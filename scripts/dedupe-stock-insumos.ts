/**
 * Repara los registros DUPLICADOS de `Stock Insumos` que dejó el bug de
 * add-quantity (ver src/lib/stock-insumos.ts): al no encontrar nunca el stock
 * existente, creaba un registro nuevo en cada entrada de inventario.
 *
 * Efecto del duplicado: `/api/inventario/list` construye un Map insumo→stock y
 * el último registro gana, así que un duplicado vacío hace que el insumo
 * aparezca con stock 0 aunque tenga movimientos.
 *
 * Estrategia — FUSIONAR, no descartar:
 *   - Agrupa los registros de Stock por insumo vinculado.
 *   - Elige como canónico el más antiguo (menor `ID`).
 *   - Vincula al canónico TODOS los movimientos del grupo y borra los demás
 *     registros de Stock.
 *
 * Fusionar no pierde información: `stock_actual` es una fórmula
 * (SUM(Cantidad Ingresa) - SUM(Cantidad Sale)) derivada de los movimientos
 * vinculados. Los movimientos son los hechos; el stock es la suma. Consolidar
 * todos los movimientos en un registro produce el stock real del insumo.
 *
 * Uso:
 *   npx tsx scripts/dedupe-stock-insumos.ts           # dry-run (no escribe nada)
 *   npx tsx scripts/dedupe-stock-insumos.ts --apply   # fusiona y borra duplicados
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carga .env.local sin depender de `dotenv` (no está en package.json). */
function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    let contenido: string;
    try {
      contenido = readFileSync(resolve(process.cwd(), file), 'utf8');
    } catch {
      continue;
    }

    for (const linea of contenido.split(/\r?\n/)) {
      const match = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      const [, clave, crudo] = match;
      if (process.env[clave] !== undefined) continue;

      // Quitar comillas envolventes si las hay.
      process.env[clave] = crudo.trim().replace(/^(['"])([\S\s]*)\1$/, '$2');
    }
  }
}

loadEnvLocal();

const CORE_BASE_ID = process.env.AIRTABLE_INSUMOS_CORE_BASE_ID;
const TOKEN = process.env.AIRTABLE_GLOBAL_TOKEN;
const STOCK_TABLE_ID = process.env.AIRTABLE_STOCK_INSUMOS_TABLE_ID;
const INSUMOS_TABLE_ID = process.env.AIRTABLE_INSUMOS_TABLE_ID;

const APPLY = process.argv.includes('--apply');

const AT = 'https://api.airtable.com/v0';

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
}

/** Lee una tabla completa siguiendo la paginación. */
async function fetchAll(tableId: string): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${AT}/${CORE_BASE_ID}/${tableId}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), { headers: authHeaders() });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Error leyendo ${tableId}: ${JSON.stringify(data)}`);
    }

    all.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return all;
}

function toIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v : v && typeof v === 'object' && 'id' in v ? (v as any).id : null))
    .filter((v): v is string => typeof v === 'string');
}

async function main() {
  if (!CORE_BASE_ID || !TOKEN || !STOCK_TABLE_ID) {
    console.error(
      '❌ Faltan variables de entorno: AIRTABLE_INSUMOS_CORE_BASE_ID, ' +
      'AIRTABLE_GLOBAL_TOKEN, AIRTABLE_STOCK_INSUMOS_TABLE_ID'
    );
    process.exit(1);
  }

  console.log(APPLY ? '🔧 MODO APLICAR (se borrarán registros)\n' : '🔍 MODO DRY-RUN (no se borra nada)\n');

  const stocks = await fetchAll(STOCK_TABLE_ID);
  console.log(`📊 Registros de Stock Insumos: ${stocks.length}`);

  // Nombres de insumos, para que el reporte sea legible.
  const nombrePorInsumo = new Map<string, string>();
  if (INSUMOS_TABLE_ID) {
    try {
      const insumos = await fetchAll(INSUMOS_TABLE_ID);
      for (const insumo of insumos) {
        nombrePorInsumo.set(insumo.id, insumo.fields?.['Nombre'] ?? insumo.id);
      }
      console.log(`📦 Insumos en Core: ${insumos.length}`);
    } catch (err) {
      console.warn('⚠️ No se pudieron leer los nombres de insumos:', err);
    }
  }

  // Agrupar stocks por insumo vinculado.
  const porInsumo = new Map<string, AirtableRecord[]>();
  const sinInsumo: AirtableRecord[] = [];

  for (const stock of stocks) {
    const insumoIds = toIds(stock.fields?.['Insumo ID']);

    if (insumoIds.length === 0) {
      sinInsumo.push(stock);
      continue;
    }

    for (const insumoId of insumoIds) {
      const grupo = porInsumo.get(insumoId) ?? [];
      grupo.push(stock);
      porInsumo.set(insumoId, grupo);
    }
  }

  interface Fusion {
    insumoId: string;
    nombre: string;
    canonico: AirtableRecord;
    eliminar: AirtableRecord[];
    /** Todos los movimientos del grupo, consolidados y sin repetir. */
    movimientos: string[];
    /** Stock resultante tras la fusión (suma de los stocks del grupo). */
    stockFusionado: number;
  }

  const fusiones: Fusion[] = [];

  for (const [insumoId, grupo] of porInsumo) {
    if (grupo.length < 2) continue;

    const nombre = nombrePorInsumo.get(insumoId) ?? insumoId;

    console.log(`\n⚠️  ${nombre} (${insumoId}) — ${grupo.length} registros de Stock:`);
    for (const stock of grupo) {
      console.log(
        `      ${stock.id}  ${stock.fields?.id_stock ?? '?'}  ` +
        `movimientos=${toIds(stock.fields?.['Movimiento Insumo ID']).length}  ` +
        `stock_actual=${stock.fields?.stock_actual ?? 0}`
      );
    }

    // Canónico = el más antiguo (menor ID autonumérico). Conserva su id_stock,
    // que puede estar referenciado en otros sitios.
    const ordenados = [...grupo].sort(
      (a, b) => Number(a.fields?.ID ?? Infinity) - Number(b.fields?.ID ?? Infinity)
    );
    const [canonico, ...eliminar] = ordenados;

    const movimientos = [
      ...new Set(grupo.flatMap((s) => toIds(s.fields?.['Movimiento Insumo ID']))),
    ];
    const stockFusionado = grupo.reduce((suma, s) => suma + Number(s.fields?.stock_actual ?? 0), 0);

    console.log(
      `   ✅ Canónico: ${canonico.id} (${canonico.fields?.id_stock ?? '?'}) ` +
      `← ${movimientos.length} movimientos, stock_actual esperado ${stockFusionado}`
    );
    console.log(`   🗑️  Eliminar: ${eliminar.map((s) => `${s.id} (${s.fields?.id_stock ?? '?'})`).join(', ')}`);

    fusiones.push({ insumoId, nombre, canonico, eliminar, movimientos, stockFusionado });
  }

  if (sinInsumo.length > 0) {
    console.log(`\n⚠️  ${sinInsumo.length} registros de Stock SIN insumo vinculado (huérfanos, no se tocan):`);
    sinInsumo.forEach((s) => console.log(`      ${s.id}  ${s.fields?.id_stock ?? '?'}`));
  }

  const idsUnicos = [...new Set(fusiones.flatMap((f) => f.eliminar.map((s) => s.id)))];

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Insumos con Stock duplicado: ${fusiones.length}`);
  console.log(`Registros de Stock a eliminar tras fusionar: ${idsUnicos.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (fusiones.length === 0) {
    console.log('✅ No hay Stock duplicado. Nada que hacer.');
    return;
  }

  if (!APPLY) {
    console.log('💡 Dry-run: no se escribió nada. Para aplicar:');
    console.log('   npx tsx scripts/dedupe-stock-insumos.ts --apply');
    return;
  }

  // PASO 1: consolidar los movimientos en el registro canónico.
  for (const fusion of fusiones) {
    const response = await fetch(`${AT}/${CORE_BASE_ID}/${STOCK_TABLE_ID}/${fusion.canonico.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({
        fields: { 'Movimiento Insumo ID': fusion.movimientos },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ Error fusionando ${fusion.nombre} en ${fusion.canonico.id}:`, JSON.stringify(error));
      console.error('   ⛔ Abortando: NO se borrará ningún registro de este grupo.');
      fusion.eliminar = [];
      continue;
    }

    console.log(
      `🔗 ${fusion.nombre}: ${fusion.movimientos.length} movimientos consolidados en ${fusion.canonico.id}`
    );

    // Rate limit: 5 req/s por base.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // PASO 2: borrar los duplicados cuya fusión sí se aplicó.
  const aBorrar = [...new Set(fusiones.flatMap((f) => f.eliminar.map((s) => s.id)))];

  if (aBorrar.length === 0) {
    console.log('\n⚠️ No se borró nada (ninguna fusión se aplicó correctamente).');
    return;
  }

  // Airtable borra máximo 10 registros por request.
  let borrados = 0;

  for (let i = 0; i < aBorrar.length; i += 10) {
    const lote = aBorrar.slice(i, i + 10);
    const url = new URL(`${AT}/${CORE_BASE_ID}/${STOCK_TABLE_ID}`);
    lote.forEach((id) => url.searchParams.append('records[]', id));

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Error borrando lote ${lote.join(', ')}:`, JSON.stringify(data));
    } else {
      borrados += (data.records ?? []).filter((r: any) => r.deleted).length;
      console.log(`🗑️  Lote borrado: ${lote.join(', ')}`);
    }

    // Rate limit: 5 req/s por base.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(`\n✅ Registros de Stock duplicados eliminados: ${borrados}`);
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});

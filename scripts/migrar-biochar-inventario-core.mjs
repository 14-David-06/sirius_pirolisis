#!/usr/bin/env node
/**
 * Mueve el libro mayor del BIOCHAR PURO de Sirius Insumos Core a Sirius
 * Inventario Production Core.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * Del 2026-07-29 al 2026-08-21 el biochar puro fue `SIRIUS-INS-0067`, un insumo.
 * Estaba en el sitio equivocado: un insumo es algo que el área COMPRA, y el biochar
 * es lo que la planta PRODUCE. Como insumo, el inventario de producto terminado del
 * ecosistema Sirius no sabía nada del biochar puro —solo veía el Blend—, mientras el
 * inventario de insumos cargaba un renglón que ninguna otra app podía interpretar.
 *
 * Destino: `SIRIUS-PRODUCT-0015` (Biochar) en Inventario Production Core, la misma
 * base donde ya vivía el Blend que alimenta.
 *
 * ═══ QUÉ HACE ═════════════════════════════════════════════════════════════════
 *   --migrar   Copia cada movimiento de `Biochar Puro` a `Movimientos_Inventario`,
 *              vinculándolo a la fila de `Stock_Actual` del producto (sin ese link
 *              el saldo NO cuenta el movimiento: así fue como la fila del Blend se
 *              quedó en 0 kg teniendo 15.528 kg de entradas).
 *
 *   --cerrar   Deja el insumo viejo en cero SIN borrar su histórico: una Salida de
 *              cierre por el saldo completo, más `Estado Insumo` → `Inactivo`.
 *              Borrar los 118 movimientos habría sido más limpio de ver y peor de
 *              auditar: el asiento de cierre deja dicho en la propia base a dónde
 *              se fue el inventario.
 *
 * Sin fase explícita corre las dos, en ese orden. Sin `--apply` es dry-run.
 *
 * ═══ IDEMPOTENCIA ═════════════════════════════════════════════════════════════
 * La llave de cada movimiento migrado es la terna
 * (documento_referencia, bache_origen_id, tipo_movimiento). Hace falta la terna y no
 * solo la referencia porque una producción consume VARIOS baches con el mismo lote
 * en `documento_referencia`: con la referencia sola, migrar dos veces habría
 * saltado 5 de los 6 movimientos de una tanda... o duplicado los 6.
 *
 * La Salida de cierre tiene su propia llave (`documento_referencia` = la marca de
 * cierre) y se salta si ya existe.
 *
 * Uso:
 *   node scripts/migrar-biochar-inventario-core.mjs                # dry-run de todo
 *   node scripts/migrar-biochar-inventario-core.mjs --migrar --apply
 *   node scripts/migrar-biochar-inventario-core.mjs --cerrar --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const soloMigrar = argv.includes('--migrar');
const soloCerrar = argv.includes('--cerrar');
const algunaFase = soloMigrar || soloCerrar;
const HACER_MIGRAR = soloMigrar || !algunaFase;
const HACER_CERRAR = soloCerrar || !algunaFase;

const AT = 'https://api.airtable.com/v0';

/** `documento_referencia` de la Salida que deja el insumo viejo en cero. */
const MARCA_CIERRE = 'CIERRE-MIGRACION-BIOCHAR-INVENTARIO-CORE';

const RESPONSABLE = 'Migracion biochar a Inventario Production Core';

// ---------------------------------------------------------------------------
function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) throw new Error('No se encontró .env.local en el directorio actual');
  const env = {};
  for (const linea of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = loadEnv();

const TOKEN = env.AIRTABLE_GLOBAL_TOKEN || env.AIRTABLE_TOKEN;

// Origen: Sirius Insumos Core
const I_BASE = env.AIRTABLE_INSUMOS_CORE_BASE_ID;
const I_MOV = env.AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID;
const I_STOCK = env.AIRTABLE_STOCK_INSUMOS_TABLE_ID;
const I_INSUMOS = env.AIRTABLE_INSUMOS_TABLE_ID;
const INSUMO_BIOCHAR = env.AIRTABLE_BLEND_BIOCHAR_RECORD_ID;

// Destino: Sirius Inventario Production Core
const V_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const V_MOV = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const V_STOCK = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK;
const PRODUCTO_BIOCHAR = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;

const faltantes = Object.entries({
  AIRTABLE_GLOBAL_TOKEN: TOKEN,
  AIRTABLE_INSUMOS_CORE_BASE_ID: I_BASE,
  AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID: I_MOV,
  AIRTABLE_STOCK_INSUMOS_TABLE_ID: I_STOCK,
  AIRTABLE_INSUMOS_TABLE_ID: I_INSUMOS,
  AIRTABLE_BLEND_BIOCHAR_RECORD_ID: INSUMO_BIOCHAR,
  AIRTABLE_BASE_SIRIUS_INVENTARIO: V_BASE,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: V_MOV,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK: V_STOCK,
  AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PRODUCTO_BIOCHAR,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (faltantes.length) {
  console.error(`❌ Faltan variables en .env.local:\n   ${faltantes.join('\n   ')}`);
  process.exit(1);
}

// Nombres reales de los campos de `Movimientos Insumos` (Insumos Core).
const I_CAMPO = {
  codigo: 'Código Movimiento Insumo',
  notas: 'Name',
  cantidad: 'Cantidad ', // el espacio final es el nombre real, no una errata
  tipo: 'Tipo Movimiento',
  responsable: 'ID Responsable Core',
  bache: 'ID Bache Origen',
  destino: 'ID Produccion Destino',
  fecha: 'Fecha Movimiento',
  insumo: 'Insumo',
  stock: 'Stock Insumos',
  creada: 'Creada',
};

// ---------------------------------------------------------------------------
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function at(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(data)}`);
  return data ?? {};
}

async function fetchAll(base, table, params = {}) {
  const records = [];
  let offset;
  do {
    const url = new URL(`${AT}/${base}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString());
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return records;
}

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const r2 = (n) => Math.round(n * 100) / 100;

function num(value) {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Record IDs de un campo link, que Airtable devuelve como strings u objetos. */
function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((e) => (typeof e === 'string' ? e : e?.id))
    .filter((id) => typeof id === 'string');
}

// ---------------------------------------------------------------------------
// Traducción origen → destino
// ---------------------------------------------------------------------------

/**
 * `documento_referencia` que le corresponde a un movimiento migrado.
 *
 * Es la llave de idempotencia que va a usar la app de aquí en adelante, así que
 * tiene que coincidir EXACTAMENTE con lo que generan `referenciaEntradaBodega()` y
 * `referenciaSalida()`. Si no coincide, la app volvería a escribir la entrada de un
 * bache que ya está migrada y duplicaría cientos de kg.
 */
function documentoReferencia(tipo, bache, destino) {
  // Salida: el destino ya ES la referencia — el lote `BLEND-…` de la producción que
  // lo consumió, o la `SAL-…` de una salida que no es producción.
  if (tipo === 'Salida') return destino || `SAL-MIGRADA-${bache}`;
  // Entrada: es el ingreso del bache a bodega. Ver `referenciaEntradaBodega()`.
  return `BODEGA-${bache}`;
}

/** Fecha del movimiento, cayendo a `Creada` si el histórico no la trae. */
function fechaDe(fields) {
  const explicita = String(fields[I_CAMPO.fecha] ?? '').slice(0, 10);
  if (explicita) return explicita;
  return String(fields[I_CAMPO.creada] ?? '').slice(0, 10);
}

// ---------------------------------------------------------------------------
async function fase_migrar() {
  console.log('\n═══ FASE MIGRAR ═══════════════════════════════════════════════');

  // 1. Los movimientos del insumo viejo. El match del insumo va en JS sobre los
  //    record IDs: en una fórmula un campo link se evalúa como el texto de su campo
  //    primario, no como el record ID, así que `filterByFormula` no sirve aquí.
  const todos = await fetchAll(I_BASE, I_MOV);
  const origen = todos.filter((m) => linkIds(m.fields?.[I_CAMPO.insumo]).includes(INSUMO_BIOCHAR));

  console.log(`📖 Insumos Core: ${origen.length} movimientos de Biochar Puro (de ${todos.length} en la tabla)`);

  const sinBache = origen.filter((m) => !String(m.fields?.[I_CAMPO.bache] ?? '').trim());
  if (sinBache.length) {
    // No se migran a ciegas: un movimiento sin bache no se puede trazar, y meterlo
    // en el nuevo libro mayor solo movería el problema de base.
    console.warn(
      `⚠️  ${sinBache.length} movimiento(s) SIN 'ID Bache Origen' NO se migran (no son trazables):\n` +
        sinBache.map((m) => `     ${m.fields?.[I_CAMPO.codigo] ?? m.id}`).join('\n')
    );
  }

  const migrables = origen.filter((m) => String(m.fields?.[I_CAMPO.bache] ?? '').trim());

  // 2. Lo que ya está en el destino, para no duplicar.
  const yaEnDestino = await fetchAll(V_BASE, V_MOV, {
    filterByFormula: `{product_id} = '${esc(PRODUCTO_BIOCHAR)}'`,
  });
  const existentes = new Set(
    yaEnDestino.map((m) =>
      [
        String(m.fields?.documento_referencia ?? ''),
        String(m.fields?.bache_origen_id ?? ''),
        String(m.fields?.tipo_movimiento ?? ''),
      ].join('|')
    )
  );
  console.log(`📖 Inventario Production Core: ${yaEnDestino.length} movimientos ya migrados`);

  // 3. La fila de stock: sin el link el saldo no cuenta nada de lo que se migre.
  const stockRows = await fetchAll(V_BASE, V_STOCK, {
    filterByFormula: `{producto_id} = '${esc(PRODUCTO_BIOCHAR)}'`,
    maxRecords: '1',
  });
  const stockId = stockRows[0]?.id;
  if (!stockId) {
    console.error(
      `❌ No existe fila en Stock_Actual para ${PRODUCTO_BIOCHAR}. Créala antes de migrar: ` +
        'sin ella los movimientos entran pero el saldo se queda en 0.'
    );
    process.exit(1);
  }

  // 4. Plan.
  const porEscribir = [];
  let saltados = 0;

  for (const mov of migrables) {
    const f = mov.fields ?? {};
    const tipo = String(f[I_CAMPO.tipo] ?? '');
    const bache = String(f[I_CAMPO.bache] ?? '').trim();
    const destino = String(f[I_CAMPO.destino] ?? '').trim();
    const kg = r2(num(f[I_CAMPO.cantidad]));
    const doc = documentoReferencia(tipo, bache, destino);

    if (existentes.has([doc, bache, tipo].join('|'))) {
      saltados++;
      continue;
    }

    const notas = String(f[I_CAMPO.notas] ?? '').trim();
    const fields = {
      product_id: PRODUCTO_BIOCHAR,
      tipo_movimiento: tipo,
      cantidad: kg,
      unidad_medida: 'kg',
      motivo:
        tipo === 'Entrada'
          ? 'Ingreso de biochar a bodega'
          : destino.startsWith('BLEND-')
            ? `Consumo para produccion de Biochar Blend ${destino}`
            : 'Salida de biochar',
      documento_referencia: doc,
      bache_origen_id: bache,
      responsable: String(f[I_CAMPO.responsable] ?? '') || RESPONSABLE,
      // Mediodía UTC: un `T00:00` se corre de día al renderizarse en Colombia, y la
      // fecha del movimiento es dato de trazabilidad, no cosmética.
      fecha_movimiento: `${fechaDe(f)}T12:00:00.000Z`,
      // Se conserva la nota original: es lo que amarra el movimiento migrado con su
      // origen si alguna vez hay que reconciliar a mano.
      observaciones: [notas, `[migrado de ${f[I_CAMPO.codigo] ?? mov.id} en Sirius Insumos Core]`]
        .filter(Boolean)
        .join('\n'),
      Stock_Actual: [stockId],
    };
    if (destino) fields.produccion_destino_id = destino;

    porEscribir.push({ fields, resumen: `${tipo} ${kg} kg · ${bache} · ${doc}` });
  }

  const totalEntradas = porEscribir
    .filter((m) => m.fields.tipo_movimiento === 'Entrada')
    .reduce((t, m) => t + m.fields.cantidad, 0);
  const totalSalidas = porEscribir
    .filter((m) => m.fields.tipo_movimiento === 'Salida')
    .reduce((t, m) => t + m.fields.cantidad, 0);

  console.log(`\n📋 A migrar: ${porEscribir.length} movimientos (${saltados} ya estaban)`);
  console.log(`   Entradas: ${r2(totalEntradas)} kg · Salidas: ${r2(totalSalidas)} kg`);
  console.log(`   Saldo que dejarían: ${r2(totalEntradas - totalSalidas)} kg`);
  for (const m of porEscribir.slice(0, 10)) console.log(`     · ${m.resumen}`);
  if (porEscribir.length > 10) console.log(`     … y ${porEscribir.length - 10} más`);

  if (!porEscribir.length) return;

  if (!APPLY) {
    console.log('\n🔍 DRY-RUN: no se escribió nada. Repite con --apply.');
    return;
  }

  // Airtable acepta 10 registros por POST.
  let creados = 0;
  for (let i = 0; i < porEscribir.length; i += 10) {
    const grupo = porEscribir.slice(i, i + 10);
    const data = await at(`${AT}/${V_BASE}/${V_MOV}`, {
      method: 'POST',
      body: JSON.stringify({ records: grupo.map((m) => ({ fields: m.fields })) }),
    });
    creados += (data.records ?? []).length;
    console.log(`   ✅ ${creados}/${porEscribir.length}`);
  }

  console.log(`\n✅ ${creados} movimientos migrados.`);
}

// ---------------------------------------------------------------------------
async function fase_cerrar() {
  console.log('\n═══ FASE CERRAR ═══════════════════════════════════════════════');

  // 1. Saldo actual del insumo viejo. Se lee de `stock_actual` y no se recalcula:
  //    es la fórmula del Core, y recalcularla aquí podría dejar un residuo.
  const stockRows = await fetchAll(I_BASE, I_STOCK);
  const fila = stockRows.find((r) => linkIds(r.fields?.['Insumo ID']).includes(INSUMO_BIOCHAR));

  if (!fila) {
    console.log('↩️  El insumo Biochar Puro no tiene fila en Stock Insumos: nada que cerrar.');
    return;
  }

  const saldo = r2(num(fila.fields?.stock_actual));
  console.log(`📖 Saldo del insumo Biochar Puro en Insumos Core: ${saldo} kg`);

  // 2. ¿Ya se cerró?
  const yaCerrado = await fetchAll(I_BASE, I_MOV, {
    filterByFormula: `FIND('${esc(MARCA_CIERRE)}', {${I_CAMPO.notas}}) > 0`,
    maxRecords: '1',
  });

  if (yaCerrado.length) {
    console.log('↩️  El asiento de cierre ya existe: no se crea otro.');
  } else if (saldo <= 0.01) {
    console.log('↩️  El saldo ya está en cero: no hace falta asiento de cierre.');
  } else {
    console.log(`\n📋 Asiento de cierre: Salida de ${saldo} kg con la marca ${MARCA_CIERRE}`);

    if (!APPLY) {
      console.log('🔍 DRY-RUN: no se escribió nada.');
    } else {
      const fields = {
        [I_CAMPO.insumo]: [INSUMO_BIOCHAR],
        [I_CAMPO.cantidad]: saldo,
        [I_CAMPO.tipo]: 'Salida',
        [I_CAMPO.fecha]: new Date().toISOString().split('T')[0],
        [I_CAMPO.notas]:
          `${MARCA_CIERRE} — el biochar puro dejo de ser un insumo: su libro mayor es ` +
          `${PRODUCTO_BIOCHAR} en Sirius Inventario Production Core. Este asiento deja el ` +
          `insumo en cero sin borrar su historico.`,
      };

      const data = await at(`${AT}/${I_BASE}/${I_MOV}`, {
        method: 'POST',
        body: JSON.stringify({ records: [{ fields }] }),
      });
      const movId = data.records?.[0]?.id;

      // Vincular al stock: el PATCH de un campo link REEMPLAZA el array, así que se
      // relee y se concatena. Sin esto se borraría el histórico del stock, que es
      // exactamente lo que este asiento viene a preservar.
      const actual = await at(`${AT}/${I_BASE}/${I_STOCK}/${fila.id}`);
      const previos = linkIds(actual.fields?.['Movimiento Insumo ID']);
      await at(`${AT}/${I_BASE}/${I_STOCK}/${fila.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { 'Movimiento Insumo ID': [...previos, movId] } }),
      });

      console.log(`✅ Asiento de cierre creado (${movId}) y vinculado al stock.`);
    }
  }

  // 3. Marcar el insumo como Inactivo, para que nadie lo elija en una pantalla.
  const insumo = await at(`${AT}/${I_BASE}/${I_INSUMOS}/${INSUMO_BIOCHAR}`);
  const estado = String(insumo.fields?.['Estado Insumo'] ?? '');

  if (estado === 'Inactivo') {
    console.log('↩️  El insumo ya está en Inactivo.');
  } else if (!APPLY) {
    console.log(`📋 'Estado Insumo': ${estado || '(vacío)'} → Inactivo`);
    console.log('🔍 DRY-RUN: no se escribió nada.');
  } else {
    // `Inactivo` es una opción REAL del singleSelect: mandar un valor que no esté en
    // la lista devuelve 422 y tumba el PATCH completo.
    await at(`${AT}/${I_BASE}/${I_INSUMOS}/${INSUMO_BIOCHAR}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Estado Insumo': 'Inactivo' } }),
    });
    console.log(`✅ 'Estado Insumo': ${estado || '(vacío)'} → Inactivo`);
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🔀 Migración del biochar puro a Sirius Inventario Production Core`);
  console.log(`   Origen : ${INSUMO_BIOCHAR} (insumo, Sirius Insumos Core)`);
  console.log(`   Destino: ${PRODUCTO_BIOCHAR} (producto, Inventario Production Core)`);
  console.log(`   Modo   : ${APPLY ? '⚠️  APPLY (escribe)' : '🔍 DRY-RUN'}`);

  if (HACER_MIGRAR) await fase_migrar();
  if (HACER_CERRAR) await fase_cerrar();

  if (!APPLY) {
    console.log('\n🔍 Nada se escribió. Repite con --apply cuando el plan se vea bien.');
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});

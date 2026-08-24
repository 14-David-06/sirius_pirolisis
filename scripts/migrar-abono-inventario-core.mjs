#!/usr/bin/env node
/**
 * Lleva el ABONO 4G de Sirius Insumos Core a Sirius Inventario Production Core.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * Del 2026-07-27 al 2026-08-21 el abono 4G fue `SIRIUS-INS-0064`, un insumo, con un
 * único movimiento: la Entrada del conteo físico (33.614 kg).
 *
 * El argumento que sacó al biochar de Insumos Core —un insumo es lo que el área
 * COMPRA, y el biochar es lo que la planta PRODUCE— no aplica igual acá: el abono
 * pirólisis lo RECIBE. Lo que lo trae al Core es otra cosa: es la materia prima del
 * Biochar Blend, y desde que el biochar puro vive en el Core, producir Blend es una
 * Salida de un producto y una Entrada de otro en un mismo libro mayor. Con el abono
 * en la otra base, esa misma producción había que descontarla en dos bases y ningún
 * libro solo alcanzaba a explicar de qué está hecho un kg de Blend.
 *
 * ═══ QUÉ HACE ═════════════════════════════════════════════════════════════════
 *   --producto  Crea "Abono 4G" en Sirius Product Core (si no existe) y su fila en
 *               `Stock_Actual`. Imprime el código para poner en .env.local.
 *
 *               ⚠️ Escribe en el CATÁLOGO COMPARTIDO del ecosistema: el producto
 *               queda visible para las otras apps de Sirius. Es la única fase que
 *               toca una base que no es de pirólisis.
 *
 *   --migrar    Copia los movimientos del insumo a `Movimientos_Inventario`,
 *               vinculándolos a la fila de `Stock_Actual` (sin ese link el saldo NO
 *               los cuenta: así fue como la fila del Blend se quedó en 0 kg
 *               teniendo 15.528 kg de entradas).
 *
 *   --cerrar    Deja el insumo viejo en cero SIN borrar su histórico: una Salida de
 *               cierre por el saldo completo, más `Estado Insumo` → `Inactivo`.
 *               Borrar el movimiento habría sido más limpio de ver y peor de
 *               auditar: el asiento de cierre deja dicho en la propia base a dónde
 *               se fue el inventario.
 *
 * Sin fase explícita corre las tres, en ese orden. Sin `--apply` es dry-run.
 *
 * ═══ IDEMPOTENCIA ═════════════════════════════════════════════════════════════
 * La llave de cada movimiento migrado es su `documento_referencia`, derivado del
 * código del movimiento de origen (`MIGRADO-MOV-INS-0194`). A diferencia del
 * biochar —donde la llave se recalcula desde el bache porque la app la vuelve a
 * generar en cada ingreso a bodega—, acá no hay nada que la app regenere: el abono
 * no tiene hoy pantalla de entradas, así que la referencia solo tiene que ser
 * estable y decir de dónde vino.
 *
 * Uso:
 *   node scripts/migrar-abono-inventario-core.mjs                    # dry-run de todo
 *   node scripts/migrar-abono-inventario-core.mjs --producto --apply
 *   node scripts/migrar-abono-inventario-core.mjs --migrar --apply
 *   node scripts/migrar-abono-inventario-core.mjs --cerrar --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const soloProducto = argv.includes('--producto');
const soloMigrar = argv.includes('--migrar');
const soloCerrar = argv.includes('--cerrar');
const algunaFase = soloProducto || soloMigrar || soloCerrar;
const HACER_PRODUCTO = soloProducto || !algunaFase;
const HACER_MIGRAR = soloMigrar || !algunaFase;
const HACER_CERRAR = soloCerrar || !algunaFase;

const AT = 'https://api.airtable.com/v0';

/** `documento_referencia` de la Salida que deja el insumo viejo en cero. */
const MARCA_CIERRE = 'CIERRE-MIGRACION-ABONO-4G-INVENTARIO-CORE';

const RESPONSABLE = 'Migracion abono 4G a Inventario Production Core';

/** Lo que se crea en el catálogo. Todos los valores son opciones REALES de sus
 *  singleSelect: mandar uno que no esté en la lista devuelve 422. */
const PRODUCTO_NUEVO = {
  'Nombre Comercial': 'Abono 4G',
  Abreviatura: '4G',
  'Tipo Producto': 'Fertilizante',
  'Categoria Producto': 'Enmienda orgánica',
  'Categoria Producto CP-CN': 'Crop Nutrition',
  'Unidad Base': 'Kg',
  Area: 'Pirolisis',
  Activo: 'Sí',
  Observaciones:
    'Materia prima del Biochar Blend (74% de la formula). Migrado desde SIRIUS-INS-0064 ' +
    'en Sirius Insumos Core el 2026-08-21: su libro mayor pasa a Sirius Inventario ' +
    'Production Core para que la produccion de Blend se descuente en una sola base.',
};

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
const INSUMO_ABONO = env.AIRTABLE_BLEND_ABONO_4G_RECORD_ID;

// Catálogo: Sirius Product Core
const P_BASE = env.AIRTABLE_PRODUCTS_BASE_ID;
const P_TABLE = env.AIRTABLE_PRODUCTS_TABLE_ID;

// Destino: Sirius Inventario Production Core
const V_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const V_MOV = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const V_STOCK = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK;

/** Puede estar vacío en la primera corrida: lo produce la fase --producto. */
let PRODUCTO_ABONO = env.AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID;

const faltantes = Object.entries({
  AIRTABLE_GLOBAL_TOKEN: TOKEN,
  AIRTABLE_INSUMOS_CORE_BASE_ID: I_BASE,
  AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID: I_MOV,
  AIRTABLE_STOCK_INSUMOS_TABLE_ID: I_STOCK,
  AIRTABLE_INSUMOS_TABLE_ID: I_INSUMOS,
  AIRTABLE_BLEND_ABONO_4G_RECORD_ID: INSUMO_ABONO,
  AIRTABLE_PRODUCTS_BASE_ID: P_BASE,
  AIRTABLE_PRODUCTS_TABLE_ID: P_TABLE,
  AIRTABLE_BASE_SIRIUS_INVENTARIO: V_BASE,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: V_MOV,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK: V_STOCK,
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

/** Una fórmula de Airtable puede llegar como `{ state, value }`. */
function texto(value) {
  if (value && typeof value === 'object' && 'value' in value) return String(value.value ?? '');
  return String(value ?? '');
}

// ---------------------------------------------------------------------------
async function fase_producto() {
  console.log('\n═══ FASE PRODUCTO ═════════════════════════════════════════════');

  // 1. ¿Ya existe en el catálogo? Se busca por nombre y NO se confía solo en la
  //    variable de entorno: si alguien lo creó a mano, crear otro dejaría dos
  //    productos con el mismo nombre y dos saldos distintos del mismo abono.
  const productos = await fetchAll(P_BASE, P_TABLE);
  const existente = productos.find(
    (p) =>
      String(p.fields?.['Nombre Comercial'] ?? '')
        .trim()
        .toLowerCase() === PRODUCTO_NUEVO['Nombre Comercial'].toLowerCase()
  );

  if (existente) {
    PRODUCTO_ABONO = texto(existente.fields?.['Codigo Producto']);
    console.log(`↩️  Ya existe en el catálogo: ${PRODUCTO_ABONO} (${existente.id})`);
  } else {
    console.log(`📋 A crear en Sirius Product Core (catálogo COMPARTIDO):`);
    for (const [k, v] of Object.entries(PRODUCTO_NUEVO)) {
      console.log(`     ${k}: ${String(v).slice(0, 80)}`);
    }
    console.log(`   Sería el producto #${productos.length + 1} del catálogo.`);

    if (!APPLY) {
      console.log('🔍 DRY-RUN: no se creó el producto.');
    } else {
      const creado = await at(`${AT}/${P_BASE}/${P_TABLE}`, {
        method: 'POST',
        body: JSON.stringify({ records: [{ fields: PRODUCTO_NUEVO }] }),
      });
      const id = creado.records?.[0]?.id;
      // `Codigo Producto` es una fórmula: se relee el registro porque la respuesta
      // del POST puede no traerla calculada.
      const leido = await at(`${AT}/${P_BASE}/${P_TABLE}/${id}`);
      PRODUCTO_ABONO = texto(leido.fields?.['Codigo Producto']);
      console.log(`✅ Producto creado: ${PRODUCTO_ABONO} (${id})`);
    }
  }

  if (!PRODUCTO_ABONO) {
    console.log('\n🔍 Sin código de producto no se puede seguir en dry-run. Corre con --apply.');
    return;
  }

  // 2. La fila de `Stock_Actual`. Sin ella los movimientos entran pero el saldo se
  //    queda en 0: `stock_actual` es una fórmula sobre los movimientos VINCULADOS.
  const filas = await fetchAll(V_BASE, V_STOCK, {
    filterByFormula: `{producto_id} = '${esc(PRODUCTO_ABONO)}'`,
    maxRecords: '1',
  });

  if (filas.length) {
    console.log(`↩️  Ya existe la fila de Stock_Actual (${filas[0].id}).`);
  } else if (!APPLY) {
    console.log(`📋 A crear: fila de Stock_Actual con producto_id = ${PRODUCTO_ABONO}`);
    console.log('🔍 DRY-RUN: no se creó.');
  } else {
    const creada = await at(`${AT}/${V_BASE}/${V_STOCK}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: { producto_id: PRODUCTO_ABONO } }] }),
    });
    console.log(`✅ Fila de Stock_Actual creada (${creada.records?.[0]?.id}).`);
  }

  if (env.AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID !== PRODUCTO_ABONO) {
    console.log(
      `\n📌 Pon esto en .env.local (y en el entorno del despliegue):\n` +
        `   AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID=${PRODUCTO_ABONO}`
    );
  }
}

// ---------------------------------------------------------------------------
async function fase_migrar() {
  console.log('\n═══ FASE MIGRAR ═══════════════════════════════════════════════');

  if (!PRODUCTO_ABONO) {
    console.log(
      '⏭️  Sin AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID no hay destino: corre primero --producto.'
    );
    return;
  }

  // 1. Los movimientos del insumo. El match va en JS sobre los record IDs: en una
  //    fórmula un campo link se evalúa como el texto de su campo primario, no como
  //    el record ID, así que `filterByFormula` no sirve para esto.
  const todos = await fetchAll(I_BASE, I_MOV);
  const origen = todos.filter((m) => linkIds(m.fields?.[I_CAMPO.insumo]).includes(INSUMO_ABONO));

  console.log(
    `📖 Insumos Core: ${origen.length} movimiento(s) de Abono 4G (de ${todos.length} en la tabla)`
  );

  // El asiento de cierre de una corrida anterior NO se migra: es contabilidad de la
  // base vieja, no inventario que exista.
  const migrables = origen.filter(
    (m) => !String(m.fields?.[I_CAMPO.notas] ?? '').includes(MARCA_CIERRE)
  );
  if (migrables.length !== origen.length) {
    console.log(`   (${origen.length - migrables.length} asiento(s) de cierre ignorado(s))`);
  }

  // 2. Lo que ya está en el destino, para no duplicar.
  const yaEnDestino = await fetchAll(V_BASE, V_MOV, {
    filterByFormula: `{product_id} = '${esc(PRODUCTO_ABONO)}'`,
  });
  const existentes = new Set(
    yaEnDestino.map((m) => String(m.fields?.documento_referencia ?? ''))
  );
  console.log(`📖 Inventario Production Core: ${yaEnDestino.length} movimiento(s) ya migrado(s)`);

  // 3. La fila de stock: sin el link el saldo no cuenta nada de lo que se migre.
  const stockRows = await fetchAll(V_BASE, V_STOCK, {
    filterByFormula: `{producto_id} = '${esc(PRODUCTO_ABONO)}'`,
    maxRecords: '1',
  });
  const stockId = stockRows[0]?.id;
  if (!stockId) {
    console.error(
      `❌ No existe fila en Stock_Actual para ${PRODUCTO_ABONO}. Corre --producto primero: ` +
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
    const codigoOrigen = String(f[I_CAMPO.codigo] ?? mov.id);
    const destino = String(f[I_CAMPO.destino] ?? '').trim();
    const kg = r2(num(f[I_CAMPO.cantidad]));
    const doc = `MIGRADO-${codigoOrigen}`;

    if (existentes.has(doc)) {
      saltados++;
      continue;
    }

    // `Ajuste` no existe en el Core (sus opciones son Entrada/Salida/Transferencia/
    // Ajuste/Merma/Devolución sí lo incluye, pero el saldo solo suma Entrada y resta
    // Salida): un tipo que el saldo no interpreta entraría sin efecto y mentiría.
    if (tipo !== 'Entrada' && tipo !== 'Salida') {
      console.warn(
        `⚠️  ${codigoOrigen} es '${tipo}': NO se migra. El saldo del Core solo suma ` +
          'Entrada y resta Salida; hay que decidir a mano cómo se representa.'
      );
      continue;
    }

    const notas = String(f[I_CAMPO.notas] ?? '').trim();
    const fecha = String(f[I_CAMPO.fecha] ?? '').slice(0, 10) ||
      String(f[I_CAMPO.creada] ?? '').slice(0, 10);

    const fields = {
      product_id: PRODUCTO_ABONO,
      tipo_movimiento: tipo,
      cantidad: kg,
      unidad_medida: 'kg',
      motivo:
        tipo === 'Entrada'
          ? 'Ingreso de abono 4G a bodega'
          : destino.startsWith('BLEND-')
            ? `Consumo para produccion de Biochar Blend ${destino}`
            : 'Salida de abono 4G',
      documento_referencia: doc,
      responsable: String(f[I_CAMPO.responsable] ?? '') || RESPONSABLE,
      // Mediodía UTC: un `T00:00` se corre de día al renderizarse en Colombia, y la
      // fecha del movimiento es dato de trazabilidad, no cosmética.
      fecha_movimiento: `${fecha}T12:00:00.000Z`,
      // Se conserva la nota original: es lo que amarra el movimiento migrado con su
      // origen si alguna vez hay que reconciliar a mano.
      observaciones: [notas, `[migrado de ${codigoOrigen} en Sirius Insumos Core]`]
        .filter(Boolean)
        .join('\n'),
      Stock_Actual: [stockId],
    };
    if (destino) fields.produccion_destino_id = destino;
    // `bache_origen_id` va vacío a propósito: el abono no se traza por bache, y
    // rellenarlo con el bache del insumo (si alguna vez lo tuvo) inventaría una
    // trazabilidad que no existe.

    porEscribir.push({ fields, resumen: `${tipo} ${kg} kg · ${doc}` });
  }

  const totalEntradas = porEscribir
    .filter((m) => m.fields.tipo_movimiento === 'Entrada')
    .reduce((t, m) => t + m.fields.cantidad, 0);
  const totalSalidas = porEscribir
    .filter((m) => m.fields.tipo_movimiento === 'Salida')
    .reduce((t, m) => t + m.fields.cantidad, 0);

  console.log(`\n📋 A migrar: ${porEscribir.length} movimiento(s) (${saltados} ya estaban)`);
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

  console.log(`\n✅ ${creados} movimiento(s) migrado(s).`);
}

// ---------------------------------------------------------------------------
async function fase_cerrar() {
  console.log('\n═══ FASE CERRAR ═══════════════════════════════════════════════');

  // 1. Saldo actual del insumo viejo. Se lee de `stock_actual` y no se recalcula:
  //    es la fórmula del Core, y recalcularla aquí podría dejar un residuo.
  const stockRows = await fetchAll(I_BASE, I_STOCK);
  const fila = stockRows.find((r) => linkIds(r.fields?.['Insumo ID']).includes(INSUMO_ABONO));

  if (!fila) {
    console.log('↩️  El insumo Abono 4G no tiene fila en Stock Insumos: nada que cerrar.');
    return;
  }

  const saldo = r2(num(fila.fields?.stock_actual));
  console.log(`📖 Saldo del insumo Abono 4G en Insumos Core: ${saldo} kg`);

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
        [I_CAMPO.insumo]: [INSUMO_ABONO],
        [I_CAMPO.cantidad]: saldo,
        [I_CAMPO.tipo]: 'Salida',
        [I_CAMPO.fecha]: new Date().toISOString().split('T')[0],
        [I_CAMPO.notas]:
          `${MARCA_CIERRE} — el abono 4G dejo de llevarse como insumo: su libro mayor es ` +
          `${PRODUCTO_ABONO || 'el producto de Abono 4G'} en Sirius Inventario Production ` +
          `Core, la misma base donde se descuenta el biochar al producir Blend. Este asiento ` +
          `deja el insumo en cero sin borrar su historico.`,
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
  const insumo = await at(`${AT}/${I_BASE}/${I_INSUMOS}/${INSUMO_ABONO}`);
  const estado = String(insumo.fields?.['Estado Insumo'] ?? '');

  if (estado === 'Inactivo') {
    console.log('↩️  El insumo ya está en Inactivo.');
  } else if (!APPLY) {
    console.log(`📋 'Estado Insumo': ${estado || '(vacío)'} → Inactivo`);
    console.log('🔍 DRY-RUN: no se escribió nada.');
  } else {
    // `Inactivo` es una opción REAL del singleSelect: mandar un valor que no esté en
    // la lista devuelve 422 y tumba el PATCH completo.
    await at(`${AT}/${I_BASE}/${I_INSUMOS}/${INSUMO_ABONO}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { 'Estado Insumo': 'Inactivo' } }),
    });
    console.log(`✅ 'Estado Insumo': ${estado || '(vacío)'} → Inactivo`);
  }
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🔀 Migración del abono 4G a Sirius Inventario Production Core`);
  console.log(`   Origen : ${INSUMO_ABONO} (insumo, Sirius Insumos Core)`);
  console.log(`   Destino: ${PRODUCTO_ABONO || '(por crear en el catálogo)'}`);
  console.log(`   Modo   : ${APPLY ? '⚠️  APPLY (escribe)' : '🔍 DRY-RUN'}`);

  if (HACER_PRODUCTO) await fase_producto();
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

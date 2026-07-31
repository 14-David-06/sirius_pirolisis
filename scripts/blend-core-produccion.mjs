#!/usr/bin/env node
/**
 * Producción de Biochar Blend registrada DIRECTAMENTE en las bases Core.
 *
 * Reemplaza el enfoque anterior (tablas locales de PiroliApp, que se borraron por
 * ser datos de prueba). El registro de producción ya no es una fila en una tabla
 * local: es un conjunto de movimientos en los Core, unidos por un CÓDIGO DE LOTE.
 *
 * ┌─ Sirius Insumos Core () ─────────────────────────────────┐
 * │ Biochar Puro = SIRIUS-INS-0067. Un movimiento POR BACHE:                  │
 * │   Entrada │ cantidad │ ID Bache Origen = S-00XXX      (llega a bodega)    │
 * │   Salida  │ cantidad │ ID Bache Origen = S-00XXX                          │
 * │                      │ ID Produccion Destino = BLEND-… (se consume)       │
 * └───────────────────────────────────────────────────────────────────────────┘
 * ┌─ Sirius Inventario Production Core ───────────────────┐
 * │ Movimientos_Inventario: Entrada de SIRIUS-PRODUCT-0016 (Biochar Blend),   │
 * │ documento_referencia = BLEND-…  ← ESTE movimiento ES el lote producido.   │
 * └───────────────────────────────────────────────────────────────────────────┘
 * ┌─ PiroliApp () — espejo obligatorio, NO opcional ─────────┐
 * │ `Detalle Cantidades Remision Pirolisis`: una fila por bache con sus KG.   │
 * │ Es el ÚNICO mecanismo que baja `Total Cantidad Actual Biochar Seco` del   │
 * │ bache. Sin esta fila la bodega seguiría mostrando biochar que ya no       │
 * │ existe, y `getBiocharDisponibleKg()` autorizaría producciones imposibles. │
 * │ Lleva `ID Produccion Blend` (texto) para amarrar la fila al lote.         │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Por qué el biochar no se descuenta dos veces: el bache y el Core no son dos
 * inventarios, son dos vistas del mismo. La fórmula del bache responde "cuánto
 * queda de ESTE bache"; el Core responde "cuánto biochar hay en bodega y a dónde
 * fue". Cada consumo se escribe una vez en cada vista, con el mismo número.
 *
 * Fases (independientes e idempotentes; se pueden correr por separado):
 *
 *   --apertura   Cargue inicial: una Entrada por cada bache en bodega con stock,
 *                por su biochar seco disponible HOY. Es el conteo físico de
 *                apertura del inventario de biochar en el Core, que hasta ahora
 *                arrancaba en 0. Se salta los baches ya cargados.
 *
 *   --producir   Registra las tandas de PRODUCCIONES definidas abajo: salidas de
 *                biochar por bache + Entrada de producto terminado + espejo en
 *                PiroliApp. Se salta los lotes ya registrados.
 *
 *   --despachar  Registra los DESPACHOS a cliente: una Salida de producto terminado
 *                por lote, con el cliente en `ubicacion_destino_id`. Valida que no
 *                se despache más de lo producido. Se salta los ya registrados.
 *
 * Sin fase explícita corre las tres. Sin --apply es dry-run.
 *
 * Uso:
 *   node scripts/blend-core-produccion.mjs                      # dry-run de todo
 *   node scripts/blend-core-produccion.mjs --apertura --apply
 *   node scripts/blend-core-produccion.mjs --producir --apply
 *   node scripts/blend-core-produccion.mjs --despachar --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const soloApertura = argv.includes('--apertura');
const soloProducir = argv.includes('--producir');
const soloDespachar = argv.includes('--despachar');
const algunaFase = soloApertura || soloProducir || soloDespachar;
const HACER_APERTURA = soloApertura || !algunaFase;
const HACER_PRODUCIR = soloProducir || !algunaFase;
const HACER_DESPACHAR = soloDespachar || !algunaFase;

const AT = 'https://api.airtable.com/v0';
const HOY = '2026-07-30';

// ---------------------------------------------------------------------------
// Tandas. Baches según la nota de operación de Maleja Polania (22/07/2026).
// Decisión de David: los baches se consumieron COMPLETOS, así que los KG de Blend
// se derivan del biochar real (biochar / 0.20), no de la cifra redondeada de 27 t.
// ---------------------------------------------------------------------------
const PRODUCCIONES = [
  {
    lote: 'BLEND-2026-04-30',
    fecha: '2026-04-30', // ⚠️ día exacto sin confirmar: la nota solo dice "abril".
    baches: ['S-00186', 'S-00188', 'S-00189', 'S-00194', 'S-00205', 'S-00207'],
    nota: 'Tanda de abril 2026 ("Baches abril para Blend")',
  },
  {
    lote: 'BLEND-2026-06-24',
    fecha: '2026-06-24',
    baches: ['S-00167', 'S-00169', 'S-00170', 'S-00172', 'S-00173'],
    nota: 'Tanda del 24 de junio 2026 ("Baches Biochar Blend 24 de junio")',
  },
];

// ---------------------------------------------------------------------------
// Despachos: a qué cliente fue cada lote (David, 2026-07-30).
//
// Las cifras que dio la operación son redondeadas ("15 toneladas para Guarila,
// 12 para Inparme" = 27 t). Los KG que se despachan son los REALES del lote
// —15.528,45 y 13.050— porque los baches se vaciaron completos: esa fue la
// decisión al registrar la producción, y despachar las cifras redondeadas dejaría
// 1.578 kg de producto terminado fantasma en el inventario del Core.
//
// `kg: null` = se despacha todo el lote.
// ---------------------------------------------------------------------------
const DESPACHOS = [
  {
    lote: 'BLEND-2026-04-30',
    cliente: 'CL-0003',
    clienteNombre: 'AGRICOLA GUARILA SAS',
    kg: null,
    nota: 'Despacho referido por operacion como "15 toneladas para Guarila"',
  },
  {
    lote: 'BLEND-2026-06-24',
    cliente: 'CL-0023',
    clienteNombre: 'INPARME S.A.S',
    kg: null,
    nota: 'Despacho referido por operacion como "12 toneladas para Inparme"',
  },
];

const RESPONSABLE = 'Reconstruccion historica (David Hernandez)';
const ESTADO_BODEGA = 'Bache Completo Bodega';
const MARCA_APERTURA = 'APERTURA-BIOCHAR-BODEGA';

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

const TOKEN = env.AIRTABLE_TOKEN || env.AIRTABLE_GLOBAL_TOKEN;

// PiroliApp
const P_BASE = env.AIRTABLE_BASE_ID;
const P_BACHES = env.AIRTABLE_BACHES_TABLE_ID;
const P_REMISIONES = env.AIRTABLE_REMISIONES_BACHES_TABLE_ID;
const P_DETALLE = env.AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID;
const PF_DET_CANTIDAD = env.AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID;
const PF_DET_REMISION = env.AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID;
const PF_DET_BACHE = env.AIRTABLE_DETALLE_BACHE_PIROLISIS_FIELD_ID;
const PF_DET_LOTE = env.AIRTABLE_DETALLE_ID_PRODUCCION_BLEND_FIELD_ID;
const PF_REM_BACHES = env.AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID;
const PF_REM_FECHA = env.AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID;
const PF_REM_REGISTRA = env.AIRTABLE_REMISIONES_REALIZA_REGISTRO_FIELD_ID;
const PF_REM_OBS = env.AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID;

// Sirius Insumos Core
const I_BASE = env.AIRTABLE_INSUMOS_CORE_BASE_ID;
const I_MOVIMIENTOS = env.AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID;
const I_STOCK = env.AIRTABLE_STOCK_INSUMOS_TABLE_ID;
const IF_INSUMO = env.AIRTABLE_MOVIMIENTO_INSUMO_FIELD_ID;
const IF_CANTIDAD = env.AIRTABLE_MOVIMIENTO_CANTIDAD_FIELD_ID;
const IF_TIPO = env.AIRTABLE_MOVIMIENTO_TIPO_FIELD_ID;
const IF_NOTAS = env.AIRTABLE_MOVIMIENTO_NOTAS_FIELD_ID;
const IF_FECHA = env.AIRTABLE_MOVIMIENTO_FECHA_FIELD_ID;
const IF_BACHE = env.AIRTABLE_MOVIMIENTO_ID_BACHE_ORIGEN_FIELD_ID;
const IF_LOTE = env.AIRTABLE_MOVIMIENTO_ID_PRODUCCION_DESTINO_FIELD_ID;
const IF_AREA_ORIGEN = env.AIRTABLE_MOVIMIENTO_ID_AREA_ORIGEN_FIELD_ID;
const IF_AREA_DESTINO = env.AIRTABLE_MOVIMIENTO_ID_AREA_DESTINO_FIELD_ID;
const IF_RESPONSABLE = env.AIRTABLE_MOVIMIENTO_ID_RESPONSABLE_FIELD_ID;
const SF_MOVIMIENTOS = env.AIRTABLE_STOCK_MOVIMIENTO_ID_FIELD_ID;
const BIOCHAR_INSUMO = env.AIRTABLE_BLEND_BIOCHAR_RECORD_ID;
const AREA_PIROLISIS = env.AIRTABLE_PIROLISIS_AREA_CODE;

// Sirius Inventario Production Core
const V_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const V_MOVIMIENTOS = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const V_STOCK = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK;
const BLEND_PRODUCT = env.AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID;

const PCT_BIOCHAR = parseFloat(env.BLEND_PCT_BIOCHAR || '0.20');

const requeridas = {
  AIRTABLE_GLOBAL_TOKEN: TOKEN,
  AIRTABLE_BASE_ID: P_BASE,
  AIRTABLE_BACHES_TABLE_ID: P_BACHES,
  AIRTABLE_REMISIONES_BACHES_TABLE_ID: P_REMISIONES,
  AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID: P_DETALLE,
  AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID: PF_DET_CANTIDAD,
  AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID: PF_DET_REMISION,
  AIRTABLE_DETALLE_BACHE_PIROLISIS_FIELD_ID: PF_DET_BACHE,
  AIRTABLE_DETALLE_ID_PRODUCCION_BLEND_FIELD_ID: PF_DET_LOTE,
  AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID: PF_REM_BACHES,
  AIRTABLE_INSUMOS_CORE_BASE_ID: I_BASE,
  AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID: I_MOVIMIENTOS,
  AIRTABLE_STOCK_INSUMOS_TABLE_ID: I_STOCK,
  AIRTABLE_MOVIMIENTO_FECHA_FIELD_ID: IF_FECHA,
  AIRTABLE_MOVIMIENTO_ID_BACHE_ORIGEN_FIELD_ID: IF_BACHE,
  AIRTABLE_MOVIMIENTO_ID_PRODUCCION_DESTINO_FIELD_ID: IF_LOTE,
  AIRTABLE_BLEND_BIOCHAR_RECORD_ID: BIOCHAR_INSUMO,
  AIRTABLE_BASE_SIRIUS_INVENTARIO: V_BASE,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: V_MOVIMIENTOS,
  AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID: BLEND_PRODUCT,
};
const faltantes = Object.entries(requeridas).filter(([, v]) => !v).map(([k]) => k);
if (faltantes.length) {
  console.error('❌ Faltan variables en .env.local:\n  - ' + faltantes.join('\n  - '));
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function at(url, init = {}) {
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function atAll(base, table, params = {}) {
  const out = [];
  let offset;
  do {
    const url = new URL(`${AT}/${base}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString());
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return out;
}

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function num(v) {
  const n = typeof v === 'object' && v !== null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (v) => v.toLocaleString('es-CO', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
async function cargarBaches() {
  const porCodigo = new Map();
  for (const r of await atAll(P_BASE, P_BACHES)) {
    const codigo = String(r.fields?.['Codigo Bache'] ?? '');
    if (!codigo) continue;
    porCodigo.set(codigo, {
      id: r.id,
      codigo,
      disponible: num(r.fields?.['Total Cantidad Actual Biochar Seco']),
      salido: num(r.fields?.['Total Cantidad Biochar Seco Salio (KG)']),
      estado: String(r.fields?.['Estado Bache'] ?? ''),
      creado: String(r.fields?.['Fecha Creacion'] ?? '').slice(0, 10),
    });
  }
  return porCodigo;
}

/** Movimientos de Biochar Puro ya existentes en el Core, para idempotencia. */
async function cargarMovimientosBiochar() {
  const movs = await atAll(I_BASE, I_MOVIMIENTOS, { returnFieldsByFieldId: 'true' });
  return movs
    .filter((m) => (m.fields?.[IF_INSUMO] ?? []).includes(BIOCHAR_INSUMO))
    .map((m) => ({
      id: m.id,
      tipo: String(m.fields?.[IF_TIPO] ?? ''),
      cantidad: num(m.fields?.[IF_CANTIDAD]),
      bache: String(m.fields?.[IF_BACHE] ?? ''),
      lote: String(m.fields?.[IF_LOTE] ?? ''),
    }));
}

/** El registro de Stock Insumos del biochar (para vincularle los movimientos). */
async function stockBiochar() {
  const stocks = await atAll(I_BASE, I_STOCK, { returnFieldsByFieldId: 'true' });
  const insumoField = env.AIRTABLE_STOCK_INSUMO_ID_FIELD_ID;
  const rec = stocks.find((s) => (s.fields?.[insumoField] ?? []).includes(BIOCHAR_INSUMO));
  if (!rec) throw new Error('No existe registro en Stock Insumos para Biochar Puro');
  return { id: rec.id, movimientos: [...(rec.fields?.[SF_MOVIMIENTOS] ?? [])] };
}

/**
 * Crea movimientos en Insumos Core y los vincula al Stock.
 * El PATCH de un campo link REEMPLAZA el array, así que hay que enviar los ya
 * vinculados junto con los nuevos o se borra el histórico (y con él stock_actual).
 */
async function crearMovimientos(registros, stock) {
  const creados = [];
  for (let i = 0; i < registros.length; i += 10) {
    const lote = registros.slice(i, i + 10);
    const res = await at(`${AT}/${I_BASE}/${I_MOVIMIENTOS}`, {
      method: 'POST',
      body: JSON.stringify({ records: lote.map((fields) => ({ fields })) }),
    });
    creados.push(...(res.records ?? []).map((r) => r.id));
  }
  stock.movimientos.push(...creados);
  await at(`${AT}/${I_BASE}/${I_STOCK}/${stock.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { [SF_MOVIMIENTOS]: stock.movimientos } }),
  });
  return creados;
}

function movimientoBase(tipo, cantidad, fecha, notas) {
  const f = {
    [IF_INSUMO]: [BIOCHAR_INSUMO],
    [IF_CANTIDAD]: cantidad,
    [IF_TIPO]: tipo,
    [IF_FECHA]: fecha,
  };
  if (IF_NOTAS) f[IF_NOTAS] = notas;
  if (IF_RESPONSABLE) f[IF_RESPONSABLE] = RESPONSABLE;
  if (AREA_PIROLISIS) {
    if (tipo === 'Entrada' && IF_AREA_DESTINO) f[IF_AREA_DESTINO] = AREA_PIROLISIS;
    if (tipo === 'Salida' && IF_AREA_ORIGEN) f[IF_AREA_ORIGEN] = AREA_PIROLISIS;
  }
  return f;
}

// ---------------------------------------------------------------------------
// FASE 1 — Apertura del inventario de biochar en el Core
// ---------------------------------------------------------------------------
async function apertura(baches, movimientos) {
  console.log('┌─ FASE 1: apertura del inventario de Biochar Puro en Sirius Insumos Core');

  const yaCargados = new Set(movimientos.filter((m) => m.tipo === 'Entrada').map((m) => m.bache));

  const pendientes = [...baches.values()]
    .filter((b) => b.estado === ESTADO_BODEGA && b.disponible > 0 && !yaCargados.has(b.codigo))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  const yaEstaban = [...baches.values()].filter(
    (b) => b.estado === ESTADO_BODEGA && b.disponible > 0 && yaCargados.has(b.codigo)
  ).length;

  if (yaEstaban) console.log(`│  ${yaEstaban} bache(s) ya cargados previamente: se saltan.`);
  if (!pendientes.length) {
    console.log('│  Nada por cargar.\n└─\n');
    return 0;
  }

  const total = r2(pendientes.reduce((s, b) => s + b.disponible, 0));
  console.log(`│  ${pendientes.length} baches en "${ESTADO_BODEGA}" con stock → ${fmt(total)} kg`);
  console.log(`│  rango: ${pendientes[0].codigo} … ${pendientes[pendientes.length - 1].codigo}`);
  console.log(`│  fecha de cada Entrada: fecha de creación del bache (o ${HOY} si falta)`);

  if (!APPLY) {
    console.log('└─ dry-run: no se escribió nada\n');
    return total;
  }

  const stock = await stockBiochar();
  const registros = pendientes.map((b) => ({
    ...movimientoBase(
      'Entrada',
      b.disponible,
      b.creado || HOY,
      `${MARCA_APERTURA} — biochar seco del bache ${b.codigo} en bodega`
    ),
    [IF_BACHE]: b.codigo,
  }));
  const creados = await crearMovimientos(registros, stock);
  console.log(`└─ ✓ ${creados.length} movimientos de Entrada creados (${fmt(total)} kg)\n`);
  return total;
}

// ---------------------------------------------------------------------------
// FASE 2 — Producciones
// ---------------------------------------------------------------------------
async function producir(baches, movimientos) {
  console.log('┌─ FASE 2: producciones de Biochar Blend');

  const lotesRegistrados = new Set(movimientos.filter((m) => m.tipo === 'Salida' && m.lote).map((m) => m.lote));
  const entradasPorBache = new Set(movimientos.filter((m) => m.tipo === 'Entrada').map((m) => m.bache));

  const plan = [];
  let errores = 0;

  for (const prod of PRODUCCIONES) {
    if (lotesRegistrados.has(prod.lote)) {
      console.log(`│  ⏭ ${prod.lote}: ya registrado, se salta.`);
      continue;
    }
    const asignaciones = [];
    for (const codigo of prod.baches) {
      const b = baches.get(codigo);
      if (!b) {
        console.error(`│  ❌ ${prod.lote}: bache ${codigo} no existe`);
        errores++;
        continue;
      }
      if (b.disponible <= 0) {
        console.error(`│  ❌ ${prod.lote}: bache ${codigo} sin biochar disponible (${b.disponible} kg)`);
        errores++;
        continue;
      }
      if (b.salido > 0) {
        console.error(`│  ❌ ${prod.lote}: bache ${codigo} ya tiene ${b.salido} kg de salidas → posible doble descuento`);
        errores++;
        continue;
      }
      if (!entradasPorBache.has(codigo) && APPLY) {
        console.error(`│  ❌ ${prod.lote}: bache ${codigo} no tiene Entrada en el Core. Corre --apertura primero.`);
        errores++;
        continue;
      }
      asignaciones.push({ bacheId: b.id, codigo, kg: b.disponible });
    }
    const kgBiochar = r2(asignaciones.reduce((s, a) => s + a.kg, 0));
    const kgBlend = r2(kgBiochar / PCT_BIOCHAR);
    console.log(`│`);
    console.log(`│  ${prod.lote}  (${prod.fecha})`);
    for (const a of asignaciones) console.log(`│    ${a.codigo}  ${String(Math.round(a.kg)).padStart(5)} kg → 0`);
    console.log(`│    biochar ${fmt(kgBiochar)} kg  →  Blend ${fmt(kgBlend)} kg`);
    plan.push({ prod, asignaciones, kgBiochar, kgBlend });
  }

  if (errores) {
    console.error(`└─ ❌ ${errores} problema(s) de validación: no se escribe nada.\n`);
    process.exit(1);
  }
  if (!plan.length) {
    console.log('│  Nada por producir.\n└─\n');
    return;
  }

  const totalBlend = plan.reduce((s, p) => s + p.kgBlend, 0);
  const totalBiochar = plan.reduce((s, p) => s + p.kgBiochar, 0);
  console.log(`│`);
  console.log(`│  TOTAL: ${fmt(totalBlend)} kg de Blend  ·  ${fmt(totalBiochar)} kg de biochar consumido`);

  if (!APPLY) {
    console.log('└─ dry-run: no se escribió nada\n');
    return;
  }

  const stock = await stockBiochar();

  for (const { prod, asignaciones, kgBiochar, kgBlend } of plan) {
    console.log(`│`);
    console.log(`│  ▶ ${prod.lote}`);

    // 2a. Salidas de biochar en Insumos Core: una por bache, con origen y destino.
    const salidas = asignaciones.map((a) => ({
      ...movimientoBase(
        'Salida',
        a.kg,
        prod.fecha,
        `Consumo para produccion de Biochar Blend ${prod.lote} — bache ${a.codigo}\n${prod.nota}`
      ),
      [IF_BACHE]: a.codigo,
      [IF_LOTE]: prod.lote,
    }));
    await crearMovimientos(salidas, stock);
    console.log(`│    ✓ ${salidas.length} Salidas de biochar en Insumos Core`);

    // 2b. Espejo en PiroliApp: es lo que baja la fórmula del bache a 0.
    const remisionFields = { [PF_REM_BACHES]: asignaciones.map((a) => a.bacheId) };
    if (PF_REM_FECHA) remisionFields[PF_REM_FECHA] = prod.fecha;
    if (PF_REM_REGISTRA) remisionFields[PF_REM_REGISTRA] = RESPONSABLE;
    if (PF_REM_OBS) {
      remisionFields[PF_REM_OBS] =
        `Consumo interno para produccion de Biochar Blend ${prod.lote}. ` +
        `Movimientos de inventario en Sirius Insumos Core (Biochar Puro) y producto ` +
        `terminado en Sirius Inventario Production Core.`;
    }
    const remision = await at(`${AT}/${P_BASE}/${P_REMISIONES}`, {
      method: 'POST',
      body: JSON.stringify({ fields: remisionFields }),
    });

    const detalle = asignaciones.map((a) => ({
      fields: {
        [PF_DET_CANTIDAD]: a.kg,
        [PF_DET_REMISION]: [remision.id],
        [PF_DET_BACHE]: [a.bacheId],
        [PF_DET_LOTE]: prod.lote,
      },
    }));
    try {
      await at(`${AT}/${P_BASE}/${P_DETALLE}`, { method: 'POST', body: JSON.stringify({ records: detalle }) });
      console.log(`│    ✓ ${detalle.length} filas de detalle en PiroliApp → stock de baches descontado`);
    } catch (err) {
      await fetch(`${AT}/${P_BASE}/${P_REMISIONES}/${remision.id}`, { method: 'DELETE', headers }).catch(() => {});
      throw new Error(
        `Falló el espejo en PiroliApp para ${prod.lote} (remisión eliminada, pero las Salidas ` +
          `del Core YA se crearon: bórralas a mano antes de reintentar): ${err.message}`
      );
    }

    // 2c. Producto terminado: este movimiento ES el lote producido.
    let stockRecordId = null;
    if (V_STOCK) {
      const q = new URLSearchParams({ filterByFormula: `{producto_id}='${BLEND_PRODUCT}'`, maxRecords: '1' });
      const s = await at(`${AT}/${V_BASE}/${V_STOCK}?${q.toString()}`);
      stockRecordId = s.records?.[0]?.id ?? null;
    }
    const fields = {
      product_id: BLEND_PRODUCT,
      tipo_movimiento: 'Entrada',
      cantidad: kgBlend,
      unidad_medida: 'kg',
      motivo: `Produccion Biochar Blend ${prod.lote}`,
      documento_referencia: prod.lote,
      responsable: RESPONSABLE,
      fecha_movimiento: `${prod.fecha}T12:00:00.000Z`,
      observaciones:
        `${prod.nota}\n` +
        `Biochar consumido: ${fmt(kgBiochar)} kg de ${asignaciones.length} baches ` +
        `(${asignaciones.map((a) => `${a.codigo}: ${Math.round(a.kg)} kg`).join(', ')}).\n` +
        `Trazabilidad de insumos: Sirius Insumos Core, movimientos de Salida con ` +
        `ID Produccion Destino = ${prod.lote}.\n` +
        `Abono 4G y Biologicos NO se descuentan: su stock en el Core es un conteo ` +
        `fisico del 2026-07-27, posterior a este consumo.`,
    };
    if (stockRecordId) fields.Stock_Actual = [stockRecordId];
    await at(`${AT}/${V_BASE}/${V_MOVIMIENTOS}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] }),
    });
    console.log(`│    ✓ Entrada de ${fmt(kgBlend)} kg de Blend en Inventario Production Core`);
  }
  console.log('└─ ✓ producciones registradas\n');
}

// ---------------------------------------------------------------------------
// FASE 3 — Despachos a cliente
// ---------------------------------------------------------------------------
async function despachar() {
  console.log('┌─ FASE 3: despachos de Biochar Blend a cliente');

  // Movimientos del producto terminado: las Entradas dicen qué se produjo por lote,
  // las Salidas qué ya se despachó (idempotencia por `documento_referencia`).
  const movimientos = await atAll(V_BASE, V_MOVIMIENTOS, {
    filterByFormula: `{product_id}='${BLEND_PRODUCT.replace(/'/g, "\\'")}'`,
  });

  const producidoPorLote = new Map();
  const despachadoPorLote = new Map();
  const docsExistentes = new Set();

  for (const m of movimientos) {
    const lote = String(m.fields?.['documento_referencia'] ?? '');
    const kg = num(m.fields?.['cantidad']);
    const tipo = String(m.fields?.['tipo_movimiento'] ?? '');
    if (tipo === 'Entrada') {
      producidoPorLote.set(lote, (producidoPorLote.get(lote) ?? 0) + kg);
    } else if (tipo === 'Salida') {
      docsExistentes.add(lote);
      // El doc de la salida es DESP-<lote>-<cliente>: se extrae el lote de ahí.
      const m2 = lote.match(/^DESP-(BLEND-\d{4}-\d{2}-\d{2})-/);
      if (m2) despachadoPorLote.set(m2[1], (despachadoPorLote.get(m2[1]) ?? 0) + kg);
    }
  }

  const plan = [];
  let errores = 0;

  for (const d of DESPACHOS) {
    const doc = `DESP-${d.lote}-${d.cliente}`;
    if (docsExistentes.has(doc)) {
      console.log(`│  ⏭ ${doc}: ya registrado, se salta.`);
      continue;
    }

    const producido = r2(producidoPorLote.get(d.lote) ?? 0);
    if (!producido) {
      console.error(`│  ❌ ${d.lote}: no hay Entrada de producción en el Core. Corre --producir primero.`);
      errores++;
      continue;
    }

    const yaDespachado = r2(despachadoPorLote.get(d.lote) ?? 0);
    const disponible = r2(producido - yaDespachado);
    const kg = d.kg === null ? disponible : r2(d.kg);

    if (kg <= 0) {
      console.error(`│  ❌ ${d.lote}: no queda producto por despachar (producido ${fmt(producido)}, despachado ${fmt(yaDespachado)}).`);
      errores++;
      continue;
    }
    if (kg > disponible + 0.01) {
      console.error(
        `│  ❌ ${d.lote}: se piden ${fmt(kg)} kg pero solo quedan ${fmt(disponible)} kg del lote ` +
          `(producido ${fmt(producido)}, ya despachado ${fmt(yaDespachado)}).`
      );
      errores++;
      continue;
    }

    console.log(`│`);
    console.log(`│  ${d.lote}  →  ${d.cliente} (${d.clienteNombre})`);
    console.log(`│    producido ${fmt(producido)} kg  ·  se despacha ${fmt(kg)} kg  ·  queda ${fmt(r2(disponible - kg))} kg`);
    plan.push({ ...d, doc, kg, producido });
  }

  if (errores) {
    console.error(`└─ ❌ ${errores} problema(s) de validación: no se escribe nada.\n`);
    process.exit(1);
  }
  if (!plan.length) {
    console.log('│  Nada por despachar.\n└─\n');
    return;
  }

  const total = plan.reduce((s, p) => s + p.kg, 0);
  console.log(`│`);
  console.log(`│  TOTAL a despachar: ${fmt(total)} kg`);

  if (!APPLY) {
    console.log('└─ dry-run: no se escribió nada\n');
    return;
  }

  // El saldo de producto terminado es una fórmula que suma por el link a
  // Movimientos_Inventario: sin vincular la Salida, el stock no baja.
  let stockRecordId = null;
  if (V_STOCK) {
    const q = new URLSearchParams({
      filterByFormula: `{producto_id}='${BLEND_PRODUCT.replace(/'/g, "\\'")}'`,
      maxRecords: '1',
    });
    const s = await at(`${AT}/${V_BASE}/${V_STOCK}?${q.toString()}`);
    stockRecordId = s.records?.[0]?.id ?? null;
  }

  for (const p of plan) {
    const prod = PRODUCCIONES.find((x) => x.lote === p.lote);
    const fields = {
      product_id: BLEND_PRODUCT,
      tipo_movimiento: 'Salida',
      cantidad: p.kg,
      unidad_medida: 'kg',
      // Para una Salida el destino es el cliente. Las Entradas usan este mismo
      // campo para el pedido (SIRIUS-PED-XXXX); no colisionan porque las consultas
      // filtran también por tipo_movimiento.
      ubicacion_destino_id: p.cliente,
      motivo: `Despacho de Biochar Blend ${p.lote} a ${p.clienteNombre}`,
      documento_referencia: p.doc,
      responsable: RESPONSABLE,
      fecha_movimiento: `${prod?.fecha ?? HOY}T12:00:00.000Z`,
      observaciones:
        `${p.nota}\n` +
        `Cliente: ${p.clienteNombre} (${p.cliente}) — Sirius Clients Core.\n` +
        `Lote de produccion: ${p.lote} (${fmt(p.producido)} kg producidos).\n` +
        `Se despacha el total real del lote y no la cifra redondeada de operacion: ` +
        `los baches se vaciaron completos.\n` +
        `⚠️ Fecha del despacho asumida igual a la de produccion: la fecha real de ` +
        `entrega se perdio al borrarse blend_remisiones. Sin remision asociada en ` +
        `Sirius Remisiones Core.`,
    };
    if (stockRecordId) fields.Stock_Actual = [stockRecordId];

    await at(`${AT}/${V_BASE}/${V_MOVIMIENTOS}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] }),
    });
    console.log(`│    ✓ ${p.doc} — ${fmt(p.kg)} kg a ${p.clienteNombre}`);
  }

  console.log('└─ ✓ despachos registrados\n');
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`  BIOCHAR BLEND EN LOS CORE — ${APPLY ? '⚠️  MODO APPLY' : 'DRY-RUN (no escribe nada)'}`);
  console.log(`${'═'.repeat(78)}\n`);

  const baches = await cargarBaches();
  const movimientos = await cargarMovimientosBiochar();
  console.log(`Biochar Puro en el Core: ${movimientos.length} movimiento(s) existentes.\n`);

  if (HACER_APERTURA) await apertura(baches, movimientos);
  if (HACER_PRODUCIR) await producir(baches, movimientos);
  if (HACER_DESPACHAR) await despachar();

  if (!APPLY) console.log('Reejecuta con --apply para aplicar.\n');
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});

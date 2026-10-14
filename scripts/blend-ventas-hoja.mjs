#!/usr/bin/env node
/**
 * Asienta en el libro mayor del Biochar Blend (`SIRIUS-PRODUCT-0016`, Inventario
 * Production Core) las ventas de Blend de 2026 de la hoja de bodega, unidas por
 * `produccion_destino_id` a las Salidas de biochar y de abono del mismo despacho.
 *
 * ═══ POR QUÉ (2026-10-07) ═════════════════════════════════════════════════════
 * El biochar (11.230 kg) y el abono ya cuadran con la hoja, pero el Blend no: a
 * seis ventas les faltaba el producto terminado entero, y Guarila e Inparme tenían
 * los kg reconstruidos desde el biochar en seco (15.528,45 y 13.050), no los de la
 * hoja (17.330 y 10.010).
 *
 * NO crea pedidos. David decidió no tocar Pedidos Core: la junta de cada venta es
 * el código de destino, el mismo que ya llevan su biochar y su abono, y el cliente
 * va en el movimiento. Una venta = una Entrada de Blend (lo que se mezcló) y una
 * Salida (lo que se despachó), así que el saldo del Blend no cambia.
 *
 * Convención de la app (`registrarEntradaBlend()`, `lotesDisponiblesBlend()`):
 *   Entrada  documento_referencia = destino · produccion_destino_id = destino
 *   Salida   documento_referencia = DESP-<destino>-<CL> · produccion_destino_id = destino
 *
 * Guarila salió en dos despachos (7 y 14 de abril) de un solo lote: una Entrada y
 * dos Salidas. La Entrada se fecha el 7-abr porque no se puede despachar antes de
 * producir; el código del lote (`BLEND-2026-04-30`) no se toca: es la llave que
 * comparten el biochar y el abono.
 *
 * Idempotente: compara contra lo que ya está y solo escribe la diferencia.
 *
 * Uso:
 *   node scripts/blend-ventas-hoja.mjs            # ensayo
 *   node scripts/blend-ventas-hoja.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const AT = 'https://api.airtable.com/v0';
const TOL = 0.01;
const HOY = new Date().toISOString().slice(0, 10);
/** 53.152 kg de 2026 + 33.000 kg de 2025. */
const TOTAL_HOJA = 86152;

/** Las ventas de la hoja. `entrada` es la fecha de producción cuando difiere del despacho. */
const VENTAS = [
  // 2025: el biochar salió de baches de la era V2, que no están en el inventario del
  // Core (arranca en S-00128) y se consumió hace un año. Solo se asienta el Blend,
  // unido al abono que ya existe; el biochar queda en `Salidas Historicas` de los
  // baches migrados (decisión de David, 2026-10-07).
  { destino: 'SAL-GUAICARAMO-2025-07-11', cl: 'CL-0001', cliente: 'GUAICARAMO SAS', entrada: '2025-07-11', salidas: [{ fecha: '2025-07-11', kg: 1500 }], sinBiochar: true },
  { destino: 'SAL-GUAICARAMO-2025-08-01', cl: 'CL-0001', cliente: 'GUAICARAMO SAS', entrada: '2025-08-01', salidas: [{ fecha: '2025-08-01', kg: 29000 }], sinBiochar: true },
  { destino: 'SAL-BELLACRUZ-2025-08-14', cl: 'CL-0002', cliente: 'BELLACRUZ DEL LLANO S A S', entrada: '2025-08-14', salidas: [{ fecha: '2025-08-14', kg: 2500 }], sinBiochar: true },
  { destino: 'SAL-BELLACRUZ-2026-03-15', cl: 'CL-0002', cliente: 'BELLACRUZ DEL LLANO S A S', entrada: '2026-03-15', salidas: [{ fecha: '2026-03-15', kg: 3440 }] },
  { destino: 'SAL-SAPUGA-2026-03-23', cl: 'CL-0009', cliente: 'SAPUGA SA', entrada: '2026-03-23', salidas: [{ fecha: '2026-03-23', kg: 7500 }] },
  { destino: 'SAL-LA-LOMA-2026-03-23', cl: 'CL-0016', cliente: 'AGROPECUARIA LA LOMA S.A.S', entrada: '2026-03-23', salidas: [{ fecha: '2026-03-23', kg: 4000 }] },
  {
    destino: 'BLEND-2026-04-30', cl: 'CL-0003', cliente: 'AGRICOLA GUARILA SAS', entrada: '2026-04-07',
    salidas: [{ fecha: '2026-04-07', kg: 5000 }, { fecha: '2026-04-14', kg: 12330 }],
  },
  { destino: 'BLEND-2026-06-24', cl: 'CL-0023', cliente: 'INPARME S.A.S', entrada: '2026-06-24', salidas: [{ fecha: '2026-07-01', kg: 10010 }] },
  { destino: 'SAL-GUAICARAMO-2026-07-22', cl: 'CL-0001', cliente: 'GUAICARAMO SAS', entrada: '2026-07-22', salidas: [{ fecha: '2026-07-22', kg: 102 }] },
  { destino: 'BLEND-2026-08-28', cl: 'CL-0001', cliente: 'GUAICARAMO SAS', entrada: '2026-08-28', salidas: [{ fecha: '2026-09-01', kg: 10000 }] },
  { destino: 'SAL-BELLACRUZ-2026-09-01', cl: 'CL-0002', cliente: 'BELLACRUZ DEL LLANO S A S', entrada: '2026-09-01', salidas: [{ fecha: '2026-09-01', kg: 770 }] },
];

/** El abono de Bellacruz 1-sep quedó con un destino de texto libre: se une a su despacho. */
const ABONO_RELINK = { de: 'Mezcla para Bella Cruz', a: 'SAL-BELLACRUZ-2026-09-01' };

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

const TOKEN = env.AIRTABLE_API_KEY_SIRIUS_INVENTARIO || env.AIRTABLE_GLOBAL_TOKEN;
const BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const MOV = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const STOCK = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK;
const BLEND = env.AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID;
const BIOCHAR = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;
const ABONO = env.AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID;

const faltantes = Object.entries({ TOKEN, BASE, MOV, STOCK, BLEND, BIOCHAR, ABONO }).filter(([, v]) => !v).map(([k]) => k);
if (faltantes.length) {
  console.error(`❌ Faltan variables en .env.local: ${faltantes.join(', ')}`);
  process.exit(1);
}

async function at(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(data)}`);
  return data ?? {};
}

async function fetchAll(params = {}, table = MOV) {
  const out = [];
  let offset;
  do {
    const url = new URL(`${AT}/${BASE}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString());
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return out;
}

async function enLotes(method, records) {
  for (let i = 0; i < records.length; i += 10) {
    await at(`${AT}/${BASE}/${MOV}`, { method, body: JSON.stringify({ records: records.slice(i, i + 10) }) });
    await new Promise((r) => setTimeout(r, 250));
  }
}

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => r2(n).toLocaleString('es-CO', { minimumFractionDigits: 2 });
const num = (v) => {
  const n = typeof v === 'object' && v !== null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const iso = (fecha) => `${fecha}T12:00:00.000Z`;
const dia = (v) => String(v ?? '').slice(0, 10);
const marca = (texto) => `[VENTA-HOJA ${HOY}] ${texto}`;
const conMarca = (obs, texto) => (obs ? `${obs}\n${marca(texto)}` : marca(texto));

// ---------------------------------------------------------------------------
async function main() {
  console.log(APPLY ? '⚠️  MODO APPLY: se escribirá en Airtable\n' : '🔎 Ensayo (dry-run): no se escribe nada\n');

  const totalHoja = VENTAS.reduce((t, v) => t + v.salidas.reduce((s, x) => s + x.kg, 0), 0);
  if (Math.abs(totalHoja - TOTAL_HOJA) > TOL) throw new Error(`VENTAS suma ${totalHoja}, la hoja ${TOTAL_HOJA}`);

  const [blend, stock, otros, abonoRelink] = await Promise.all([
    fetchAll({ filterByFormula: `{product_id} = '${esc(BLEND)}'` }),
    fetchAll({ filterByFormula: `{producto_id} = '${esc(BLEND)}'` }, STOCK),
    fetchAll({
      filterByFormula: `AND(OR({product_id} = '${esc(BIOCHAR)}', {product_id} = '${esc(ABONO)}'), {tipo_movimiento} = 'Salida')`,
    }),
    fetchAll({
      filterByFormula: `AND({product_id} = '${esc(ABONO)}', {produccion_destino_id} = '${esc(ABONO_RELINK.de)}')`,
    }),
  ]);
  if (stock.length !== 1) throw new Error(`Se esperaba 1 fila de Stock_Actual del Blend y hay ${stock.length}`);
  const stockId = stock[0].id;

  const patches = [];
  const nuevas = [];
  const lineas = [];

  for (const v of VENTAS) {
    const kgTotal = v.salidas.reduce((t, s) => t + s.kg, 0);
    const delDestino = blend.filter((m) => String(m.fields.produccion_destino_id ?? m.fields.documento_referencia ?? '') === v.destino
      || String(m.fields.documento_referencia ?? '').startsWith(`DESP-${v.destino}-`)
      || String(m.fields.documento_referencia ?? '') === v.destino);
    const entradas = delDestino.filter((m) => m.fields.tipo_movimiento === 'Entrada');
    const salidas = delDestino.filter((m) => m.fields.tipo_movimiento === 'Salida');

    // Que el biochar y el abono de este despacho estén, o la junta no sirve.
    const componentes = otros.filter((m) => m.fields.produccion_destino_id === v.destino);
    const tieneBiochar = componentes.some((m) => m.fields.product_id === BIOCHAR);
    const tieneAbono = componentes.some((m) => m.fields.product_id === ABONO)
      || (v.destino === ABONO_RELINK.a && abonoRelink.length > 0);
    lineas.push(`\n${v.destino} · ${v.cliente} · ${fmt(kgTotal)} kg  (biochar ${v.sinBiochar ? '— 2025, fuera del inventario' : tieneBiochar ? '✅' : '❌'} · abono ${tieneAbono ? '✅' : '❌'})`);

    // ── Entrada ──────────────────────────────────────────────────────────────
    if (entradas.length > 1) throw new Error(`${v.destino}: ${entradas.length} Entradas de Blend, revisar a mano`);
    const fEntrada = {
      cantidad: kgTotal,
      fecha_movimiento: iso(v.entrada),
      produccion_destino_id: v.destino,
    };
    if (entradas.length) {
      const e = entradas[0];
      const cambia = Math.abs(num(e.fields.cantidad) - kgTotal) > TOL || dia(e.fields.fecha_movimiento) !== v.entrada
        || e.fields.produccion_destino_id !== v.destino;
      if (cambia) {
        patches.push({
          id: e.id,
          fields: { ...fEntrada, observaciones: conMarca(String(e.fields.observaciones ?? ''), `Entrada ${fmt(num(e.fields.cantidad))} kg del ${dia(e.fields.fecha_movimiento)} → ${fmt(kgTotal)} kg del ${v.entrada}, según la hoja de bodega.`) },
        });
        lineas.push(`   ✏️  Entrada ${e.fields.id_movimiento}: ${fmt(num(e.fields.cantidad))} kg ${dia(e.fields.fecha_movimiento)} → ${fmt(kgTotal)} kg ${v.entrada}`);
      } else lineas.push(`   ✅ Entrada ${e.fields.id_movimiento}: ${fmt(kgTotal)} kg`);
    } else {
      nuevas.push({
        fields: {
          product_id: BLEND,
          tipo_movimiento: 'Entrada',
          unidad_medida: 'kg',
          documento_referencia: v.destino,
          motivo: `Producción de Biochar Blend — ${v.destino}`,
          responsable: 'Venta de la hoja de bodega (David Hernandez)',
          observaciones: marca(
            v.sinBiochar
              ? `Blend mezclado para la venta a ${v.cliente}. Su abono salió con el mismo destino; su biochar, de baches de la era V2 que no están en este inventario.`
              : `Blend mezclado para la venta a ${v.cliente}. Su biochar y su abono salieron con el mismo destino.`
          ),
          Stock_Actual: [stockId],
          ...fEntrada,
        },
      });
      lineas.push(`   ➕ Entrada nueva: ${fmt(kgTotal)} kg ${v.entrada}`);
    }

    // ── Salidas ──────────────────────────────────────────────────────────────
    // La primera salida de la hoja reusa la existente; las demás se crean.
    const pendientes = [...v.salidas];
    const existentes = [...salidas].sort((a, b) => dia(a.fields.fecha_movimiento).localeCompare(dia(b.fields.fecha_movimiento)));
    if (existentes.length > pendientes.length) throw new Error(`${v.destino}: más Salidas de Blend que en la hoja, revisar a mano`);

    // Emparejar: primero por fecha exacta, luego en orden.
    const asignadas = new Map();
    for (const m of existentes) {
      const i = pendientes.findIndex((s, idx) => !asignadas.has(idx) && s.fecha === dia(m.fields.fecha_movimiento));
      if (i >= 0) asignadas.set(i, m);
    }
    // Una salida sin fecha que coincida se corrige hacia el despacho más grande
    // libre: la histórica de Guarila (15.528,45) es la del 14-abr (12.330), no la
    // del 7-abr (5.000).
    for (const m of existentes) {
      if ([...asignadas.values()].includes(m)) continue;
      const libres = pendientes.map((s, idx) => ({ s, idx })).filter(({ idx }) => !asignadas.has(idx));
      libres.sort((a, b) => b.s.kg - a.s.kg);
      asignadas.set(libres[0].idx, m);
    }

    pendientes.forEach((s, idx) => {
      const docBase = `DESP-${v.destino}-${v.cl}`;
      const m = asignadas.get(idx);
      if (m) {
        const cambia = Math.abs(num(m.fields.cantidad) - s.kg) > TOL || dia(m.fields.fecha_movimiento) !== s.fecha
          || m.fields.produccion_destino_id !== v.destino || m.fields.ubicacion_destino_id !== v.cliente;
        if (cambia) {
          patches.push({
            id: m.id,
            fields: {
              cantidad: s.kg,
              fecha_movimiento: iso(s.fecha),
              produccion_destino_id: v.destino,
              ubicacion_destino_id: v.cliente,
              observaciones: conMarca(String(m.fields.observaciones ?? ''), `Salida ${fmt(num(m.fields.cantidad))} kg del ${dia(m.fields.fecha_movimiento)} → ${fmt(s.kg)} kg del ${s.fecha}, según la hoja de bodega.`),
            },
          });
          lineas.push(`   ✏️  Salida ${m.fields.id_movimiento}: ${fmt(num(m.fields.cantidad))} kg ${dia(m.fields.fecha_movimiento)} → ${fmt(s.kg)} kg ${s.fecha}`);
        } else lineas.push(`   ✅ Salida ${m.fields.id_movimiento}: ${fmt(s.kg)} kg ${s.fecha}`);
        return;
      }
      const doc = pendientes.length > 1 ? `${docBase}-${s.fecha}` : docBase;
      if (blend.some((b) => b.fields.documento_referencia === doc)) throw new Error(`Ya existe ${doc}`);
      nuevas.push({
        fields: {
          product_id: BLEND,
          tipo_movimiento: 'Salida',
          cantidad: s.kg,
          unidad_medida: 'kg',
          documento_referencia: doc,
          produccion_destino_id: v.destino,
          ubicacion_destino_id: v.cliente,
          fecha_movimiento: iso(s.fecha),
          motivo: `Despacho de Biochar Blend a ${v.cliente}`,
          responsable: 'Venta de la hoja de bodega (David Hernandez)',
          observaciones: marca(`Venta de ${fmt(s.kg)} kg de Blend a ${v.cliente} (${v.cl}) del ${s.fecha}, sin pedido ni remisión en el Core.`),
          Stock_Actual: [stockId],
        },
      });
      lineas.push(`   ➕ Salida nueva ${doc}: ${fmt(s.kg)} kg ${s.fecha}`);
    });
  }

  for (const m of abonoRelink) {
    patches.push({
      id: m.id,
      fields: {
        produccion_destino_id: ABONO_RELINK.a,
        observaciones: conMarca(String(m.fields.observaciones ?? ''), `Destino «${ABONO_RELINK.de}» → ${ABONO_RELINK.a}: es el abono de la venta a Bellacruz del 1-sep.`),
      },
    });
    lineas.push(`\n🔗 Abono ${m.fields.id_movimiento} (${fmt(num(m.fields.cantidad))} kg): destino «${ABONO_RELINK.de}» → ${ABONO_RELINK.a}`);
  }

  console.log(lineas.join('\n'));

  // ── Verificación ──────────────────────────────────────────────────────────
  const despues = new Map(blend.map((m) => [m.id, { ...m.fields }]));
  for (const p of patches) if (despues.has(p.id)) Object.assign(despues.get(p.id), p.fields);
  const todos = [...despues.values(), ...nuevas.map((n) => n.fields)];
  const suma = (tipo) => r2(todos.filter((f) => f.tipo_movimiento === tipo).reduce((t, f) => t + num(f.cantidad), 0));
  const antesE = r2(blend.filter((m) => m.fields.tipo_movimiento === 'Entrada').reduce((t, m) => t + num(m.fields.cantidad), 0));
  const antesS = r2(blend.filter((m) => m.fields.tipo_movimiento === 'Salida').reduce((t, m) => t + num(m.fields.cantidad), 0));
  const ventasHoja = r2(todos.filter((f) => f.tipo_movimiento === 'Salida' && VENTAS.some((v) => v.destino === f.produccion_destino_id)).reduce((t, f) => t + num(f.cantidad), 0));

  console.log('\nBlend                antes          después');
  console.log(`Entradas      ${fmt(antesE).padStart(14)} ${fmt(suma('Entrada')).padStart(16)}`);
  console.log(`Salidas       ${fmt(antesS).padStart(14)} ${fmt(suma('Salida')).padStart(16)}`);
  console.log(`Saldo         ${fmt(antesE - antesS).padStart(14)} ${fmt(suma('Entrada') - suma('Salida')).padStart(16)}`);
  console.log(`\nVentas de la hoja en el libro mayor: ${fmt(ventasHoja)} kg ${Math.abs(ventasHoja - TOTAL_HOJA) <= TOL ? '✅' : '❌'} (hoja ${fmt(TOTAL_HOJA)})`);
  console.log(`${patches.length} corregidos · ${nuevas.length} nuevos`);

  if (!APPLY) {
    console.log('\nEnsayo terminado. Para escribir: node scripts/blend-ventas-hoja.mjs --apply');
    return;
  }
  if (Math.abs(ventasHoja - TOTAL_HOJA) > TOL) {
    console.error('❌ No cuadra con la hoja: no se escribe nada.');
    process.exit(1);
  }
  await enLotes('PATCH', patches);
  await enLotes('POST', nuevas);
  console.log('\n✅ Aplicado');
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

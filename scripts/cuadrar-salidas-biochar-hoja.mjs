#!/usr/bin/env node
/**
 * Cuadra las Salidas de biochar puro (`SIRIUS-PRODUCT-0015`, Inventario Production
 * Core) de los despachos de Blend de 2026 con la hoja de bodega: 11.230 kg, la
 * columna del 20 % de cada despacho.
 *
 * ═══ POR QUÉ (2026-10-07) ═════════════════════════════════════════════════════
 * El Core asentaba 6.343,77 kg para esos despachos. Faltaban cinco salidas enteras
 * —marzo (Bellacruz, Sapuga, La Loma), Guaicaramo 22-jul y Guaicaramo 1-sep— y
 * tres lotes no daban lo de la hoja: Guarila 3.000 vs 3.466, Inparme 2.500 vs
 * 2.002 y SIRIUS-PED-0093 489,77 vs 400. La hoja manda (decisión de David).
 *
 * Lo que falta sale de los baches MÁS ANTIGUOS con saldo, desde S-00128 (los V2
 * que volvieron a bodega): FIFO por código. Lo que sobra se le devuelve al bache
 * más reciente del lote, reduciendo su Salida — no se crea una Entrada, porque
 * ese biochar nunca salió.
 *
 * Las Salidas nuevas llevan como destino el MISMO código que su Salida de abono
 * (`SAL-SAPUGA-2026-03-23`…), que es la junta entre los dos componentes del
 * despacho, y el cliente en `ubicacion_destino_id`. El lote de Guaicaramo 1-sep
 * estaba mal escrito en el abono (`BLEND-26/08/2026`): se corrige a
 * `BLEND-2026-08-28` en las dos.
 *
 * Las salidas que NO son de la hoja (laboratorio, muestras, entregas, la
 * remisión 4 de S-00177) no se tocan: David decidió dejarlas.
 *
 * Solo escribe el libro mayor y `Estado Bache`. La fórmula de los baches en
 * PiroliApp va en seco y no incluye los migrados: ya diverge desde el paso a
 * peso de referencia y no es la vista de bodega.
 *
 * Idempotente: el faltante de cada destino es objetivo − lo ya asentado, así que
 * una segunda corrida no encuentra nada que hacer.
 *
 * Uso:
 *   node scripts/cuadrar-salidas-biochar-hoja.mjs            # ensayo
 *   node scripts/cuadrar-salidas-biochar-hoja.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const AT = 'https://api.airtable.com/v0';
const TOL = 0.01;
const HOY = new Date().toISOString().slice(0, 10);
const PRIMER_BACHE = 'S-00128';
const TOTAL_HOJA = 11230;

/**
 * Los despachos de Blend de la hoja, en biochar (20 %). `destinos` agrupa los
 * lotes que la hoja cuenta como uno (el pedido 0093 salió en dos tandas).
 */
const HOJA = [
  { destinos: ['SAL-BELLACRUZ-2026-03-15'], kg: 688, fecha: '2026-03-15', cliente: 'BELLACRUZ DEL LLANO S A S' },
  { destinos: ['SAL-SAPUGA-2026-03-23'], kg: 1500, fecha: '2026-03-23', cliente: 'SAPUGA SA' },
  { destinos: ['SAL-LA-LOMA-2026-03-23'], kg: 800, fecha: '2026-03-23', cliente: 'AGROPECUARIA LA LOMA S.A.S' },
  { destinos: ['BLEND-2026-04-30'], kg: 3466, fecha: '2026-04-30', cliente: 'AGRICOLA GUARILA SAS', nota: 'Guarila 7-abr (1.000) + 14-abr (2.466)' },
  { destinos: ['BLEND-2026-06-24'], kg: 2002, fecha: '2026-06-24', cliente: 'INPARME S.A.S' },
  { destinos: ['SAL-GUAICARAMO-2026-07-22'], kg: 20, fecha: '2026-07-22', cliente: 'GUAICARAMO SAS' },
  { destinos: ['BLEND-2026-08-28'], kg: 2000, fecha: '2026-08-28', cliente: 'GUAICARAMO SAS', nota: 'Guaicaramo 1-sep, 10.000 kg de Blend' },
  // NO es SAL-ENT-2026-08-25-S-00211: esa es una entrega real al Colegio Francisco
  // Walter que coincide en kg (David, 2026-10-07). La venta nunca se había asentado.
  { destinos: ['SAL-BELLACRUZ-2026-09-01'], kg: 154, fecha: '2026-09-01', cliente: 'BELLACRUZ DEL LLANO S A S', nota: 'Bellacruz 1-sep, 770 kg de Blend' },
  { destinos: ['BLEND-2026-09-22-SIRIUS-PED-0093', 'BLEND-2026-09-24-SIRIUS-PED-0093'], kg: 400, fecha: '2026-09-24', cliente: 'GUAICARAMO SAS' },
  { destinos: ['BLEND-2026-10-02-SIRIUS-PED-0094'], kg: 200, fecha: '2026-10-02', cliente: 'GUAICARAMO SAS' },
];

const ABONO_LOTE_MAL = 'BLEND-26/08/2026';
const ABONO_LOTE_BIEN = 'BLEND-2026-08-28';

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
const P_BASE = env.AIRTABLE_BASE_ID;
const P_BACHES = env.AIRTABLE_BACHES_TABLE_ID;
const GTOKEN = env.AIRTABLE_API_KEY_SIRIUS_INVENTARIO || env.AIRTABLE_GLOBAL_TOKEN || TOKEN;
const V_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const V_MOV = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const V_STOCK = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK;
const BIOCHAR = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;
const ABONO = env.AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID;

const faltantes = Object.entries({ TOKEN, P_BASE, P_BACHES, V_BASE, V_MOV, V_STOCK, BIOCHAR, ABONO })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (faltantes.length) {
  console.error(`❌ Faltan variables en .env.local: ${faltantes.join(', ')}`);
  process.exit(1);
}

async function at(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(data)}`);
  return data ?? {};
}

async function fetchAll(base, table, token, params = {}) {
  const out = [];
  let offset;
  do {
    const url = new URL(`${AT}/${base}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString(), token);
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return out;
}

async function enLotes(method, base, table, token, records) {
  for (let i = 0; i < records.length; i += 10) {
    await at(`${AT}/${base}/${table}`, token, { method, body: JSON.stringify({ records: records.slice(i, i + 10) }) });
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

// ---------------------------------------------------------------------------
async function main() {
  console.log(APPLY ? '⚠️  MODO APPLY: se escribirá en Airtable\n' : '🔎 Ensayo (dry-run): no se escribe nada\n');

  const [movs, abonoMal, stock, baches] = await Promise.all([
    fetchAll(V_BASE, V_MOV, GTOKEN, { filterByFormula: `{product_id} = '${esc(BIOCHAR)}'` }),
    fetchAll(V_BASE, V_MOV, GTOKEN, {
      filterByFormula: `AND({product_id} = '${esc(ABONO)}', {produccion_destino_id} = '${esc(ABONO_LOTE_MAL)}')`,
    }),
    fetchAll(V_BASE, V_STOCK, GTOKEN, { filterByFormula: `{producto_id} = '${esc(BIOCHAR)}'` }),
    fetchAll(P_BASE, P_BACHES, TOKEN, { filterByFormula: `{Codigo Bache} >= '${PRIMER_BACHE}'` }),
  ]);
  if (stock.length !== 1) throw new Error(`Se esperaba 1 fila de Stock_Actual del biochar y hay ${stock.length}`);
  const stockId = stock[0].id;

  const bacheApp = new Map(baches.map((b) => [String(b.fields['Codigo Bache']), b]));

  // Saldo por bache según el Core: lo que hay para sacar.
  const saldo = new Map();
  const tocar = (b, d) => saldo.set(b, r2((saldo.get(b) ?? 0) + d));
  for (const m of movs) {
    const b = String(m.fields.bache_origen_id ?? '');
    if (!b) continue;
    if (m.fields.tipo_movimiento === 'Entrada') tocar(b, num(m.fields.cantidad));
    else if (m.fields.tipo_movimiento === 'Salida') tocar(b, -num(m.fields.cantidad));
  }
  const docs = new Set(movs.map((m) => String(m.fields.documento_referencia ?? '')));

  const patches = [];
  const nuevas = [];
  const tocados = new Set();
  const lineas = [];

  for (const item of HOJA) {
    const del = movs.filter(
      (m) => m.fields.tipo_movimiento === 'Salida' && item.destinos.includes(String(m.fields.produccion_destino_id ?? ''))
    );
    const asentado = r2(del.reduce((t, m) => t + num(m.fields.cantidad), 0));
    const diff = r2(item.kg - asentado);
    const nombre = `${item.destinos.join(' + ')} (${item.cliente})`;

    if (Math.abs(diff) <= TOL) {
      lineas.push(`✅ ${nombre}: ${fmt(asentado)} kg`);
      continue;
    }

    if (diff < 0) {
      // Sobra: se devuelve al bache más reciente del lote.
      let sobra = -diff;
      const orden = [...del].sort((a, b) =>
        String(b.fields.bache_origen_id).localeCompare(String(a.fields.bache_origen_id))
      );
      lineas.push(`➖ ${nombre}: ${fmt(asentado)} → ${fmt(item.kg)} kg`);
      for (const m of orden) {
        if (sobra <= TOL) break;
        const actual = num(m.fields.cantidad);
        const quita = r2(Math.min(actual, sobra));
        const nueva = r2(actual - quita);
        const bache = String(m.fields.bache_origen_id);
        const obs = String(m.fields.observaciones ?? '');
        patches.push({
          id: m.id,
          fields: {
            cantidad: nueva,
            observaciones:
              `${obs}\n[CUADRE-HOJA ${HOY}] ${fmt(actual)} → ${fmt(nueva)} kg para cuadrar con la hoja de bodega ` +
              `(${fmt(item.kg)} kg de biochar en este despacho).`,
          },
        });
        lineas.push(`     ${bache}: Salida ${fmt(actual)} → ${fmt(nueva)} kg (vuelven ${fmt(quita)} kg al bache)`);
        tocar(bache, quita);
        tocados.add(bache);
        sobra = r2(sobra - quita);
      }
      continue;
    }

    // Falta: FIFO desde el bache más antiguo con saldo.
    if (item.destinos.length !== 1) throw new Error(`${nombre}: falta biochar en un grupo de varios lotes`);
    const destino = item.destinos[0];
    let falta = diff;
    lineas.push(`➕ ${nombre}: ${fmt(asentado)} → ${fmt(item.kg)} kg`);
    const candidatos = [...saldo.entries()]
      .filter(([b, kg]) => b >= PRIMER_BACHE && kg > TOL)
      .sort(([a], [b]) => a.localeCompare(b));
    for (const [bache, disponible] of candidatos) {
      if (falta <= TOL) break;
      const sale = r2(Math.min(disponible, falta));
      const doc = `${destino}-${bache}`;
      if (docs.has(doc)) throw new Error(`Ya existe un movimiento ${doc}: revisar a mano`);
      docs.add(doc);
      nuevas.push({
        fields: {
          product_id: BIOCHAR,
          tipo_movimiento: 'Salida',
          cantidad: sale,
          unidad_medida: 'kg',
          motivo: `Despacho de Biochar Blend a ${item.cliente}`,
          documento_referencia: doc,
          bache_origen_id: bache,
          produccion_destino_id: destino,
          ubicacion_destino_id: item.cliente,
          fecha_movimiento: `${item.fecha}T12:00:00.000Z`,
          responsable: 'Cuadre con hoja de bodega (David Hernandez)',
          observaciones:
            `CUADRE-HOJA ${HOY} — biochar (20 %) del despacho de Blend a ${item.cliente} del ${item.fecha}` +
            `${item.nota ? ` (${item.nota})` : ''}. Sale del bache más antiguo con saldo.`,
          Stock_Actual: [stockId],
        },
      });
      lineas.push(`     ${bache}: nueva Salida ${fmt(sale)} kg`);
      tocar(bache, -sale);
      tocados.add(bache);
      falta = r2(falta - sale);
    }
    if (falta > TOL) throw new Error(`${nombre}: no alcanza el biochar, faltan ${fmt(falta)} kg`);
  }

  // Estado Bache de los tocados, según su saldo en el Core.
  const estados = [];
  for (const bache of [...tocados].sort()) {
    const rec = bacheApp.get(bache);
    if (!rec) continue;
    const kg = saldo.get(bache) ?? 0;
    const nuevo = kg <= TOL ? 'Bache Agotado' : 'Bache Incompleto';
    if (rec.fields['Estado Bache'] !== nuevo) {
      estados.push({ id: rec.id, fields: { 'Estado Bache': nuevo } });
      lineas.push(`🏷️  ${bache}: ${rec.fields['Estado Bache']} → ${nuevo} (${fmt(kg)} kg en bodega)`);
    }
  }

  const abonoPatches = abonoMal.map((m) => ({
    id: m.id,
    fields: { produccion_destino_id: ABONO_LOTE_BIEN },
  }));
  for (const m of abonoMal) {
    lineas.push(`🔤 Abono ${m.fields.id_movimiento}: destino ${ABONO_LOTE_MAL} → ${ABONO_LOTE_BIEN}`);
  }

  console.log(lineas.join('\n'));

  // Verificación: lo de la hoja después de aplicar.
  const totalHoja = r2(HOJA.reduce((t, i) => t + i.kg, 0));
  const entradas = movs.filter((m) => m.fields.tipo_movimiento === 'Entrada').reduce((t, m) => t + num(m.fields.cantidad), 0);
  const salidasAntes = movs.filter((m) => m.fields.tipo_movimiento === 'Salida').reduce((t, m) => t + num(m.fields.cantidad), 0);
  const delta =
    nuevas.reduce((t, n) => t + n.fields.cantidad, 0) -
    patches.reduce((t, p) => t + (num(movs.find((m) => m.id === p.id).fields.cantidad) - p.fields.cantidad), 0);
  const salidasDespues = r2(salidasAntes + delta);

  console.log(`\nDespachos de la hoja: ${fmt(totalHoja)} kg ${Math.abs(totalHoja - TOTAL_HOJA) <= TOL ? '✅' : '❌'}`);
  console.log('                     antes          después');
  console.log(`Salidas       ${fmt(salidasAntes).padStart(14)} ${fmt(salidasDespues).padStart(16)}`);
  console.log(`Saldo         ${fmt(entradas - salidasAntes).padStart(14)} ${fmt(entradas - salidasDespues).padStart(16)}`);
  console.log(`\n${patches.length} Salidas corregidas · ${nuevas.length} nuevas · ${estados.length} estados · ${abonoPatches.length} abono`);

  if (Math.abs(totalHoja - TOTAL_HOJA) > TOL) {
    console.error('❌ La tabla HOJA no suma el total de la hoja: no se escribe nada.');
    process.exit(1);
  }
  if (!APPLY) {
    console.log('\nEnsayo terminado. Para escribir: node scripts/cuadrar-salidas-biochar-hoja.mjs --apply');
    return;
  }

  await enLotes('PATCH', V_BASE, V_MOV, GTOKEN, patches);
  await enLotes('POST', V_BASE, V_MOV, GTOKEN, nuevas);
  await enLotes('PATCH', V_BASE, V_MOV, GTOKEN, abonoPatches);
  await enLotes('PATCH', P_BASE, P_BACHES, TOKEN, estados);
  console.log('\n✅ Aplicado');
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

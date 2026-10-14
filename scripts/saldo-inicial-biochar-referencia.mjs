#!/usr/bin/env node
/**
 * Lleva TODO el libro mayor del biochar puro (`SIRIUS-PRODUCT-0015` en Sirius
 * Inventario Production Core) a peso de referencia, para que lo ingresado sume
 * exactamente `Total Biochar Bache Referencia (KG)` de los baches de la app.
 *
 * ═══ POR QUÉ (2026-10-06) ═════════════════════════════════════════════════════
 * El conteo de la planta da 73.500 kg (25 kg × lona, S-00144…S-00291) y el Core
 * sumaba 70.761,51. `migrar-biochar-referencia.mjs` dejó tres huecos:
 *   · Los agotados quedaron en seco: su Entrada y su Salida neteaban 0, y subir
 *     solo la Entrada los sobregiraba. Aquí se suben LAS DOS: la Entrada a la
 *     referencia y sus Salidas escaladas en la misma proporción. Un bache agotado
 *     salió entero —sus lonas—, así que en referencia salió su referencia.
 *   · S-00165 quedó en −36,98: Entrada ya en 500 y Salidas en seco (536,98).
 *     Es el mismo caso: se escalan sus Salidas.
 *   · Los baches que pasaron a bodega DESPUÉS del 22-sep entraron otra vez en
 *     seco, porque `registrarEntradaBiocharBodega()` sigue escribiendo la masa
 *     seca. Hasta que eso cambie, este script hay que volver a correrlo.
 * Y los baches todavía en planta no tienen Entrada (biochar en planta no es
 * inventario). Con `--incluir-planta` se les crea la `BODEGA-<bache>`, la misma
 * llave que usa la app, así que pasarlos a bodega después no los duplica.
 *
 * Nada se borra. Cada cantidad corregida guarda su kg seco original en
 * `observaciones` con la marca `[REF-KG seco=…]`: con ella se revierte, y es la
 * masa seca medida —la que sostiene el carbono— la que sigue en Monitoreo Baches.
 *
 * NO toca un bache con más de una Entrada, ni un parcial cuyas Salidas superen su
 * referencia: se reportan para mirarlos a mano. Las Salidas de un parcial no se
 * escalan, porque no se sabe si se digitaron en seco o ya en referencia.
 *
 * Con `--incluir-migrados` entran también los baches de la era V2 que están en
 * `Bache Completo Bodega` (2026-10-07: S-00128…S-00143, que David devolvió a bodega
 * el 06-oct: son las lonas que siguen ahí). El histórico de la bodega arranca en
 * S-00128, no en S-00144. Su `Total Biochar Bache Referencia (KG)` da 0 porque
 * `Recuento Lonas` CUENTA lonas vinculadas y ellos no tienen ninguna: la referencia
 * sale de `Recuento Lonas Historico`. Los demás migrados (Bache Agotado) siguen
 * fuera, porque ese biochar se consumió en 2025.
 *
 * Termina comparando lo ingresado contra la suma de referencias y ABORTA el
 * --apply si no cuadra al centavo.
 *
 * Uso:
 *   node scripts/saldo-inicial-biochar-referencia.mjs                    # ensayo
 *   node scripts/saldo-inicial-biochar-referencia.mjs --incluir-planta   # ensayo
 *   node scripts/saldo-inicial-biochar-referencia.mjs [--incluir-planta] [--incluir-migrados] --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const INCLUIR_PLANTA = ARGS.includes('--incluir-planta');
const INCLUIR_MIGRADOS = ARGS.includes('--incluir-migrados');
const LONA_KG = 25;
const AT = 'https://api.airtable.com/v0';
const TOLERANCIA_KG = 0.01;
const MARCA = /\[REF-KG seco=([\d.]+)\]/;
const HOY = new Date().toISOString().slice(0, 10);

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
const PRODUCTO = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;

const faltantes = Object.entries({
  AIRTABLE_TOKEN: TOKEN,
  AIRTABLE_BASE_ID: P_BASE,
  AIRTABLE_BACHES_TABLE_ID: P_BACHES,
  AIRTABLE_BASE_SIRIUS_INVENTARIO: V_BASE,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: V_MOV,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK: V_STOCK,
  AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PRODUCTO,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (faltantes.length) {
  console.error(`❌ Faltan variables en .env.local:\n   ${faltantes.join('\n   ')}`);
  process.exit(1);
}

const B = {
  codigo: 'Codigo Bache',
  estado: 'Estado Bache',
  referencia: 'Total Biochar Bache Referencia (KG)',
  origen: 'Origen Registro',
  lonasHistorico: 'Recuento Lonas Historico',
  masaSecaHistorica: 'Masa Seca Historica (KG)',
};

const ESTADO_BODEGA = 'Bache Completo Bodega';
const FILTRO_BACHES = INCLUIR_MIGRADOS
  ? `OR({${B.origen}} = '', {${B.estado}} = '${ESTADO_BODEGA}')`
  : `{${B.origen}} = ''`;

// ---------------------------------------------------------------------------
async function at(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${JSON.stringify(data)}`);
  return data ?? {};
}

async function fetchAll(base, table, token, params = {}) {
  const records = [];
  let offset;
  do {
    const url = new URL(`${AT}/${base}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString(), token);
    records.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return records;
}

/** PATCH/POST en lotes de 10 (el máximo de Airtable), respetando el rate limit. */
async function enLotes(method, base, table, token, records) {
  for (let i = 0; i < records.length; i += 10) {
    await at(`${AT}/${base}/${table}`, token, {
      method,
      body: JSON.stringify({ records: records.slice(i, i + 10) }),
    });
    await new Promise((r) => setTimeout(r, 250));
  }
}

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => r2(n).toLocaleString('es-CO', { minimumFractionDigits: 2 });
/** Un migrado no tiene lonas vinculadas: su referencia sale del recuento histórico. */
const referenciaDe = (bache) =>
  bache.fields[B.origen]
    ? r2(LONA_KG * num(bache.fields[B.lonasHistorico]))
    : num(bache.fields[B.referencia]);
const suma = (movs) => movs.reduce((t, m) => t + num(m.fields.cantidad), 0);

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function num(value) {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** La marca se agrega una sola vez: si ya está, el seco original es el de la marca. */
function conMarca(obs, seco) {
  if (MARCA.test(obs)) return obs;
  const marca = `[REF-KG seco=${r2(seco)}] Llevado a peso de referencia (25 kg × lona) el ${HOY}.`;
  return obs ? `${obs}\n${marca}` : marca;
}
const secoDe = (m) => {
  const obs = String(m.fields.observaciones ?? '');
  return MARCA.test(obs) ? Number(MARCA.exec(obs)[1]) : num(m.fields.cantidad);
};

/**
 * Reparte `total` entre las salidas en proporción a su seco, y el redondeo lo
 * absorbe la última: así suman `total` al centavo y el agotado netea 0 exacto.
 */
function escalar(salidas, total) {
  const secos = salidas.map(secoDe);
  const base = secos.reduce((t, s) => t + s, 0);
  let acumulado = 0;
  return salidas.map((m, i) => {
    const cantidad =
      i === salidas.length - 1 ? r2(total - acumulado) : r2((secos[i] * total) / base);
    acumulado = r2(acumulado + cantidad);
    return { m, seco: secos[i], cantidad };
  });
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(APPLY ? '⚠️  MODO APPLY: se escribirá en Airtable' : '🔎 Ensayo (dry-run): no se escribe nada');
  console.log(INCLUIR_PLANTA ? '   Incluye los baches en planta' : '   Sin los baches en planta (--incluir-planta para sumarlos)');
  console.log(INCLUIR_MIGRADOS ? `   Incluye los migrados V2 en ${ESTADO_BODEGA}\n` : '   Sin los migrados V2 (--incluir-migrados para sumar los que están en bodega)\n');

  const [baches, movimientos, stock] = await Promise.all([
    fetchAll(P_BASE, P_BACHES, TOKEN, { filterByFormula: FILTRO_BACHES }),
    fetchAll(V_BASE, V_MOV, GTOKEN, { filterByFormula: `{product_id} = '${esc(PRODUCTO)}'` }),
    fetchAll(V_BASE, V_STOCK, GTOKEN, { filterByFormula: `{producto_id} = '${esc(PRODUCTO)}'` }),
  ]);

  // Sin vincular a Stock_Actual, una Entrada nueva es invisible para el saldo.
  if (stock.length !== 1) throw new Error(`Se esperaba 1 fila de Stock_Actual del biochar y hay ${stock.length}`);
  const stockId = stock[0].id;

  const porBache = new Map();
  const sinBache = [];
  for (const m of movimientos) {
    const codigo = String(m.fields.bache_origen_id ?? '');
    if (!codigo) {
      sinBache.push(m);
      continue;
    }
    const g = porBache.get(codigo) ?? { entradas: [], salidas: [] };
    if (m.fields.tipo_movimiento === 'Entrada') g.entradas.push(m);
    else if (m.fields.tipo_movimiento === 'Salida') g.salidas.push(m);
    porBache.set(codigo, g);
  }

  const patches = []; // { id, fields, linea }
  const nuevas = []; // { fields, linea }
  const omitidos = [];
  const enPlanta = [];
  let refEsperada = 0;
  let ingresadoDespues = 0;
  let salidasDespues = 0;

  const codigosApp = new Set();
  for (const bache of [...baches].sort((a, b) =>
    String(a.fields[B.codigo]).localeCompare(String(b.fields[B.codigo]))
  )) {
    const codigo = String(bache.fields[B.codigo] ?? '');
    codigosApp.add(codigo);
    const referencia = referenciaDe(bache);
    const migrado = Boolean(bache.fields[B.origen]);
    const { entradas, salidas } = porBache.get(codigo) ?? { entradas: [], salidas: [] };
    const salido = suma(salidas);

    const sinTocar = (motivo) => {
      if (motivo) omitidos.push({ codigo, motivo });
      ingresadoDespues += suma(entradas);
      salidasDespues += salido;
    };

    if (referencia <= 0) {
      sinTocar(entradas.length || salidas.length ? 'no tiene peso de referencia (0 lonas)' : null);
      continue;
    }

    // ── Sin Entrada: el bache sigue en planta ────────────────────────────────
    if (!entradas.length) {
      if (salidas.length) {
        sinTocar(`tiene Salidas sin ninguna Entrada`);
        continue;
      }
      if (!migrado) {
        enPlanta.push({ codigo, estado: bache.fields[B.estado], referencia });
        if (!INCLUIR_PLANTA) continue;
      }
      refEsperada += referencia;
      ingresadoDespues += referencia;
      nuevas.push({
        linea: `${codigo}: nueva Entrada ${fmt(referencia)} kg (${bache.fields[B.estado]})`,
        fields: {
          product_id: PRODUCTO,
          tipo_movimiento: 'Entrada',
          cantidad: referencia,
          unidad_medida: 'kg',
          motivo: 'Entrada de biochar a bodega',
          documento_referencia: `BODEGA-${codigo}`,
          bache_origen_id: codigo,
          fecha_movimiento: `${HOY}T12:00:00.000Z`,
          responsable: migrado
            ? 'Saldo inicial: bache V2 en bodega (conteo de lonas)'
            : 'Saldo inicial 73.500 kg (conteo de lonas)',
          observaciones: migrado
            ? `SALDO-INICIAL-REFERENCIA ${HOY} — ${codigo}, migrado de PiroliApp V 1.0 y en ` +
              `${ESTADO_BODEGA}: ${num(bache.fields[B.lonasHistorico])} lonas × ${LONA_KG} kg. ` +
              `Masa seca histórica ${r2(num(bache.fields[B.masaSecaHistorica]))} kg.`
            : `SALDO-INICIAL-REFERENCIA ${HOY} — ${codigo} en ${bache.fields[B.estado]}, ` +
              `ingresado por peso de referencia (25 kg × lona) sin esperar el monitoreo.`,
          Stock_Actual: [stockId],
        },
      });
      continue;
    }

    refEsperada += referencia;

    if (entradas.length > 1) {
      sinTocar(`tiene ${entradas.length} Entradas: no se adivina cuál corregir`);
      continue;
    }

    const entrada = entradas[0];
    const actual = num(entrada.fields.cantidad);
    const secoEntrada = secoDe(entrada);
    const secoSalidas = salidas.reduce((t, m) => t + secoDe(m), 0);
    // Agotado en seco: salió todo su seco. Es la única forma segura de saber que
    // las Salidas están en seco y no ya en referencia.
    const agotadoEnSeco = salidas.length > 0 && Math.abs(secoSalidas - secoEntrada) <= TOLERANCIA_KG;

    if (!agotadoEnSeco && salido > referencia + TOLERANCIA_KG) {
      sinTocar(`ya salieron ${fmt(salido)} kg, más que su referencia de ${fmt(referencia)} kg`);
      continue;
    }

    if (Math.abs(actual - referencia) > TOLERANCIA_KG) {
      const obs = String(entrada.fields.observaciones ?? '');
      patches.push({
        id: entrada.id,
        linea: `${codigo}: Entrada ${fmt(actual)} → ${fmt(referencia)} kg`,
        fields: { cantidad: referencia, observaciones: conMarca(obs, secoEntrada) },
      });
    }
    ingresadoDespues += referencia;

    if (agotadoEnSeco && Math.abs(salido - referencia) > TOLERANCIA_KG) {
      for (const { m, seco, cantidad } of escalar(salidas, referencia)) {
        if (Math.abs(num(m.fields.cantidad) - cantidad) <= TOLERANCIA_KG) continue;
        patches.push({
          id: m.id,
          linea: `${codigo}:   Salida ${m.fields.documento_referencia} ${fmt(num(m.fields.cantidad))} → ${fmt(cantidad)} kg`,
          fields: { cantidad, observaciones: conMarca(String(m.fields.observaciones ?? ''), seco) },
        });
      }
      salidasDespues += referencia;
    } else {
      salidasDespues += salido;
    }
  }

  const ajenos = [...porBache.keys()].filter((c) => !codigosApp.has(c));

  // ── Reporte ────────────────────────────────────────────────────────────────
  const ingresadoAntes = suma(movimientos.filter((m) => m.fields.tipo_movimiento === 'Entrada'));
  const salidasAntes = suma(movimientos.filter((m) => m.fields.tipo_movimiento === 'Salida'));

  console.log(`Baches de la app: ${baches.length} · movimientos de biochar: ${movimientos.length}\n`);
  console.log(`Correcciones (${patches.length}):`);
  for (const p of patches) console.log(`  ${p.linea}`);
  if (nuevas.length) {
    console.log(`\nEntradas nuevas (${nuevas.length}):`);
    for (const n of nuevas) console.log(`  ${n.linea}`);
  }
  if (!INCLUIR_PLANTA && enPlanta.length) {
    const kg = enPlanta.reduce((t, b) => t + b.referencia, 0);
    console.log(`\nEn planta, sin Entrada y NO incluidos (${enPlanta.length}, ${fmt(kg)} kg):`);
    for (const b of enPlanta) console.log(`  ${b.codigo}: ${fmt(b.referencia)} kg · ${b.estado}`);
  }
  if (omitidos.length) {
    console.log(`\n⚠️  Omitidos (${omitidos.length}), para mirar a mano:`);
    for (const o of omitidos) console.log(`  ${o.codigo}: ${o.motivo}`);
  }
  if (sinBache.length || ajenos.length) {
    console.log(`\n⚠️  Movimientos fuera de los baches de la app: ${sinBache.length} sin bache, baches ${ajenos.join(', ') || '—'}`);
  }

  const saldoAntes = ingresadoAntes - salidasAntes;
  const saldoDespues = ingresadoDespues - salidasDespues;
  console.log('\n                     antes          después');
  console.log(`Ingresado     ${fmt(ingresadoAntes).padStart(14)} ${fmt(ingresadoDespues).padStart(16)}`);
  console.log(`Salidas       ${fmt(salidasAntes).padStart(14)} ${fmt(salidasDespues).padStart(16)}`);
  console.log(`Saldo         ${fmt(saldoAntes).padStart(14)} ${fmt(saldoDespues).padStart(16)}`);
  console.log(`\nReferencia de los baches incluidos: ${fmt(refEsperada)} kg`);

  const cuadra =
    !omitidos.length && !sinBache.length && !ajenos.length &&
    Math.abs(ingresadoDespues - refEsperada) <= TOLERANCIA_KG;
  console.log(cuadra ? '✅ Lo ingresado cuadra con la referencia' : '❌ Lo ingresado NO cuadra con la referencia');

  if (!APPLY) {
    console.log(`\nEnsayo terminado. Para escribir: node scripts/saldo-inicial-biochar-referencia.mjs${INCLUIR_PLANTA ? ' --incluir-planta' : ''}${INCLUIR_MIGRADOS ? ' --incluir-migrados' : ''} --apply`);
    return;
  }
  if (!cuadra) {
    console.error('\n❌ No se escribe nada: el resultado no aterriza en la referencia.');
    process.exit(1);
  }

  await enLotes('PATCH', V_BASE, V_MOV, GTOKEN, patches.map((p) => ({ id: p.id, fields: p.fields })));
  console.log(`\n✅ ${patches.length} movimientos corregidos`);
  await enLotes('POST', V_BASE, V_MOV, GTOKEN, nuevas.map((n) => ({ fields: n.fields })));
  console.log(`✅ ${nuevas.length} Entradas creadas`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

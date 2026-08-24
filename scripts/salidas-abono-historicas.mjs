#!/usr/bin/env node
/**
 * Registra en Sirius Inventario Production Core las SALIDAS de abono 4G (humus)
 * que faltaban entre el conteo físico del 2026-07-27 y el de hoy.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * El libro mayor del abono tenía UN solo movimiento: la Entrada de 33.614 kg que
 * trajo la migración desde Insumos Core (`MIGRADO-MOV-INS-0194`). Cero salidas.
 * Bodega, en cambio, tiene 11.458 kg (conteo de Santiago, 2026-08-21). Los 22.156 kg
 * de diferencia se consumieron y nunca se asentaron: el saldo del Core estaba
 * mintiendo por el triple de lo que hay.
 *
 * ⚠️ ESTO REVIERTE LA DECISIÓN DEL 2026-07-29 ("no re-deducir el histórico de
 * abono"). Esa decisión se tomó por inferencia: como el Core no tenía salidas y el
 * Blend despachado implicaba 24.619 kg de abono, se concluyó que la entrada del
 * 2026-07-27 ya venía neteada. Santiago cuenta bultos, no infiere: dice que de los
 * 33.614 salieron estas cuatro partidas y quedan 11.458. El conteo físico gana.
 *
 * ═══ LA TRAZABILIDAD, QUE ES EL PUNTO ═════════════════════════════════════════
 * Las dos salidas de producción se atan al LOTE (`produccion_destino_id` =
 * `BLEND-…`), no al bache. Y eso es lo que las hace trazables: en la misma tabla,
 * las Salidas de Biochar Puro de ese lote SÍ llevan `bache_origen_id`, así que el
 * lote es la junta que responde "qué baches y cuánto abono entraron a esta mezcla".
 * El abono no tiene baches; darle un `bache_origen_id` sería inventar un dato.
 *
 * El script NO acepta un lote de palabra: lo verifica contra las salidas de biochar
 * del Core y ABORTA si no existe o si no tiene baches. Una salida de abono contra
 * un lote fantasma baja el saldo y no explica nada, que es exactamente el problema
 * que este script viene a arreglar.
 *
 * ═══ IDEMPOTENCIA ═════════════════════════════════════════════════════════════
 * `documento_referencia`, con la MISMA convención que usa la app
 * (`referenciaConsumoAbono` en `src/lib/abono-inventario-core.ts`): `ABONO-<lote>`
 * para producción, `ABONO-<referencia>` para el resto. Así, si mañana alguien
 * reproduce ese lote desde la app, la app ve que ya existe y no duplica.
 *
 * Uso:
 *   node scripts/salidas-abono-historicas.mjs            # dry-run
 *   node scripts/salidas-abono-historicas.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const AT = 'https://api.airtable.com/v0';

// ─────────────────────────────────────────────────────────────────────────────
// EL PLAN. Cada partida es lo que Santiago reportó el 2026-08-21.
//
// `lote` → es producción de Blend: se valida contra las salidas de biochar y la
//          referencia queda `ABONO-<lote>`.
// `referencia` → no es producción (traslado, consumo suelto).
// ─────────────────────────────────────────────────────────────────────────────
const PARTIDAS = [
  {
    kg: 11100,
    fecha: '2026-04-30',
    lote: 'BLEND-2026-04-30',
    motivo: 'Consumo para produccion de Biochar Blend BLEND-2026-04-30',
  },
  {
    kg: 8880,
    fecha: '2026-06-24',
    lote: 'BLEND-2026-06-24',
    motivo: 'Consumo para produccion de Biochar Blend BLEND-2026-06-24',
  },
  {
    kg: 2000,
    fecha: '2026-08-03',
    referencia: 'SAL-LABORATORIO-2026-08-03',
    destino: 'Laboratorio DataLab',
    motivo: 'Traslado de abono 4G al laboratorio',
    observaciones:
      'Retirado por Jhoana para el laboratorio. Reportado por Santiago Amaya el 2026-08-21.',
  },
  {
    kg: 176,
    fecha: '2026-08-20',
    referencia: 'SAL-CONSUMO-2026-08-20',
    motivo: 'Consumo de abono 4G en planta',
    observaciones:
      'Consumo del 2026-08-20 reportado por Santiago Amaya el 2026-08-21. Destino no especificado.',
  },
];

/** El conteo de bodega contra el que tiene que cuadrar el saldo final. */
const SALDO_ESPERADO = 11458;

const RESPONSABLE = 'Conciliacion abono 4G (reporte Santiago Amaya 2026-08-21)';

const NOTA_TRAZA =
  'Reconstruccion historica (2026-08-21): el consumo se asienta contra el lote, y los ' +
  'baches del lote son las Salidas de Biochar Puro con este mismo produccion_destino_id.';

// ─────────────────────────────────────────────────────────────────────────────
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
const V_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const V_MOV = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const V_STOCK = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK;
const P_ABONO = env.AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID;
const P_PURO = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;

const faltantes = Object.entries({
  AIRTABLE_GLOBAL_TOKEN: TOKEN,
  AIRTABLE_BASE_SIRIUS_INVENTARIO: V_BASE,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: V_MOV,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK: V_STOCK,
  AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID: P_ABONO,
  AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: P_PURO,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (faltantes.length) {
  console.error(`❌ Faltan variables en .env.local:\n   ${faltantes.join('\n   ')}`);
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

/** El mismo escape de `src/lib/airtable-escape.ts`: la barra invertida primero. */
function esc(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

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

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function num(v) {
  const n = typeof v === 'object' && v !== null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`  SALIDAS DE ABONO 4G — ${APPLY ? '⚠️  APLICANDO' : 'DRY-RUN (no escribe nada)'}`);
  console.log('═'.repeat(78));

  // ── 1. Estado actual del abono ────────────────────────────────────────────
  const movsAbono = await fetchAll(V_BASE, V_MOV, {
    filterByFormula: `{product_id} = '${esc(P_ABONO)}'`,
  });
  const entradas = r2(
    movsAbono
      .filter((m) => m.fields.tipo_movimiento === 'Entrada')
      .reduce((s, m) => s + num(m.fields.cantidad), 0)
  );
  const salidas = r2(
    movsAbono
      .filter((m) => m.fields.tipo_movimiento === 'Salida')
      .reduce((s, m) => s + num(m.fields.cantidad), 0)
  );

  const filasStock = await fetchAll(V_BASE, V_STOCK, {
    filterByFormula: `{producto_id} = '${esc(P_ABONO)}'`,
  });
  if (filasStock.length !== 1) {
    console.error(
      `❌ Se esperaba 1 fila de Stock_Actual para ${P_ABONO} y hay ${filasStock.length}. ` +
        'Sin ella el movimiento queda invisible para el saldo: se aborta.'
    );
    process.exit(1);
  }
  const stockRecordId = filasStock[0].id;
  const saldoCore = r2(num(filasStock[0].fields.stock_actual));

  console.log(`\n📊 ESTADO DEL LIBRO MAYOR (${P_ABONO})`);
  console.log(`   Movimientos:        ${movsAbono.length}`);
  console.log(`   Entradas:           ${fmt(entradas)} kg`);
  console.log(`   Salidas:            ${fmt(salidas)} kg`);
  console.log(`   Saldo Stock_Actual: ${fmt(saldoCore)} kg   (fila ${stockRecordId})`);
  if (r2(entradas - salidas) !== saldoCore) {
    console.log(
      `   ⚠️  DIVERGENCIA de ${fmt(r2(saldoCore - (entradas - salidas)))} kg: hay movimientos ` +
        'sin vincular a Stock_Actual y el saldo no los cuenta.'
    );
  }
  console.log(`   Conteo físico de bodega (Santiago 2026-08-21): ${fmt(SALDO_ESPERADO)} kg`);
  console.log(`   Faltan por asentar: ${fmt(r2(saldoCore - SALDO_ESPERADO))} kg`);

  // ── 2. Los lotes, contra la realidad del Core ─────────────────────────────
  const movsPuro = await fetchAll(V_BASE, V_MOV, {
    filterByFormula: `{product_id} = '${esc(P_PURO)}'`,
  });
  const lotes = new Map();
  for (const m of movsPuro) {
    if (m.fields.tipo_movimiento !== 'Salida') continue;
    const lote = String(m.fields.produccion_destino_id ?? '');
    if (!lote.startsWith('BLEND-')) continue;
    if (!lotes.has(lote)) lotes.set(lote, { baches: [], kgBiochar: 0 });
    const l = lotes.get(lote);
    const bache = String(m.fields.bache_origen_id ?? '');
    if (bache) l.baches.push({ bache, kg: num(m.fields.cantidad) });
    l.kgBiochar = r2(l.kgBiochar + num(m.fields.cantidad));
  }

  console.log(`\n🔗 LOTES DE BLEND EN EL CORE (${lotes.size})`);
  let totalBaches = 0;
  for (const [lote, l] of [...lotes.entries()].sort()) {
    totalBaches += l.baches.length;
    console.log(`   ${lote}: ${l.baches.length} baches, ${fmt(l.kgBiochar)} kg de biochar puro`);
    console.log(`      ${l.baches.map((b) => `${b.bache} (${fmt(b.kg)})`).join(', ')}`);
  }
  console.log(`   Total: ${totalBaches} baches trazados a producción de Blend`);

  // ── 3. Validación del plan ────────────────────────────────────────────────
  const referenciasExistentes = new Set(
    movsAbono.map((m) => String(m.fields.documento_referencia ?? '')).filter(Boolean)
  );

  const plan = [];
  const errores = [];

  for (const p of PARTIDAS) {
    if (!(p.kg > 0)) errores.push(`Partida con kg inválidos: ${JSON.stringify(p)}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) errores.push(`Fecha inválida en ${p.kg} kg: ${p.fecha}`);

    // La misma convención de `referenciaConsumoAbono()`, para que la app dedupe
    // contra estos movimientos si alguien vuelve a producir el lote.
    const ref = p.lote ? `ABONO-${p.lote}` : `ABONO-${p.referencia}`;

    let baches = null;
    if (p.lote) {
      const l = lotes.get(p.lote);
      if (!l) {
        errores.push(
          `El lote ${p.lote} no existe en el Core: no hay ninguna Salida de Biochar Puro con ` +
            `produccion_destino_id = ${p.lote}. Sin eso la salida de abono no es trazable.`
        );
      } else if (!l.baches.length) {
        errores.push(`El lote ${p.lote} no tiene baches: la salida de abono no sería trazable.`);
      } else {
        baches = l.baches.map((b) => b.bache);
      }
    } else if (!p.referencia) {
      errores.push(`La partida de ${p.kg} kg no tiene lote ni referencia: no sería rastreable.`);
    }

    plan.push({ ...p, ref, baches, yaExiste: referenciasExistentes.has(ref) });
  }

  const refs = plan.map((p) => p.ref);
  const duplicadas = refs.filter((r, i) => refs.indexOf(r) !== i);
  if (duplicadas.length) {
    errores.push(`Referencias repetidas dentro del plan: ${[...new Set(duplicadas)].join(', ')}`);
  }

  const kgPlan = r2(plan.filter((p) => !p.yaExiste).reduce((s, p) => s + p.kg, 0));
  const kgTotalPlan = r2(plan.reduce((s, p) => s + p.kg, 0));
  const saldoFinal = r2(saldoCore - kgPlan);

  // El plan tiene que aterrizar EXACTO en el conteo de bodega. Si no, algo no se
  // entendió del reporte, y un inventario "casi bien" es el que después nadie
  // sabe explicar.
  if (saldoFinal !== SALDO_ESPERADO) {
    errores.push(
      `El saldo final sería ${fmt(saldoFinal)} kg y el conteo de bodega es ${fmt(SALDO_ESPERADO)} kg ` +
        `(diferencia de ${fmt(r2(saldoFinal - SALDO_ESPERADO))} kg).`
    );
  }
  if (kgPlan > saldoCore) {
    errores.push(`Las salidas (${fmt(kgPlan)} kg) superan el saldo disponible (${fmt(saldoCore)} kg).`);
  }

  console.log(`\n📋 PLAN — ${plan.length} salidas, ${fmt(kgTotalPlan)} kg`);
  for (const p of plan) {
    const marca = p.yaExiste ? '⏭️  ya existe' : '✍️  nueva';
    console.log(`\n   ${marca}  ${fmt(p.kg)} kg · ${p.fecha} · ${p.ref}`);
    console.log(`      motivo:  ${p.motivo}`);
    console.log(`      destino: ${p.lote ?? p.referencia}${p.destino ? ` → ${p.destino}` : ''}`);
    if (p.baches) console.log(`      baches:  ${p.baches.join(', ')}`);
  }

  console.log(`\n🧮 CUADRE`);
  console.log(`   Saldo hoy en el Core:  ${fmt(saldoCore)} kg`);
  console.log(`   Salidas por asentar:  −${fmt(kgPlan)} kg`);
  console.log(`   Saldo final:           ${fmt(saldoFinal)} kg`);
  console.log(
    `   Conteo de bodega:      ${fmt(SALDO_ESPERADO)} kg  ${saldoFinal === SALDO_ESPERADO ? '✅' : '❌'}`
  );

  if (errores.length) {
    console.error(`\n❌ NO SE ESCRIBE NADA. ${errores.length} problema(s):`);
    for (const e of errores) console.error(`   • ${e}`);
    process.exit(1);
  }

  const pendientes = plan.filter((p) => !p.yaExiste);
  if (!pendientes.length) {
    console.log('\n✅ Todas las salidas ya estaban registradas. Nada por hacer.');
    return;
  }

  if (!APPLY) {
    console.log(
      `\n✅ Dry-run OK. ${pendientes.length} salida(s) por crear. Corre con --apply para escribir.`
    );
    return;
  }

  // ── 4. Escritura ──────────────────────────────────────────────────────────
  console.log(`\n✍️  Escribiendo ${pendientes.length} salida(s)…`);
  for (const p of pendientes) {
    const observaciones = [
      p.observaciones,
      p.baches ? `Baches del lote: ${p.baches.join(', ')}.` : null,
      p.baches ? NOTA_TRAZA : 'Reconstruccion historica (2026-08-21).',
    ]
      .filter(Boolean)
      .join(' ');

    const fields = {
      product_id: P_ABONO,
      tipo_movimiento: 'Salida',
      cantidad: r2(p.kg),
      unidad_medida: 'kg',
      motivo: p.motivo,
      documento_referencia: p.ref,
      responsable: RESPONSABLE,
      // Mediodía UTC: un T00:00 se corre de día al renderizarse en Colombia.
      fecha_movimiento: `${p.fecha}T12:00:00.000Z`,
      observaciones,
      produccion_destino_id: p.lote ?? p.referencia,
      // El link va EN EL POST: un PATCH posterior reemplazaría el array, y sin él
      // el movimiento es invisible para el saldo.
      Stock_Actual: [stockRecordId],
    };
    if (p.destino) fields.ubicacion_destino_id = p.destino;

    const data = await at(`${AT}/${V_BASE}/${V_MOV}`, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] }),
    });
    const creado = data.records?.[0];
    console.log(`   ✅ ${p.ref} — ${fmt(p.kg)} kg — ${creado?.fields?.id_movimiento ?? creado?.id}`);
  }

  // ── 5. Verificación posterior ─────────────────────────────────────────────
  const stockDespues = await fetchAll(V_BASE, V_STOCK, {
    filterByFormula: `{producto_id} = '${esc(P_ABONO)}'`,
  });
  const saldoReal = r2(num(stockDespues[0]?.fields?.stock_actual));
  console.log(`\n🧮 Saldo en Stock_Actual después de escribir: ${fmt(saldoReal)} kg`);
  if (saldoReal === SALDO_ESPERADO) {
    console.log(`✅ Cuadra con el conteo de bodega (${fmt(SALDO_ESPERADO)} kg).`);
  } else {
    console.error(
      `❌ Quedó en ${fmt(saldoReal)} kg y se esperaba ${fmt(SALDO_ESPERADO)}. Revisa que las ` +
        'salidas hayan quedado vinculadas a Stock_Actual.'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});

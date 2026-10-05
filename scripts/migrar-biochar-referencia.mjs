#!/usr/bin/env node
/**
 * Pasa el libro mayor del biochar puro (`SIRIUS-PRODUCT-0015` en Sirius
 * Inventario Production Core) de masa seca a PESO DE REFERENCIA: 25 kg por lona,
 * normalmente 500 kg por bache (`Total Biochar Bache Referencia (KG)`).
 *
 * ═══ POR QUÉ (decisión de David, 2026-09-22) ═════════════════════════════════
 * Los pedidos y la producción de Blend se piensan en baches de 500 kg, y las
 * cuentas se llevan sumando los movimientos del Core. Con la Entrada de cada
 * bache en masa seca (557,81 kg, 433,32 kg…) esa suma no cuadra con lo que el
 * operador tiene en la cabeza ni con la receta del pedido. Esto REVIERTE, para el
 * inventario, la regla del 2026-08-05 de «todo en masa seca». La masa seca medida
 * NO se pierde: sigue en `Monitoreo Baches`, que es lo que respalda el carbono.
 *
 * ═══ QUÉ HACE ═════════════════════════════════════════════════════════════════
 * Por cada bache con saldo en el Core:
 *   · Corrige la `cantidad` de su Entrada `BODEGA-<bache>` a la referencia, y deja
 *     el kg seco original en `observaciones` con la marca `[REF-KG seco=…]`.
 *     Se corrige la Entrada en vez de asentar un ajuste porque `Stock_Actual` y la
 *     app suman SOLO Entradas − Salidas: un `Ajuste` no lo vería nadie, y una
 *     Salida de ajuste se contaría como biochar consumido.
 *   · Las Salidas NO se tocan: son lo que de verdad salió. Un parcial queda en
 *     referencia − salidas (S-00165: 500 − 200 = 300).
 *   · Un bache sin ninguna salida que esté en `Bache Incompleto` vuelve a `Bache
 *     Completo Bodega` (el rastro de la producción de prueba en S-00184).
 *
 * NO toca:
 *   · Los agotados. Su Entrada seca y su Salida seca ya netean 0; llevar la
 *     Entrada a 500 los dejaría sobregirados (S-00188: 500 − 540,23).
 *   · Un bache cuyas salidas superen su referencia: se reporta para mirarlo a mano.
 *   · Un bache con más de una Entrada: se reporta, no se adivina cuál corregir.
 *
 * Sin `--apply` es dry-run. Es idempotente: una Entrada que ya lleva la marca y la
 * cantidad de referencia se salta.
 *
 * Revertir: la marca guarda el kg seco original de cada Entrada.
 *
 * Uso:
 *   node scripts/migrar-biochar-referencia.mjs            # ensayo
 *   node scripts/migrar-biochar-referencia.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.slice(2).includes('--apply');
const AT = 'https://api.airtable.com/v0';
const TOLERANCIA_KG = 0.01;
const MARCA = /\[REF-KG seco=([\d.]+)\]/;

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

const GTOKEN = env.AIRTABLE_GLOBAL_TOKEN || TOKEN;
const V_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const V_MOV = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const PRODUCTO = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;

const faltantes = Object.entries({
  AIRTABLE_TOKEN: TOKEN,
  AIRTABLE_BASE_ID: P_BASE,
  AIRTABLE_BACHES_TABLE_ID: P_BACHES,
  AIRTABLE_BASE_SIRIUS_INVENTARIO: V_BASE,
  AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: V_MOV,
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
  salio: 'Total Cantidad Biochar Seco Salio (KG)',
};
const ESTADO_COMPLETO = 'Bache Completo Bodega';
const ESTADO_INCOMPLETO = 'Bache Incompleto';

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

/** PATCH en lotes de 10 (el máximo de Airtable), respetando el rate limit. */
async function patchEnLotes(base, table, token, updates) {
  for (let i = 0; i < updates.length; i += 10) {
    await at(`${AT}/${base}/${table}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ records: updates.slice(i, i + 10) }),
    });
    await new Promise((r) => setTimeout(r, 250));
  }
}

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => r2(n).toLocaleString('es-CO', { minimumFractionDigits: 2 });

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function num(value) {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(APPLY ? '⚠️  MODO APPLY: se escribirá en Airtable\n' : '🔎 Ensayo (dry-run): no se escribe nada\n');

  const [baches, movimientos] = await Promise.all([
    fetchAll(P_BASE, P_BACHES, TOKEN),
    fetchAll(V_BASE, V_MOV, GTOKEN, { filterByFormula: `{product_id} = '${esc(PRODUCTO)}'` }),
  ]);

  const bachePorCodigo = new Map(baches.map((b) => [String(b.fields[B.codigo] ?? ''), b]));

  // Movimientos por bache.
  const porBache = new Map();
  let sinBache = 0;
  for (const m of movimientos) {
    const codigo = String(m.fields.bache_origen_id ?? '');
    if (!codigo) {
      sinBache += 1;
      continue;
    }
    const g = porBache.get(codigo) ?? { entradas: [], salidas: [] };
    if (m.fields.tipo_movimiento === 'Entrada') g.entradas.push(m);
    else if (m.fields.tipo_movimiento === 'Salida') g.salidas.push(m);
    porBache.set(codigo, g);
  }

  const cambiosEntrada = [];
  const cambiosEstado = [];
  const omitidos = [];
  const yaMigrados = [];
  let totalAntes = 0;
  let totalDespues = 0;

  for (const [codigo, { entradas, salidas }] of [...porBache.entries()].sort()) {
    const ingresado = entradas.reduce((t, m) => t + num(m.fields.cantidad), 0);
    const salido = salidas.reduce((t, m) => t + num(m.fields.cantidad), 0);
    const saldo = ingresado - salido;
    totalAntes += saldo;

    // Agotado: ya netea 0 y se deja como está.
    if (saldo <= TOLERANCIA_KG) {
      totalDespues += saldo;
      continue;
    }

    const bache = bachePorCodigo.get(codigo);
    const referencia = num(bache?.fields[B.referencia]);

    const omitir = (motivo) => {
      omitidos.push({ codigo, motivo });
      totalDespues += saldo;
    };
    if (!bache) {
      omitir('no existe en la tabla de baches de PiroliApp');
      continue;
    }
    if (referencia <= 0) {
      omitir('no tiene peso de referencia (0 lonas)');
      continue;
    }
    if (entradas.length !== 1) {
      omitir(`tiene ${entradas.length} Entradas: no se adivina cuál corregir`);
      continue;
    }
    if (salido > referencia + TOLERANCIA_KG) {
      omitir(`ya salieron ${fmt(salido)} kg, más que su referencia de ${fmt(referencia)} kg`);
      continue;
    }

    const entrada = entradas[0];
    const actual = num(entrada.fields.cantidad);
    const obs = String(entrada.fields.observaciones ?? '');
    const nuevoSaldo = referencia - salido;
    totalDespues += nuevoSaldo;

    if (MARCA.test(obs) && Math.abs(actual - referencia) <= TOLERANCIA_KG) {
      yaMigrados.push(codigo);
    } else {
      // Si ya tenía la marca (un intento a medias), se conserva el seco ORIGINAL.
      const secoOriginal = MARCA.test(obs) ? Number(MARCA.exec(obs)[1]) : actual;
      const marca = `[REF-KG seco=${r2(secoOriginal)}]`;
      cambiosEntrada.push({
        codigo,
        id: entrada.id,
        antes: actual,
        despues: referencia,
        salido,
        saldoAntes: saldo,
        saldoDespues: nuevoSaldo,
        fields: {
          cantidad: referencia,
          observaciones: MARCA.test(obs)
            ? obs
            : `${obs ? `${obs}\n` : ''}${marca} Llevado a peso de referencia (25 kg × lona) el 2026-09-22. La masa seca medida sigue en Monitoreo Baches.`,
        },
      });
    }

    // Sin ninguna salida EN NINGUNA DE LAS DOS VISTAS, "Incompleto" es un rastro
    // que ya no corresponde. Si PiroliApp sí registra salidas, el estado puede ser
    // cierto y es el Core el que está corto: eso se mira a mano, no se pisa.
    if (
      !salidas.length &&
      num(bache.fields[B.salio]) <= TOLERANCIA_KG &&
      bache.fields[B.estado] === ESTADO_INCOMPLETO
    ) {
      cambiosEstado.push({ codigo, id: bache.id, antes: bache.fields[B.estado] });
    }
  }

  // ── Reporte ────────────────────────────────────────────────────────────────
  console.log(`Movimientos de biochar puro: ${movimientos.length} (${sinBache} sin bache)`);
  console.log(`Baches en el libro mayor: ${porBache.size}\n`);

  console.log(`Entradas a corregir: ${cambiosEntrada.length}`);
  for (const c of cambiosEntrada) {
    const parcial = c.salido > TOLERANCIA_KG ? ` · ya salieron ${fmt(c.salido)}` : '';
    console.log(
      `  ${c.codigo}: Entrada ${fmt(c.antes)} → ${fmt(c.despues)} kg${parcial} · saldo ${fmt(c.saldoAntes)} → ${fmt(c.saldoDespues)}`
    );
  }
  if (yaMigrados.length) console.log(`\nYa estaban en referencia: ${yaMigrados.join(', ')}`);

  console.log(`\nEstado Bache a corregir: ${cambiosEstado.length}`);
  for (const c of cambiosEstado) console.log(`  ${c.codigo}: ${c.antes} → ${ESTADO_COMPLETO}`);

  if (omitidos.length) {
    console.log(`\n⚠️  Omitidos (${omitidos.length}), para mirar a mano:`);
    for (const o of omitidos) console.log(`  ${o.codigo}: ${o.motivo}`);
  }

  console.log(`\nSaldo de biochar en el Core: ${fmt(totalAntes)} kg → ${fmt(totalDespues)} kg`);
  console.log(`Diferencia: ${fmt(totalDespues - totalAntes)} kg`);

  if (!APPLY) {
    console.log('\nEnsayo terminado. Para escribir: node scripts/migrar-biochar-referencia.mjs --apply');
    return;
  }

  await patchEnLotes(
    V_BASE,
    V_MOV,
    GTOKEN,
    cambiosEntrada.map((c) => ({ id: c.id, fields: c.fields }))
  );
  console.log(`\n✅ ${cambiosEntrada.length} Entradas corregidas en el Core`);

  await patchEnLotes(
    P_BASE,
    P_BACHES,
    TOKEN,
    cambiosEstado.map((c) => ({ id: c.id, fields: { [B.estado]: ESTADO_COMPLETO } }))
  );
  console.log(`✅ ${cambiosEstado.length} Estado Bache corregidos en PiroliApp`);
}

main().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});

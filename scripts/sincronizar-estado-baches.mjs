#!/usr/bin/env node
/**
 * Pone al día `Estado Bache` en la tabla de baches de PiroliApp.
 *
 * La tabla de baches es el HISTORIAL de la producción de pirólisis: los baches no
 * se borran, cambian de estado a medida que se vacían. Hasta el 2026-07-30 nada
 * actualizaba ese estado al consumir biochar, así que hay baches en "Bache Completo
 * Bodega" con 0 kg disponibles — incluidos los 11 que consumieron las dos tandas
 * históricas de Blend.
 *
 * De aquí en adelante el flujo de la app lo hace solo (`blend-deduction.ts` →
 * `marcarEstadoBaches`). Este script es para el rezago, y sirve de auditoría: si
 * vuelve a encontrar mucho, algo dejó de marcar.
 *
 * Reglas (solo para baches en bodega; los de planta no se tocan):
 *   disponible ≈ 0  y ya salió algo  → Bache Agotado
 *   0 < disponible < masa seca       → Bache Incompleto
 *   nada consumido                   → sin cambio
 *
 * Uso:
 *   node scripts/sincronizar-estado-baches.mjs           # dry-run
 *   node scripts/sincronizar-estado-baches.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const AT = 'https://api.airtable.com/v0';
const TOLERANCIA_VACIO_KG = 0.01;

const ESTADO = {
  agotado: 'Bache Agotado',
  incompleto: 'Bache Incompleto',
  completoBodega: 'Bache Completo Bodega',
  completoPlanta: 'Bache Completo Planta',
};

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
const BASE = env.AIRTABLE_BASE_ID;
const TABLA = env.AIRTABLE_BACHES_TABLE_ID;

if (!TOKEN || !BASE || !TABLA) {
  console.error('❌ Faltan AIRTABLE_GLOBAL_TOKEN, AIRTABLE_BASE_ID o AIRTABLE_BACHES_TABLE_ID en .env.local');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function at(url, init = {}) {
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function num(v) {
  const n = typeof v === 'object' && v !== null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ESTADO DE BACHES — ${APPLY ? '⚠️  MODO APPLY' : 'DRY-RUN (no escribe nada)'}`);
  console.log(`${'═'.repeat(72)}\n`);

  const baches = [];
  let offset;
  do {
    const url = new URL(`${AT}/${BASE}/${TABLA}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString());
    baches.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  console.log(`${baches.length} baches leídos.\n`);

  const cambios = [];
  for (const b of baches) {
    const codigo = String(b.fields['Codigo Bache'] ?? b.id);
    const estado = String(b.fields['Estado Bache'] ?? '');
    const disponible = num(b.fields['Total Cantidad Actual Biochar Seco']);
    const salido = num(b.fields['Total Cantidad Biochar Seco Salio (KG)']);

    // Los baches de planta no son inventario de bodega: no se tocan.
    if (estado === ESTADO.completoPlanta) continue;
    // Si nunca salió nada, no hay razón para cambiar el estado.
    if (salido <= 0) continue;

    const nuevo = disponible <= TOLERANCIA_VACIO_KG ? ESTADO.agotado : ESTADO.incompleto;
    if (nuevo === estado) continue;

    cambios.push({ id: b.id, codigo, estado, nuevo, disponible, salido });
  }

  if (!cambios.length) {
    console.log('✓ Todos los baches tienen el estado que les corresponde. Nada por hacer.\n');
    return;
  }

  console.log(`${cambios.length} bache(s) con estado desactualizado:\n`);
  console.log(`  ${'Bache'.padEnd(10)} ${'disponible'.padStart(11)} ${'salido'.padStart(10)}   ${'estado actual'.padEnd(24)} → nuevo`);
  for (const c of cambios) {
    console.log(
      `  ${c.codigo.padEnd(10)} ${c.disponible.toFixed(2).padStart(11)} ${c.salido.toFixed(2).padStart(10)}   ` +
        `${c.estado.padEnd(24)} → ${c.nuevo}`
    );
  }

  const agotados = cambios.filter((c) => c.nuevo === ESTADO.agotado).length;
  console.log(`\n  ${agotados} pasan a Agotado, ${cambios.length - agotados} a Incompleto.\n`);

  if (!APPLY) {
    console.log('DRY-RUN: no se escribió nada. Reejecuta con --apply para aplicar.\n');
    return;
  }

  let actualizados = 0;
  for (let i = 0; i < cambios.length; i += 10) {
    const grupo = cambios.slice(i, i + 10);
    const data = await at(`${AT}/${BASE}/${TABLA}`, {
      method: 'PATCH',
      body: JSON.stringify({
        records: grupo.map((c) => ({ id: c.id, fields: { 'Estado Bache': c.nuevo } })),
      }),
    });
    actualizados += (data.records ?? []).length;
  }

  console.log(`✓ ${actualizados} bache(s) actualizados.\n`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});

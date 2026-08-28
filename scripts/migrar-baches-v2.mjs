#!/usr/bin/env node
/**
 * Trae los 61 baches de la era V2 (S-00083…S-00143) desde la base `PiroliApp V 1.0`
 * a la tabla `Baches Pirolisis` de la base actual.
 *
 * ═══ POR QUÉ NO ES UN COPY-PASTE ══════════════════════════════════════════════
 * `Codigo Bache` en la tabla destino NO es un texto: es una fórmula anclada al
 * autonumber, `CONCATENATE("S-", RIGHT("00000" & (144 + {Auto Number} - 1), 5))`.
 * Un registro insertado hoy toma el autonumber que sigue y sale como S-00280, no
 * como S-00083. Y el autonumber no se puede fijar, ni reordenar, ni reciclar: es
 * lo mismo que dejó el hueco de S-00077 abierto para siempre.
 *
 * Por eso la migración escribe el código en `Codigo Bache Historico` (texto) y la
 * fórmula pasa a preferirlo cuando existe. Ese cambio de fórmula es MANUAL: la
 * Meta API de Airtable no crea ni edita campos calculados. El script lo imprime
 * al final y verifica si ya está puesto.
 *
 * ═══ LAS DECISIONES QUE SOSTIENEN ESTO ════════════════════════════════════════
 *
 * **Los baches migrados entran con 0 kg disponibles, a propósito.** El saldo del
 * destino es `SUM(Masa Seca from Monitoreo Baches) − SUM(salidas)`, una fórmula
 * sobre filas VINCULADAS de monitoreo. No creamos esas filas, así que la fórmula
 * da 0 y `fetchBachesConBiochar()` —que lee la tabla completa y filtra `kg > 0`—
 * nunca los ofrece al producir Blend. Es lo correcto además de lo seguro: ese
 * biochar se consumió en 2025 y no está en los 48.273 kg conciliados de hoy.
 * La masa seca real se conserva en `Masa Seca Historica (KG)`, que no alimenta
 * ninguna fórmula de inventario.
 *
 * **`Estado Bache` va en `Bache Agotado` para los 61.** El estado original queda
 * en `Estado Bache V2`. Mandar `Bache Pesado` —que traen 18 de ellos— es un 422:
 * no es una opción del singleSelect destino, y un 422 tumba el PATCH completo.
 *
 * **La humedad de S-00138…S-00143 se imputa al 19,35%.** Esos 6 registros salieron
 * de V2 con humedad 0, así que su "masa seca" era el peso húmedo: 596 kg de más.
 * 19,35% es el promedio de los 55 baches que sí tienen dato de laboratorio. Es un
 * dato inventado y por eso queda dicho en `Salidas Historicas`, registro por
 * registro: quien lea la ficha ve que ese número no salió de una balanza.
 *
 * **La trazabilidad de salida viaja como texto.** Las 11 ventas y los 2 lotes de
 * Blend de la era V2 no tienen tabla equivalente aquí (`Venta Biochar` no existe;
 * el Blend de hoy se deriva de un lote en los Core). Reproducir esas tablas sería
 * resucitar un modelo que ya se reemplazó, así que se aplanan a `Salidas
 * Historicas`: es lo que explica por qué 43 baches quedaron agotados.
 *
 * Sin `--apply` es dry-run. Es idempotente por `Codigo Bache Historico`: un bache
 * ya migrado se salta, así que un reintento COMPLETA lo que falte en vez de
 * duplicarlo. Duplicar sí importaría: cada fila de más corre el autonumber y
 * desalinea el offset de la fórmula para los baches futuros.
 *
 * Uso:
 *   node scripts/migrar-baches-v2.mjs --crear-campos           # dry-run del esquema
 *   node scripts/migrar-baches-v2.mjs --crear-campos --apply
 *   node scripts/migrar-baches-v2.mjs                          # dry-run de los datos
 *   node scripts/migrar-baches-v2.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const CREAR_CAMPOS = argv.includes('--crear-campos');

const AT = 'https://api.airtable.com/v0';
const META = 'https://api.airtable.com/v0/meta/bases';

/** Promedio de los 55 baches V2 con dato de laboratorio. Ver cabecera. */
const HUMEDAD_IMPUTADA_PCT = 19.35;

/** Estado destino de todo bache migrado: su biochar ya no existe. */
const ESTADO_MIGRADO = 'Bache Agotado';

/** Marca de `Origen Registro`. Es la llave por la que el runtime los excluye. */
const ORIGEN_MIGRADO = 'Migrado PiroliApp V2';

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
const DEST_BASE = env.AIRTABLE_BASE_ID;
const DEST_BACHES = env.AIRTABLE_BACHES_TABLE_ID;
const V1_BASE = env.AIRTABLE_BASE_PIROLIAPP_V1;
const V1_BACHES = env.AIRTABLE_TABLE_V1_BACHES_V2;
const V1_VENTAS = env.AIRTABLE_TABLE_V1_VENTA_BIOCHAR;
const V1_BLEND = env.AIRTABLE_TABLE_V1_BIOCHAR_BLEND;

const faltantes = Object.entries({
  AIRTABLE_GLOBAL_TOKEN: TOKEN,
  AIRTABLE_BASE_ID: DEST_BASE,
  AIRTABLE_BACHES_TABLE_ID: DEST_BACHES,
  AIRTABLE_BASE_PIROLIAPP_V1: V1_BASE,
  AIRTABLE_TABLE_V1_BACHES_V2: V1_BACHES,
  AIRTABLE_TABLE_V1_VENTA_BIOCHAR: V1_VENTAS,
  AIRTABLE_TABLE_V1_BIOCHAR_BLEND: V1_BLEND,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (faltantes.length) {
  console.error(`❌ Faltan variables en .env.local:\n   ${faltantes.join('\n   ')}`);
  process.exit(1);
}

/**
 * Los campos que la migración necesita en la tabla destino. Airtable indexa la
 * respuesta por NOMBRE de campo, así que el nombre es el contrato.
 */
const CAMPOS_NUEVOS = [
  {
    name: 'Codigo Bache Historico',
    type: 'singleLineText',
    description:
      'Codigo real del bache en la era anterior (S-00083..S-00143). La formula de Codigo Bache lo prefiere cuando existe, porque el autonumber no puede reproducirlo.',
  },
  {
    name: 'Origen Registro',
    type: 'singleSelect',
    options: { choices: [{ name: ORIGEN_MIGRADO }] },
    description:
      'Marca los registros que no nacieron en esta app. El runtime los excluye por este campo.',
  },
  {
    name: 'Fecha Historica',
    type: 'date',
    options: { dateFormat: { name: 'iso' } },
    description:
      'Fecha original del bache. Fecha Creacion es createdTime y marca el dia de la migracion, no el de produccion.',
  },
  {
    name: 'Masa Seca Historica (KG)',
    type: 'number',
    options: { precision: 2 },
    description:
      'Masa seca de la era V2. Deliberadamente NO alimenta el saldo: ese biochar ya se consumio.',
  },
  {
    name: 'Humedad Historica (%)',
    type: 'number',
    options: { precision: 2 },
    description:
      'Humedad de laboratorio de la era V2, o el promedio imputado cuando el registro venia en 0.',
  },
  {
    name: 'Estado Bache V2',
    type: 'singleLineText',
    description:
      'Estado original. Se guarda aparte porque Bache Pesado no es una opcion del singleSelect de hoy.',
  },
  {
    name: 'Recuento Lonas Historico',
    type: 'number',
    options: { precision: 0 },
    description:
      'Lonas del bache. Recuento Lonas es un count sobre Balances Masa y da 0 sin los balances de la era.',
  },
  {
    name: 'Salidas Historicas',
    type: 'multilineText',
    description:
      'Ventas y lotes de Blend de la era V2, ya sin tabla equivalente aqui. Explica por que el bache quedo agotado.',
  },
];

// ---------------------------------------------------------------------------
async function at(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${url}\n${JSON.stringify(data)}`);
  await new Promise((r) => setTimeout(r, 220)); // 5 req/s por base
  return data;
}

async function leerTodo(base, tabla) {
  const out = [];
  let offset;
  do {
    const url = new URL(`${AT}/${base}/${tabla}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString());
    out.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);
  return out;
}

const fmt = (n) => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 });
const soloFecha = (iso) => String(iso).slice(0, 10);

// ---------------------------------------------------------------------------
async function esquema() {
  const data = await at(`${META}/${DEST_BASE}/tables`);
  const tabla = data.tables.find((t) => t.id === DEST_BACHES);
  if (!tabla) throw new Error(`La tabla ${DEST_BACHES} no existe en la base destino`);
  return tabla;
}

/** Autonumber más alto entre los baches que NACIERON en esta app. */
function watermarkVivo(destino) {
  return Math.max(
    0,
    ...destino
      .filter((r) => !r.fields['Codigo Bache Historico'])
      .map((r) => Number(r.fields['Auto Number']) || 0)
  );
}

async function pasoCampos(tabla) {
  const existentes = new Map(tabla.fields.map((f) => [f.name, f]));
  const pendientes = CAMPOS_NUEVOS.filter((c) => !existentes.has(c.name));

  console.log(`\n▸ Campos en la tabla destino: ${tabla.fields.length}`);
  for (const c of CAMPOS_NUEVOS) {
    console.log(`   ${existentes.has(c.name) ? '✅ ya existe' : '➕ falta    '}  ${c.name} :: ${c.type}`);
  }
  if (!pendientes.length) return;

  if (!APPLY) {
    console.log(`\n   (dry-run) se crearian ${pendientes.length} campos. Repite con --apply.`);
    return;
  }
  for (const campo of pendientes) {
    await at(`${META}/${DEST_BASE}/tables/${DEST_BACHES}/fields`, {
      method: 'POST',
      body: JSON.stringify(campo),
    });
    console.log(`   ✅ creado: ${campo.name}`);
  }
}

// ---------------------------------------------------------------------------
/** Aplana las ventas y los lotes de Blend de un bache a texto legible. */
function salidasDe(codigo, ventas, lotes, humedadImputada) {
  const lineas = [];
  for (const v of ventas) {
    const f = v.fields;
    const partes = [
      `VENTA ${soloFecha(f['Fecha Venta'] ?? f['Fecha Registro'])}`,
      `${fmt(f['Peso Vendido (kg)'] ?? 0)} kg`,
      `${f['Comprador'] ?? 'sin comprador'}${f['NIT/Cedula Comprador'] ? ` (${f['NIT/Cedula Comprador']})` : ''}`,
      f['Destino'] ? String(f['Destino']).trim() : null,
      f['Tipo de Uso'] ?? null,
      f['Operador Responsable'] ?? null,
    ].filter(Boolean);
    lineas.push(partes.join(' | '));
    if (f['Observaciones']) lineas.push(`   obs: ${String(f['Observaciones']).trim()}`);
  }
  for (const l of lotes) {
    const f = l.fields;
    lineas.push(
      `BLEND ${f['Codigo Biochar Blend']} ${soloFecha(l.createdTime)} | lote de ${(f['Baches Pirolisis'] ?? []).length} baches | ${fmt(f['Cantidad Biochar Blend Preparacion'] ?? 0)} kg de preparacion`
    );
  }
  if (humedadImputada) {
    lineas.push(
      `HUMEDAD IMPUTADA: ${HUMEDAD_IMPUTADA_PCT}% (promedio de los 55 baches V2 con dato de laboratorio). El registro original venia en 0, lo que daba masa seca = peso humedo. Este porcentaje NO se midio.`
    );
  }
  if (!lineas.length) lineas.push('Sin ventas ni lotes de Blend registrados en la era V2.');
  return `${codigo} — migrado de PiroliApp V 1.0\n${lineas.join('\n')}`;
}

async function pasoDatos(tabla) {
  const nombres = new Set(tabla.fields.map((f) => f.name));
  const sinCrear = CAMPOS_NUEVOS.filter((c) => !nombres.has(c.name));
  if (sinCrear.length) {
    console.error(`\n❌ Faltan campos en el destino: ${sinCrear.map((c) => c.name).join(', ')}`);
    console.error('   Corre primero: node scripts/migrar-baches-v2.mjs --crear-campos --apply');
    process.exit(1);
  }

  const estadoField = tabla.fields.find((f) => f.name === 'Estado Bache');
  if (!estadoField.options.choices.some((c) => c.name === ESTADO_MIGRADO)) {
    console.error(`\n❌ '${ESTADO_MIGRADO}' no es una opcion de Estado Bache. Escribirlo seria un 422.`);
    process.exit(1);
  }

  console.log('\n▸ Leyendo la era V2 en PiroliApp V 1.0…');
  const v2 = await leerTodo(V1_BASE, V1_BACHES);
  const ventas = await leerTodo(V1_BASE, V1_VENTAS);
  const lotes = await leerTodo(V1_BASE, V1_BLEND);
  console.log(`   ${v2.length} baches · ${ventas.length} ventas · ${lotes.length} lotes de Blend`);

  console.log('▸ Leyendo la tabla destino…');
  const destino = await leerTodo(DEST_BASE, DEST_BACHES);
  const yaMigrados = new Set(destino.map((r) => r.fields['Codigo Bache Historico']).filter(Boolean));
  const codigosVivos = new Set(
    destino.filter((r) => !r.fields['Codigo Bache Historico']).map((r) => r.fields['Codigo Bache'])
  );
  const watermark = watermarkVivo(destino);
  console.log(
    `   ${destino.length} registros · ${yaMigrados.size} ya migrados · autonumber vivo mas alto: ${watermark}`
  );

  // Índices por record ID: en una fórmula un campo link se evalúa como el texto
  // del campo primario, así que el cruce va en JS sobre los IDs reales.
  const ventasPorBache = new Map();
  for (const v of ventas) {
    for (const id of v.fields['Baches'] ?? []) {
      if (!ventasPorBache.has(id)) ventasPorBache.set(id, []);
      ventasPorBache.get(id).push(v);
    }
  }
  const lotesPorBache = new Map();
  for (const l of lotes) {
    for (const id of l.fields['Baches Pirolisis'] ?? []) {
      if (!lotesPorBache.has(id)) lotesPorBache.set(id, []);
      lotesPorBache.get(id).push(l);
    }
  }

  const nuevos = [];
  const saltados = [];
  const problemas = [];
  let imputados = 0;
  let secoTotal = 0;

  const ordenados = [...v2].sort((a, b) =>
    String(a.fields['Codigo Bache']).localeCompare(String(b.fields['Codigo Bache']))
  );

  for (const bache of ordenados) {
    const f = bache.fields;
    const codigo = f['Codigo Bache'];

    if (!codigo) {
      problemas.push(`${bache.id}: sin Codigo Bache`);
      continue;
    }
    if (codigosVivos.has(codigo)) {
      problemas.push(`${codigo}: colisiona con un bache VIVO del destino`);
      continue;
    }
    if (yaMigrados.has(codigo)) {
      saltados.push(codigo);
      continue;
    }

    const humedo = Number(f['Total Biochar Baches (KG) Wet Weight']) || 0;
    const humedadOriginal = Number(f['Porcentaje de Humedad (Lab Guaicaramo)']) || 0;
    const imputada = humedadOriginal === 0;
    if (imputada) imputados++;
    const humedadPct = imputada ? HUMEDAD_IMPUTADA_PCT : humedadOriginal * 100;
    const seco = Math.round(humedo * (1 - humedadPct / 100) * 100) / 100;
    secoTotal += seco;

    nuevos.push({
      fields: {
        'Codigo Bache Historico': codigo,
        'Origen Registro': ORIGEN_MIGRADO,
        'Fecha Historica': soloFecha(bache.createdTime),
        'Total Biochar Humedo Bache (KG)': humedo,
        'Masa Seca Historica (KG)': seco,
        'Humedad Historica (%)': Math.round(humedadPct * 100) / 100,
        'Estado Bache': ESTADO_MIGRADO,
        'Estado Bache V2': String(f['Estado Bache'] ?? ''),
        'Recuento Lonas Historico': Number(f['Recuento Lonas']) || 0,
        'Salidas Historicas': salidasDe(
          codigo,
          ventasPorBache.get(bache.id) ?? [],
          lotesPorBache.get(bache.id) ?? [],
          imputada
        ),
      },
    });
  }

  console.log('\n▸ Plan');
  console.log(`   a crear:        ${nuevos.length}`);
  console.log(
    `   ya migrados:    ${saltados.length}${saltados.length ? ` (${saltados[0]}…${saltados.at(-1)})` : ''}`
  );
  console.log(
    `   masa seca:      ${fmt(secoTotal)} kg  (${imputados} con humedad imputada al ${HUMEDAD_IMPUTADA_PCT}%)`
  );
  if (problemas.length) {
    console.log(`   ⚠️  problemas:  ${problemas.length}`);
    for (const p of problemas) console.log(`        ${p}`);
  }
  // Se muestran dos: el primero y el primero CON trazabilidad de salida. Revisar
  // solo el primero deja sin ojos la parte que se aplana a texto, que es la que
  // no tiene forma de validarse contra un esquema.
  const muestras = [nuevos[0], nuevos.find((n) => n.fields['Salidas Historicas'].includes('VENTA'))]
    .filter((m, i, arr) => m && arr.indexOf(m) === i);
  for (const m of muestras) {
    console.log(`\n   Muestra (${m.fields['Codigo Bache Historico']}):`);
    console.log(
      JSON.stringify(m.fields, null, 2)
        .split('\n')
        .map((l) => `     ${l}`)
        .join('\n')
    );
  }

  if (!nuevos.length) {
    console.log('\n✅ No hay nada que migrar.');
  } else if (!APPLY) {
    console.log('\n   (dry-run) no se escribio nada. Repite con --apply.');
  } else {
    console.log('');
    for (let i = 0; i < nuevos.length; i += 10) {
      const lote = nuevos.slice(i, i + 10);
      await at(`${AT}/${DEST_BASE}/${DEST_BACHES}`, {
        method: 'POST',
        body: JSON.stringify({ records: lote, typecast: false }),
      });
      console.log(
        `   ✅ ${lote[0].fields['Codigo Bache Historico']}…${lote.at(-1).fields['Codigo Bache Historico']} (${i + lote.length}/${nuevos.length})`
      );
    }
  }

  return watermark;
}

// ---------------------------------------------------------------------------
/**
 * La Meta API no crea ni edita campos calculados, así que este último paso es a
 * mano. Se imprime siempre para que quede claro que la migración no está cerrada
 * hasta que la fórmula esté puesta.
 */
function pasoFormula(tabla, watermark) {
  const auto = tabla.fields.find((f) => f.name === 'Auto Number');
  const hist = tabla.fields.find((f) => f.name === 'Codigo Bache Historico');
  const codigo = tabla.fields.find((f) => f.name === 'Codigo Bache');
  const formulaActual = String(codigo?.options?.formula ?? '');

  console.log('\n' + '─'.repeat(78));
  if (hist && formulaActual.includes(hist.id)) {
    console.log('✅ La formula de `Codigo Bache` ya respeta `Codigo Bache Historico`.');
    console.log('─'.repeat(78));
    return;
  }
  console.log('⚠️  PASO MANUAL PENDIENTE — la formula de `Codigo Bache` todavia ignora lo migrado.');
  console.log('    La Meta API de Airtable no edita campos calculados. Abre la tabla');
  console.log('    `Baches Pirolisis`, edita el campo `Codigo Bache` y pega:\n');
  console.log(
    [
      'IF(',
      '  {Codigo Bache Historico},',
      '  {Codigo Bache Historico},',
      `  CONCATENATE("S-", RIGHT("00000" & (144 + {Auto Number} - 1 - IF({Auto Number} > ${watermark}, 61, 0)), 5))`,
      ')',
    ]
      .map((l) => `      ${l}`)
      .join('\n')
  );
  console.log(`\n    El watermark ${watermark} es el autonumber mas alto de los baches VIVOS.`);
  console.log('    Los de arriba son los 61 migrados (su codigo lo manda el historico) y');
  console.log('    restarles 61 hace que el proximo bache real siga en S-00280, no en S-00341.');
  if (auto && hist) {
    console.log('\n    Referencias por field ID, por si el editor las pide:');
    console.log(`      Auto Number             = ${auto.id}`);
    console.log(`      Codigo Bache Historico  = ${hist.id}`);
  }
  console.log('─'.repeat(78));
}

// ---------------------------------------------------------------------------
(async () => {
  console.log(`\n🏭 Migracion de baches V2 (S-00083…S-00143) — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}`);

  let tabla = await esquema();

  if (CREAR_CAMPOS) {
    await pasoCampos(tabla);
    if (APPLY) tabla = await esquema();
    pasoFormula(tabla, watermarkVivo(await leerTodo(DEST_BASE, DEST_BACHES)));
    return;
  }

  const watermark = await pasoDatos(tabla);
  pasoFormula(await esquema(), watermark);
})().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Repara los baches de bodega que no cuadran con el libro mayor del biochar puro
 * (`SIRIUS-PRODUCT-0015` en Sirius Inventario Production Core).
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * Pasar un bache a `Bache Completo Bodega` es lo que hace existir su biochar como
 * inventario del ecosistema (ver `src/lib/biochar-bodega.ts`). Ese enganche puede
 * quedar corto de dos maneras, y las dos dejan al bache y al Core contando cosas
 * distintas:
 *
 *   1. El bache pasa a bodega SIN biochar seco cuantificado (un bache `No
 *      Monitoreado` da 0 en la fórmula), así que la Entrada se OMITE. El bache
 *      queda "en bodega" y el Core no ve un solo kg.
 *   2. El bache salió por una remisión de baches, que solo escribe el detalle en
 *      PiroliApp: sus kg nunca pasaron por el Core, ni de entrada ni de salida.
 *
 * ═══ QUÉ HACE ═════════════════════════════════════════════════════════════════
 *   (siempre)   Audita: lista los baches de bodega SIN Entrada en el Core y separa
 *               los que no tienen nada que ingresar —masa seca en 0, a la espera de
 *               monitoreo— de los que sí.
 *
 *   --pendientes Ingresa al Core los baches que YA están en bodega, YA tienen masa
 *               seca y nunca despacharon nada, pero se quedaron sin Entrada: los que
 *               pasaron a bodega sin monitoreo y se monitorearon después. De aquí en
 *               adelante lo hace solo `/api/monitoreo-baches/create`; esto es para el
 *               rezago.
 *
 *   --negativos Cierra los baches con saldo NEGATIVO: los que despacharon más de lo
 *               que su monitoreo les reconoce. Sube `Masa Seca (DM kg)` del
 *               monitoreo hasta lo que realmente salió —NO toca la remisión, que es
 *               el documento firmado del cliente— y carga al Core la Entrada y las
 *               Salidas que le faltan, para que el bache deje de ser invisible en el
 *               libro mayor. El ajuste de masa seca se rechaza si la diferencia pasa
 *               de TOLERANCIA_AJUSTE_KG: por encima de eso no es redondeo de
 *               báscula y hay que mirarlo a mano.
 *
 * Sin `--apply` es dry-run. Es idempotente: la Entrada va con `BODEGA-<bache>` y
 * cada Salida con `SAL-REMISION-<n>-<bache>`, y ambas se saltan si ya existen.
 *
 * Uso:
 *   node scripts/reparar-biochar-bodega.mjs                        # auditoría
 *   node scripts/reparar-biochar-bodega.mjs --pendientes           # dry-run del rezago
 *   node scripts/reparar-biochar-bodega.mjs --negativos            # dry-run del arreglo
 *   node scripts/reparar-biochar-bodega.mjs --negativos --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const HACER_NEGATIVOS = argv.includes('--negativos');
const HACER_PENDIENTES = argv.includes('--pendientes');

const AT = 'https://api.airtable.com/v0';

/** Por debajo de esto un saldo es residuo de redondeo, no un descuadre. */
const TOLERANCIA_VACIO_KG = 0.01;

/** Cuánto se acepta subir la masa seca de un monitoreo para cerrar un negativo. */
const TOLERANCIA_AJUSTE_KG = 1;

const RESPONSABLE = 'Reparacion biochar bodega';

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

// PiroliApp
const TOKEN = env.AIRTABLE_TOKEN || env.AIRTABLE_GLOBAL_TOKEN;
const P_BASE = env.AIRTABLE_BASE_ID;
const P_BACHES = env.AIRTABLE_BACHES_TABLE_ID;
const P_MONITOREO = env.AIRTABLE_MONITOREO_BACHES_TABLE_ID;
const P_DETALLE = env.AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID;
const P_REMISIONES = env.AIRTABLE_REMISIONES_BACHES_TABLE_ID;

// Sirius Inventario Production Core
const GTOKEN = env.AIRTABLE_GLOBAL_TOKEN || TOKEN;
const V_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const V_MOV = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const V_STOCK = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK;
const PRODUCTO = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;

const faltantes = Object.entries({
  AIRTABLE_TOKEN: TOKEN,
  AIRTABLE_BASE_ID: P_BASE,
  AIRTABLE_BACHES_TABLE_ID: P_BACHES,
  AIRTABLE_MONITOREO_BACHES_TABLE_ID: P_MONITOREO,
  AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID: P_DETALLE,
  AIRTABLE_REMISIONES_BACHES_TABLE_ID: P_REMISIONES,
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

// Campos de PiroliApp que usa el script (por NOMBRE: así los devuelve la API).
const B = {
  codigo: 'Codigo Bache',
  estado: 'Estado Bache',
  seco: 'Total Cantidad Actual Biochar Seco',
  salio: 'Total Cantidad Biochar Seco Salio (KG)',
  monitoreado: 'Monitoreado',
  monitoreos: 'Monitoreo Baches',
  detalles: 'Detalle Cantidades Remision Pirolisis',
};
const MON_DM = 'Masa Seca (DM kg)';
const DET = { cantidad: 'Cantidad Especificada (KG)', remision: 'Remisiones Baches Pirolisis' };
const REM = { numero: 'ID Numerico', fecha: 'Fecha Evento', cliente: 'Cliente' };

// Los estados que significan "el biochar ya pasó por bodega".
const ESTADOS_BODEGA = ['Bache Completo Bodega', 'Bache Incompleto', 'Bache Agotado'];

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

const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const r2 = (n) => Math.round(n * 100) / 100;

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function num(value) {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const idsDe = (v) =>
  Array.isArray(v) ? v.map((e) => (typeof e === 'string' ? e : e?.id)).filter(Boolean) : [];

/** `documento_referencia` de la Entrada a bodega. Igual que `referenciaEntradaBodega()`. */
const refEntrada = (codigo) => `BODEGA-${codigo}`;

/** `documento_referencia` de la Salida por una remisión de baches. */
const refSalida = (numeroRemision, codigo) => `SAL-REMISION-${numeroRemision}-${codigo}`;

// ---------------------------------------------------------------------------
async function cargar() {
  const [baches, movimientos] = await Promise.all([
    fetchAll(P_BASE, P_BACHES, TOKEN),
    fetchAll(V_BASE, V_MOV, GTOKEN, { filterByFormula: `{product_id} = '${esc(PRODUCTO)}'` }),
  ]);

  // La llave es (documento_referencia, tipo) y no solo la referencia: una
  // producción reparte el mismo lote entre varios baches.
  const referencias = new Set(
    movimientos.map((m) =>
      [
        String(m.fields?.documento_referencia ?? ''),
        String(m.fields?.tipo_movimiento ?? ''),
      ].join('|')
    )
  );

  return { baches, referencias };
}

function auditar(baches, referencias) {
  console.log('\n═══ AUDITORÍA ════════════════════════════════════════════════');

  const enBodega = baches.filter((b) => ESTADOS_BODEGA.includes(String(b.fields?.[B.estado] ?? '')));
  const sinEntrada = enBodega.filter(
    (b) => !referencias.has([refEntrada(String(b.fields?.[B.codigo] ?? '')), 'Entrada'].join('|'))
  );

  console.log(`📖 ${enBodega.length} baches en bodega · ${sinEntrada.length} sin Entrada en el Core`);

  // Se separan porque el arreglo es distinto: un bache sin masa seca no se puede
  // ingresar sin inventar el número, y lo que le falta es el monitoreo.
  const sinMasaSeca = sinEntrada.filter(
    (b) => num(b.fields?.[B.seco]) <= 0 && num(b.fields?.[B.salio]) <= 0
  );
  const conNegativo = sinEntrada.filter((b) => num(b.fields?.[B.seco]) < -TOLERANCIA_VACIO_KG);
  const resto = sinEntrada.filter((b) => !sinMasaSeca.includes(b) && !conNegativo.includes(b));

  if (sinMasaSeca.length) {
    console.log(
      `\n⏳ ${sinMasaSeca.length} bache(s) en bodega sin masa seca: la Entrada se omitió porque no` +
        ' había nada que ingresar. Lo que les falta es el monitoreo, no un movimiento inventado.'
    );
    for (const b of sinMasaSeca) {
      console.log(`     · ${b.fields[B.codigo]} (${b.fields[B.monitoreado] ?? 'sin dato'})`);
    }
  }

  if (conNegativo.length) {
    console.log(`\n🔻 ${conNegativo.length} bache(s) con saldo NEGATIVO (--negativos los cierra):`);
    for (const b of conNegativo) {
      console.log(
        `     · ${b.fields[B.codigo]}: ${r2(num(b.fields[B.seco]))} kg ` +
          `(salió ${r2(num(b.fields[B.salio]))} kg)`
      );
    }
  }

  if (resto.length) {
    console.log(`\n❓ ${resto.length} bache(s) con masa seca y sin Entrada — revisar a mano:`);
    for (const b of resto) {
      console.log(`     · ${b.fields[B.codigo]}: ${r2(num(b.fields[B.seco]))} kg`);
    }
  }

  return { conNegativo, sinEntradaConMasaSeca: resto };
}

// ---------------------------------------------------------------------------
/**
 * Entradas del rezago: bache en bodega, con masa seca, sin salidas y sin Entrada.
 *
 * Se exige `salio = 0` porque un bache que ya despachó necesita reconstruir también
 * sus salidas para no inflar el saldo, y eso es lo que hace `--negativos` con la
 * remisión en la mano. Aquí solo se ingresa lo que sigue intacto en bodega.
 */
function planPendientes(baches, stockId) {
  const porEscribir = [];
  const hoy = new Date().toISOString().slice(0, 10);

  for (const bache of baches) {
    const codigo = String(bache.fields?.[B.codigo] ?? '');
    const kg = r2(num(bache.fields?.[B.seco]));
    const salio = r2(num(bache.fields?.[B.salio]));

    if (salio > TOLERANCIA_VACIO_KG) {
      console.warn(
        `⚠️  ${codigo}: ya despachó ${salio} kg. Necesita entrada Y salidas: eso es --negativos.`
      );
      continue;
    }
    if (kg <= 0) continue;

    porEscribir.push({
      codigo,
      kg,
      fields: {
        product_id: PRODUCTO,
        tipo_movimiento: 'Entrada',
        cantidad: kg,
        unidad_medida: 'kg',
        motivo: 'Ingreso de biochar a bodega',
        documento_referencia: refEntrada(codigo),
        bache_origen_id: codigo,
        responsable: RESPONSABLE,
        fecha_movimiento: `${hoy}T12:00:00.000Z`,
        observaciones:
          `Entrada del bache ${codigo}, que pasó a bodega sin monitoreo y quedó fuera del libro ` +
          'mayor hasta que se registró su masa seca.',
        Stock_Actual: [stockId],
      },
    });
  }

  return porEscribir;
}

async function fasePendientes(candidatos) {
  console.log('\n═══ ENTRADAS PENDIENTES ══════════════════════════════════════');

  // En dry-run no se consulta la fila de stock: el plan no depende de ella y así la
  // auditoría corre aunque el producto todavía no tenga stock creado.
  const stockId = APPLY ? await stockRecordId() : 'recSTOCK_EN_APPLY';
  const plan = planPendientes(candidatos, stockId);

  if (!plan.length) {
    console.log('✅ No hay entradas pendientes.');
    return;
  }

  const total = r2(plan.reduce((suma, m) => suma + m.kg, 0));
  console.log(`📋 ${plan.length} Entrada(s) a crear · ${total} kg`);
  for (const m of plan) console.log(`     · ${m.codigo}: ${m.kg} kg (${refEntrada(m.codigo)})`);

  if (!APPLY) {
    console.log('\n🔍 DRY-RUN: no se escribió nada. Repite con --apply.');
    return;
  }

  // Airtable acepta 10 registros por POST.
  for (let i = 0; i < plan.length; i += 10) {
    const data = await at(`${AT}/${V_BASE}/${V_MOV}`, GTOKEN, {
      method: 'POST',
      body: JSON.stringify({ records: plan.slice(i, i + 10).map((m) => ({ fields: m.fields })) }),
    });
    for (const rec of data.records ?? []) {
      console.log(`   ✅ ${rec.fields?.bache_origen_id}: Entrada ${rec.fields?.cantidad} kg`);
    }
  }
}

// ---------------------------------------------------------------------------
/** Fila de `Stock_Actual` del producto: sin el link, el saldo ignora el movimiento. */
async function stockRecordId() {
  const filas = await fetchAll(V_BASE, V_STOCK, GTOKEN, {
    filterByFormula: `{producto_id} = '${esc(PRODUCTO)}'`,
    maxRecords: '1',
  });
  const id = filas[0]?.id;
  if (!id) {
    throw new Error(
      `No existe fila en Stock_Actual para ${PRODUCTO}. Créala antes: sin ella los movimientos ` +
        'entran pero el saldo se queda en 0.'
    );
  }
  return id;
}

/** Las salidas del bache según PiroliApp, con la remisión que las documenta. */
async function salidasDelBache(bache) {
  const salidas = [];

  for (const id of idsDe(bache.fields?.[B.detalles])) {
    const detalle = await at(`${AT}/${P_BASE}/${P_DETALLE}/${id}`, TOKEN);
    const kg = r2(num(detalle.fields?.[DET.cantidad]));
    const remisionId = idsDe(detalle.fields?.[DET.remision])[0];
    if (!kg || !remisionId) continue;

    const remision = await at(`${AT}/${P_BASE}/${P_REMISIONES}/${remisionId}`, TOKEN);
    salidas.push({
      kg,
      numero: String(remision.fields?.[REM.numero] ?? remisionId),
      fecha: String(remision.fields?.[REM.fecha] ?? '').slice(0, 10),
      cliente: String(remision.fields?.[REM.cliente] ?? ''),
    });
  }

  return salidas;
}

async function planNegativos(baches, referencias) {
  const plan = [];

  for (const bache of baches) {
    const codigo = String(bache.fields?.[B.codigo] ?? '');
    const saldo = num(bache.fields?.[B.seco]);
    const salio = r2(num(bache.fields?.[B.salio]));

    const monitoreoIds = idsDe(bache.fields?.[B.monitoreos]);
    if (monitoreoIds.length !== 1) {
      console.warn(
        `⚠️  ${codigo}: tiene ${monitoreoIds.length} monitoreos; el ajuste de masa seca va a mano.`
      );
      continue;
    }

    const monitoreo = await at(`${AT}/${P_BASE}/${P_MONITOREO}/${monitoreoIds[0]}`, TOKEN);
    const dmActual = r2(num(monitoreo.fields?.[MON_DM]));
    const ajuste = r2(salio - dmActual);

    if (ajuste > TOLERANCIA_AJUSTE_KG) {
      console.warn(
        `⚠️  ${codigo}: faltarían ${ajuste} kg de masa seca (más de ${TOLERANCIA_AJUSTE_KG} kg). ` +
          'Eso no es redondeo de báscula: revisar el monitoreo o la remisión antes de tocar nada.'
      );
      continue;
    }

    const salidas = await salidasDelBache(bache);
    const sumaSalidas = r2(salidas.reduce((total, s) => total + s.kg, 0));
    if (Math.abs(sumaSalidas - salio) > TOLERANCIA_VACIO_KG) {
      console.warn(
        `⚠️  ${codigo}: las remisiones suman ${sumaSalidas} kg pero el bache reporta ${salio} kg. ` +
          'Se omite: no se escribe al Core con las dos fuentes en desacuerdo.'
      );
      continue;
    }

    plan.push({
      codigo,
      saldo: r2(saldo),
      monitoreoId: monitoreoIds[0],
      dmActual,
      dmNuevo: salio,
      ajuste,
      entradaFalta: !referencias.has([refEntrada(codigo), 'Entrada'].join('|')),
      salidas: salidas.map((s) => ({
        ...s,
        referencia: refSalida(s.numero, codigo),
        falta: !referencias.has([refSalida(s.numero, codigo), 'Salida'].join('|')),
      })),
    });
  }

  return plan;
}

async function aplicarNegativos(plan, stockId) {
  for (const p of plan) {
    if (p.ajuste > 0) {
      await at(`${AT}/${P_BASE}/${P_MONITOREO}/${p.monitoreoId}`, TOKEN, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { [MON_DM]: p.dmNuevo } }),
      });
      console.log(`   ✅ ${p.codigo}: masa seca ${p.dmActual} → ${p.dmNuevo} kg`);
    }

    const movimientos = [];

    if (p.entradaFalta) {
      movimientos.push({
        fields: {
          product_id: PRODUCTO,
          tipo_movimiento: 'Entrada',
          cantidad: p.dmNuevo,
          unidad_medida: 'kg',
          motivo: 'Ingreso de biochar a bodega',
          documento_referencia: refEntrada(p.codigo),
          bache_origen_id: p.codigo,
          responsable: RESPONSABLE,
          // Mediodía UTC: un `T00:00` se corre de día al renderizarse en Colombia,
          // y la fecha del movimiento es dato de trazabilidad, no cosmética.
          fecha_movimiento: `${
            p.salidas[0]?.fecha || new Date().toISOString().slice(0, 10)
          }T12:00:00.000Z`,
          observaciones:
            `Entrada reconstruida: el bache ${p.codigo} pasó por bodega y salió por remisión sin ` +
            'quedar en el libro mayor.',
          Stock_Actual: [stockId],
        },
      });
    }

    for (const s of p.salidas.filter((salida) => salida.falta)) {
      const fields = {
        product_id: PRODUCTO,
        tipo_movimiento: 'Salida',
        cantidad: s.kg,
        unidad_medida: 'kg',
        motivo: 'Salida de biochar por remision de baches',
        documento_referencia: s.referencia,
        bache_origen_id: p.codigo,
        produccion_destino_id: s.referencia,
        responsable: RESPONSABLE,
        fecha_movimiento: `${s.fecha}T12:00:00.000Z`,
        observaciones: `Salida reconstruida de la remision de baches ${s.numero} (${s.cliente}).`,
        Stock_Actual: [stockId],
      };
      if (s.cliente) fields.ubicacion_destino_id = s.cliente;
      movimientos.push({ fields });
    }

    if (!movimientos.length) continue;

    const data = await at(`${AT}/${V_BASE}/${V_MOV}`, GTOKEN, {
      method: 'POST',
      body: JSON.stringify({ records: movimientos }),
    });
    for (const rec of data.records ?? []) {
      console.log(
        `   ✅ ${p.codigo}: ${rec.fields?.tipo_movimiento} ${rec.fields?.cantidad} kg ` +
          `(${rec.fields?.documento_referencia})`
      );
    }
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const { baches, referencias } = await cargar();
  const { conNegativo, sinEntradaConMasaSeca } = auditar(baches, referencias);

  if (!HACER_NEGATIVOS && !HACER_PENDIENTES) {
    console.log(
      '\n🔍 Solo auditoría. Corre con --pendientes (rezago de entradas) o --negativos (cierre' +
        ' de saldos negativos) para ver el plan.'
    );
    return;
  }

  if (HACER_PENDIENTES) await fasePendientes(sinEntradaConMasaSeca);

  if (!HACER_NEGATIVOS) return;

  console.log('\n═══ CIERRE DE SALDOS NEGATIVOS ═══════════════════════════════');
  if (!conNegativo.length) {
    console.log('✅ No hay baches con saldo negativo.');
    return;
  }

  const plan = await planNegativos(conNegativo, referencias);
  if (!plan.length) {
    console.log('Nada que se pueda cerrar automáticamente.');
    return;
  }

  for (const p of plan) {
    console.log(`\n📋 ${p.codigo} (saldo ${p.saldo} kg)`);
    if (p.ajuste > 0) console.log(`   · Masa seca ${p.dmActual} → ${p.dmNuevo} kg (+${p.ajuste})`);
    console.log(
      `   · Entrada ${refEntrada(p.codigo)}: ${p.entradaFalta ? `crear ${p.dmNuevo} kg` : 'ya existe'}`
    );
    for (const s of p.salidas) {
      console.log(
        `   · Salida ${s.referencia}: ${s.falta ? `crear ${s.kg} kg` : 'ya existe'} — ` +
          `${s.cliente} ${s.fecha}`
      );
    }
  }

  if (!APPLY) {
    console.log('\n🔍 DRY-RUN: no se escribió nada. Repite con --apply.');
    return;
  }

  const stockId = await stockRecordId();
  console.log('');
  await aplicarNegativos(plan, stockId);
  console.log('\n✅ Listo.');
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});

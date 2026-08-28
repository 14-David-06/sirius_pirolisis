#!/usr/bin/env node
/**
 * Carga en lote el monitoreo (masa seca y % humedad) de baches que están en bodega
 * sin él, que es lo que los tiene invisibles para el inventario.
 *
 * ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
 * Un bache sin monitoreo vale 0 en `Total Cantidad Actual Biochar Seco`, así que
 * `registrarEntradaBiocharBodega()` OMITE su Entrada al Core —correctamente: el
 * número no existe todavía— y el bache queda en bodega con cero kg en el libro
 * mayor. No aparece al sacar biochar ni al producir Blend. Así quedaron
 * S-00251…S-00260 el 2026-08-21.
 *
 * El camino normal es registrarlos uno por uno en `/sistema-baches`. Esto es para
 * el rezago: diez baches a la vez, con el dato de laboratorio en un CSV.
 *
 * ═══ DOS MODOS, Y LA DIFERENCIA IMPORTA ══════════════════════════════════════
 * Por defecto el script CARGA mediciones: el CSV trae lo que dijo el laboratorio y
 * él solo valida y escribe.
 *
 * `--estimar` es el otro modo, y es una excepción con dueño: **decisión explícita
 * de David el 2026-08-28**, tomada después de advertirle dos veces, para los diez
 * baches (S-00251…S-00260) que se movieron a bodega sin monitoreo y que no lo van a
 * tener. Sin masa seca son invisibles: no se pueden sacar ni producir con ellos, y
 * el biochar está físicamente en la bodega.
 *
 * Lo que ese modo NO hace es disimularlo. Cada registro va marcado
 * `ESTIMADO (no medido)` en `Realiza Registro`, y el endpoint copia esa marca al
 * `responsable` del movimiento del Core: la estimación es visible en las dos vistas
 * del biochar. Importa porque estos kg entran a la contabilidad de carbono, y de
 * ahí a un certificado: quien audite tiene que poder separar lo medido de lo
 * estimado sin preguntarle a nadie.
 *
 * ⚠️ No conviertas `--estimar` en la vía normal. Un bache monitoreado de verdad
 * cuesta una muestra; uno estimado cuesta la credibilidad de todos los demás.
 *
 * ═══ POR QUÉ PASA POR LA API Y NO ESCRIBE AIRTABLE DIRECTO ════════════════════
 * `POST /api/monitoreo-baches/create` ya hace las dos partes —crea el monitoreo y,
 * si el bache está en `Bache Completo Bodega`, ingresa su biochar al Core— y lo
 * hace bien: la Entrada se vincula a `Stock_Actual` en el POST, que es la trampa
 * que dejó la fila del Blend en 0 kg teniendo 15.528 kg de entradas. Reimplementar
 * eso acá sería tener dos versiones de la misma regla, y la del script sería la
 * que nadie prueba. Necesita la app corriendo (`npm run dev`) o `--url`.
 *
 * Es idempotente: un bache que ya tiene monitoreo se salta. El endpoint además
 * deduplica la Entrada por `BODEGA-<bache>`.
 *
 * ═══ EL CSV ═══════════════════════════════════════════════════════════════════
 *   codigo,masa_seca_kg,humedad_mc,id_bigbag
 *   S-00251,503.18,21.89,BB-251
 *   S-00252,500.62,22.6,
 *
 * `id_bigbag` es opcional (por defecto el código del bache). `peso_humedo_kg` se
 * acepta como columna extra y solo sirve para VERIFICAR que masa_seca ≈
 * humedo × (1 − humedad): si no cuadra, el script lo dice y no escribe.
 *
 * Uso:
 *   node scripts/registrar-monitoreo-baches.mjs datos.csv              # dry-run
 *   node scripts/registrar-monitoreo-baches.mjs datos.csv --apply
 *   node scripts/registrar-monitoreo-baches.mjs --pendientes           # qué falta
 *   node scripts/registrar-monitoreo-baches.mjs --estimar              # dry-run estimado
 *   node scripts/registrar-monitoreo-baches.mjs --estimar --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const SOLO_PENDIENTES = argv.includes('--pendientes');
const ESTIMAR = argv.includes('--estimar');
const CSV = argv.find((a) => !a.startsWith('--'));
const URL_APP =
  (argv.find((a) => a.startsWith('--url=')) ?? '--url=http://localhost:3000').split('=')[1];
/** Cuántos baches monitoreados anteriores forman la muestra de `--estimar`. */
const MUESTRA = Number((argv.find((a) => a.startsWith('--muestra=')) ?? '--muestra=20').split('=')[1]);

/**
 * Marca que llevan los registros creados por `--estimar`.
 *
 * Va en `Realiza Registro`, que el endpoint copia al `responsable` del movimiento
 * del Core: la estimación queda visible en las DOS vistas del biochar. Sin esto,
 * dentro de seis meses estos diez baches son indistinguibles de una medición, y la
 * diferencia importa cuando alguien audite la contabilidad de carbono.
 */
const MARCA_ESTIMADO = 'ESTIMADO (no medido)';

const AT = 'https://api.airtable.com/v0';

/** Estado en el que el endpoint ingresa el biochar al Core. */
const ESTADO_BODEGA = 'Bache Completo Bodega';

/** Cuánto puede alejarse la masa seca del nominal (lonas × 25) sin ser sospechosa. */
const DESVIACION_MAXIMA = 0.3;

/** Humedad plausible de un biochar recién producido. Fuera de esto, es un dedazo. */
const HUMEDAD_MIN = 0;
const HUMEDAD_MAX = 60;

/** Tolerancia al verificar masa_seca contra peso_humedo × (1 − humedad). */
const TOLERANCIA_COHERENCIA_KG = 1;

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
const BASE = env.AIRTABLE_BASE_ID;
const BACHES = env.AIRTABLE_BACHES_TABLE_ID;

if (!TOKEN || !BASE || !BACHES) {
  console.error('❌ Faltan AIRTABLE_GLOBAL_TOKEN, AIRTABLE_BASE_ID o AIRTABLE_BACHES_TABLE_ID');
  process.exit(1);
}

async function leerBaches() {
  const out = [];
  let offset;
  do {
    const url = new URL(`${AT}/${BASE}/${BACHES}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    out.push(...(data.records ?? []));
    offset = data.offset;
    await new Promise((r) => setTimeout(r, 220));
  } while (offset);
  return out;
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
};

// ---------------------------------------------------------------------------
function parseCsv(ruta) {
  if (!fs.existsSync(ruta)) throw new Error(`No existe el archivo ${ruta}`);
  const lineas = fs
    .readFileSync(ruta, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lineas.length) throw new Error('El CSV está vacío');

  const cabecera = lineas[0].split(',').map((c) => c.trim().toLowerCase());
  const idx = (nombre) => cabecera.indexOf(nombre);
  for (const requerida of ['codigo', 'masa_seca_kg', 'humedad_mc']) {
    if (idx(requerida) === -1) throw new Error(`Al CSV le falta la columna '${requerida}'`);
  }

  return lineas.slice(1).map((linea, i) => {
    const c = linea.split(',').map((x) => x.trim());
    return {
      fila: i + 2,
      codigo: c[idx('codigo')]?.toUpperCase(),
      masaSeca: num(c[idx('masa_seca_kg')]),
      humedad: num(c[idx('humedad_mc')]),
      idBigBag: idx('id_bigbag') !== -1 ? c[idx('id_bigbag')] : '',
      pesoHumedo: idx('peso_humedo_kg') !== -1 ? num(c[idx('peso_humedo_kg')]) : NaN,
    };
  });
}

// ---------------------------------------------------------------------------
function pendientes(baches) {
  return baches
    .filter((r) => !r.fields['Codigo Bache Historico'])
    .filter((r) => (r.fields['Monitoreo Baches'] ?? []).length === 0)
    .filter((r) => String(r.fields['Estado Bache'] ?? '') === ESTADO_BODEGA)
    .sort((a, b) => String(a.fields['Codigo Bache']).localeCompare(String(b.fields['Codigo Bache'])));
}

function mostrarPendientes(baches) {
  const lista = pendientes(baches);
  console.log(`\n▸ Baches en ${ESTADO_BODEGA} SIN monitoreo: ${lista.length}`);
  if (!lista.length) {
    console.log('   Ninguno. Todo lo que está en bodega tiene su masa seca.');
    return;
  }
  console.log('\n   codigo    | lonas | humedo (KG) | nominal (KG)');
  for (const r of lista) {
    const f = r.fields;
    console.log(
      `   ${String(f['Codigo Bache']).padEnd(9)} | ${String(f['Recuento Lonas'] ?? '-').padStart(5)} | ` +
        `${String(f['Total Biochar Humedo Bache (KG)'] ?? '—').padStart(11)} | ` +
        `${String(f['Total Biochar Bache Referencia (KG)'] ?? '-').padStart(12)}`
    );
  }
  console.log(
    '\n   Estos son los que no aparecen al sacar biochar ni al producir Blend.\n' +
      '   Para cargarlos, arma un CSV con el dato de laboratorio:\n\n' +
      '     codigo,masa_seca_kg,humedad_mc,id_bigbag\n' +
      lista.map((r) => `     ${r.fields['Codigo Bache']},,,`).join('\n') +
      '\n\n   y corre: node scripts/registrar-monitoreo-baches.mjs datos.csv'
  );
}

// ---------------------------------------------------------------------------
/**
 * Arma las filas de los baches pendientes con valores ESTIMADOS.
 *
 * ⚠️ Decisión explícita de David, 2026-08-28, después de que se le advirtiera dos
 * veces: estos diez baches no tienen medición y no la van a tener, así que se
 * cargan estimados para que dejen de ser invisibles en bodega. Lo que este modo NO
 * hace es disimularlo — cada registro va marcado y la marca llega hasta el
 * movimiento del Core.
 *
 * La muestra son los baches monitoreados INMEDIATAMENTE ANTERIORES, no todo el
 * histórico: S-00231…S-00250 salieron de la misma corrida que S-00251…S-00260, con
 * la misma biomasa y el mismo clima. El promedio global (19,12% de humedad sobre
 * 92 baches, con desviación de 5,24 puntos y rango 10–30%) mezcla meses distintos y
 * es peor estimador que el de al lado.
 *
 * Cuando el bache SÍ tiene peso húmedo registrado se usa ese, y la masa seca sale
 * de `húmedo × (1 − humedad)`: un dato propio del bache, aunque sea uno solo, vence
 * a un promedio ajeno.
 */
function estimar(pendientesLista, monitoreados) {
  const anteriores = monitoreados
    .filter((m) => m.codigo < pendientesLista[0]?.fields['Codigo Bache'])
    .slice(-MUESTRA);

  if (anteriores.length < 3) {
    throw new Error(
      `Solo hay ${anteriores.length} baches monitoreados anteriores: muy pocos para estimar nada`
    );
  }

  const media = (nums) => nums.reduce((s, x) => s + x, 0) / nums.length;
  const humedad = Math.round(media(anteriores.map((m) => m.humedad)) * 100) / 100;
  const masaSecaMedia = Math.round(media(anteriores.map((m) => m.masaSeca)) * 100) / 100;

  console.log(
    `\n▸ Muestra: los ${anteriores.length} monitoreados anteriores ` +
      `(${anteriores[0].codigo}…${anteriores.at(-1).codigo})`
  );
  console.log(`   humedad media:   ${humedad}%`);
  console.log(`   masa seca media: ${masaSecaMedia} kg`);

  return pendientesLista.map((r) => {
    const codigo = r.fields['Codigo Bache'];
    const humedo = num(r.fields['Total Biochar Humedo Bache (KG)']);
    const tieneHumedo = Number.isFinite(humedo) && humedo > 0;
    const masaSeca = tieneHumedo
      ? Math.round(humedo * (1 - humedad / 100) * 100) / 100
      : masaSecaMedia;

    return {
      fila: 0,
      codigo,
      masaSeca,
      humedad,
      idBigBag: codigo,
      pesoHumedo: NaN, // ya se usó arriba; no hay que re-verificar coherencia
      metodo: tieneHumedo
        ? `peso humedo propio (${humedo} kg) × (1 − ${humedad}%)`
        : `promedio de ${anteriores.length} baches anteriores`,
    };
  });
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🧪 Monitoreo de baches — ${APPLY ? 'APLICANDO' : 'DRY-RUN'}`);

  const baches = await leerBaches();
  const porCodigo = new Map(
    baches.filter((r) => !r.fields['Codigo Bache Historico']).map((r) => [r.fields['Codigo Bache'], r])
  );

  let filas;

  if (ESTIMAR) {
    const lista = pendientes(baches);
    if (!lista.length) {
      console.log('\n✅ No hay baches en bodega sin monitoreo. Nada que estimar.');
      return;
    }
    const monitoreados = baches
      .filter((r) => !r.fields['Codigo Bache Historico'])
      .map((r) => ({
        codigo: String(r.fields['Codigo Bache'] ?? ''),
        humedad: parseFloat((r.fields['% Humedad (MC) (from Monitoreo Baches)'] ?? [])[0]),
        masaSeca: num((r.fields['Masa Seca (DM kg) (from Monitoreo Baches)'] ?? [])[0]),
      }))
      .filter((m) => Number.isFinite(m.humedad) && Number.isFinite(m.masaSeca) && m.masaSeca > 0)
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    filas = estimar(lista, monitoreados);
    console.log(`\n⚠️  MODO ESTIMACIÓN: ${filas.length} baches con valores NO MEDIDOS.`);
    console.log(`   Cada registro queda marcado '${MARCA_ESTIMADO}' en Realiza Registro,`);
    console.log('   y esa marca viaja al responsable del movimiento en el Core.');
  } else if (SOLO_PENDIENTES || !CSV) {
    mostrarPendientes(baches);
    if (!CSV && !SOLO_PENDIENTES) {
      console.log('\n   (no se pasó ningún CSV: solo se listó lo pendiente)');
    }
    return;
  } else {
    filas = parseCsv(CSV);
    console.log(`\n▸ ${filas.length} filas en ${CSV}`);
  }

  const listos = [];
  const errores = [];
  const avisos = [];
  const saltados = [];

  for (const fila of filas) {
    const donde = `fila ${fila.fila} (${fila.codigo || 'sin código'})`;
    const bache = porCodigo.get(fila.codigo);

    if (!bache) {
      errores.push(`${donde}: no existe ese bache`);
      continue;
    }
    if ((bache.fields['Monitoreo Baches'] ?? []).length) {
      saltados.push(`${fila.codigo}: ya tiene monitoreo`);
      continue;
    }
    if (!Number.isFinite(fila.masaSeca) || fila.masaSeca <= 0) {
      errores.push(`${donde}: masa_seca_kg vacía o inválida — es el dato que hay que medir`);
      continue;
    }
    if (!Number.isFinite(fila.humedad) || fila.humedad < HUMEDAD_MIN || fila.humedad > HUMEDAD_MAX) {
      errores.push(`${donde}: humedad_mc fuera de ${HUMEDAD_MIN}–${HUMEDAD_MAX}% (${fila.humedad})`);
      continue;
    }

    const estado = String(bache.fields['Estado Bache'] ?? '');
    if (estado !== ESTADO_BODEGA) {
      // El monitoreo se crea igual, pero el endpoint NO ingresa el biochar al Core
      // salvo en bodega: reconstruir un bache que ya despachó es otro trabajo.
      avisos.push(`${fila.codigo}: está en '${estado}', el biochar NO entrará al Core`);
    }

    const nominal = num(bache.fields['Total Biochar Bache Referencia (KG)']);
    if (Number.isFinite(nominal) && nominal > 0) {
      const desvio = Math.abs(fila.masaSeca - nominal) / nominal;
      if (desvio > DESVIACION_MAXIMA) {
        errores.push(
          `${donde}: masa seca ${fila.masaSeca} kg se aleja ${(desvio * 100).toFixed(0)}% del nominal ${nominal} kg`
        );
        continue;
      }
    }

    if (Number.isFinite(fila.pesoHumedo) && fila.pesoHumedo > 0) {
      const esperada = fila.pesoHumedo * (1 - fila.humedad / 100);
      if (Math.abs(esperada - fila.masaSeca) > TOLERANCIA_COHERENCIA_KG) {
        errores.push(
          `${donde}: masa_seca ${fila.masaSeca} no cuadra con ${fila.pesoHumedo} × (1 − ${fila.humedad}%) = ${esperada.toFixed(2)}`
        );
        continue;
      }
    }

    listos.push({ fila, bache });
  }

  console.log(`\n▸ Plan`);
  console.log(`   a registrar:  ${listos.length}`);
  console.log(`   ya tenían:    ${saltados.length}`);
  console.log(`   con error:    ${errores.length}`);
  for (const e of errores) console.log(`      ❌ ${e}`);
  for (const a of avisos) console.log(`      ⚠️  ${a}`);
  for (const s of saltados) console.log(`      ↩️  ${s}`);

  for (const { fila, bache } of listos) {
    console.log(
      `   ✔ ${fila.codigo}: ${fila.masaSeca} kg secos · ${fila.humedad}%` +
        (fila.metodo ? `  ← ${fila.metodo}` : ` · big bag ${fila.idBigBag || fila.codigo}`)
    );
  }

  if (errores.length) {
    console.log('\n❌ Hay errores: no se escribe nada. Corrige el CSV y vuelve a correr.');
    process.exit(1);
  }
  if (!listos.length) {
    console.log('\n✅ No hay nada que registrar.');
    return;
  }
  if (!APPLY) {
    console.log('\n   (dry-run) no se escribio nada. Repite con --apply.');
    return;
  }

  console.log(`\n▸ Enviando a ${URL_APP}/api/monitoreo-baches/create`);
  for (const { fila, bache } of listos) {
    const cuerpo = {
      records: [
        {
          fields: {
            'ID BigBag': fila.idBigBag || fila.codigo,
            // String a propósito: el campo es multilineText en Airtable.
            '% Humedad (MC)': String(fila.humedad),
            'Masa Seca (DM kg)': fila.masaSeca,
            'Realiza Registro': ESTIMAR
              ? `${MARCA_ESTIMADO} — ${fila.metodo}`
              : 'Carga en lote (registrar-monitoreo-baches)',
            Bache: [bache.id],
            Laboratorio: [],
          },
        },
      ],
    };

    const res = await fetch(`${URL_APP}/api/monitoreo-baches/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.log(`   ❌ ${fila.codigo}: ${res.status} ${JSON.stringify(json)}`);
      continue;
    }
    const entrada = json?.biochar_bodega?.[0]?.entrada;
    const nota = entrada?.yaExistia
      ? 'la Entrada ya existía'
      : entrada?.omitido
        ? `Entrada omitida: ${entrada.motivo}`
        : entrada?.ok
          ? `Entrada al Core: ${entrada.cantidad} kg (${entrada.referencia})`
          : `⚠️ el biochar NO entró al Core: ${entrada?.error ?? 'sin detalle'}`;
    console.log(`   ✅ ${fila.codigo} — ${nota}`);
  }
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});

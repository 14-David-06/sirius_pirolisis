#!/usr/bin/env node
/**
 * Reclasifica el MOTIVO de una salida de bache ya registrada.
 *
 * ═══ POR QUÉ HACE FALTA UN SCRIPT ═════════════════════════════════════════════
 * El motivo de una salida no es un campo editable: entra en la referencia
 * (`SAL-LAB-2026-08-25-S-00211`), que es la LLAVE DE IDEMPOTENCIA de la operación.
 * Por eso corregirlo NO es re-enviar el formulario con el motivo correcto: eso
 * genera `SAL-ENT-…`, que el sistema lee como una salida distinta y descuenta los
 * kg OTRA VEZ. La única corrección honesta es reescribir en sitio lo que ya está
 * escrito, sin mover un solo kg.
 *
 * Existe porque hasta el 2026-08-25 el formulario de salida traía el motivo
 * preseleccionado en `laboratorio`, y así se registraron como análisis de
 * laboratorio entregas que no lo eran (el caso disparador: 154 kg al Colegio
 * Francisco Walter, que era una entrega sin contraprestación del numeral 5.4.2).
 *
 * ═══ QUÉ TOCA ═════════════════════════════════════════════════════════════════
 * La salida vive en dos sitios, y los dos guardan el motivo:
 *
 *   Sirius Inventario Production Core — el/los movimientos de `Biochar Puro` con
 *     esta referencia: `motivo`, `documento_referencia`, `produccion_destino_id` y
 *     `observaciones`. La `cantidad` NO se toca.
 *   PiroliApp — la remisión de baches que lleva la marca `[SALIDA:<ref>]` en sus
 *     Observaciones. Su detalle (los kg que bajan la fórmula del bache) NO se toca.
 *
 * ═══ LO QUE NO HACE ═══════════════════════════════════════════════════════════
 * No mueve inventario, no crea ni borra movimientos y no toca los kg ni el
 * `Estado Bache`: la salida ocurrió, lo único mal es su clasificación.
 *
 * Se NIEGA a correr si ya existe un movimiento con la referencia NUEVA junto al
 * viejo: eso significaría que la salida se re-registró con el motivo correcto y los
 * kg se descontaron dos veces. Ese caso hay que mirarlo a mano —hay que borrar un
 * movimiento, no renombrarlo— y un script no debería decidirlo solo.
 *
 * Sin `--apply` es dry-run. Es idempotente: si la referencia vieja ya no existe en
 * ningún lado y la nueva sí, informa que ya estaba reclasificada y no escribe nada.
 *
 * Uso:
 *   node scripts/reclasificar-salida-bache.mjs --referencia=SAL-LAB-2026-08-25-S-00211 --motivo=entrega
 *   node scripts/reclasificar-salida-bache.mjs --referencia=... --motivo=entrega --apply
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (nombre) => {
  const encontrado = argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado ? encontrado.slice(nombre.length + 3).trim() : '';
};

const AT = 'https://api.airtable.com/v0';

/**
 * Copia de `MOTIVOS_SALIDA` de `src/lib/salida-bache.constants.ts`.
 *
 * Duplicada a propósito: este script es `.mjs` y no puede importar TypeScript sin
 * arrastrar un build. Si allá se agrega un motivo, hay que agregarlo aquí — el
 * script valida contra esta lista, así que un motivo nuevo será rechazado hasta que
 * se copie, que es el fallo seguro.
 */
const MOTIVOS = {
  laboratorio: { prefijo: 'LAB', etiqueta: 'Laboratorio' },
  muestra: { prefijo: 'MUE', etiqueta: 'Muestra' },
  merma: { prefijo: 'MER', etiqueta: 'Merma' },
  traslado: { prefijo: 'TRA', etiqueta: 'Traslado' },
  entrega: { prefijo: 'ENT', etiqueta: 'Entrega sin contraprestación' },
};

const PREFIJO_A_CLAVE = Object.fromEntries(
  Object.entries(MOTIVOS).map(([clave, info]) => [info.prefijo, clave])
);

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
const BASE = env.AIRTABLE_BASE_ID;
const T_REMISIONES = env.AIRTABLE_REMISIONES_BACHES_TABLE_ID;
const F_OBSERVACIONES = env.AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID;

// Sirius Inventario Production Core
const CORE_TOKEN = env.AIRTABLE_API_KEY_SIRIUS_INVENTARIO || env.AIRTABLE_GLOBAL_TOKEN || TOKEN;
const CORE_BASE = env.AIRTABLE_BASE_SIRIUS_INVENTARIO;
const CORE_MOVIMIENTOS = env.AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS;
const PRODUCTO_BIOCHAR_PURO = env.AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID;

/** Igual que `escapeAirtableValue`: la barra invertida primero, o se re-escapa. */
function esc(valor) {
  return String(valor).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function at(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data)}`);
  return data;
}

const marca = (ref) => `[SALIDA:${ref}]`;

/** Reemplazo literal (sin regex): las etiquetas llevan acentos y espacios. */
const reemplazar = (texto, de, a) => String(texto ?? '').split(de).join(a);

// ---------------------------------------------------------------------------
async function main() {
  const referenciaVieja = arg('referencia');
  const motivoNuevo = arg('motivo');

  if (!referenciaVieja || !motivoNuevo) {
    throw new Error(
      'Uso: node scripts/reclasificar-salida-bache.mjs --referencia=SAL-LAB-2026-08-25-S-00211 --motivo=entrega [--apply]'
    );
  }
  if (!MOTIVOS[motivoNuevo]) {
    throw new Error(`Motivo desconocido «${motivoNuevo}». Debe ser uno de: ${Object.keys(MOTIVOS).join(', ')}.`);
  }

  // La referencia se descompone en vez de reemplazar el prefijo a ciegas: si no
  // tiene esta forma no es una referencia de salida y no hay nada que reclasificar.
  const partes = referenciaVieja.match(/^SAL-([A-Z]+)-(\d{4}-\d{2}-\d{2})-(.+)$/);
  if (!partes) {
    throw new Error(
      `«${referenciaVieja}» no tiene la forma SAL-<MOTIVO>-<YYYY-MM-DD>-<bache>. ` +
        'Las salidas que pertenecen a un documento con identidad propia (un acta) no se reclasifican así.'
    );
  }
  const [, prefijoViejo, fecha, bache] = partes;
  const motivoViejo = PREFIJO_A_CLAVE[prefijoViejo];
  if (!motivoViejo) throw new Error(`Prefijo de motivo desconocido: ${prefijoViejo}`);
  if (motivoViejo === motivoNuevo) {
    throw new Error(`La salida ya está clasificada como «${MOTIVOS[motivoNuevo].etiqueta}».`);
  }

  const referenciaNueva = `SAL-${MOTIVOS[motivoNuevo].prefijo}-${fecha}-${bache}`;
  const etiquetaVieja = MOTIVOS[motivoViejo].etiqueta;
  const etiquetaNueva = MOTIVOS[motivoNuevo].etiqueta;

  const faltantes = Object.entries({
    AIRTABLE_TOKEN: TOKEN,
    AIRTABLE_BASE_ID: BASE,
    AIRTABLE_REMISIONES_BACHES_TABLE_ID: T_REMISIONES,
    AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID: F_OBSERVACIONES,
    AIRTABLE_BASE_SIRIUS_INVENTARIO: CORE_BASE,
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: CORE_MOVIMIENTOS,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PRODUCTO_BIOCHAR_PURO,
  })
    .filter(([, valor]) => !valor)
    .map(([clave]) => clave);
  if (faltantes.length) throw new Error(`Falta configuración en .env.local: ${faltantes.join(', ')}`);

  console.log(`\n${APPLY ? '⚙️  APLICANDO' : '🔍 DRY-RUN'} — reclasificar ${referenciaVieja}`);
  console.log(`   ${etiquetaVieja} → ${etiquetaNueva}`);
  console.log(`   Referencia nueva: ${referenciaNueva}`);
  console.log(`   Bache ${bache} · fecha ${fecha} · NO se mueve ni un kg.\n`);

  // ── Core: los movimientos con la referencia ───────────────────────────────
  const buscarMovimientos = async (referencia) => {
    const url = new URL(`${AT}/${CORE_BASE}/${CORE_MOVIMIENTOS}`);
    url.searchParams.set(
      'filterByFormula',
      `AND({product_id} = '${esc(PRODUCTO_BIOCHAR_PURO)}', OR({documento_referencia} = '${esc(referencia)}', ` +
        `{produccion_destino_id} = '${esc(referencia)}'))`
    );
    const { records } = await at(url.toString(), CORE_TOKEN);
    return records ?? [];
  };

  const movimientos = await buscarMovimientos(referenciaVieja);
  const yaReclasificados = await buscarMovimientos(referenciaNueva);

  // Un movimiento con la referencia NUEVA no significa "ya está hecho" si el viejo
  // sigue ahí: son dos movimientos, y eso es un doble descuento que se resuelve
  // borrando uno. Renombrar encima lo esconderÍa.
  if (yaReclasificados.length && movimientos.length) {
    throw new Error(
      `Hay ${movimientos.length} movimiento(s) con ${referenciaVieja} y ${yaReclasificados.length} con ` +
        `${referenciaNueva}: los kg se descontaron DOS VECES. Eso se resuelve a mano borrando el ` +
        'movimiento sobrante, no reclasificando.'
    );
  }
  if (yaReclasificados.length && !movimientos.length) {
    const codigos = yaReclasificados.map((m) => m.fields.id_movimiento ?? m.id).join(', ');
    console.log(`✅ El Core ya está reclasificado (${codigos}).`);
  }
  if (!yaReclasificados.length && !movimientos.length) {
    console.log(`⚠️  El Core no tiene ningún movimiento con ${referenciaVieja}: nada que reclasificar ahí.`);
  }

  for (const mov of movimientos) {
    const f = mov.fields;
    const observaciones = reemplazar(
      reemplazar(f.observaciones, etiquetaVieja, etiquetaNueva),
      marca(referenciaVieja),
      marca(referenciaNueva)
    );

    const campos = {
      motivo: `Salida de biochar — ${etiquetaNueva}`,
      documento_referencia: referenciaNueva,
      produccion_destino_id: referenciaNueva,
      observaciones: `${observaciones}\nReclasificada de ${referenciaVieja} a ${referenciaNueva} (motivo mal clasificado al registrar).`,
    };

    console.log(
      `   Core ${f.id_movimiento ?? mov.id} · ${f.cantidad} ${f.unidad_medida ?? 'kg'} · ${f.tipo_movimiento}`
    );
    console.log(`     motivo: «${f.motivo}» → «${campos.motivo}»`);
    console.log(`     documento_referencia / produccion_destino_id → ${referenciaNueva}`);

    if (APPLY) {
      await at(`${AT}/${CORE_BASE}/${CORE_MOVIMIENTOS}/${mov.id}`, CORE_TOKEN, {
        method: 'PATCH',
        body: JSON.stringify({ fields: campos }),
      });
      console.log('     ✅ escrito');
    }
  }

  // ── PiroliApp: la remisión que lleva la marca ──────────────────────────────
  const buscarRemision = async (referencia) => {
    const url = new URL(`${AT}/${BASE}/${T_REMISIONES}`);
    url.searchParams.set('filterByFormula', `FIND('${esc(marca(referencia))}', {Observaciones}) > 0`);
    const { records } = await at(url.toString(), TOKEN);
    return records ?? [];
  };

  const remisiones = await buscarRemision(referenciaVieja);
  if (!remisiones.length) {
    const nuevas = await buscarRemision(referenciaNueva);
    console.log(
      nuevas.length
        ? `✅ La remisión de PiroliApp ya está reclasificada (${nuevas.map((r) => r.id).join(', ')}).`
        : `⚠️  PiroliApp no tiene ninguna remisión con la marca ${marca(referenciaVieja)}.`
    );
  }

  for (const rem of remisiones) {
    // Se LEE por nombre (la respuesta viene indexada por nombre) y se ESCRIBE por
    // field ID, que es lo que guarda `config.ts`. Las dos formas son válidas para
    // Airtable; mezclarlas al leer es lo que da `undefined` siempre.
    const observaciones = reemplazar(
      reemplazar(rem.fields.Observaciones, etiquetaVieja, etiquetaNueva),
      marca(referenciaVieja),
      marca(referenciaNueva)
    );

    console.log(`   PiroliApp remisión ${rem.id}`);
    console.log(`     Observaciones → ${observaciones.replace(/\n/g, ' | ')}`);

    if (APPLY) {
      await at(`${AT}/${BASE}/${T_REMISIONES}/${rem.id}`, TOKEN, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { [F_OBSERVACIONES]: observaciones } }),
      });
      console.log('     ✅ escrito');
    }
  }

  console.log(
    APPLY
      ? '\n✅ Reclasificación aplicada. El inventario no cambió: solo la clasificación.\n'
      : '\n🔍 Dry-run: no se escribió nada. Repite con --apply para aplicarlo.\n'
  );
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
});

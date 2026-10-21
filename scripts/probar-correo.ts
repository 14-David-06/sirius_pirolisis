/**
 * Prueba las credenciales de Microsoft Graph con UN correo a una dirección interna.
 *
 * ═══ POR QUÉ ══════════════════════════════════════════════════════════════════
 * PiroliApp usa las mismas credenciales de Azure que DataLab, y ese secreto ya
 * venció una vez (2026-08-13). Antes de que la recepción por enlace dependa del
 * correo, esto confirma de punta a punta —token, permiso Mail.Send, buzón
 * remitente, 202— que el envío funciona, y deja ver en Outlook cómo llegan los
 * colores sólidos y el PDF adjunto.
 *
 * Pasa por el MISMO transporte que la app (`src/lib/correo/graph.ts`), no por una
 * copia, y no importa nada más de ella: ni `graph.server.ts` (`server-only`) ni
 * `config.ts`.
 *
 * ═══ QUÉ PUEDE Y QUÉ NO ════════════════════════════════════════════════════════
 * - Sin `--apply` no sale a la red: dice qué variables hay (solo los nombres) y
 *   cómo sería el mensaje.
 * - Con `--apply` envía UN correo, y solo a una dirección @siriusregenerative.com.
 * - Nunca imprime el valor de una variable ni el token.
 *
 * Uso:
 *   npx tsx scripts/probar-correo.ts --para david@siriusregenerative.com            # dry-run
 *   npx tsx scripts/probar-correo.ts --para david@siriusregenerative.com --apply    # envía UNO
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  crearClienteGraph,
  ErrorCorreo,
  esDireccionInterna,
  prepararMensaje,
  resolverModoCorreo,
} from '../src/lib/correo/graph';

/** Carga .env.local a mano, como los demás scripts: este no pasa por `config.ts`. */
function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    let contenido: string;
    try {
      contenido = readFileSync(resolve(process.cwd(), file), 'utf8');
    } catch {
      continue;
    }
    for (const linea of contenido.split(/\r?\n/)) {
      const match = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const [, clave, crudo] = match;
      if (process.env[clave] !== undefined) continue;
      process.env[clave] = crudo.trim().replace(/^(['"])([\S\s]*)\1$/, '$2');
    }
  }
}

const APPLY = process.argv.includes('--apply');
const VARIABLES = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'OUTLOOK_SENDER_EMAIL'] as const;

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function variable(nombre: string): string {
  return (process.env[nombre] ?? '').trim();
}

const kb = (bytes: number) => (bytes / 1024).toFixed(1);

/**
 * Contenido fijo, sin datos de nadie. Usa la misma receta que el correo de la
 * recepción —tablas de 600 px, `bgcolor` sólido, sin imágenes ni enlaces— porque
 * lo que se quiere ver en Outlook es justo eso: el correo del laboratorio usaba
 * degradados, Outlook los descarta y el texto blanco quedaba sobre blanco.
 */
function htmlDePrueba(instante: string): string {
  const fuente = 'font-family:Arial,Helvetica,sans-serif;';
  return [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#F4F4F4;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F4F4">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" ',
    'style="width:600px;max-width:100%;background-color:#FFFFFF;">',
    `<tr><td bgcolor="#111111" style="background-color:#111111;border-bottom:4px solid #2EBD6B;padding:20px 24px;${fuente}`,
    'font-size:20px;line-height:26px;color:#FFFFFF;"><strong>Sirius · PiroliApp</strong></td></tr>',
    `<tr><td style="padding:24px;${fuente}font-size:15px;line-height:22px;color:#222222;">`,
    '<p style="margin:0 0 12px 0;">Prueba de las credenciales de Microsoft Graph.</p>',
    '<p style="margin:0 0 12px 0;">Si este correo llegó con el encabezado negro, la línea verde y un PDF adjunto, ',
    'el envío funciona.</p>',
    `<p style="margin:0;font-size:13px;color:#666666;">Enviado el ${instante} (UTC) por scripts/probar-correo.ts.</p>`,
    '</td></tr>',
    `<tr><td bgcolor="#176633" style="background-color:#176633;padding:12px 24px;${fuente}`,
    'font-size:12px;line-height:18px;color:#FFFFFF;">Sirius Regenerative Solutions S.A.S. ZOMAC</td></tr>',
    '</table></td></tr></table></body></html>',
  ].join('');
}

async function pdfDePrueba(instante: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Prueba de correo de PiroliApp');
  const [ancho, alto] = [595.28, 841.89]; // A4
  const pagina = doc.addPage([ancho, alto]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  pagina.drawRectangle({ x: 0, y: alto - 64, width: ancho, height: 64, color: rgb(0.067, 0.067, 0.067) });
  pagina.drawRectangle({ x: 0, y: alto - 68, width: ancho, height: 4, color: rgb(0.18, 0.741, 0.42) });
  pagina.drawText('Sirius · PiroliApp', { x: 40, y: alto - 42, size: 18, font: negrita, color: rgb(1, 1, 1) });
  pagina.drawText('Prueba de adjunto de scripts/probar-correo.ts', { x: 40, y: alto - 110, size: 13, font: normal });
  pagina.drawText(`Generado el ${instante} (UTC)`, { x: 40, y: alto - 132, size: 11, font: normal, color: rgb(0.4, 0.4, 0.4) });
  return doc.save();
}

async function main() {
  const para = (argumento('--para') ?? '').trim().toLowerCase();
  if (!esDireccionInterna(para)) {
    console.error('Uso: npx tsx scripts/probar-correo.ts --para <usuario>@siriusregenerative.com [--apply]');
    console.error('✗ --para tiene que ser UNA dirección @siriusregenerative.com: esta prueba nunca le escribe a un tercero.');
    process.exitCode = 1;
    return;
  }

  loadEnvLocal();
  console.log(`${APPLY ? 'APLICANDO' : 'DRY-RUN'} — prueba de correo por Microsoft Graph\n`);
  console.log('Variables (solo los nombres):');
  for (const nombre of VARIABLES) console.log(`  ${variable(nombre) ? '✓' : '✗'} ${nombre}${variable(nombre) ? '' : ' (falta)'}`);

  const app = resolverModoCorreo(process.env);
  console.log(`\nLa app, con este entorno, estaría en modo «${app.modo}»: ${app.motivo}.`);
  console.log('Este script no usa ese modo: con --apply envía directo, y solo a la dirección de --para.\n');

  const instante = new Date().toISOString();
  // `prepararMensaje` en modo enviar: las mismas validaciones que en la app.
  const correo = prepararMensaje(
    {
      para: [para],
      asunto: `Prueba de correo de PiroliApp · ${instante}`,
      html: htmlDePrueba(instante),
      adjuntos: [{ nombre: 'prueba-piroliapp.pdf', contentType: 'application/pdf', bytes: await pdfDePrueba(instante) }],
      etiqueta: 'probar-correo',
    },
    { modo: 'enviar' }
  );
  const adjunto = correo.adjuntos?.[0];
  console.log('Mensaje:');
  console.log(`  Para:     ${correo.para.join(', ')}`);
  console.log(`  Asunto:   ${correo.asunto}`);
  console.log(`  Cuerpo:   ${kb(Buffer.byteLength(correo.html, 'utf8'))} KB de HTML, colores sólidos, sin imágenes ni enlaces`);
  if (adjunto) console.log(`  Adjunto:  ${adjunto.nombre} (${kb(adjunto.bytes.byteLength)} KB)`);
  console.log('  Remitente: el de OUTLOOK_SENDER_EMAIL, con copia en sus Enviados');

  const faltan = VARIABLES.filter((nombre) => !variable(nombre));
  if (faltan.length) {
    console.log(`\n✗ Falta ${faltan.join(', ')}: así no se puede enviar.`);
    process.exitCode = 1;
  }
  if (!APPLY) {
    console.log('\nNada salió a la red. Repetir con --apply para enviar UN correo.');
    return;
  }
  if (faltan.length) return;

  const cliente = crearClienteGraph(
    {
      tenantId: variable('AZURE_TENANT_ID'),
      clientId: variable('AZURE_CLIENT_ID'),
      clientSecret: variable('AZURE_CLIENT_SECRET'),
      remitente: variable('OUTLOOK_SENDER_EMAIL'),
    },
    { fetch, ahora: () => Date.now() }
  );
  try {
    const r = await cliente.enviar(correo);
    console.log(`\n✓ Graph aceptó el correo (202) · intentos: ${r.intentos}${r.requestId ? ` · request-id: ${r.requestId}` : ''}`);
    console.log('  Revisar en Outlook que llegó con el encabezado de color y el PDF, y que quedó en Enviados del remitente.');
  } catch (e) {
    if (!(e instanceof ErrorCorreo)) throw e;
    console.log(`\n✗ ${e.tipo}${e.status ? ` (HTTP ${e.status})` : ''}: ${e.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // Solo el nombre y el mensaje: un error inesperado podría traer la petición entera.
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : 'Error inesperado');
  process.exit(1);
});

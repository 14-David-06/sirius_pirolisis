// src/lib/recepcion/correo-recepcion.ts
//
// El correo que sale cuando alguien confirma la recepción de una remisión: el
// asunto, el HTML y a quién va. Puro: no envía nada (eso es `correo/graph.server`).
//
// ═══ REGLAS QUE NO SE AFLOJAN ════════════════════════════════════════════════
// - Destinatarios: Para = quien recibió; CC = la lista fija de Sirius
//   (`RECEPCION_CORREO_CC`). NUNCA los contactos del cliente ni nada que llegue en
//   el body de una petición: la página es pública, y un destinatario que se pudiera
//   elegir convertiría el correo de Sirius en un relé.
// - Todo valor dinámico pasa por `escapeHtml`: el nombre lo escribió alguien de
//   afuera, y sin escape un `<a href=…>` en el nombre pondría un enlace en un
//   correo legítimo de la empresa.
// - Sin enlaces ni imágenes: un correo de "confirme aquí" con enlaces es lo que se
//   enseña a no abrir, y las imágenes remotas delatan cuándo se lee.
// - Cédula enmascarada: el correo se reenvía y queda en buzones de terceros; la
//   completa va en el PDF adjunto, que es la evidencia.
// - Colores sólidos con `bgcolor` y estilos en línea: Outlook ignora los
//   degradados y el `<style>` del encabezado (defecto del correo del laboratorio).

import { config } from '../config';
import { escapeHtml } from '../html-escape';
import { fechaHoraBogotaLegible, fechaLegible } from '../fecha-bogota';
import type { RemisionBlend } from '../blend-remisiones-core';
import { enmascararCedula, esCorreoValido, normalizarCorreo } from './datos-personales';

export interface DatosCorreoRecepcion {
  codigo: string;
  idPedido: string;
  cliente: string;
  area?: string;
  producto: string;
  kg: number;
  co2Kg: number;
  /** `YYYY-MM-DD`. */
  fechaDespacho: string;
  /** Instante ISO de la confirmación (`[recibida:]`). */
  recibidaEnIso: string;
  receptorNombre: string;
  receptorCedula: string;
  /** Solo lo que escribió el operador (lo que va después de « — »). */
  observaciones?: string;
  /** Canal para ejercer los derechos sobre los datos (`RECEPCION_CONTACTO_DATOS`). */
  contactoDatos: string;
  reenvio?: boolean;
  /** Quien recibió no registró correo: el mensaje llega solo a la copia interna. */
  sinCorreoReceptor?: boolean;
}

const LARGO_ASUNTO = 150;

function kgLegible(kg: number): string {
  return (Number.isFinite(kg) ? kg : 0).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Sin caracteres de control ni saltos: un asunto con `\r\n` es inyección de cabeceras. */
function textoPlano(valor: unknown): string {
  // Por código de carácter y no con una regex de controles, que el lint rechaza.
  return Array.from(String(valor ?? ''))
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `SIRIUS-REM-0232` → `0232`: el número que se lee en la barra. */
function numeroRemision(codigo: string): string {
  return /(\d+)$/.exec(codigo)?.[1] ?? codigo;
}

function asuntoRecepcion(d: DatosCorreoRecepcion): string {
  const prefijo = d.reenvio ? 'Reenvío: ' : '';
  const base = `${prefijo}Remisión ${textoPlano(d.codigo)} recibida · ${textoPlano(d.producto)} ${kgLegible(d.kg)} kg`;
  const cliente = textoPlano(d.cliente);
  if (!cliente) return base.slice(0, LARGO_ASUNTO);
  // Lo que se recorta es el cliente: el código y la cantidad son lo que se busca.
  const disponible = LARGO_ASUNTO - base.length - 3;
  if (disponible <= 0) return base.slice(0, LARGO_ASUNTO);
  const recortado = cliente.length > disponible ? `${cliente.slice(0, Math.max(0, disponible - 1))}…` : cliente;
  return `${base} · ${recortado}`;
}

const COLOR = {
  barra: '#111111',
  acento: '#2EBD6B',
  subtitulo: '#BFC7D1',
  verdeFondo: '#ECFAF1',
  verdeTexto: '#176633',
  etiqueta: '#8F949C',
  valor: '#222222',
  filaAlterna: '#F6F7F9',
  fondo: '#F2F3F5',
  blanco: '#FFFFFF',
  avisoFondo: '#FEF8E1',
  avisoBorde: '#E8C44F',
  avisoTexto: '#7A5E0F',
  pie: '#6B7280',
} as const;

const FUENTE = "font-family:Arial,Helvetica,sans-serif;";

function fila(etiqueta: string, valor: string, alterna: boolean): string {
  const fondo = alterna ? COLOR.filaAlterna : COLOR.blanco;
  return (
    `<tr><td bgcolor="${fondo}" style="background-color:${fondo};padding:10px 16px;${FUENTE}` +
    `font-size:11px;color:${COLOR.etiqueta};text-transform:uppercase;letter-spacing:0.4px;width:170px;vertical-align:top;">` +
    `${escapeHtml(etiqueta)}</td>` +
    `<td bgcolor="${fondo}" style="background-color:${fondo};padding:10px 16px;${FUENTE}font-size:14px;color:${COLOR.valor};vertical-align:top;">` +
    `${escapeHtml(valor)}</td></tr>`
  );
}

function franja(texto: string): string {
  return (
    `<tr><td style="padding:0 24px 16px 24px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td bgcolor="${COLOR.avisoFondo}" style="background-color:${COLOR.avisoFondo};border:1px solid ${COLOR.avisoBorde};` +
    `padding:12px 14px;${FUENTE}font-size:13px;line-height:19px;color:${COLOR.avisoTexto};">${texto}</td></tr></table></td></tr>`
  );
}

/**
 * Asunto y HTML del comprobante de recepción.
 *
 * Asunto: `Remisión SIRIUS-REM-XXXX recibida · <Producto> <kg> kg · <Cliente>`
 * (≤ 150 caracteres, sin caracteres de control). «Reenvío: » delante si es un
 * reenvío desde la bodega.
 */
export function correoRecepcion(d: DatosCorreoRecepcion): { asunto: string; html: string } {
  const recibida = fechaHoraBogotaLegible(d.recibidaEnIso) || textoPlano(d.recibidaEnIso);
  const despachada = d.fechaDespacho ? fechaLegible(d.fechaDespacho) : '';
  const nombre = textoPlano(d.receptorNombre);
  const contacto = textoPlano(d.contactoDatos);
  const observaciones = textoPlano(d.observaciones);

  const filas: Array<[string, string]> = [
    ['Remisión', textoPlano(d.codigo)],
    ['Pedido', textoPlano(d.idPedido)],
    ['Cliente', textoPlano(d.cliente)],
    ...(d.area ? ([['Área', textoPlano(d.area)]] as Array<[string, string]>) : []),
    ['Producto', textoPlano(d.producto)],
    ['Cantidad', `${kgLegible(d.kg)} kg`],
    ...(d.co2Kg > 0 ? ([['CO₂ secuestrado', `${kgLegible(d.co2Kg)} kg`]] as Array<[string, string]>) : []),
    ['Despachada el', despachada],
    ['Recibida el', recibida],
    ['Recibió', `${nombre} · C.C. ${enmascararCedula(d.receptorCedula)}`],
  ].filter(([, v]) => v) as Array<[string, string]>;

  const preencabezado = `Recibida el ${recibida} por ${nombre}. El documento va adjunto.`;
  const saludo = d.reenvio
    ? `Le reenviamos el documento de la remisión ${escapeHtml(d.codigo)}, con la confirmación de recepción.`
    : `Confirmó la recepción de la remisión ${escapeHtml(d.codigo)}. Adjuntamos el documento con su confirmación.`;

  const html =
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(asuntoRecepcion(d))}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${COLOR.fondo};">` +
    // Preencabezado: lo que muestra la bandeja junto al asunto.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preencabezado)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.fondo}" style="background-color:${COLOR.fondo};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.blanco}" style="width:600px;max-width:600px;background-color:${COLOR.blanco};">` +
    // Barra
    `<tr><td bgcolor="${COLOR.barra}" style="background-color:${COLOR.barra};border-bottom:3px solid ${COLOR.acento};padding:18px 24px;">` +
    `<div style="${FUENTE}font-size:15px;font-weight:bold;color:${COLOR.blanco};letter-spacing:0.6px;">SIRIUS REGENERATIVE SOLUTIONS</div>` +
    `<div style="${FUENTE}font-size:12px;color:${COLOR.subtitulo};padding-top:4px;">Remisión de despacho · ` +
    `<span style="color:${COLOR.acento};font-weight:bold;">No. ${escapeHtml(numeroRemision(textoPlano(d.codigo)))}</span></div>` +
    `</td></tr>` +
    // Insignia
    `<tr><td style="padding:20px 24px 4px 24px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td bgcolor="${COLOR.verdeFondo}" style="background-color:${COLOR.verdeFondo};padding:5px 12px;${FUENTE}font-size:12px;font-weight:bold;color:${COLOR.verdeTexto};letter-spacing:0.6px;">ENTREGADA</td>` +
    `</tr></table></td></tr>` +
    (d.sinCorreoReceptor
      ? franja('Copia interna: quien recibió no registró un correo electrónico, así que este mensaje solo llega a Sirius.')
      : '') +
    // Saludo
    `<tr><td style="padding:12px 24px 16px 24px;${FUENTE}font-size:15px;line-height:22px;color:${COLOR.valor};">` +
    `Hola, ${escapeHtml(nombre)}:<br>${saludo}</td></tr>` +
    // Tabla de datos
    `<tr><td style="padding:0 24px 16px 24px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E5E7EB;">` +
    filas.map(([e, v], i) => fila(e, v, i % 2 === 1)).join('') +
    `</table></td></tr>` +
    (observaciones ? franja(`<strong>Observaciones:</strong> ${escapeHtml(observaciones)}`) : '') +
    // Aviso de seguridad
    `<tr><td style="padding:4px 24px 20px 24px;${FUENTE}font-size:13px;line-height:19px;color:${COLOR.valor};">` +
    `Este correo se generó automáticamente al confirmar la recepción con el enlace personal de Sirius. ` +
    `<strong>Si usted no confirmó esta recepción</strong>, o el producto llegó con alguna novedad, responda este correo.` +
    (contacto
      ? ` Para conocer, actualizar o suprimir sus datos personales, escriba a ${escapeHtml(contacto)}.`
      : '') +
    `</td></tr>` +
    // Pie
    `<tr><td bgcolor="${COLOR.filaAlterna}" style="background-color:${COLOR.filaAlterna};padding:14px 24px;${FUENTE}font-size:11px;color:${COLOR.pie};">` +
    `${escapeHtml(config.empresa.razonSocial)} · Documento generado por PiroliApp</td></tr>` +
    `</table></td></tr></table></body></html>`;

  return { asunto: asuntoRecepcion(d), html };
}

/**
 * A quién va el comprobante. Puro.
 *
 * Todo en minúsculas, sin repetidos y sin lo inválido; lo que ya va en Para sale
 * de CC. Si quien recibió no tiene correo, la copia pasa a ser el Para (el correo
 * no puede salir sin Para) y `sinCorreoReceptor` lo dice, para que el HTML lleve
 * la franja.
 */
export function destinatariosRecepcion(
  correoReceptor: string | null,
  cc: string[]
): { para: string[]; cc: string[]; sinCorreoReceptor: boolean } {
  const limpiar = (xs: Array<string | null | undefined>) => [
    ...new Set(xs.filter((x): x is string => esCorreoValido(x)).map(normalizarCorreo)),
  ];
  const copia = limpiar(cc);
  const receptor = limpiar([correoReceptor]);
  if (!receptor.length) return { para: copia, cc: [], sinCorreoReceptor: true };
  return { para: receptor, cc: copia.filter((c) => !receptor.includes(c)), sinCorreoReceptor: false };
}

/** Lo que escribió el operador en las notas: lo que va después del primer « — ». */
function observacionesDeNotas(notas: string): string | undefined {
  const obs = String(notas ?? '').split(' — ').slice(1).join(' — ').trim();
  return obs || undefined;
}

/** Los datos del correo desde la remisión del Core (ya `Entregada`). Puro. */
export function datosCorreoDesdeRemision(
  r: RemisionBlend,
  receptor: { nombre: string; cedula: string },
  recibidaEnIso: string
): DatosCorreoRecepcion {
  return {
    codigo: r.codigo,
    idPedido: r.idPedido,
    cliente: r.clienteNombre || r.idCliente,
    area: r.idAreaCliente ? r.areaClienteNombre || r.idAreaCliente : undefined,
    producto: r.productoNombre,
    kg: r.kgTotal,
    co2Kg: r.co2SecuestradoKg,
    fechaDespacho: r.fechaDespacho || r.fechaRemision,
    recibidaEnIso,
    receptorNombre: receptor.nombre,
    receptorCedula: receptor.cedula,
    observaciones: observacionesDeNotas(r.notas),
    contactoDatos: config.recepcion.contactoDatos,
  };
}

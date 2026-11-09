/**
 * PDF de una remisión de pirólisis: Biochar Blend o Biochar puro.
 *
 * Sigue el formato estándar de remisión del ecosistema, el de DataLab
 * (`sirius_laboratorio/src/lib/remision-pdf-generator.ts`, Manual de Marca 2023):
 * el cliente recibe remisiones de las dos áreas —GUAICARAMO compra biológicos y
 * Blend— y tienen que verse como el mismo documento de la misma empresa. La
 * versión anterior era un diseño propio de la planta que no se parecía en nada.
 *
 * Lo único que el Blend agrega al estándar, con el mismo lenguaje visual, es el
 * bloque de CO₂, que sostiene la contabilidad de carbono.
 */
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export interface BlendRemisionData {
  /** `SIRIUS-REM-XXXX`. */
  id: string;
  record_id: string;
  /** `YYYY-MM-DD`. */
  fecha_evento: string;

  cliente: string;
  id_cliente?: string;
  pedido_id?: string;
  /** Área del cliente a la que va (Sanidad, Fertilización…) y su `AC-XXXX`. */
  area_cliente?: { nombre: string; codigo: string };

  kg_total: number;
  co2_secuestrado_kg: number;

  responsable_entrega: string;
  transportista?: { nombre: string; cedula: string };
  receptor?: { nombre: string; cedula: string };
  /** Fecha en que se recibió, si ya se recibió. */
  fecha_recibido?: string;

  estado: string;
  observaciones?: string;

  /** Lo que dice el renglón del producto. Sin él, `Biochar Blend` (remisiones viejas). */
  producto?: string;
  /**
   * Un renglón por producto, cuando la entrega llevó más de uno (Blend y biochar
   * puro). Sin él, el único renglón es `producto` con `kg_total`.
   */
  productos?: { nombre: string; kg: number }[];
  /** NIT de la empresa. Vacío o ausente = el encabezado no imprime NIT. */
  empresa_nit?: string;
  /**
   * La remisión espera a quien la recibe: bloque con instrucciones, «Válido
   * hasta», líneas para firmar en papel y, si hay enlace, el QR. Sin receptor.
   */
  recepcion_pendiente?: { qr_png?: Uint8Array; vence_el?: string };
  /** Quien recibe la confirmó por enlace: fecha y hora legibles en Bogotá. */
  recepcion_confirmada?: { fecha_hora: string };
  /** Cancelada: insignia de anulada en el pie y sin bloque de recepción. */
  anulada?: boolean;
}

/**
 * Línea del encabezado con la razón social y, si está configurado, el NIT.
 * Sin NIT no se inventa uno: el que traía el encabezado era de relleno, y desde
 * que la remisión sale por correo a terceros un NIT equivocado es peor que ninguno.
 */
export function lineaRazonSocial(nit?: string): string {
  const limpio = (nit ?? '').trim();
  return limpio ? `S.A.S. ZOMAC  |  NIT: ${limpio}` : 'S.A.S. ZOMAC';
}

// ============ COLORES MARCA SIRIUS (los mismos de DataLab) ============
export const SIRIUS_BLACK = rgb(0.067, 0.067, 0.067);
export const SIRIUS_DARK = rgb(0.122, 0.137, 0.161);
export const SIRIUS_GREEN = rgb(0.180, 0.741, 0.420);
export const TEXT_PRIMARY = rgb(0.133, 0.133, 0.133);
export const TEXT_SECONDARY = rgb(0.400, 0.420, 0.450);
export const TEXT_MUTED = rgb(0.560, 0.580, 0.610);
export const WHITE = rgb(1, 1, 1);
export const BG_PAPER = rgb(0.992, 0.992, 0.996);
export const BORDER_MAIN = rgb(0.880, 0.890, 0.905);
export const BORDER_LIGHT = rgb(0.930, 0.935, 0.945);
export const ROW_ALT = rgb(0.965, 0.970, 0.978);

export const NOTES_BG = rgb(0.996, 0.973, 0.882);
export const NOTES_BORDER = rgb(0.910, 0.770, 0.310);
export const NOTES_TEXT = rgb(0.480, 0.370, 0.060);

export const COMPLETED_BG = rgb(0.925, 0.980, 0.945);
export const COMPLETED_BORDER = rgb(0.180, 0.741, 0.420);
export const COMPLETED_TEXT = rgb(0.090, 0.400, 0.200);

export const ANULADO = rgb(0.760, 0.150, 0.150);

export const PAGE_WIDTH = 595.28; // A4
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 50;
export const CONTENT_W = PAGE_WIDTH - 2 * MARGIN;

// ============ HELPERS ============
// Exportados para el acta de entrega de biochar (`acta-entrega-biochar-pdf.ts`):
// es otro documento de la misma empresa y tiene que verse como tal.

// Las fuentes estándar de pdf-lib usan WinAnsi: el subíndice de CO₂ se pasa a
// ASCII antes de que el filtro general lo borre y quede "CO".
export function sanitize(text: string): string {
  if (!text) return '';
  return text
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .trim();
}

export function rect(page: PDFPage, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

export function borderRect(
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  borderColor: ReturnType<typeof rgb>,
  borderWidth = 0.75,
  fillColor?: ReturnType<typeof rgb>
) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor, borderWidth, color: fillColor });
}

export function line(page: PDFPage, x1: number, y1: number, x2: number, y2: number, color: ReturnType<typeof rgb>, thickness = 0.5) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
}

export function truncate(text: string, font: PDFFont, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 0 && font.widthOfTextAtSize(t + '...', size) > maxW) t = t.slice(0, -1);
  return t + '...';
}

export function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Se parte el texto en vez de usar `new Date()`: `YYYY-MM-DD` se leería como
// medianoche UTC, que en Bogotá todavía es el día anterior.
export function formatDateES(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  const parts = dateStr.split('T')[0].split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const [y, m, d] = parts;
    return `${d} de ${MESES[m - 1]} de ${y}`;
  }
  return dateStr;
}

export function formatKg(n: number): string {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function textRight(page: PDFPage, text: string, font: PDFFont, size: number, rightX: number, yPos: number, color: ReturnType<typeof rgb>) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y: yPos, size, font, color });
}

export function textCenter(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, colW: number, yPos: number, color: ReturnType<typeof rgb>) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx + (colW - w) / 2, y: yPos, size, font, color });
}

export function sectionTitle(page: PDFPage, title: string, y: number, bold: PDFFont) {
  rect(page, MARGIN, y - 2, 3, 14, SIRIUS_GREEN);
  page.drawText(title, { x: MARGIN + 10, y, size: 9, font: bold, color: TEXT_PRIMARY });
  line(page, MARGIN, y - 8, MARGIN + CONTENT_W, y - 8, BORDER_MAIN, 0.5);
}

// ============ GENERADOR ============

export async function generateBlendRemisionPdf(data: BlendRemisionData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Remisión ${data.id}`);
  pdfDoc.setAuthor('Sirius Regenerative Solutions S.A.S.');
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Sin logo el documento sigue siendo válido: se avisa y se dibuja el nombre.
  let logoImage: PDFImage | null = null;
  try {
    const logoBytes = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png'));
    logoImage = await pdfDoc.embedPng(logoBytes);
  } catch {
    console.warn('⚠️ public/logo.png no encontrado: remisión sin logo');
  }

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT;

  // El servidor puede correr en UTC: la hora del documento es la de la planta.
  const ahora = new Date();
  const fechaGen = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota' });
  const horaGen = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });

  function ensureSpace(needed: number) {
    if (y - needed < 65) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 40;
    }
  }

  // ═══ ENCABEZADO ═══════════════════════════════════════════════════════════
  const headerH = 90;
  y -= headerH;
  rect(page, 0, y, PAGE_WIDTH, headerH, SIRIUS_BLACK);
  rect(page, 0, y, PAGE_WIDTH, 3, SIRIUS_GREEN);

  if (logoImage) {
    const dims = logoImage.scale(1);
    const logoH = 52;
    const logoW = (dims.width / dims.height) * logoH;
    page.drawImage(logoImage, { x: MARGIN, y: y + (headerH - logoH) / 2 + 2, width: logoW, height: logoH });

    const textX = MARGIN + logoW + 14;
    page.drawText('SIRIUS', { x: textX, y: y + 55, size: 20, font: bold, color: WHITE });
    page.drawText('REGENERATIVE SOLUTIONS', { x: textX, y: y + 38, size: 10, font: regular, color: rgb(0.75, 0.78, 0.82) });
    page.drawText(sanitize(lineaRazonSocial(data.empresa_nit)), { x: textX, y: y + 22, size: 7.5, font: regular, color: rgb(0.55, 0.58, 0.62) });
  } else {
    page.drawText('SIRIUS REGENERATIVE SOLUTIONS', { x: MARGIN, y: y + 52, size: 18, font: bold, color: WHITE });
    page.drawText(sanitize(lineaRazonSocial(data.empresa_nit)), { x: MARGIN, y: y + 34, size: 8, font: regular, color: rgb(0.55, 0.58, 0.62) });
  }

  textRight(page, 'REMISION DE DESPACHO', regular, 7.5, PAGE_WIDTH - MARGIN, y + 68, rgb(0.55, 0.58, 0.62));
  textRight(page, 'No. ' + data.id.split('-').pop(), bold, 28, PAGE_WIDTH - MARGIN, y + 30, SIRIUS_GREEN);
  textRight(page, sanitize(data.id), regular, 8, PAGE_WIDTH - MARGIN, y + 15, rgb(0.65, 0.68, 0.72));

  // ═══ DATOS DEL DOCUMENTO ══════════════════════════════════════════════════
  y -= 22;
  ensureSpace(120);

  const col1X = MARGIN + 18;
  const col2X = MARGIN + CONTENT_W / 2 + 10;
  const rowStep = 24;
  const leftFields = [
    { label: 'CLIENTE', value: sanitize(data.cliente) },
    { label: 'FECHA DE REMISION', value: sanitize(formatDateES(data.fecha_evento)) },
    { label: 'PEDIDO RELACIONADO', value: sanitize(data.pedido_id || 'N/A') },
  ];
  const rightFields = [
    { label: 'CODIGO CLIENTE', value: sanitize(data.id_cliente || 'N/A') },
    { label: 'HORA DE GENERACION', value: sanitize(horaGen) },
    { label: 'AREA DE ORIGEN', value: 'Pirólisis' },
  ];
  // Solo si se indicó: una fila "N/A" en cada remisión vieja sería ruido.
  if (data.area_cliente) {
    leftFields.push({ label: 'AREA DESTINO', value: sanitize(data.area_cliente.nombre) });
    rightFields.push({ label: 'CODIGO AREA', value: sanitize(data.area_cliente.codigo) });
  }

  const infoBoxH = 20 + (leftFields.length - 1) * rowStep + 22;
  borderRect(page, MARGIN, y - infoBoxH, CONTENT_W, infoBoxH, BORDER_MAIN, 0.75, BG_PAPER);
  const divX = MARGIN + CONTENT_W / 2;
  line(page, divX, y - 10, divX, y - infoBoxH + 10, BORDER_LIGHT, 0.5);

  for (let i = 0; i < leftFields.length; i++) {
    const rowY = y - 20 - i * rowStep;
    for (const [x, f] of [[col1X, leftFields[i]], [col2X, rightFields[i]]] as const) {
      page.drawText(f.label, { x, y: rowY, size: 7, font: bold, color: TEXT_MUTED });
      page.drawText(truncate(f.value, bold, 9.5, CONTENT_W / 2 - 40), { x, y: rowY - 12, size: 9.5, font: bold, color: TEXT_PRIMARY });
    }
    if (i < leftFields.length - 1) {
      line(page, MARGIN + 12, rowY - 19, MARGIN + CONTENT_W - 12, rowY - 19, BORDER_LIGHT, 0.3);
    }
  }
  y -= infoBoxH;

  // ═══ TRANSPORTE Y ENTREGA ═════════════════════════════════════════════════
  if (data.transportista || data.responsable_entrega) {
    y -= 16;
    ensureSpace(65);
    page.drawText('TRANSPORTE Y ENTREGA', { x: MARGIN, y, size: 7, font: bold, color: TEXT_MUTED });
    y -= 8;

    const cardH = 44;
    const gap = 10;
    const showBoth = Boolean(data.transportista && data.responsable_entrega);
    const halfW = showBoth ? (CONTENT_W - gap) / 2 : CONTENT_W;
    y -= cardH;

    if (data.transportista) {
      const cw = halfW;
      borderRect(page, MARGIN, y, cw, cardH, BORDER_MAIN, 0.5, BG_PAPER);
      rect(page, MARGIN, y, 3, cardH, SIRIUS_GREEN);
      page.drawText('TRANSPORTISTA', { x: MARGIN + 14, y: y + cardH - 14, size: 6.5, font: bold, color: TEXT_MUTED });
      page.drawText(truncate(sanitize(data.transportista.nombre), bold, 10, cw - 30), { x: MARGIN + 14, y: y + cardH - 28, size: 10, font: bold, color: TEXT_PRIMARY });
      page.drawText(`C.C. ${sanitize(data.transportista.cedula)}`, { x: MARGIN + 14, y: y + 6, size: 7.5, font: regular, color: TEXT_SECONDARY });
    }

    if (data.responsable_entrega) {
      const rx = showBoth ? MARGIN + halfW + gap : MARGIN;
      const rw = halfW;
      borderRect(page, rx, y, rw, cardH, BORDER_MAIN, 0.5, BG_PAPER);
      rect(page, rx, y, 3, cardH, SIRIUS_GREEN);
      page.drawText('RESPONSABLE DE ENTREGA', { x: rx + 14, y: y + cardH - 14, size: 6.5, font: bold, color: TEXT_MUTED });
      page.drawText(truncate(sanitize(data.responsable_entrega), bold, 10, rw - 30), { x: rx + 14, y: y + cardH - 28, size: 10, font: bold, color: TEXT_PRIMARY });
    }
  }

  // ═══ PRODUCTOS DESPACHADOS ════════════════════════════════════════════════
  y -= 24;
  ensureSpace(40);
  sectionTitle(page, 'PRODUCTOS DESPACHADOS', y, bold);
  y -= 12;

  const colW = [36, CONTENT_W - 36 - 85 - 70, 85, 70];
  const thH = 28;
  const tdH = 26;
  // Un renglón por PRODUCTO aunque la remisión junte varios lotes: al cliente se
  // le despacha un producto, no tandas de producción. El reparto por lote vive en
  // las notas de la remisión y en las Salidas del Core, que es donde se audita.
  const filas = data.productos?.length
    ? data.productos
    : [{ nombre: data.producto || 'Biochar Blend', kg: data.kg_total }];
  const kgTotalFilas = filas.reduce((t, f) => t + f.kg, 0);

  ensureSpace(thH + tdH * (filas.length + 1) + 20);
  y -= thH;
  rect(page, MARGIN, y, CONTENT_W, thH, SIRIUS_DARK);
  let cx = MARGIN;
  ['#', 'PRODUCTO', 'CANTIDAD', 'UNIDAD'].forEach((h, i) => {
    if (i === 1) page.drawText(h, { x: cx + 10, y: y + 10, size: 7, font: bold, color: WHITE });
    else textCenter(page, h, bold, 7, cx, colW[i], y + 10, WHITE);
    cx += colW[i];
  });

  filas.forEach((f, idx) => {
    y -= tdH;
    if (idx % 2 === 0) rect(page, MARGIN, y, CONTENT_W, tdH, ROW_ALT);
    line(page, MARGIN, y, MARGIN + CONTENT_W, y, BORDER_LIGHT, 0.3);
    cx = MARGIN;
    const vals = [String(idx + 1), sanitize(f.nombre), formatKg(f.kg), 'kg'];
    vals.forEach((v, i) => {
      const sz = i === 1 ? 9 : 8.5;
      const t = truncate(v, regular, sz, colW[i] - 20);
      if (i === 1) page.drawText(t, { x: cx + 10, y: y + 8, size: sz, font: regular, color: TEXT_PRIMARY });
      else textCenter(page, t, regular, sz, cx, colW[i], y + 8, TEXT_PRIMARY);
      cx += colW[i];
    });
  });

  y -= tdH;
  rect(page, MARGIN, y, CONTENT_W, tdH, SIRIUS_GREEN);
  const totalLabelW = bold.widthOfTextAtSize('TOTAL', 9);
  page.drawText('TOTAL', { x: MARGIN + colW[0] + colW[1] - totalLabelW - 12, y: y + 8, size: 9, font: bold, color: WHITE });
  textCenter(page, formatKg(kgTotalFilas), bold, 9, MARGIN + colW[0] + colW[1], colW[2], y + 8, WHITE);
  textCenter(page, 'kg', bold, 9, MARGIN + colW[0] + colW[1] + colW[2], colW[3], y + 8, WHITE);

  // ═══ CARBONO ══════════════════════════════════════════════════════════════
  // Se deriva del lote, no se guarda (ver `composicionDeDespacho()`). La tabla
  // de composición (biochar/abono/agua/biológicos) se quitó a pedido: al cliente
  // no le dice nada y la receta sigue disponible en la API de la remisión.
  const co2H = 30;
  y -= 18;
  ensureSpace(co2H + 5);
  y -= co2H;
  borderRect(page, MARGIN, y, CONTENT_W, co2H, COMPLETED_BORDER, 0.75, COMPLETED_BG);
  page.drawText('CO2 SECUESTRADO', { x: MARGIN + 14, y: y + 11, size: 7, font: bold, color: COMPLETED_TEXT });
  textRight(page, `${formatKg(data.co2_secuestrado_kg)} kg CO2-eq`, bold, 11, MARGIN + CONTENT_W - 14, y + 10, COMPLETED_TEXT);

  // ═══ OBSERVACIONES ════════════════════════════════════════════════════════
  const notas = sanitize(data.observaciones ?? '');
  if (notas) {
    y -= 18;
    const notasLines = wrapText(notas, regular, 9, CONTENT_W - 30);
    const boxH = 32 + notasLines.length * 14;
    ensureSpace(boxH + 5);
    y -= boxH;
    borderRect(page, MARGIN, y, CONTENT_W, boxH, NOTES_BORDER, 0.75, NOTES_BG);
    page.drawText('OBSERVACIONES', { x: MARGIN + 14, y: y + boxH - 16, size: 7, font: bold, color: NOTES_TEXT });
    notasLines.forEach((l, i) => {
      page.drawText(l, { x: MARGIN + 14, y: y + boxH - 30 - i * 14, size: 9, font: regular, color: NOTES_TEXT });
    });
  }

  // ═══ ANULADA ══════════════════════════════════════════════════════════════
  // Arriba y visible, no solo en el pie: una copia cancelada que circula impresa
  // tiene que leerse como tal antes de que alguien entregue o reciba con ella.
  if (data.anulada) {
    const anH = 30;
    y -= 18;
    ensureSpace(anH + 5);
    y -= anH;
    borderRect(page, MARGIN, y, CONTENT_W, anH, ANULADO, 1.25, WHITE);
    textCenter(page, 'REMISION ANULADA - SIN VALIDEZ PARA ENTREGA', bold, 10, MARGIN, CONTENT_W, y + 11, ANULADO);
  }

  // ═══ RECEPCIÓN ════════════════════════════════════════════════════════════
  // Tres casos excluyentes, según el estado que arma `construirDatosPdf()`:
  //  - anulada: nada de recepción;
  //  - pendiente: cómo confirmar la recepción —QR del enlace personal— y, como
  //    respaldo, las líneas para firmar en papel. Sin receptor: nadie recibió;
  //  - con receptor: quién recibió y cuándo, con la hora si fue por enlace.
  if (!data.anulada && data.recepcion_pendiente) {
    const pend = data.recepcion_pendiente;
    const qrLado = 96;
    const boxH = 128;
    y -= 18;
    ensureSpace(boxH + 5);
    y -= boxH;
    borderRect(page, MARGIN, y, CONTENT_W, boxH, NOTES_BORDER, 1, NOTES_BG);

    const textoW = CONTENT_W - 28 - (pend.qr_png ? qrLado + 18 : 0);
    page.drawText('RECEPCION PENDIENTE', { x: MARGIN + 14, y: y + boxH - 18, size: 8, font: bold, color: NOTES_TEXT });
    const instrucciones = pend.qr_png
      ? 'Quien recibe: escanee el codigo con la camara del celular y confirme la recepcion con su numero de documento. Si no puede, firme abajo en papel.'
      : 'Quien recibe: escriba su nombre y documento y firme en papel.';
    const lineas = wrapText(instrucciones, regular, 8, textoW).slice(0, 3);
    lineas.forEach((l, k) => {
      page.drawText(l, { x: MARGIN + 14, y: y + boxH - 32 - k * 11, size: 8, font: regular, color: NOTES_TEXT });
    });
    if (pend.vence_el) {
      page.drawText(sanitize(`Valido hasta: ${formatDateES(pend.vence_el)}`), {
        x: MARGIN + 14,
        y: y + boxH - 36 - lineas.length * 11,
        size: 8,
        font: bold,
        color: NOTES_TEXT,
      });
    }

    // Respaldo en papel: si en la finca no hay señal, el documento sigue
    // sirviendo como siempre.
    const campoW = (textoW - 12) / 2;
    ['Nombre', 'Documento', 'Firma', 'Fecha'].forEach((c, k) => {
      const cx2 = MARGIN + 14 + (k % 2) * (campoW + 12);
      const cy2 = y + 34 - Math.floor(k / 2) * 22;
      page.drawText(`${c}:`, { x: cx2, y: cy2, size: 7, font: regular, color: NOTES_TEXT });
      const etiquetaW = regular.widthOfTextAtSize(`${c}:`, 7) + 4;
      line(page, cx2 + etiquetaW, cy2 - 1, cx2 + campoW, cy2 - 1, NOTES_BORDER, 0.6);
    });

    if (pend.qr_png) {
      const qr = await pdfDoc.embedPng(pend.qr_png);
      const qx = MARGIN + CONTENT_W - 14 - qrLado;
      const qy = y + (boxH - qrLado) / 2;
      rect(page, qx - 2, qy - 2, qrLado + 4, qrLado + 4, WHITE);
      page.drawImage(qr, { x: qx, y: qy, width: qrLado, height: qrLado });
    }
  } else if (!data.anulada && data.receptor) {
    // DataLab solo la pinta con la firma del receptor. Aquí la remisión se emite
    // sin firma (2026-09-25), así que va siempre que se sepa quién recibe, con el
    // estado real: decir "ENTREGADA" de algo en tránsito sería falso.
    const confirmacion = data.recepcion_confirmada
      ? wrapText(
          sanitize(
            `Recepcion confirmada por quien recibe mediante enlace personal de Sirius, el ${data.recepcion_confirmada.fecha_hora}.`
          ),
          regular,
          7.5,
          CONTENT_W - 28
        )
      : [];
    y -= 18;
    const compH = 62 + (confirmacion.length ? confirmacion.length * 10 + 4 : 0);
    ensureSpace(compH + 8);
    y -= compH;
    borderRect(page, MARGIN, y, CONTENT_W, compH, COMPLETED_BORDER, 1, COMPLETED_BG);

    const top = y + compH;
    const badge = sanitize(data.estado).toUpperCase();
    if (badge) {
      const btW = bold.widthOfTextAtSize(badge, 7) + 14;
      rect(page, MARGIN + 14, top - 20, btW, 15, SIRIUS_GREEN);
      page.drawText(badge, { x: MARGIN + 21, y: top - 17, size: 7, font: bold, color: WHITE });
    }

    const midX = MARGIN + CONTENT_W / 2;
    page.drawText('Receptor:', { x: MARGIN + 14, y: top - 38, size: 7, font: regular, color: COMPLETED_TEXT });
    page.drawText(`${sanitize(data.receptor.nombre)}  -  C.C. ${sanitize(data.receptor.cedula)}`, { x: MARGIN + 14, y: top - 52, size: 9, font: bold, color: COMPLETED_TEXT });
    page.drawText('Fecha de Recepcion:', { x: midX + 10, y: top - 38, size: 7, font: regular, color: COMPLETED_TEXT });
    page.drawText(data.fecha_recibido ? sanitize(formatDateES(data.fecha_recibido)) : 'Pendiente', { x: midX + 10, y: top - 52, size: 9, font: bold, color: COMPLETED_TEXT });
    confirmacion.forEach((l, k) => {
      page.drawText(l, { x: MARGIN + 14, y: top - 68 - k * 10, size: 7.5, font: regular, color: COMPLETED_TEXT });
    });
  }

  // ═══ PIE — en todas las páginas ═══════════════════════════════════════════
  const pages = pdfDoc.getPages();
  pages.forEach((pg, pi) => {
    const fY = 22;
    line(pg, MARGIN, fY + 18, PAGE_WIDTH - MARGIN, fY + 18, SIRIUS_GREEN, 0.75);
    pg.drawText('Documento generado automaticamente por PiroliApp  |  Sirius Regenerative Solutions S.A.S.', { x: MARGIN, y: fY + 8, size: 6.5, font: regular, color: TEXT_MUTED });
    pg.drawText(sanitize(`${fechaGen}  -  ${horaGen}`), { x: MARGIN, y: fY - 2, size: 6.5, font: regular, color: TEXT_MUTED });
    textRight(pg, `${pi + 1} / ${pages.length}`, regular, 6.5, PAGE_WIDTH - MARGIN, fY + 8, TEXT_MUTED);
    // Una remisión cancelada sigue existiendo (las Salidas del Core la nombran),
    // pero el papel no puede decir que vale.
    const badge = data.anulada ? 'DOCUMENTO ANULADO' : 'DOCUMENTO VALIDO';
    const bW = bold.widthOfTextAtSize(badge, 6.5) + 12;
    const bX = PAGE_WIDTH - MARGIN - bW;
    rect(pg, bX, fY - 5, bW, 13, data.anulada ? ANULADO : SIRIUS_GREEN);
    pg.drawText(badge, { x: bX + 6, y: fY - 2, size: 6.5, font: bold, color: WHITE });
  });

  return pdfDoc.save();
}

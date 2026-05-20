/**
 * blend-remision-pdf-generator.ts
 * Generador server-side de Remisión de Despacho Biochar Blend usando pdf-lib.
 * Retorna Uint8Array (bytes del PDF) listo para subir a S3.
 *
 * Secciones del documento:
 *   1. Encabezado: identificación del documento
 *   2. Datos del Pedido / Vinculación
 *   3. Composición del Despacho (KG por componente)
 *   4. Impacto Ambiental (CO2 secuestrado)
 *   5. Responsable de Entrega
 *   6. Responsable que Recibe
 *   7. Firma y Compromiso
 *   8. Pie de Página (observaciones + aviso legal)
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';

export interface BlendRemisionData {
  // Identificación
  id: string;           // REM-BLEND-recXXX
  record_id: string;    // recXXX de Airtable
  fecha_evento: string; // ISO date

  // Datos del pedido
  cliente: string;
  nit_cc_cliente?: string;
  pedido_id?: string;
  produccion_id?: string;

  // Composición
  kg_biochar_puro: number;
  kg_abono_4g: number;
  kg_agua: number;
  kg_biologicos: number;
  kg_total: number;
  co2_secuestrado_kg: number;

  // Responsable entrega
  responsable_entrega: string;
  num_doc_entrega: string;
  telefono_entrega?: string;
  email_entrega?: string;

  // Responsable recibe (puede estar vacío si es borrador)
  responsable_recibe?: string;
  num_doc_recibe?: string;
  telefono_recibe?: string;
  email_recibe?: string;

  // Firma y compromiso
  firma_timestamp?: string;
  compromiso_aceptado?: boolean;
  firma_imagen_url?: string;
  ip_firma?: string;

  // Otros
  estado: string;
  realiza_registro: string;
  observaciones?: string;
}

// ─── Colores corporativos ─────────────────────────────────────────────────────
const COLOR_VERDE_PRIMARIO = rgb(0.10, 0.44, 0.19);   // #1A7030
const COLOR_VERDE_CLARO    = rgb(0.82, 0.93, 0.84);   // #D1EDD6
const COLOR_GRIS_TEXTO     = rgb(0.20, 0.20, 0.20);   // #333333
const COLOR_GRIS_BORDE     = rgb(0.75, 0.75, 0.75);   // #BFBFBF
const COLOR_BLANCO         = rgb(1, 1, 1);
const COLOR_AMARILLO_CO2   = rgb(1.00, 0.95, 0.60);   // #FFF299

// ─── Constantes de layout ─────────────────────────────────────────────────────
const MARGIN_X = 50;
const PAGE_WIDTH = 595.28;   // A4 pts
const PAGE_HEIGHT = 841.89;  // A4 pts
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function drawRect(
  page: PDFPage,
  x: number, y: number, w: number, h: number,
  fill: ReturnType<typeof rgb>,
  stroke?: ReturnType<typeof rgb>
) {
  page.drawRectangle({
    x, y, width: w, height: h,
    color: fill,
    borderColor: stroke ?? fill,
    borderWidth: stroke ? 0.5 : 0,
  });
}

function drawText(
  page: PDFPage,
  text: string,
  x: number, y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb> = COLOR_GRIS_TEXTO
) {
  page.drawText(text, { x, y, font, size, color });
}

function drawLabel(
  page: PDFPage,
  label: string, value: string,
  x: number, y: number,
  labelFont: PDFFont, valueFont: PDFFont,
  labelSize = 8, valueSize = 9
) {
  drawText(page, label, x, y, labelFont, labelSize, COLOR_VERDE_PRIMARIO);
  drawText(page, value || '—', x, y - 11, valueFont, valueSize);
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Bogota',
    });
  } catch {
    return iso;
  }
}

function formatKg(val: number): string {
  return val.toFixed(2) + ' kg';
}

// ─── Generador principal ──────────────────────────────────────────────────────

export async function generateBlendRemisionPdf(data: BlendRemisionData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Remisión Blend ${data.id}`);
  doc.setAuthor('Sirius Pirólisis SAS');
  doc.setCreator('Sistema Sirius Pirólisis');

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  let cursorY = PAGE_HEIGHT - MARGIN_X;

  // ── SECCIÓN 1: Encabezado ──────────────────────────────────────────────────
  // Barra verde de cabecera
  drawRect(page, MARGIN_X, cursorY - 60, CONTENT_WIDTH, 60, COLOR_VERDE_PRIMARIO);

  // Título principal
  drawText(
    page,
    'REMISIÓN DE DESPACHO',
    MARGIN_X + 12, cursorY - 22,
    fontBold, 15, COLOR_BLANCO
  );
  drawText(
    page,
    'BIOCHAR BLEND — SIRIUS PIRÓLISIS SAS',
    MARGIN_X + 12, cursorY - 38,
    fontRegular, 10, COLOR_BLANCO
  );

  // ID y fecha — parte derecha
  const idText = data.id;
  const idWidth = fontBold.widthOfTextAtSize(idText, 11);
  drawText(page, idText, PAGE_WIDTH - MARGIN_X - idWidth - 4, cursorY - 22, fontBold, 11, COLOR_BLANCO);
  const fechaStr = 'Fecha: ' + formatDate(data.fecha_evento);
  const fechaWidth = fontRegular.widthOfTextAtSize(fechaStr, 8);
  drawText(page, fechaStr, PAGE_WIDTH - MARGIN_X - fechaWidth - 4, cursorY - 38, fontRegular, 8, COLOR_BLANCO);

  // Badge de estado
  drawRect(page, MARGIN_X + 12, cursorY - 58, 90, 14, COLOR_BLANCO);
  drawText(page, `Estado: ${data.estado}`, MARGIN_X + 16, cursorY - 52, fontBold, 7.5, COLOR_VERDE_PRIMARIO);

  cursorY -= 70;

  // ── SECCIÓN 2: Datos del Pedido ───────────────────────────────────────────
  cursorY -= 10;
  drawRect(page, MARGIN_X, cursorY - 14, CONTENT_WIDTH, 14, COLOR_VERDE_CLARO);
  drawText(page, '1. DATOS DEL PEDIDO Y CLIENTE', MARGIN_X + 5, cursorY - 11, fontBold, 9, COLOR_VERDE_PRIMARIO);
  cursorY -= 22;

  const col = CONTENT_WIDTH / 3;

  drawLabel(page, 'Cliente', data.cliente, MARGIN_X, cursorY, fontBold, fontRegular);
  drawLabel(page, 'NIT / CC', data.nit_cc_cliente || '—', MARGIN_X + col, cursorY, fontBold, fontRegular);
  drawLabel(page, 'Pedido Origen', data.pedido_id || '—', MARGIN_X + col * 2, cursorY, fontBold, fontRegular);
  cursorY -= 28;

  drawLabel(page, 'Producción Origen', data.produccion_id || '—', MARGIN_X, cursorY, fontBold, fontRegular);
  drawLabel(page, 'Registrado por', data.realiza_registro, MARGIN_X + col, cursorY, fontBold, fontRegular);
  cursorY -= 28;

  // ── SECCIÓN 3: Composición del Despacho ──────────────────────────────────
  cursorY -= 4;
  drawRect(page, MARGIN_X, cursorY - 14, CONTENT_WIDTH, 14, COLOR_VERDE_CLARO);
  drawText(page, '2. COMPOSICIÓN DEL DESPACHO', MARGIN_X + 5, cursorY - 11, fontBold, 9, COLOR_VERDE_PRIMARIO);
  cursorY -= 20;

  // Tabla de composición
  const compCols = 5;
  const compColW = CONTENT_WIDTH / compCols;
  const tableTop = cursorY;
  const tableRowH = 22;

  // Encabezado de tabla
  drawRect(page, MARGIN_X, tableTop - tableRowH, CONTENT_WIDTH, tableRowH, COLOR_VERDE_PRIMARIO);
  const headers = ['Biochar Puro', 'Abono 4G', 'Agua', 'Biológicos', 'TOTAL DESPACHO'];
  headers.forEach((h, i) => {
    drawText(page, h, MARGIN_X + compColW * i + 5, tableTop - 9, fontBold, 8, COLOR_BLANCO);
  });

  // Fila de valores
  cursorY = tableTop - tableRowH;
  drawRect(page, MARGIN_X, cursorY - tableRowH, CONTENT_WIDTH, tableRowH, COLOR_VERDE_CLARO);
  const values = [
    formatKg(data.kg_biochar_puro),
    formatKg(data.kg_abono_4g),
    formatKg(data.kg_agua),
    formatKg(data.kg_biologicos),
    formatKg(data.kg_total),
  ];
  values.forEach((v, i) => {
    const isTotalCol = i === compCols - 1;
    drawText(
      page, v,
      MARGIN_X + compColW * i + 5, cursorY - 13,
      isTotalCol ? fontBold : fontRegular, 9,
      isTotalCol ? COLOR_VERDE_PRIMARIO : COLOR_GRIS_TEXTO
    );
  });
  cursorY -= tableRowH;

  // Bordes de tabla
  drawRect(page, MARGIN_X, cursorY, CONTENT_WIDTH, tableRowH * 2, COLOR_BLANCO, COLOR_GRIS_BORDE);
  for (let i = 1; i < compCols; i++) {
    page.drawLine({
      start: { x: MARGIN_X + compColW * i, y: cursorY },
      end:   { x: MARGIN_X + compColW * i, y: tableTop },
      thickness: 0.3,
      color: COLOR_GRIS_BORDE,
    });
  }

  cursorY -= 10;

  // ── SECCIÓN 4: Impacto Ambiental ──────────────────────────────────────────
  cursorY -= 8;
  drawRect(page, MARGIN_X, cursorY - 44, CONTENT_WIDTH, 44, COLOR_AMARILLO_CO2);
  drawRect(page, MARGIN_X, cursorY - 44, CONTENT_WIDTH, 44, COLOR_BLANCO, COLOR_GRIS_BORDE);

  drawText(page, '3. IMPACTO AMBIENTAL', MARGIN_X + 5, cursorY - 12, fontBold, 9, COLOR_VERDE_PRIMARIO);
  drawText(
    page,
    `CO₂ Secuestrado Total:  ${data.co2_secuestrado_kg.toFixed(4)} kg CO₂-eq`,
    MARGIN_X + 5, cursorY - 28,
    fontBold, 13, COLOR_VERDE_PRIMARIO
  );
  drawText(
    page,
    `Factor de secuestro aplicado: ${data.kg_biochar_puro.toFixed(2)} kg Biochar Puro × factor CO₂`,
    MARGIN_X + 5, cursorY - 42,
    fontOblique, 7.5, COLOR_GRIS_TEXTO
  );
  cursorY -= 52;

  // ── SECCIÓN 5: Responsable Entrega ────────────────────────────────────────
  cursorY -= 8;
  drawRect(page, MARGIN_X, cursorY - 14, CONTENT_WIDTH, 14, COLOR_VERDE_CLARO);
  drawText(page, '4. RESPONSABLE DE ENTREGA', MARGIN_X + 5, cursorY - 11, fontBold, 9, COLOR_VERDE_PRIMARIO);
  cursorY -= 22;

  drawLabel(page, 'Nombre / Razón Social', data.responsable_entrega, MARGIN_X, cursorY, fontBold, fontRegular);
  drawLabel(page, 'N° Documento', data.num_doc_entrega, MARGIN_X + col, cursorY, fontBold, fontRegular);
  drawLabel(page, 'Teléfono', data.telefono_entrega || '—', MARGIN_X + col * 2, cursorY, fontBold, fontRegular);
  cursorY -= 28;
  drawLabel(page, 'Email', data.email_entrega || '—', MARGIN_X, cursorY, fontBold, fontRegular);
  cursorY -= 28;

  // ── SECCIÓN 6: Responsable Recibe ─────────────────────────────────────────
  cursorY -= 4;
  drawRect(page, MARGIN_X, cursorY - 14, CONTENT_WIDTH, 14, COLOR_VERDE_CLARO);
  drawText(page, '5. RESPONSABLE QUE RECIBE', MARGIN_X + 5, cursorY - 11, fontBold, 9, COLOR_VERDE_PRIMARIO);
  cursorY -= 22;

  drawLabel(page, 'Nombre', data.responsable_recibe || 'Pendiente firma', MARGIN_X, cursorY, fontBold, fontRegular);
  drawLabel(page, 'N° Documento', data.num_doc_recibe || '—', MARGIN_X + col, cursorY, fontBold, fontRegular);
  drawLabel(page, 'Teléfono', data.telefono_recibe || '—', MARGIN_X + col * 2, cursorY, fontBold, fontRegular);
  cursorY -= 28;
  drawLabel(page, 'Email', data.email_recibe || '—', MARGIN_X, cursorY, fontBold, fontRegular);
  cursorY -= 28;

  // ── SECCIÓN 7: Firma y Compromiso ─────────────────────────────────────────
  cursorY -= 4;
  drawRect(page, MARGIN_X, cursorY - 14, CONTENT_WIDTH, 14, COLOR_VERDE_CLARO);
  drawText(page, '6. FIRMA Y COMPROMISO', MARGIN_X + 5, cursorY - 11, fontBold, 9, COLOR_VERDE_PRIMARIO);
  cursorY -= 22;

  drawLabel(page, 'Compromiso Aceptado', data.compromiso_aceptado ? 'Sí' : 'No', MARGIN_X, cursorY, fontBold, fontRegular);
  drawLabel(page, 'Fecha / Hora Firma', formatDateTime(data.firma_timestamp), MARGIN_X + col, cursorY, fontBold, fontRegular);
  drawLabel(page, 'IP de Firma', data.ip_firma || '—', MARGIN_X + col * 2, cursorY, fontBold, fontRegular);
  cursorY -= 28;

  // Caja de firma (solo muestra nota si no hay imagen — la imagen real se ve en el portal)
  const firmaBoxH = 50;
  drawRect(page, MARGIN_X, cursorY - firmaBoxH, CONTENT_WIDTH / 2 - 5, firmaBoxH, COLOR_BLANCO, COLOR_GRIS_BORDE);
  drawText(page, 'Firma digital del receptor', MARGIN_X + 5, cursorY - 14, fontBold, 7.5, COLOR_VERDE_PRIMARIO);
  if (data.firma_imagen_url) {
    drawText(page, '✓ Firma capturada — ver portal', MARGIN_X + 5, cursorY - 30, fontRegular, 8, COLOR_VERDE_PRIMARIO);
    drawText(page, data.firma_imagen_url.substring(0, 60) + '...', MARGIN_X + 5, cursorY - 42, fontOblique, 6, COLOR_GRIS_TEXTO);
  } else {
    drawText(page, 'Pendiente de firma', MARGIN_X + 5, cursorY - 30, fontOblique, 8, COLOR_GRIS_TEXTO);
  }
  cursorY -= firmaBoxH + 10;

  // ── SECCIÓN 8: Observaciones ──────────────────────────────────────────────
  if (data.observaciones) {
    cursorY -= 4;
    drawRect(page, MARGIN_X, cursorY - 14, CONTENT_WIDTH, 14, COLOR_VERDE_CLARO);
    drawText(page, '7. OBSERVACIONES', MARGIN_X + 5, cursorY - 11, fontBold, 9, COLOR_VERDE_PRIMARIO);
    cursorY -= 22;

    const obsLines = data.observaciones.match(/.{1,90}/g) || [];
    for (const line of obsLines.slice(0, 5)) {
      drawText(page, line, MARGIN_X, cursorY, fontRegular, 8.5);
      cursorY -= 12;
    }
    cursorY -= 6;
  }

  // ── PIE DE PÁGINA ─────────────────────────────────────────────────────────
  const footerY = MARGIN_Y_FOOTER(cursorY);
  drawRect(page, MARGIN_X, footerY - 30, CONTENT_WIDTH, 30, COLOR_VERDE_PRIMARIO);
  drawText(
    page,
    'SIRIUS PIRÓLISIS SAS — NIT 901.123.456-0 — Colombia',
    MARGIN_X + 5, footerY - 12,
    fontBold, 7.5, COLOR_BLANCO
  );
  drawText(
    page,
    `Documento generado el ${formatDateTime(new Date().toISOString())} · ID Registro: ${data.record_id}`,
    MARGIN_X + 5, footerY - 24,
    fontOblique, 6.5, COLOR_BLANCO
  );

  // Línea divisoria antes del pie
  page.drawLine({
    start: { x: MARGIN_X, y: footerY },
    end:   { x: PAGE_WIDTH - MARGIN_X, y: footerY },
    thickness: 0.5,
    color: COLOR_GRIS_BORDE,
  });

  // Aviso legal pequeño
  drawText(
    page,
    'Este documento tiene validez como remisión de despacho y acredita la entrega del producto descrito.',
    MARGIN_X, footerY + 6,
    fontOblique, 6, COLOR_GRIS_TEXTO
  );

  return doc.save();
}

function MARGIN_Y_FOOTER(cursorY: number): number {
  // El pie va a 32 pts del fondo de la página, aunque el cursor esté más arriba
  return Math.min(cursorY - 10, 50);
}

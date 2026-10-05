/**
 * PDF del acta de entrega de biochar sin contraprestación.
 *
 * Es la remisión del Blend (`blend-remision-pdf-generator.ts`) con lo que la
 * entrega agrega: quién recibe, el compromiso de no quemar el biochar y
 * llevarlo al suelo, y las dos firmas en papel. Comparte helpers y
 * colores con ella a propósito: al que recibe le llegan documentos de la misma
 * empresa y tienen que verse como tales.
 */
import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import {
  BG_PAPER,
  BORDER_LIGHT,
  BORDER_MAIN,
  COMPLETED_BG,
  COMPLETED_BORDER,
  COMPLETED_TEXT,
  CONTENT_W,
  MARGIN,
  NOTES_BG,
  NOTES_BORDER,
  NOTES_TEXT,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  ROW_ALT,
  SIRIUS_BLACK,
  SIRIUS_DARK,
  SIRIUS_GREEN,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
  borderRect,
  formatDateES,
  formatKg,
  line,
  rect,
  sanitize,
  sectionTitle,
  textCenter,
  textRight,
  truncate,
  wrapText,
} from './blend-remision-pdf-generator';
import { COMPROMISO_ENTREGA_BIOCHAR } from './salida-bache.constants';
import type { ActaEntrega } from './acta-entrega-biochar';

export interface ActaEntregaPdfData extends ActaEntrega {
  /** kg × `config.carbon.factorSecuestroCo2`, el mismo factor de la remisión del Blend. */
  co2Kg: number;
}

export async function generarActaEntregaPdf(data: ActaEntregaPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Acta de entrega ${data.referencia}`);
  pdfDoc.setAuthor('Sirius Regenerative Solutions S.A.S.');
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logoImage: PDFImage | null = null;
  try {
    logoImage = await pdfDoc.embedPng(fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png')));
  } catch {
    console.warn('⚠️ public/logo.png no encontrado: acta sin logo');
  }

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT;

  const ahora = new Date();
  const fechaGen = ahora.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Bogota' });
  const horaGen = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });

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
    page.drawText('S.A.S. ZOMAC  |  NIT: 901.234.567-8', { x: textX, y: y + 22, size: 7.5, font: regular, color: rgb(0.55, 0.58, 0.62) });
  } else {
    page.drawText('SIRIUS REGENERATIVE SOLUTIONS', { x: MARGIN, y: y + 52, size: 18, font: bold, color: WHITE });
    page.drawText('S.A.S. ZOMAC  |  NIT: 901.234.567-8', { x: MARGIN, y: y + 34, size: 8, font: regular, color: rgb(0.55, 0.58, 0.62) });
  }

  textRight(page, 'ACTA DE ENTREGA DE BIOCHAR', regular, 7.5, PAGE_WIDTH - MARGIN, y + 68, rgb(0.55, 0.58, 0.62));
  textRight(page, 'No. ' + (data.numero ?? '-'), bold, 28, PAGE_WIDTH - MARGIN, y + 30, SIRIUS_GREEN);
  textRight(page, sanitize(data.referencia), regular, 8, PAGE_WIDTH - MARGIN, y + 15, rgb(0.65, 0.68, 0.72));

  // ═══ DATOS DEL DOCUMENTO ══════════════════════════════════════════════════
  y -= 22;
  const col1X = MARGIN + 18;
  const col2X = MARGIN + CONTENT_W / 2 + 10;
  const rowStep = 30;
  const leftFields = [
    { label: 'FECHA DE ENTREGA', value: sanitize(formatDateES(data.fecha)) },
    { label: 'BACHE DE ORIGEN', value: sanitize(data.bache || 'N/A') },
    { label: 'TIPO DE ENTREGA', value: 'Sin contraprestación' },
  ];
  const rightFields = [
    { label: 'HORA DE GENERACION', value: sanitize(horaGen) },
    { label: 'AREA DE ORIGEN', value: 'Pirólisis' },
    { label: 'RESPONSABLE DE ENTREGA', value: sanitize(data.responsableEntrega || 'N/A') },
  ];

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
      line(page, MARGIN + 12, rowY - 20, MARGIN + CONTENT_W - 12, rowY - 20, BORDER_LIGHT, 0.3);
    }
  }
  y -= infoBoxH;

  // ═══ QUIEN RECIBE ═════════════════════════════════════════════════════════
  y -= 16;
  page.drawText('QUIEN RECIBE', { x: MARGIN, y, size: 7, font: bold, color: TEXT_MUTED });
  y -= 8;

  // El vehículo se guarda en la remisión pero no se imprime (decisión de David,
  // 2026-09-28): el acta documenta a quién se entregó, no en qué se lo llevó.
  const cardH = 44;
  y -= cardH;

  const r = data.receptor;
  borderRect(page, MARGIN, y, CONTENT_W, cardH, BORDER_MAIN, 0.5, BG_PAPER);
  rect(page, MARGIN, y, 3, cardH, SIRIUS_GREEN);
  page.drawText('RECEPTOR', { x: MARGIN + 14, y: y + cardH - 14, size: 6.5, font: bold, color: TEXT_MUTED });
  page.drawText(truncate(sanitize(r.nombre || 'Sin registrar'), bold, 10, CONTENT_W - 30), { x: MARGIN + 14, y: y + cardH - 28, size: 10, font: bold, color: TEXT_PRIMARY });
  page.drawText(`C.C. ${sanitize(r.cedula || '-')}`, { x: MARGIN + 14, y: y + 6, size: 7.5, font: regular, color: TEXT_SECONDARY });

  // ═══ PRODUCTO ENTREGADO ═══════════════════════════════════════════════════
  y -= 24;
  sectionTitle(page, 'PRODUCTO ENTREGADO', y, bold);
  y -= 12;

  const colW = [36, CONTENT_W - 36 - 85 - 70, 85, 70];
  const thH = 28;
  const tdH = 26;
  y -= thH;
  rect(page, MARGIN, y, CONTENT_W, thH, SIRIUS_DARK);
  let cx = MARGIN;
  ['#', 'PRODUCTO', 'CANTIDAD', 'UNIDAD'].forEach((h, i) => {
    if (i === 1) page.drawText(h, { x: cx + 10, y: y + 10, size: 7, font: bold, color: WHITE });
    else textCenter(page, h, bold, 7, cx, colW[i], y + 10, WHITE);
    cx += colW[i];
  });

  // Todo el biochar se lleva en masa seca (CLAUDE.md §5): el documento lo dice
  // para que nadie compare estos kg contra la balanza de un material húmedo.
  y -= tdH;
  rect(page, MARGIN, y, CONTENT_W, tdH, ROW_ALT);
  cx = MARGIN;
  ['1', `Biochar puro (masa seca) - bache ${data.bache}`, formatKg(data.kg), 'kg'].forEach((v, i) => {
    const t = truncate(sanitize(v), regular, 9, colW[i] - 20);
    if (i === 1) page.drawText(t, { x: cx + 10, y: y + 8, size: 9, font: regular, color: TEXT_PRIMARY });
    else textCenter(page, t, regular, 8.5, cx, colW[i], y + 8, TEXT_PRIMARY);
    cx += colW[i];
  });

  y -= tdH;
  rect(page, MARGIN, y, CONTENT_W, tdH, SIRIUS_GREEN);
  const totalLabelW = bold.widthOfTextAtSize('TOTAL', 9);
  page.drawText('TOTAL', { x: MARGIN + colW[0] + colW[1] - totalLabelW - 12, y: y + 8, size: 9, font: bold, color: WHITE });
  textCenter(page, formatKg(data.kg), bold, 9, MARGIN + colW[0] + colW[1], colW[2], y + 8, WHITE);
  textCenter(page, 'kg', bold, 9, MARGIN + colW[0] + colW[1] + colW[2], colW[3], y + 8, WHITE);

  // ═══ CARBONO ══════════════════════════════════════════════════════════════
  const co2H = 30;
  y -= 18 + co2H;
  borderRect(page, MARGIN, y, CONTENT_W, co2H, COMPLETED_BORDER, 0.75, COMPLETED_BG);
  page.drawText('CO2 SECUESTRADO EN ESTE BIOCHAR', { x: MARGIN + 14, y: y + 11, size: 7, font: bold, color: COMPLETED_TEXT });
  textRight(page, `${formatKg(data.co2Kg)} kg CO2-eq`, bold, 11, MARGIN + CONTENT_W - 14, y + 10, COMPLETED_TEXT);

  // ═══ COMPROMISO (el banner) ═══════════════════════════════════════════════
  // Es la razón del documento: sin este compromiso la entrega no se puede contar
  // como carbono secuestrado. Va antes de las firmas para que se firme DEBAJO.
  const compromisoLines = wrapText(sanitize(COMPROMISO_ENTREGA_BIOCHAR), regular, 9.5, CONTENT_W - 32);
  const bannerTitleH = 26;
  const bannerBodyH = 20 + compromisoLines.length * 14;
  y -= 18 + bannerTitleH + bannerBodyH;
  borderRect(page, MARGIN, y, CONTENT_W, bannerTitleH + bannerBodyH, SIRIUS_GREEN, 1.25, COMPLETED_BG);
  rect(page, MARGIN, y + bannerBodyH, CONTENT_W, bannerTitleH, SIRIUS_GREEN);
  page.drawText('COMPROMISO DEL RECEPTOR: NO QUEMAR  -  LLEVAR AL SUELO', {
    x: MARGIN + 16, y: y + bannerBodyH + 9, size: 10, font: bold, color: WHITE,
  });
  compromisoLines.forEach((l, i) => {
    page.drawText(l, { x: MARGIN + 16, y: y + bannerBodyH - 18 - i * 14, size: 9.5, font: regular, color: COMPLETED_TEXT });
  });

  // ═══ OBSERVACIONES ════════════════════════════════════════════════════════
  const notas = sanitize(data.observaciones ?? '');
  if (notas) {
    const notasLines = wrapText(notas, regular, 9, CONTENT_W - 30).slice(0, 4);
    const boxH = 32 + notasLines.length * 14;
    y -= 14 + boxH;
    borderRect(page, MARGIN, y, CONTENT_W, boxH, NOTES_BORDER, 0.75, NOTES_BG);
    page.drawText('OBSERVACIONES', { x: MARGIN + 14, y: y + boxH - 16, size: 7, font: bold, color: NOTES_TEXT });
    notasLines.forEach((l, i) => {
      page.drawText(l, { x: MARGIN + 14, y: y + boxH - 30 - i * 14, size: 9, font: regular, color: NOTES_TEXT });
    });
  }

  // ═══ FIRMAS ═══════════════════════════════════════════════════════════════
  // En papel: el acta se imprime y se firma en la entrega. Van debajo del
  // compromiso con aire para firmar, pero nunca más abajo que el pie.
  const firmaY = Math.max(110, y - 90);
  const firmaW = (CONTENT_W - 40) / 2;
  const firmas = [
    { x: MARGIN, titulo: 'ENTREGA - SIRIUS REGENERATIVE', nombre: data.responsableEntrega, doc: '' },
    { x: MARGIN + firmaW + 40, titulo: 'RECIBE Y ACEPTA EL COMPROMISO', nombre: r.nombre ?? '', doc: r.cedula ? `C.C. ${r.cedula}` : 'C.C.' },
  ];
  for (const f of firmas) {
    line(page, f.x, firmaY, f.x + firmaW, firmaY, TEXT_PRIMARY, 0.75);
    page.drawText(sanitize(f.titulo), { x: f.x, y: firmaY - 12, size: 6.5, font: bold, color: TEXT_MUTED });
    page.drawText(truncate(sanitize(f.nombre || ''), bold, 9, firmaW), { x: f.x, y: firmaY - 25, size: 9, font: bold, color: TEXT_PRIMARY });
    if (f.doc) page.drawText(sanitize(f.doc), { x: f.x, y: firmaY - 37, size: 8, font: regular, color: TEXT_SECONDARY });
  }

  // ═══ PIE ══════════════════════════════════════════════════════════════════
  const fY = 22;
  line(page, MARGIN, fY + 18, PAGE_WIDTH - MARGIN, fY + 18, SIRIUS_GREEN, 0.75);
  page.drawText('Documento generado automaticamente por PiroliApp  |  Sirius Regenerative Solutions S.A.S.', { x: MARGIN, y: fY + 8, size: 6.5, font: regular, color: TEXT_MUTED });
  page.drawText(sanitize(`${fechaGen}  -  ${horaGen}  -  Entrega sin contraprestacion (Puro Biochar Methodology 5.4.2)`), { x: MARGIN, y: fY - 2, size: 6.5, font: regular, color: TEXT_MUTED });

  return pdfDoc.save();
}

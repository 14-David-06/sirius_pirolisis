// src/lib/acta-entrega-pdf.ts
//
// El PDF del Acta de Entrega de Biochar: el documento que acredita una entrega SIN
// contraprestación comercial (investigación, ensayo, piloto, donación).
//
// ═══ POR QUÉ EL PDF ES EL DOCUMENTO, Y NO LA FILA DE AIRTABLE ═════════════════
// El numeral 5.4.2 de la Puro Biochar Methodology exige constancia del uso previsto
// declarado, firmada por quien entrega y por quien recibe. Una fila de Airtable no
// se le puede mostrar a un auditor ni al receptor: lo que queda es este PDF, con las
// dos firmas embebidas, sus fechas y la IP desde donde se firmaron. Airtable guarda
// el estado; el PDF ES el acta.
//
// ═══ SE REGENERA, NO SE PARCHEA ═══════════════════════════════════════════════
// Cada firma vuelve a generar el documento completo. Es más barato que mantener un
// PDF mutable, y deja el invariante importante: un acta con las dos firmas SIEMPRE
// tiene las dos impresas. La versión anterior no se borra de S3 (la key lleva
// timestamp): el rastro de cómo se veía el acta con una sola firma es evidencia.
//
// ═══ FIRMAS FALTANTES SE DIBUJAN VACÍAS ═══════════════════════════════════════
// Un acta a medio firmar imprime la casilla de la firma pendiente con su línea y la
// palabra «Pendiente». NO se oculta: el documento tiene que mostrar qué falta, o un
// acta sin la firma del receptor se leería como completa.

import { PDFDocument, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import {
  COLOR_AMARILLO_CO2,
  COLOR_BLANCO,
  COLOR_GRIS_BORDE,
  COLOR_GRIS_TEXTO,
  COLOR_VERDE_CLARO,
  COLOR_VERDE_PRIMARIO,
  CONTENT_WIDTH,
  MARGIN_X,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  drawLabel,
  drawRect,
  drawText,
  formatDate,
  formatDateTime,
  formatKg,
  wrapText,
} from './pdf-sirius';

/** Una de las dos firmas del acta. `imagenUrl` puede faltar: aún no firmó. */
export interface FirmaActa {
  nombre?: string;
  cargo?: string;
  documento?: string;
  /** URL (S3 firmada) del PNG del trazo. */
  imagenUrl?: string;
  /** ISO del momento en que firmó. */
  timestamp?: string;
  ip?: string;
}

export interface ActaEntregaPdfData {
  codigo: string;
  estado: string;
  fechaEntrega: string;
  elaboradoPor: string;
  cargoElaboradoPor?: string;

  tipoBiochar: string;
  loteEntregado: string;
  detallePorBache?: string;
  kgSeca: number;
  humedadPct?: number;
  co2SecuestradoKg: number;

  receptorNombre: string;
  receptorTipo?: string;
  receptorDocumento?: string;
  receptorContacto?: string;
  receptorTelefono?: string;
  receptorCorreo?: string;
  receptorMunicipio?: string;
  actuaComoIntermediario?: boolean;

  nombreProyecto: string;
  categoriaUso: string;
  categoriaUsoOtro?: string;
  ubicacionAplicacion: string;
  coordenadasGps?: string;
  fechaEstimadaAplicacion?: string;
  duracionEnsayo?: string;

  observaciones?: string;

  firmaSirius: FirmaActa;
  firmaReceptor: FirmaActa;
}

/**
 * Declaración que ambas partes firman.
 *
 * Es lo que convierte el acta en evidencia del uso previsto: sin la prohibición
 * expresa de quemar el material y sin el compromiso de la atestación posterior, el
 * documento solo probaría que el biochar cambió de manos.
 */
const DECLARACION = [
  '1. La presente entrega se realiza SIN contraprestación comercial: no constituye venta, no genera',
  '   factura y no transfiere derechos sobre el carbono secuestrado, que permanece en cabeza de Sirius',
  '   Regenerative Solutions S.A.S. BIC.',
  '2. QUEDA PROHIBIDA la quema o incineración del material entregado: revertiría el carbono',
  '   secuestrado a la atmósfera e invalidaría la certificación asociada.',
  '3. El receptor destinará el material exclusivamente al uso previsto declarado en la sección 3 de',
  '   esta acta, y se compromete a remitir la Atestación de Uso con evidencia de la aplicación real.',
  '4. Las partes autorizan el tratamiento de sus datos personales conforme a la Ley 1581 de 2012,',
  '   con la finalidad de acreditar esta entrega ante auditorías de la metodología de biochar.',
];

const AVISO_METODOLOGICO =
  'Documento emitido en cumplimiento del numeral 5.4.2 de la Puro Biochar Methodology (2022 V3), ' +
  'siguiendo los principios del numeral 3.6 de la Edition 2025 V2. Las cantidades se expresan en ' +
  'MASA SECA.';

/**
 * Descarga el PNG de una firma.
 *
 * Devuelve `null` en vez de lanzar: una firma que no se pudo descargar no puede
 * impedir que se emita el acta —el trazo ya está guardado en S3 y en Airtable—, y
 * la casilla se dibuja como pendiente, que es visible y honesto.
 */
async function descargarFirma(doc: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await doc.embedPng(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Encabezado de sección: barra verde con el número y el título. */
function seccion(page: PDFPage, titulo: string, y: number, font: PDFFont): number {
  drawRect(page, MARGIN_X, y - 14, CONTENT_WIDTH, 16, COLOR_VERDE_PRIMARIO);
  drawText(page, titulo, MARGIN_X + 6, y - 10, font, 9, COLOR_BLANCO);
  return y - 26;
}

/**
 * Casilla de una firma: el trazo (o la línea vacía), el nombre, el cargo y la
 * trazabilidad de cuándo y desde dónde se firmó.
 */
function casillaFirma(
  page: PDFPage,
  x: number,
  y: number,
  ancho: number,
  rotulo: string,
  firma: FirmaActa,
  imagen: PDFImage | null,
  bold: PDFFont,
  regular: PDFFont
) {
  const alto = 108;
  drawRect(page, x, y - alto, ancho, alto, COLOR_BLANCO, COLOR_GRIS_BORDE);
  drawText(page, rotulo, x + 8, y - 14, bold, 8, COLOR_VERDE_PRIMARIO);

  const lineaY = y - 58;
  if (imagen) {
    // El trazo se escala para caber sin deformarse: una firma estirada no se parece
    // a la que la persona hizo.
    const maxAncho = ancho - 24;
    const maxAlto = 34;
    const escala = Math.min(maxAncho / imagen.width, maxAlto / imagen.height, 1);
    page.drawImage(imagen, {
      x: x + 12,
      y: lineaY + 4,
      width: imagen.width * escala,
      height: imagen.height * escala,
    });
  } else if (!firma.imagenUrl) {
    drawText(page, 'Pendiente de firma', x + 12, lineaY + 12, regular, 8, COLOR_GRIS_BORDE);
  } else {
    // Hay firma registrada pero la imagen no se pudo traer: decirlo es mejor que
    // dejar la casilla igual a una que nadie firmó.
    drawText(page, 'Firma registrada (imagen no disponible)', x + 12, lineaY + 12, regular, 8, COLOR_GRIS_TEXTO);
  }

  page.drawLine({
    start: { x: x + 12, y: lineaY },
    end: { x: x + ancho - 12, y: lineaY },
    thickness: 0.7,
    color: COLOR_GRIS_BORDE,
  });

  drawText(page, firma.nombre || '—', x + 12, lineaY - 12, bold, 9);
  drawText(page, firma.cargo || '—', x + 12, lineaY - 23, regular, 8);
  if (firma.documento) drawText(page, `C.C. ${firma.documento}`, x + 12, lineaY - 33, regular, 8);
  drawText(
    page,
    firma.timestamp ? `Firmado ${formatDateTime(firma.timestamp)}${firma.ip ? ` · IP ${firma.ip}` : ''}` : '',
    x + 12,
    lineaY - 43,
    regular,
    6.5,
    COLOR_GRIS_TEXTO
  );
}

export async function generarActaEntregaPdf(data: ActaEntregaPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Acta de Entrega de Biochar ${data.codigo}`);
  doc.setSubject('Entrega de biochar sin contraprestación comercial');
  doc.setProducer('PiroliApp — Sirius Regenerative');

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const [imgSirius, imgReceptor] = await Promise.all([
    descargarFirma(doc, data.firmaSirius.imagenUrl),
    descargarFirma(doc, data.firmaReceptor.imagenUrl),
  ]);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 45;

  // ─── Encabezado ────────────────────────────────────────────────────────────
  drawRect(page, MARGIN_X, y - 44, CONTENT_WIDTH, 48, COLOR_VERDE_PRIMARIO);
  drawText(page, 'ACTA DE ENTREGA DE BIOCHAR', MARGIN_X + 12, y - 14, bold, 14, COLOR_BLANCO);
  drawText(
    page,
    'Entrega sin contraprestación comercial · Sirius Regenerative Solutions S.A.S. BIC',
    MARGIN_X + 12,
    y - 28,
    regular,
    8,
    COLOR_BLANCO
  );
  drawText(page, `${data.codigo} · ${data.estado}`, MARGIN_X + 12, y - 39, bold, 9, COLOR_BLANCO);
  drawText(
    page,
    `Fecha de entrega: ${formatDate(data.fechaEntrega)}`,
    PAGE_WIDTH - MARGIN_X - 150,
    y - 39,
    regular,
    8,
    COLOR_BLANCO
  );
  y -= 58;

  // ─── 1. Producto entregado ─────────────────────────────────────────────────
  y = seccion(page, '1. PRODUCTO ENTREGADO', y, bold);
  const col = CONTENT_WIDTH / 3;
  drawLabel(page, 'TIPO', data.tipoBiochar, MARGIN_X, y, bold, regular);
  drawLabel(page, 'LOTE / BACHES', data.loteEntregado, MARGIN_X + col, y, bold, regular);
  drawLabel(page, 'CANTIDAD (MASA SECA)', formatKg(data.kgSeca), MARGIN_X + col * 2, y, bold, regular);
  y -= 26;
  drawLabel(
    page,
    'HUMEDAD DEL LOTE',
    data.humedadPct ? `${data.humedadPct} %` : 'No registrada',
    MARGIN_X,
    y,
    bold,
    regular
  );
  // El CO₂ va resaltado porque es el dato que un auditor busca primero.
  drawRect(page, MARGIN_X + col, y - 15, col * 2 - 10, 20, COLOR_AMARILLO_CO2, COLOR_GRIS_BORDE);
  drawText(
    page,
    `CO2 secuestrado en el material entregado: ${formatKg(data.co2SecuestradoKg)}`,
    MARGIN_X + col + 8,
    y - 9,
    bold,
    9
  );
  y -= 30;

  if (data.detallePorBache?.trim()) {
    drawText(page, 'DETALLE POR BACHE', MARGIN_X, y, bold, 8, COLOR_VERDE_PRIMARIO);
    y -= 11;
    for (const linea of wrapText(data.detallePorBache.trim(), regular, 8, CONTENT_WIDTH - 8).slice(0, 6)) {
      drawText(page, linea, MARGIN_X + 4, y, regular, 8);
      y -= 10;
    }
    y -= 4;
  }

  // ─── 2. Receptor ───────────────────────────────────────────────────────────
  y = seccion(page, '2. RECEPTOR', y, bold);
  drawLabel(page, 'NOMBRE / RAZÓN SOCIAL', data.receptorNombre, MARGIN_X, y, bold, regular);
  drawLabel(page, 'TIPO', data.receptorTipo ?? '', MARGIN_X + col, y, bold, regular);
  drawLabel(page, 'NIT / C.C.', data.receptorDocumento ?? '', MARGIN_X + col * 2, y, bold, regular);
  y -= 26;
  drawLabel(page, 'PERSONA DE CONTACTO', data.receptorContacto ?? '', MARGIN_X, y, bold, regular);
  drawLabel(page, 'TELÉFONO / CORREO', [data.receptorTelefono, data.receptorCorreo].filter(Boolean).join(' · '), MARGIN_X + col, y, bold, regular);
  drawLabel(page, 'MUNICIPIO', data.receptorMunicipio ?? '', MARGIN_X + col * 2, y, bold, regular);
  y -= 26;
  if (data.actuaComoIntermediario) {
    // Un intermediario no aplica el biochar: la metodología exige saberlo, porque la
    // atestación de uso tendrá que venir de un tercero.
    drawRect(page, MARGIN_X, y - 13, CONTENT_WIDTH, 16, COLOR_VERDE_CLARO, COLOR_GRIS_BORDE);
    drawText(
      page,
      'El receptor actúa como INTERMEDIARIO: no es quien aplica el material en campo.',
      MARGIN_X + 6,
      y - 9,
      bold,
      8
    );
    y -= 22;
  }

  // ─── 3. Uso previsto ───────────────────────────────────────────────────────
  y = seccion(page, '3. USO PREVISTO DECLARADO', y, bold);
  drawLabel(page, 'PROYECTO', data.nombreProyecto, MARGIN_X, y, bold, regular);
  drawLabel(page, 'UBICACIÓN DE APLICACIÓN', data.ubicacionAplicacion, MARGIN_X + col, y, bold, regular);
  drawLabel(page, 'COORDENADAS GPS', data.coordenadasGps ?? '', MARGIN_X + col * 2, y, bold, regular);
  y -= 26;
  drawText(page, 'CATEGORÍA (Tabla 3.2 de la metodología)', MARGIN_X, y, bold, 8, COLOR_VERDE_PRIMARIO);
  y -= 11;
  const categoria = data.categoriaUso === 'Otro' && data.categoriaUsoOtro?.trim()
    ? `Otro — ${data.categoriaUsoOtro.trim()}`
    : data.categoriaUso;
  for (const linea of wrapText(categoria, regular, 8.5, CONTENT_WIDTH - 8)) {
    drawText(page, linea, MARGIN_X + 4, y, regular, 8.5);
    y -= 10;
  }
  y -= 6;
  drawLabel(page, 'FECHA ESTIMADA DE APLICACIÓN', formatDate(data.fechaEstimadaAplicacion), MARGIN_X, y, bold, regular);
  drawLabel(page, 'DURACIÓN ESTIMADA DEL ENSAYO', data.duracionEnsayo ?? '', MARGIN_X + col, y, bold, regular);
  y -= 30;

  // ─── 4. Declaración ────────────────────────────────────────────────────────
  y = seccion(page, '4. DECLARACIÓN DE LAS PARTES', y, bold);
  for (const linea of DECLARACION) {
    drawText(page, linea, MARGIN_X + 2, y, regular, 7.8);
    y -= 9.5;
  }
  y -= 10;

  // ─── 5. Firmas ─────────────────────────────────────────────────────────────
  y = seccion(page, '5. FIRMAS', y, bold);
  const anchoCasilla = (CONTENT_WIDTH - 12) / 2;
  casillaFirma(page, MARGIN_X, y, anchoCasilla, 'POR SIRIUS — QUIEN ENTREGA', data.firmaSirius, imgSirius, bold, regular);
  casillaFirma(
    page,
    MARGIN_X + anchoCasilla + 12,
    y,
    anchoCasilla,
    'POR EL RECEPTOR — QUIEN RECIBE',
    data.firmaReceptor,
    imgReceptor,
    bold,
    regular
  );
  y -= 120;

  // ─── Pie ───────────────────────────────────────────────────────────────────
  if (data.observaciones?.trim()) {
    drawText(page, 'OBSERVACIONES', MARGIN_X, y, bold, 8, COLOR_VERDE_PRIMARIO);
    y -= 10;
    for (const linea of wrapText(data.observaciones.trim(), regular, 7.5, CONTENT_WIDTH).slice(0, 4)) {
      drawText(page, linea, MARGIN_X, y, regular, 7.5);
      y -= 9;
    }
    y -= 4;
  }

  drawText(page, `Elaborado por: ${data.elaboradoPor}${data.cargoElaboradoPor ? ` — ${data.cargoElaboradoPor}` : ''}`, MARGIN_X, y, regular, 7.5);
  y -= 10;
  for (const linea of wrapText(AVISO_METODOLOGICO, italic, 7, CONTENT_WIDTH)) {
    drawText(page, linea, MARGIN_X, y, italic, 7, COLOR_GRIS_TEXTO);
    y -= 8.5;
  }

  return await doc.save();
}

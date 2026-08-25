// src/lib/pdf-sirius.ts
//
// Primitivos de dibujo compartidos por los documentos PDF de Sirius Pirólisis
// (remisión de Blend, acta de entrega de biochar).
//
// Existen aparte porque los dos documentos son el MISMO papel institucional: mismo
// verde, misma retícula, mismas etiquetas. Tener dos copias del estilo hacía que un
// ajuste de marca dejara un documento firmado con el aspecto viejo, y que la trampa
// de `sanitizeWinAnsi` (abajo) hubiera que recordarla dos veces.
//
// Aquí NO va nada de la estructura de un documento concreto: cada generador arma
// sus secciones. Esto es la caja de lápices.

import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';

// ─── Colores corporativos ─────────────────────────────────────────────────────
export const COLOR_VERDE_PRIMARIO = rgb(0.1, 0.44, 0.19); // #1A7030
export const COLOR_VERDE_CLARO = rgb(0.82, 0.93, 0.84); // #D1EDD6
export const COLOR_GRIS_TEXTO = rgb(0.2, 0.2, 0.2); // #333333
export const COLOR_GRIS_BORDE = rgb(0.75, 0.75, 0.75); // #BFBFBF
export const COLOR_BLANCO = rgb(1, 1, 1);
export const COLOR_AMARILLO_CO2 = rgb(1.0, 0.95, 0.6); // #FFF299

// ─── Layout A4 ────────────────────────────────────────────────────────────────
export const MARGIN_X = 50;
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

export type ColorPdf = ReturnType<typeof rgb>;

export function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: ColorPdf,
  stroke?: ColorPdf
) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: fill,
    borderColor: stroke ?? fill,
    borderWidth: stroke ? 0.5 : 0,
  });
}

/**
 * Las fuentes estándar de pdf-lib codifican en WinAnsi, que NO puede representar
 * el subíndice ₂ ni un check ✓: dibujarlos lanza y tumba el documento entero. Se
 * reemplazan por equivalentes ASCII antes de dibujar, no después de fallar.
 */
export function sanitizeWinAnsi(text: string): string {
  if (!text) return text;
  return text
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))
    .replace(/[✓✔]/g, 'OK')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/•/g, '-');
}

export function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ColorPdf = COLOR_GRIS_TEXTO
) {
  const safe = sanitizeWinAnsi(text);
  try {
    page.drawText(safe, { x, y, font, size, color });
  } catch {
    // Cualquier carácter que aún no codifique WinAnsi → '?'. Un documento con un
    // signo de pregunta se puede leer; uno que no se generó, no.
    page.drawText(safe.replace(/[^\x20-\xFF]/g, '?'), { x, y, font, size, color });
  }
}

export function drawLabel(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  labelFont: PDFFont,
  valueFont: PDFFont,
  labelSize = 8,
  valueSize = 9
) {
  drawText(page, label, x, y, labelFont, labelSize, COLOR_VERDE_PRIMARIO);
  drawText(page, value || '—', x, y - 11, valueFont, valueSize);
}

/**
 * Parte un texto en líneas que caben en `maxWidth`.
 *
 * Hace falta para las observaciones y la descripción del uso previsto: son texto
 * libre, y pdf-lib no recorta — dibuja fuera de la página, donde nadie lo lee.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of sanitizeWinAnsi(text).split('\n')) {
    let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = actual ? `${actual} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(tentativa, size) > maxWidth && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = tentativa;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatKg(val: number): string {
  return `${(Number(val) || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} kg`;
}

import ExcelJS from 'exceljs';

/**
 * Lectura del ÚLTIMO registro de un archivo Excel.
 *
 * "Último" es la última fila con datos reales, no `worksheet.rowCount`: ExcelJS
 * cuenta también las filas que solo tienen formato (bordes, relleno, validaciones
 * arrastradas hacia abajo), que en una plantilla suelen ser cientos. Por eso se
 * recorre de abajo hacia arriba descartando las filas cuyas celdas quedan todas
 * vacías tras normalizar.
 */

export interface RegistroExcel {
  /** Fila real dentro de la hoja (1-indexada, como la ve el usuario en Excel). */
  fila: number;
  /** Valores indexados por encabezado; las columnas sin encabezado usan su letra. */
  valores: Record<string, string | number | boolean | null>;
}

export interface LecturaUltimoRegistro {
  hoja: string;
  encabezados: string[];
  filaEncabezado: number;
  /** Filas con datos por debajo del encabezado. */
  totalRegistros: number;
  /** `null` si la hoja solo tiene encabezado. */
  ultimoRegistro: RegistroExcel | null;
}

export interface OpcionesLectura {
  /** Nombre de la hoja, o su índice 1-based. Por defecto, la primera. */
  hoja?: string | number;
  /** Fila que contiene los encabezados (1-indexada). Por defecto, 1. */
  filaEncabezado?: number;
}

export class ExcelInvalidoError extends Error {}

type ValorNormalizado = string | number | boolean | null;

/**
 * ExcelJS no devuelve escalares: una celda puede traer un objeto de fórmula
 * (`{ formula, result }`), rich text (`{ richText: [...] }`), un hipervínculo,
 * un error (`{ error: '#N/A' }`) o un `Date`. Devolver eso crudo en el JSON
 * rompe a cualquier consumidor, así que se aplana aquí.
 */
function normalizarValor(valor: ExcelJS.CellValue): ValorNormalizado {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') {
    const limpio = valor.trim();
    return limpio === '' ? null : limpio;
  }
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === 'object') {
    if ('richText' in valor) {
      return normalizarValor(valor.richText.map((t) => t.text).join(''));
    }
    if ('formula' in valor || 'sharedFormula' in valor) {
      // Interesa el resultado calculado, no la fórmula.
      return normalizarValor((valor as ExcelJS.CellFormulaValue).result ?? null);
    }
    if ('error' in valor) return String(valor.error);
    if ('text' in valor) return normalizarValor(valor.text);
  }

  return String(valor);
}

function esFilaVacia(fila: ExcelJS.Row, columnas: number): boolean {
  for (let c = 1; c <= columnas; c++) {
    if (normalizarValor(fila.getCell(c).value) !== null) return false;
  }
  return true;
}

function seleccionarHoja(wb: ExcelJS.Workbook, hoja?: string | number): ExcelJS.Worksheet {
  const hojas = wb.worksheets;
  if (hojas.length === 0) {
    throw new ExcelInvalidoError('El archivo no tiene hojas.');
  }

  if (hoja === undefined || hoja === '') return hojas[0];

  if (typeof hoja === 'number') {
    const encontrada = hojas[hoja - 1];
    if (!encontrada) {
      throw new ExcelInvalidoError(`La hoja #${hoja} no existe (el archivo tiene ${hojas.length}).`);
    }
    return encontrada;
  }

  const porNombre = hojas.find((h) => h.name.trim().toLowerCase() === hoja.trim().toLowerCase());
  if (!porNombre) {
    throw new ExcelInvalidoError(
      `No existe la hoja "${hoja}". Disponibles: ${hojas.map((h) => h.name).join(', ')}`
    );
  }
  return porNombre;
}

export async function leerUltimoRegistro(
  buffer: Buffer,
  opciones: OpcionesLectura = {}
): Promise<LecturaUltimoRegistro> {
  const filaEncabezado = opciones.filaEncabezado ?? 1;
  if (!Number.isInteger(filaEncabezado) || filaEncabezado < 1) {
    throw new ExcelInvalidoError('filaEncabezado debe ser un entero mayor o igual a 1.');
  }

  const wb = new ExcelJS.Workbook();
  try {
    // El tipado de ExcelJS pide su propio ArrayBuffer; el Buffer de Node sirve en runtime.
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new ExcelInvalidoError(`No se pudo leer el archivo como Excel (.xlsx): ${detalle}`);
  }

  const ws = seleccionarHoja(wb, opciones.hoja);
  const columnas = Math.max(ws.columnCount, ws.getRow(filaEncabezado).cellCount);

  const encabezados: string[] = [];
  for (let c = 1; c <= columnas; c++) {
    const bruto = normalizarValor(ws.getRow(filaEncabezado).getCell(c).value);
    // Sin encabezado se usa la letra de columna: perder la columna sería peor que nombrarla feo.
    encabezados.push(bruto === null ? String(ws.getColumn(c).letter) : String(bruto));
  }

  let ultimaConDatos = 0;
  for (let f = ws.rowCount; f > filaEncabezado; f--) {
    if (!esFilaVacia(ws.getRow(f), columnas)) {
      ultimaConDatos = f;
      break;
    }
  }

  let totalRegistros = 0;
  for (let f = filaEncabezado + 1; f <= ultimaConDatos; f++) {
    if (!esFilaVacia(ws.getRow(f), columnas)) totalRegistros++;
  }

  if (ultimaConDatos === 0) {
    return { hoja: ws.name, encabezados, filaEncabezado, totalRegistros: 0, ultimoRegistro: null };
  }

  const fila = ws.getRow(ultimaConDatos);
  const valores: Record<string, ValorNormalizado> = {};
  encabezados.forEach((nombre, i) => {
    valores[nombre] = normalizarValor(fila.getCell(i + 1).value);
  });

  return {
    hoja: ws.name,
    encabezados,
    filaEncabezado,
    totalRegistros,
    ultimoRegistro: { fila: ultimaConDatos, valores },
  };
}

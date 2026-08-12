/**
 * @jest-environment node
 */
import ExcelJS from 'exceljs';
import { ExcelInvalidoError, leerUltimoRegistro } from '@/lib/excel-ultimo-registro';

async function construirLibro(configurar: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  configurar(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('leerUltimoRegistro', () => {
  it('devuelve la última fila con datos y normaliza fechas y fórmulas', async () => {
    const buffer = await construirLibro((wb) => {
      const ws = wb.addWorksheet('Novedades');
      ws.addRow(['Cedula', 'Nombre', 'Fecha', 'Dias', 'Total']);
      ws.addRow(['1030', 'Kevin Avila', new Date('2026-07-21T00:00:00Z'), 5, { formula: 'D2*2', result: 10 }]);
      ws.addRow(['1044', "O'Brien", new Date('2026-08-01T00:00:00Z'), 3, { formula: 'D3*2', result: 6 }]);
    });

    const lectura = await leerUltimoRegistro(buffer);

    expect(lectura.hoja).toBe('Novedades');
    expect(lectura.totalRegistros).toBe(2);
    expect(lectura.ultimoRegistro).toEqual({
      fila: 3,
      valores: {
        Cedula: '1044',
        Nombre: "O'Brien",
        Fecha: '2026-08-01T00:00:00.000Z',
        Dias: 3,
        Total: 6,
      },
    });
  });

  it('ignora las filas que solo tienen formato', async () => {
    const buffer = await construirLibro((wb) => {
      const ws = wb.addWorksheet('Hoja1');
      ws.addRow(['A', 'B']);
      ws.addRow([1, 2]);
      ws.getRow(40).getCell(1).border = { top: { style: 'thin' } };
    });

    const lectura = await leerUltimoRegistro(buffer);

    expect(lectura.ultimoRegistro?.fila).toBe(2);
    expect(lectura.totalRegistros).toBe(1);
  });

  it('respeta filaEncabezado y no cuenta las filas por encima', async () => {
    const buffer = await construirLibro((wb) => {
      const ws = wb.addWorksheet('Hoja1');
      ws.addRow(['REPORTE DE NOMINA']);
      ws.addRow([]);
      ws.addRow(['Cedula', 'Dias']);
      ws.addRow(['1030', 5]);
    });

    const lectura = await leerUltimoRegistro(buffer, { filaEncabezado: 3 });

    expect(lectura.encabezados).toEqual(['Cedula', 'Dias']);
    expect(lectura.totalRegistros).toBe(1);
    expect(lectura.ultimoRegistro?.valores).toEqual({ Cedula: '1030', Dias: 5 });
  });

  it('selecciona la hoja por nombre y por índice', async () => {
    const buffer = await construirLibro((wb) => {
      wb.addWorksheet('Primera').addRow(['A']);
      const segunda = wb.addWorksheet('Segunda');
      segunda.addRow(['A']);
      segunda.addRow(['x']);
    });

    expect((await leerUltimoRegistro(buffer, { hoja: 'segunda' })).ultimoRegistro?.valores).toEqual({ A: 'x' });
    expect((await leerUltimoRegistro(buffer, { hoja: 2 })).hoja).toBe('Segunda');
    await expect(leerUltimoRegistro(buffer, { hoja: 'Tercera' })).rejects.toThrow(ExcelInvalidoError);
  });

  it('devuelve null cuando la hoja solo tiene encabezado', async () => {
    const buffer = await construirLibro((wb) => {
      wb.addWorksheet('Hoja1').addRow(['Cedula', 'Dias']);
    });

    const lectura = await leerUltimoRegistro(buffer);

    expect(lectura.ultimoRegistro).toBeNull();
    expect(lectura.totalRegistros).toBe(0);
  });

  it('rechaza un archivo que no es xlsx', async () => {
    await expect(leerUltimoRegistro(Buffer.from('no soy un excel'))).rejects.toThrow(ExcelInvalidoError);
  });
});

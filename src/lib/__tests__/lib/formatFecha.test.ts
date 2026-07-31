import { formatFecha } from '@/lib/inventario.format';

/**
 * `formatFecha` sobre cadenas `YYYY-MM-DD`.
 *
 * El bug: `new Date('2026-06-24')` es medianoche UTC, y al renderizar en la zona de
 * Colombia (UTC-5) caía al día anterior. El lote `BLEND-2026-06-24` se mostraba como
 * "23 de jun de 2026". Los campos `date` de Airtable llegan siempre sin hora, así
 * que afectaba a toda fecha de la app, no solo a los lotes.
 */
describe('formatFecha con fechas sin hora', () => {
  it('no corre el día de una fecha ISO sin hora', () => {
    // El día debe ser 24, no 23, independientemente de la zona del proceso.
    expect(formatFecha('2026-06-24')).toContain('24');
    expect(formatFecha('2026-04-30')).toContain('30');
  });

  it('respeta el mes y el año', () => {
    const salida = formatFecha('2026-01-01');
    expect(salida).toContain('1');
    expect(salida).toContain('2026');
  });

  it('no corre el día en el primero de mes, donde el error cambiaba también el mes', () => {
    // '2026-03-01' en UTC-5 se veía como 28 de febrero: el peor caso del bug.
    expect(formatFecha('2026-03-01')).toContain('mar');
  });

  it('tolera espacios alrededor', () => {
    expect(formatFecha('  2026-06-24  ')).toContain('24');
  });

  it('devuelve — cuando no hay fecha o es inválida', () => {
    expect(formatFecha(null)).toBe('—');
    expect(formatFecha(undefined)).toBe('—');
    expect(formatFecha('')).toBe('—');
    expect(formatFecha('no es fecha')).toBe('—');
  });

  it('sigue formateando cadenas con hora, que sí son un instante real', () => {
    expect(formatFecha('2026-06-24T18:00:00.000Z')).toContain('2026');
  });
});

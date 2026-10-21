/**
 * @jest-environment node
 */

/**
 * Fechas de negocio en Bogotá. Lo que se protege: que después de las 19:00 el
 * día siga siendo el de la planta (UTC ya es mañana), y que el vencimiento de un
 * enlace caiga al final del día en Bogotá y no a medianoche UTC.
 */

import {
  fechaBogota,
  fechaHoraBogotaLegible,
  fechaLegible,
  finDelDiaBogotaSeg,
  horaBogota,
  sumarDiasFecha,
} from '@/lib/fecha-bogota';

describe('fechaBogota y horaBogota (de @sirius/solicitudes/fecha)', () => {
  it('a las 22:30 en Bogotá sigue siendo el mismo día aunque en UTC ya sea el siguiente', () => {
    expect(fechaBogota(new Date('2026-10-22T03:30:00Z'))).toBe('2026-10-21');
    expect(fechaBogota(new Date('2026-10-22T05:00:00Z'))).toBe('2026-10-22');
  });

  it('la hora va en 24 h y la medianoche es 00:00', () => {
    expect(horaBogota(new Date('2026-10-21T20:04:00Z'))).toBe('15:04');
    expect(horaBogota(new Date('2026-10-22T05:00:00Z'))).toBe('00:00');
  });
});

describe('sumarDiasFecha', () => {
  it('cruza meses, años y febrero bisiesto, y acepta días negativos', () => {
    expect(sumarDiasFecha('2026-10-21', 7)).toBe('2026-10-28');
    expect(sumarDiasFecha('2026-10-28', 7)).toBe('2026-11-04');
    expect(sumarDiasFecha('2026-12-30', 3)).toBe('2027-01-02');
    expect(sumarDiasFecha('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDiasFecha('2026-03-01', -1)).toBe('2026-02-28');
    expect(sumarDiasFecha('2026-10-21', 0)).toBe('2026-10-21');
  });

  it('rechaza fechas imposibles en vez de correrlas, y días no enteros', () => {
    expect(() => sumarDiasFecha('2026-02-30', 1)).toThrow(RangeError);
    expect(() => sumarDiasFecha('2026-13-01', 1)).toThrow(RangeError);
    expect(() => sumarDiasFecha('21/10/2026', 1)).toThrow(RangeError);
    expect(() => sumarDiasFecha('2026-10-21T00:00:00Z', 1)).toThrow(RangeError);
    expect(() => sumarDiasFecha('2026-10-21', 1.5)).toThrow(RangeError);
    expect(() => sumarDiasFecha('2026-10-21', Number.NaN)).toThrow(RangeError);
  });
});

describe('finDelDiaBogotaSeg', () => {
  it('es 23:59:59 −05:00: en UTC ya son las 04:59:59 del día siguiente', () => {
    const seg = finDelDiaBogotaSeg('2026-10-28');
    expect(Number.isInteger(seg)).toBe(true);
    expect(new Date(seg * 1000).toISOString()).toBe('2026-10-29T04:59:59.000Z');
  });

  it('el último segundo todavía es ese día en Bogotá; el siguiente ya no', () => {
    const seg = finDelDiaBogotaSeg('2026-12-31');
    expect(fechaBogota(new Date(seg * 1000))).toBe('2026-12-31');
    expect(fechaBogota(new Date((seg + 1) * 1000))).toBe('2027-01-01');
  });

  it('rechaza una fecha inválida', () => {
    expect(() => finDelDiaBogotaSeg('2026-02-29')).toThrow(RangeError);
  });
});

describe('fechaLegible y fechaHoraBogotaLegible', () => {
  it('formatea la fecha sin pasar por new Date (que la correría un día)', () => {
    expect(fechaLegible('2026-10-28')).toBe('28 de octubre de 2026');
    expect(fechaLegible('2027-01-01')).toBe('1 de enero de 2027');
  });

  it('devuelve tal cual lo que no es una fecha', () => {
    expect(fechaLegible('pendiente')).toBe('pendiente');
    expect(fechaLegible('2026-02-30')).toBe('2026-02-30');
  });

  it('un instante sale con fecha y hora de Bogotá', () => {
    expect(fechaHoraBogotaLegible('2026-10-21T20:04:05.123Z')).toBe('21 de octubre de 2026, 15:04');
    // 22:30 en Bogotá: en UTC ya es el 22.
    expect(fechaHoraBogotaLegible('2026-10-22T03:30:00Z')).toBe('21 de octubre de 2026, 22:30');
  });

  it('una fecha sola no se lee como medianoche UTC (sería el día anterior a las 19:00)', () => {
    expect(fechaHoraBogotaLegible('2026-10-21')).toBe('21 de octubre de 2026');
  });

  it('vacío y basura no revientan', () => {
    expect(fechaHoraBogotaLegible('')).toBe('');
    expect(fechaHoraBogotaLegible('no es una fecha')).toBe('no es una fecha');
  });
});

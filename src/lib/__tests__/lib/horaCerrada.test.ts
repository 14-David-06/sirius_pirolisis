/**
 * @jest-environment node
 */
import { esHoraCerrada } from '@/lib/balance-desde-registro';

describe('esHoraCerrada', () => {
  it('reconoce las horas cerradas en UTC', () => {
    expect(esHoraCerrada('2026-08-13T08:00:00.000Z')).toBe(true);
    expect(esHoraCerrada('2026-08-13T13:00:00.000Z')).toBe(true);
    expect(esHoraCerrada('2026-08-13T00:00:00.000Z')).toBe(true);
  });

  it('ignora los segundos: la marca del PLC puede caer en 8:00:37', () => {
    expect(esHoraCerrada('2026-08-13T08:00:37.000Z')).toBe(true);
    expect(esHoraCerrada('2026-08-13T08:00:59.999Z')).toBe(true);
  });

  it('no marca las filas que sí son lonas', () => {
    expect(esHoraCerrada('2026-08-13T08:05:00.000Z')).toBe(false);
    expect(esHoraCerrada('2026-08-13T08:59:00.000Z')).toBe(false);
    expect(esHoraCerrada('2026-08-13T08:01:00.000Z')).toBe(false);
  });

  // El offset de Colombia es de horas enteras, así que la hora cerrada local sigue
  // siendo minuto 0 en UTC: no hace falta convertir de zona para detectarla.
  it('detecta la hora cerrada local aunque el ISO venga en UTC', () => {
    expect(esHoraCerrada('2026-08-13T08:00:00-05:00')).toBe(true);
    expect(esHoraCerrada('2026-08-13T08:30:00-05:00')).toBe(false);
  });

  it('no revienta con una fecha inválida', () => {
    expect(esHoraCerrada('no es fecha')).toBe(false);
  });
});

/**
 * El reparto de un despacho de Blend entre lotes, cuando el operador digita los KG
 * del viaje (entregas programadas, 2026-11-06).
 *
 * Lo que tiene que sostener: los lotes del pedido se vacían antes que los libres,
 * un viaje parcial no toca el lote siguiente si el primero alcanza, y un total
 * que los lotes no cubren no produce un reparto que el servidor rechazaría.
 */

import { repartirKgEnLotes } from '@/app/inventario-bodega-sirius/comunes';

// Lo que había el 2026-11-06: la tonelada sin pedido, en dos lotes.
const LIBRES = [
  { lote: 'BLEND-2026-10-27', kgDisponibles: 902.21 },
  { lote: 'BLEND-2026-10-28', kgDisponibles: 100 },
];

describe('repartirKgEnLotes', () => {
  it('una tonelada sale de los dos lotes libres, el más viejo primero', () => {
    const r = repartirKgEnLotes(LIBRES, 1000);
    expect(r?.map(({ lote, kg }) => ({ lote, kg }))).toEqual([
      { lote: 'BLEND-2026-10-27', kg: 902.21 },
      { lote: 'BLEND-2026-10-28', kg: 97.79 },
    ]);
  });

  it('un viaje parcial no toca el lote siguiente si el primero alcanza', () => {
    const lotes = [{ lote: 'BLEND-2026-11-09-SIRIUS-PED-0134', kgDisponibles: 2000 }, ...LIBRES];
    const r = repartirKgEnLotes(lotes, 1000);
    expect(r?.map(({ lote, kg }) => ({ lote, kg }))).toEqual([
      { lote: 'BLEND-2026-11-09-SIRIUS-PED-0134', kg: 1000 },
    ]);
  });

  it('salta lotes vacíos y redondea a centésimas sin perder el total', () => {
    const lotes = [
      { lote: 'A', kgDisponibles: 0 },
      { lote: 'B', kgDisponibles: 333.333 },
      { lote: 'C', kgDisponibles: 1000 },
    ];
    const r = repartirKgEnLotes(lotes, 500);
    expect(r?.map(({ lote, kg }) => ({ lote, kg }))).toEqual([
      { lote: 'B', kg: 333.33 },
      { lote: 'C', kg: 166.67 },
    ]);
    expect(Math.round((r ?? []).reduce((t, l) => t + l.kg, 0) * 100) / 100).toBe(500);
  });

  it('devuelve null si los lotes no alcanzan o los kg no son positivos', () => {
    expect(repartirKgEnLotes(LIBRES, 1002.22)).toBeNull();
    expect(repartirKgEnLotes(LIBRES, 0)).toBeNull();
    expect(repartirKgEnLotes(LIBRES, -5)).toBeNull();
    expect(repartirKgEnLotes(LIBRES, Number.NaN)).toBeNull();
  });

  it('entrega el lote original para que la pantalla sepa si es del pedido', () => {
    const r = repartirKgEnLotes(LIBRES, 50);
    expect(r?.[0].origen).toBe(LIBRES[0]);
  });
});

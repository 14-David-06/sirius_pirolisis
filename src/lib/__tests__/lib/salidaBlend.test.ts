import { lotesDeNotas } from '@/lib/blend-remisiones-core';
import { marcasDeLotes, referenciaSalidaBlend } from '@/lib/salida-blend';
import { esSalidaNoComercial } from '@/lib/salida-bache.constants';

/**
 * Una salida de Blend es UN movimiento aunque cubra varios lotes: el reparto
 * viaja en sus marcas, y `lotesDisponiblesBlend()` lo lee con `lotesDeNotas()`.
 * Si las dos puntas no hablan el mismo formato, un lote carga con lo que salió
 * de otro.
 */
describe('marcasDeLotes', () => {
  it('lo que escribe una salida multilote se lee con el mismo reparto', () => {
    const reparto = [
      { lote: 'BLEND-2026-09-24-SIRIUS-PED-0093', kg: 32.21 },
      { lote: 'BLEND-2026-10-20', kg: 27.79 },
    ];
    const notas = `Salida de Biochar Blend — Muestra · ${marcasDeLotes(reparto)} · [SALIDA:SAL-MUE-2026-10-20]`;
    expect(lotesDeNotas(notas, 60)).toEqual(reparto);
  });

  it('con un solo lote no hace falta el reparto: todo es de ese lote', () => {
    const notas = marcasDeLotes([{ lote: 'BLEND-2026-10-20', kg: 10 }]);
    expect(notas).not.toContain('kg-lote');
    expect(lotesDeNotas(notas, 10)).toEqual([{ lote: 'BLEND-2026-10-20', kg: 10 }]);
  });
});

describe('referenciaSalidaBlend', () => {
  it('la primera del día no lleva número y las siguientes sí', () => {
    expect(referenciaSalidaBlend('muestra', '2026-10-20')).toBe('SAL-MUE-2026-10-20');
    expect(referenciaSalidaBlend('muestra', '2026-10-20', 2)).toBe('SAL-MUE-2026-10-20-2');
  });

  it('cuenta como salida no comercial, aparte de lo despachado', () => {
    expect(esSalidaNoComercial(referenciaSalidaBlend('laboratorio', '2026-10-20'))).toBe(true);
  });
});

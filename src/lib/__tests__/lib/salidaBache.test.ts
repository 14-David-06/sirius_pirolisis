import {
  bacheDeReferencia,
  esMotivoSalida,
  esMotivoSalidaBlend,
  esReferenciaEntrega,
  esSalidaNoComercial,
  marcaSalida,
  MOTIVOS_SALIDA,
  referenciaBaseLibre,
  referenciaBaseSalida,
  referenciaSalida,
  repartirEnOrden,
  repartirSalidaFIFO,
} from '@/lib/salida-bache.constants';

/**
 * La referencia de una salida de bache es su llave de idempotencia: es lo que
 * impide que un doble clic descuente 487 kg dos veces, y lo que permite que un
 * reintento COMPLETE una salida a la que le faltó un paso en vez de duplicarla.
 *
 * Se prueba aquí porque es pura; el camino que la usa toca dos bases de Airtable.
 */
describe('referenciaSalida', () => {
  it('es determinista: mismo motivo, fecha y bache → misma referencia', () => {
    const a = referenciaSalida('laboratorio', '2026-08-05', 'S-00171');
    const b = referenciaSalida('laboratorio', '2026-08-05', 'S-00171');
    expect(a).toBe(b);
    expect(a).toBe('SAL-LAB-2026-08-05-S-00171');
  });

  it('distingue el motivo, para que dos salidas distintas del mismo bache no colisionen', () => {
    expect(referenciaSalida('muestra', '2026-08-05', 'S-00171')).not.toBe(
      referenciaSalida('laboratorio', '2026-08-05', 'S-00171')
    );
  });

  it('distingue la fecha', () => {
    expect(referenciaSalida('merma', '2026-08-05', 'S-00171')).not.toBe(
      referenciaSalida('merma', '2026-08-06', 'S-00171')
    );
  });

  it('usa el prefijo declarado de cada motivo', () => {
    for (const [motivo, info] of Object.entries(MOTIVOS_SALIDA)) {
      expect(referenciaSalida(motivo as keyof typeof MOTIVOS_SALIDA, '2026-08-05', 'S-1')).toContain(
        `SAL-${info.prefijo}-`
      );
    }
  });
});

describe('marcaSalida', () => {
  it('encierra la referencia entre corchetes para que un bache no matchee a otro', () => {
    // Sin los corchetes, buscar la marca de S-00171 encontraría también S-001710.
    const marca = marcaSalida(referenciaSalida('laboratorio', '2026-08-05', 'S-00171'));
    const otra = marcaSalida(referenciaSalida('laboratorio', '2026-08-05', 'S-001710'));
    expect(otra.includes(marca)).toBe(false);
  });
});

describe('esMotivoSalida', () => {
  it('acepta los motivos declarados', () => {
    for (const motivo of Object.keys(MOTIVOS_SALIDA)) {
      expect(esMotivoSalida(motivo)).toBe(true);
    }
  });

  it('rechaza cualquier otra cosa: el motivo llega del body de un POST', () => {
    for (const valor of ['LABORATORIO', 'venta', '', null, undefined, 7, {}]) {
      expect(esMotivoSalida(valor)).toBe(false);
    }
  });
});

/**
 * La salida se pide como total y se reparte por bache: el reparto decide de qué
 * bache sale cada kg, que es lo que sostiene la contabilidad de carbono.
 */
describe('repartirSalidaFIFO', () => {
  const BACHES = [
    { codigo: 'S-00144', kg: 100 },
    { codigo: 'S-00139', kg: 30 },
    { codigo: 'S-00165', kg: 89.77 },
    { codigo: 'S-00128', kg: 0 },
  ];

  it('toma primero el bache más antiguo y salta los vacíos', () => {
    expect(repartirSalidaFIFO(BACHES, 20)).toEqual([{ codigo: 'S-00139', kg: 20 }]);
  });

  it('vacía un bache y sigue con el siguiente hasta cuadrar el total', () => {
    expect(repartirSalidaFIFO(BACHES, 75)).toEqual([
      { codigo: 'S-00139', kg: 30 },
      { codigo: 'S-00144', kg: 45 },
    ]);
  });

  it('devuelve null si el total excede lo que hay', () => {
    expect(repartirSalidaFIFO(BACHES, 220)).toBeNull();
    expect(repartirSalidaFIFO(BACHES, 219.77)).toHaveLength(3);
  });
});

describe('referenciaBaseLibre', () => {
  it('la primera salida del día conserva la referencia de siempre', () => {
    expect(referenciaBaseLibre('muestra', '2026-10-20', ['S-00139'], () => false)).toBeUndefined();
  });

  it('una segunda salida del mismo bache el mismo día no se confunde con un reintento', () => {
    const existentes = new Set(['SAL-MUE-2026-10-20-S-00139']);
    const base = referenciaBaseLibre('muestra', '2026-10-20', ['S-00139', 'S-00144'], (r) => existentes.has(r));
    expect(base).toBe('SAL-MUE-2026-10-20-2');
    expect(referenciaSalida('muestra', '2026-10-20', 'S-00139', base)).toBe('SAL-MUE-2026-10-20-2-S-00139');
    expect(referenciaBaseSalida('muestra', '2026-10-20', 1)).toBeUndefined();
  });

  it('las entregas numeradas siguen teniendo acta y siguen siendo no comerciales', () => {
    const ref = referenciaSalida('entrega', '2026-10-20', 'S-00139', referenciaBaseSalida('entrega', '2026-10-20', 2));
    expect(esReferenciaEntrega(ref)).toBe(true);
    expect(bacheDeReferencia(ref)).toBe('S-00139');
    expect(esSalidaNoComercial(ref)).toBe(true);
  });
});

describe('repartirEnOrden (lotes de Blend)', () => {
  it('respeta el orden de llegada —la fecha del lote—, no el código', () => {
    const lotes = [
      { codigo: 'SAL-GUAICARAMO-2025-08-01', kg: 0 },
      { codigo: 'BLEND-2026-09-24-SIRIUS-PED-0093', kg: 32.21 },
      { codigo: 'BLEND-2026-10-16', kg: 100 },
    ];
    expect(repartirEnOrden(lotes, 40)).toEqual([
      { codigo: 'BLEND-2026-09-24-SIRIUS-PED-0093', kg: 32.21 },
      { codigo: 'BLEND-2026-10-16', kg: 7.79 },
    ]);
  });
});

describe('esMotivoSalidaBlend', () => {
  it('no ofrece la entrega: sin acta no hay dónde guardar quién recibe', () => {
    expect(esMotivoSalidaBlend('muestra')).toBe(true);
    expect(esMotivoSalidaBlend('entrega')).toBe(false);
  });
});

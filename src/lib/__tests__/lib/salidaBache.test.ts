import {
  esMotivoSalida,
  marcaSalida,
  MOTIVOS_SALIDA,
  referenciaSalida,
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

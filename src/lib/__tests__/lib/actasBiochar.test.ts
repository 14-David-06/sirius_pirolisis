import {
  codigoActa,
  consecutivoDeCodigo,
  esTipoBiochar,
  normalizarHumedad,
  TIPO_BIOCHAR,
} from '@/lib/actas-biochar.constants';

/**
 * La humedad del acta es INFORMATIVA: la planta maneja todo en masa seca y no hay
 * conversión. Se sanea igual porque viene de un lookup de texto libre del monitoreo
 * y termina impresa en un documento firmado.
 */
describe('normalizarHumedad', () => {
  it('deja pasar un porcentaje razonable', () => {
    expect(normalizarHumedad(12.2)).toBe(12.2);
    expect(normalizarHumedad('12.2')).toBe(12.2);
  });

  it('devuelve 0 cuando no hay dato', () => {
    for (const v of [undefined, null, '', NaN, 0, -5]) expect(normalizarHumedad(v)).toBe(0);
  });

  it('topa la humedad en 99% para no imprimir un absurdo', () => {
    expect(normalizarHumedad(1000)).toBe(99);
  });
});

describe('consecutivo del acta', () => {
  it('formatea el código con cuatro dígitos', () => {
    expect(codigoActa(1)).toBe('ACTA-BC-0001');
    expect(codigoActa(147)).toBe('ACTA-BC-0147');
  });

  it('es la inversa de consecutivoDeCodigo', () => {
    for (const n of [1, 9, 10, 99, 100, 1234]) {
      expect(consecutivoDeCodigo(codigoActa(n))).toBe(n);
    }
  });

  it('devuelve 0 ante cualquier cosa que no sea un código de acta', () => {
    // El consecutivo se calcula como el mayor existente + 1: un valor basura que
    // devolviera NaN dejaría el siguiente código en "ACTA-BC-NaN".
    for (const valor of ['', null, undefined, 'ACTA-BC', 'REM-0001', 'ACTA-BC-abc', 7]) {
      expect(consecutivoDeCodigo(valor)).toBe(0);
    }
  });
});

describe('validadores del body del POST', () => {
  it('acepta solo los dos tipos de biochar', () => {
    expect(esTipoBiochar(TIPO_BIOCHAR.puro)).toBe(true);
    expect(esTipoBiochar(TIPO_BIOCHAR.blend)).toBe(true);
    // El tipo decide de qué libro mayor se descuenta, así que un valor fuera de
    // los dos no puede caer en una rama por defecto.
    for (const v of ['puro', 'Biochar', '', null, 3]) expect(esTipoBiochar(v)).toBe(false);
  });
});

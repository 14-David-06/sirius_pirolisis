import { ESTADO_BACHE, estadoTrasConsumo } from '@/lib/baches-biochar';

/**
 * `estadoTrasConsumo` decide el nuevo `Estado Bache` después de consumirle biochar.
 *
 * Es la regla que hace de la tabla de baches un HISTORIAL: los baches no se borran,
 * cambian de estado a medida que se vacían. Se prueba aquí porque es pura y porque
 * el camino que la usa (producir Blend desde la app) toca cuatro bases de Airtable
 * y no se puede ejercitar en un test.
 */
describe('estadoTrasConsumo', () => {
  it('deja el bache Agotado cuando se consume todo', () => {
    expect(estadoTrasConsumo(500, 500, ESTADO_BACHE.completoBodega)).toBe(ESTADO_BACHE.agotado);
  });

  it('deja el bache Incompleto cuando se consume una parte', () => {
    expect(estadoTrasConsumo(500, 200, ESTADO_BACHE.completoBodega)).toBe(ESTADO_BACHE.incompleto);
  });

  it('trata como agotado un resto por debajo de la tolerancia de redondeo', () => {
    // El reparto entre baches redondea a 2 decimales: un bache puede quedar con
    // milésimas que no existen físicamente y no deben dejarlo como "Incompleto".
    expect(estadoTrasConsumo(500, 499.995, ESTADO_BACHE.completoBodega)).toBe(ESTADO_BACHE.agotado);
  });

  it('trata como agotado un bache que queda en negativo', () => {
    // Pasa de verdad: S-00177 quedó en −0,18 kg porque se le descontó más de lo que
    // tenía. La fórmula de Airtable permite negativos; el estado no debe quedarse en
    // "Completo" por eso.
    expect(estadoTrasConsumo(500, 500.18, ESTADO_BACHE.completoBodega)).toBe(ESTADO_BACHE.agotado);
  });

  it('no cambia nada si no se consumió biochar', () => {
    expect(estadoTrasConsumo(500, 0, ESTADO_BACHE.completoBodega)).toBeNull();
  });

  it('no cambia nada si el consumo es negativo (dato corrupto)', () => {
    expect(estadoTrasConsumo(500, -10, ESTADO_BACHE.completoBodega)).toBeNull();
  });

  it('devuelve null si el estado que corresponde ya es el actual', () => {
    // Evita PATCHes inútiles cuando se consume dos veces del mismo bache parcial.
    expect(estadoTrasConsumo(300, 100, ESTADO_BACHE.incompleto)).toBeNull();
    expect(estadoTrasConsumo(300, 300, ESTADO_BACHE.agotado)).toBeNull();
  });

  it('pasa de Incompleto a Agotado al consumir el resto', () => {
    expect(estadoTrasConsumo(120, 120, ESTADO_BACHE.incompleto)).toBe(ESTADO_BACHE.agotado);
  });

  it('marca Incompleto un bache de planta que se empieza a consumir', () => {
    // La rama de planta se filtra antes de llegar aquí en el script de sincronización,
    // pero si un consumo llega, el estado debe reflejar que ya no está completo.
    expect(estadoTrasConsumo(500, 50, ESTADO_BACHE.completoPlanta)).toBe(ESTADO_BACHE.incompleto);
  });
});

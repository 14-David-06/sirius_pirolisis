import { MATERIAS_PRIMAS, calcularCapacidadBlend } from '@/lib/bodega.constants';

/**
 * `calcularCapacidadBlend` es la respuesta a "hasta dónde alcanza la materia prima
 * de bodega", y la dan DOS pantallas: /bodega y /calendario-blend. Antes cada una
 * tenía su cuenta, así que la bodega podía decir "sin stock suficiente para
 * producir" al lado de una agenda que daba los pedidos por cubiertos.
 *
 * Las proporciones se leen del registro y no se escriben a mano: vienen de env vars
 * (`BLEND_PCT_*`) y fijarlas aquí haría fallar el test al cambiarlas, no al romper
 * la regla.
 */
const PCT = {
  biochar: MATERIAS_PRIMAS.biochar.pctBlend,
  bioabono: MATERIAS_PRIMAS.bioabono.pctBlend,
  biologicos: MATERIAS_PRIMAS.biologicos.pctBlend,
};

describe('calcularCapacidadBlend', () => {
  it('la materia prima más escasa respecto a su proporción es la que limita', () => {
    // Biochar y bioabono alcanzan para ~240 t y ~45 t; 7 L de biológicos, para 1 t.
    const capacidad = calcularCapacidadBlend({
      biochar: 48_273.53,
      bioabono: 33_614,
      biologicos: 7,
    });

    expect(capacidad.limitante).toBe('biologicos');
    expect(capacidad.kgBlend).toBe(Math.floor(7 / PCT.biologicos));
  });

  it('sin biológicos la capacidad es 0 aunque haya toneladas de las otras dos', () => {
    // El caso real de la planta el 2026-08-11: 48 t de biochar y 33 t de bioabono
    // en bodega, y aun así no se puede producir un solo kg de Blend.
    const capacidad = calcularCapacidadBlend({
      biochar: 48_273.53,
      bioabono: 33_614,
      biologicos: 0,
    });

    expect(capacidad.kgBlend).toBe(0);
    expect(capacidad.limitante).toBe('biologicos');
  });

  it('expone cuánto alcanza cada materia prima por separado', () => {
    const capacidad = calcularCapacidadBlend({
      biochar: 1_000,
      bioabono: 1_000,
      biologicos: 10,
    });

    expect(capacidad.porMateria).toEqual({
      biochar: Math.floor(1_000 / PCT.biochar),
      bioabono: Math.floor(1_000 / PCT.bioabono),
      biologicos: Math.floor(10 / PCT.biologicos),
    });
  });

  it('un stock negativo cuenta como 0, no como capacidad negativa', () => {
    // Las fórmulas de Airtable admiten negativos: un bache al que se le descontó
    // más de lo que tenía dejó a S-00177 en −0,18 kg. Sin el tope, la capacidad
    // salía negativa y el "alcanza para" perdía sentido.
    const capacidad = calcularCapacidadBlend({
      biochar: -0.18,
      bioabono: 33_614,
      biologicos: 100,
    });

    expect(capacidad.kgBlend).toBe(0);
    expect(capacidad.limitante).toBe('biochar');
    expect(capacidad.porMateria.biochar).toBe(0);
  });

  it('una materia prima ausente del stock no revienta la cuenta', () => {
    const capacidad = calcularCapacidadBlend({ bioabono: 1_000 });

    expect(capacidad.kgBlend).toBe(0);
    expect(capacidad.porMateria.biologicos).toBe(0);
  });
});

/**
 * @jest-environment node
 */

/**
 * Saldo de biochar por bache según el libro mayor (Inventario Production Core).
 *
 * Lo que se protege: que extraer `saldosPorBache()` como función pura no cambió
 * lo que devuelve `fetchBachesBiocharCore()` —la bodega, la producción de Blend y
 * la salida lo usan para decidir de dónde sale cada kg—, y que `saldoDeBaches()`
 * lea solo los movimientos de los baches pedidos, con la fórmula escapada.
 * Datos inventados.
 */

import { AirtableFalso } from '@/test-utils/airtable-falso';
import type { MovimientoBiocharPuro } from '@/lib/biochar-inventario-core';

const B_INV = 'baseInvFalsa';
const T_MOV = 'tblMovimientos';
const PURO = 'PRODUCTO-PURO-FALSO';

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_BASE_SIRIUS_INVENTARIO: B_INV,
    AIRTABLE_API_KEY_SIRIUS_INVENTARIO: 'token-falso',
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: T_MOV,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PURO,
  });
}

type Modulo = typeof import('@/lib/biochar-inventario-core');
let mod: Modulo;

beforeAll(async () => {
  entorno();
  mod = await import('@/lib/biochar-inventario-core');
});

afterEach(() => jest.restoreAllMocks());

function mov(o: Partial<MovimientoBiocharPuro> & Pick<MovimientoBiocharPuro, 'tipo' | 'kg' | 'bache'>): MovimientoBiocharPuro {
  return {
    id: `rec-${Math.random()}`,
    codigo: 'INV-MOV-0000',
    destino: '',
    ubicacionDestino: '',
    documento: '',
    fecha: '2026-10-01T12:00:00.000Z',
    motivo: '',
    observaciones: '',
    ...o,
  };
}

/**
 * El algoritmo tal como estaba DENTRO de `fetchBachesBiocharCore()` antes de
 * extraerlo, copiado aquí como oráculo: si alguien cambia `saldosPorBache()`, este
 * test dice en qué se aparta de lo que la app hacía.
 */
function saldosAntes(movimientos: MovimientoBiocharPuro[]) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const porBache = new Map<string, { codigo: string; kg: number; kgIngresado: number; kgConsumido: number; lotes: string[] }>();
  for (const m of movimientos) {
    if (!m.bache) continue;
    const a = porBache.get(m.bache) ?? { codigo: m.bache, kg: 0, kgIngresado: 0, kgConsumido: 0, lotes: [] };
    if (m.tipo === 'Entrada') {
      a.kgIngresado += m.kg;
      a.kg += m.kg;
    } else if (m.tipo === 'Salida') {
      a.kgConsumido += m.kg;
      a.kg -= m.kg;
      if (m.destino && !a.lotes.includes(m.destino)) a.lotes.push(m.destino);
    }
    porBache.set(m.bache, a);
  }
  return [...porBache.values()]
    .map((b) => ({ ...b, kg: r2(b.kg), kgIngresado: r2(b.kgIngresado), kgConsumido: r2(b.kgConsumido) }))
    .sort((a, b) => b.kg - a.kg);
}

const MOVIMIENTOS: MovimientoBiocharPuro[] = [
  mov({ tipo: 'Entrada', kg: 500.4, bache: 'S-00901', documento: 'BODEGA-S-00901' }),
  mov({ tipo: 'Salida', kg: 100.15, bache: 'S-00901', destino: 'BLEND-2026-10-01' }),
  mov({ tipo: 'Salida', kg: 50, bache: 'S-00901', destino: 'SIRIUS-REM-0310', documento: 'DESP-SIRIUS-REM-0310-S-00901' }),
  mov({ tipo: 'Salida', kg: 10, bache: 'S-00901', destino: 'BLEND-2026-10-01' }),
  mov({ tipo: 'Entrada', kg: 480, bache: 'S-00902' }),
  mov({ tipo: 'Salida', kg: 480.18, bache: 'S-00902', destino: 'SAL-MUE-2026-10-02-S-00902' }),
  mov({ tipo: 'Entrada', kg: 300, bache: 'S-00903' }),
  mov({ tipo: 'Ajuste', kg: 999, bache: 'S-00903' }),
  mov({ tipo: 'Entrada', kg: 77, bache: '' }),
  mov({ tipo: 'Salida', kg: 20, bache: 'S-00904', destino: '' }),
];

describe('saldosPorBache', () => {
  it('da lo mismo que el cálculo de antes', () => {
    expect(mod.saldosPorBache(MOVIMIENTOS)).toEqual(saldosAntes(MOVIMIENTOS));
  });

  it('resta las salidas, junta los destinos sin repetir y ordena de mayor a menor saldo', () => {
    expect(mod.saldosPorBache(MOVIMIENTOS)).toEqual([
      { codigo: 'S-00901', kg: 340.25, kgIngresado: 500.4, kgConsumido: 160.15, lotes: ['BLEND-2026-10-01', 'SIRIUS-REM-0310'] },
      { codigo: 'S-00903', kg: 300, kgIngresado: 300, kgConsumido: 0, lotes: [] },
      { codigo: 'S-00902', kg: -0.18, kgIngresado: 480, kgConsumido: 480.18, lotes: ['SAL-MUE-2026-10-02-S-00902'] },
      { codigo: 'S-00904', kg: -20, kgIngresado: 0, kgConsumido: 20, lotes: [] },
    ]);
  });

  it('sin movimientos, sin baches', () => {
    expect(mod.saldosPorBache([])).toEqual([]);
  });
});

function sembrar(falso: AirtableFalso) {
  for (const m of MOVIMIENTOS) {
    falso.sembrar(B_INV, T_MOV, {
      product_id: PURO,
      tipo_movimiento: m.tipo,
      cantidad: m.kg,
      bache_origen_id: m.bache,
      produccion_destino_id: m.destino,
      documento_referencia: m.documento,
      fecha_movimiento: m.fecha,
    });
  }
  // De otro producto con el mismo bache: no es biochar puro.
  falso.sembrar(B_INV, T_MOV, { product_id: 'OTRO', tipo_movimiento: 'Entrada', cantidad: 1000, bache_origen_id: 'S-00901' });
}

describe('fetchBachesBiocharCore', () => {
  it('es saldosPorBache sobre todos los movimientos del biochar puro', async () => {
    const falso = new AirtableFalso();
    sembrar(falso);
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
    expect(await mod.fetchBachesBiocharCore()).toEqual(saldosAntes(MOVIMIENTOS));
  });
});

describe('saldoDeBaches', () => {
  it('lee solo los baches pedidos y devuelve 0 para los que no tienen movimientos', async () => {
    const falso = new AirtableFalso();
    sembrar(falso);
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);

    const saldos = await mod.saldoDeBaches(['S-00901', 'S-00902', 'S-00999', 'S-00901', ' ']);
    expect(Object.fromEntries(saldos)).toEqual({ 'S-00901': 340.25, 'S-00902': -0.18, 'S-00999': 0 });

    expect(falso.llamadas).toHaveLength(1);
    expect(falso.llamadas[0].params.get('filterByFormula')).toBe(
      `AND({product_id} = '${PURO}', OR({bache_origen_id} = 'S-00901', {bache_origen_id} = 'S-00902', {bache_origen_id} = 'S-00999'))`
    );
  });

  it('escapa el código: una comilla no rompe la fórmula', async () => {
    const falso = new AirtableFalso();
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
    await mod.saldoDeBaches(["S-1' , TRUE()) & '"]);
    expect(falso.llamadas[0].params.get('filterByFormula')).toContain("\\'");
  });

  it('lanza si la lectura falla: "no pude verificar" no es "quedó bien"', async () => {
    const falso = new AirtableFalso({ fallar: () => ({ status: 503 }) });
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
    await expect(mod.saldoDeBaches(['S-00901'])).rejects.toThrow();
  });

  it('sin baches no lee nada', async () => {
    const espia = jest.spyOn(global, 'fetch');
    expect((await mod.saldoDeBaches([])).size).toBe(0);
    expect(espia).not.toHaveBeenCalled();
  });
});

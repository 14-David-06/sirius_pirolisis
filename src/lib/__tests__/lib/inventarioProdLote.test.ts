/**
 * @jest-environment node
 */

/**
 * Escritura por lotes en Inventario Production Core.
 *
 * Lo que se protege:
 *  - cada movimiento entra vinculado a `Stock_Actual` EN EL POST (un movimiento
 *    sin vincular es invisible para el saldo) y con `ubicacion_origen_id`, que es
 *    la junta de lo despachado con el pedido;
 *  - sin fila de stock no se escribe NADA;
 *  - POST de 10 como máximo, y se detiene en el primer lote que falla;
 *  - `documentosPorDestino` es una sola lectura, escapada, y lanza si falla.
 * Datos inventados.
 */

import { AirtableFalso, resumenEscritura } from '@/test-utils/airtable-falso';
import type { MovimientoProductoInput } from '@/lib/inventario-prod-core';

const B_INV = 'baseInvFalsa';
const T_MOV = 'tblMovimientos';
const T_STOCK = 'tblStock';
const PURO = 'PRODUCTO-PURO-FALSO';

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_BASE_SIRIUS_INVENTARIO: B_INV,
    AIRTABLE_API_KEY_SIRIUS_INVENTARIO: 'token-falso',
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: T_MOV,
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK: T_STOCK,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PURO,
  });
}

type Inv = typeof import('@/lib/inventario-prod-core');
type Bio = typeof import('@/lib/biochar-inventario-core');
let inv: Inv;
let bio: Bio;

beforeAll(async () => {
  entorno();
  inv = await import('@/lib/inventario-prod-core');
  bio = await import('@/lib/biochar-inventario-core');
});

afterEach(() => jest.restoreAllMocks());

function montar(o: { conStock?: boolean; fallar?: (n: number, metodo: string, tabla: string) => boolean } = {}) {
  let posts = 0;
  const falso = new AirtableFalso({
    fallar: (ll) => {
      if (ll.metodo === 'POST' && ll.tabla === T_MOV) posts++;
      return o.fallar?.(posts, ll.metodo, ll.tabla) ? { status: 422, body: { error: 'INVALID' } } : null;
    },
  });
  const stockId = o.conStock === false ? '' : falso.sembrar(B_INV, T_STOCK, { producto_id: PURO, stock_actual: 1000 });
  falso.sembrar(B_INV, T_STOCK, { producto_id: 'OTRO-PRODUCTO', stock_actual: 5 });
  jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
  return { falso, stockId };
}

function salida(i: number): MovimientoProductoInput {
  const bache = `S-${String(900 + i).padStart(5, '0')}`;
  return {
    tipo: 'Salida',
    cantidad: 10 + i + 0.256,
    documentoReferencia: `DESP-SIRIUS-REM-0310-${bache}`,
    motivo: 'Despacho SIRIUS-REM-0310',
    fecha: '2026-10-21',
    bacheOrigen: bache,
    produccionDestino: 'SIRIUS-REM-0310',
    ubicacionOrigen: 'SIRIUS-REM-0310',
    ubicacionDestino: 'CL-0902',
    responsable: 'Operador Falso',
  };
}

const cred = () => inv.credencialesProducto(PURO);

describe('crearMovimientosProducto', () => {
  it('POST de 10 como máximo, con Stock_Actual y ubicacion_origen_id en el mismo POST', async () => {
    const { falso, stockId } = montar();
    const inputs = Array.from({ length: 23 }, (_, i) => salida(i));
    const r = await inv.crearMovimientosProducto(cred(), inputs);

    const posts = falso.escrituras().map(resumenEscritura);
    expect(posts.map((p) => p.metodo)).toEqual(['POST', 'POST', 'POST']);
    const tamanos = posts.map((p) => (p.body as { records: unknown[] }).records.length);
    expect(tamanos).toEqual([10, 10, 3]);

    const primero = (posts[0].body as { records: Array<{ fields: Record<string, unknown> }> }).records[0].fields;
    expect(primero).toEqual({
      product_id: PURO,
      tipo_movimiento: 'Salida',
      cantidad: 10.26,
      unidad_medida: 'kg',
      motivo: 'Despacho SIRIUS-REM-0310',
      documento_referencia: 'DESP-SIRIUS-REM-0310-S-00900',
      fecha_movimiento: '2026-10-21T12:00:00.000Z',
      bache_origen_id: 'S-00900',
      produccion_destino_id: 'SIRIUS-REM-0310',
      responsable: 'Operador Falso',
      ubicacion_destino_id: 'CL-0902',
      ubicacion_origen_id: 'SIRIUS-REM-0310',
      Stock_Actual: [stockId],
    });
    for (const p of posts) {
      for (const rec of (p.body as { records: Array<{ fields: Record<string, unknown> }> }).records) {
        expect(rec.fields.Stock_Actual).toEqual([stockId]);
      }
    }

    expect(r).toHaveLength(23);
    expect(r.map((x) => x.documentoReferencia)).toEqual(inputs.map((i) => i.documentoReferencia));
    expect(r.every((x) => x.movimientoId && !x.error)).toBe(true);
    expect(falso.registros(B_INV, T_MOV)).toHaveLength(23);
  });

  it('sin fila de Stock_Actual lanza ANTES de escribir', async () => {
    const { falso } = montar({ conStock: false });
    await expect(inv.crearMovimientosProducto(cred(), [salida(0)])).rejects.toThrow(/Stock_Actual/);
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('si no se puede leer la fila de stock, lanza sin escribir', async () => {
    const { falso } = montar({ fallar: (_n, metodo, tabla) => metodo === 'GET' && tabla === T_STOCK });
    await expect(inv.crearMovimientosProducto(cred(), [salida(0)])).rejects.toThrow();
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('sin configuración lanza', async () => {
    await expect(inv.crearMovimientosProducto(null, [salida(0)])).rejects.toThrow(/no está configurado/);
  });

  it('se detiene en el primer lote que falla y lo dice por referencia', async () => {
    const { falso } = montar({ fallar: (n, metodo, tabla) => metodo === 'POST' && tabla === T_MOV && n === 2 });
    const inputs = Array.from({ length: 25 }, (_, i) => salida(i));
    const r = await inv.crearMovimientosProducto(cred(), inputs);

    // Se intentaron dos POST (el segundo falló); el tercero no se intentó.
    expect(falso.escrituras()).toHaveLength(2);
    expect(r.slice(0, 10).every((x) => x.movimientoId && !x.error)).toBe(true);
    expect(r.slice(10, 20).every((x) => !x.movimientoId && /Error creando movimientos/.test(x.error ?? ''))).toBe(true);
    expect(r.slice(20).every((x) => !x.movimientoId && /^No se intentó/.test(x.error ?? ''))).toBe(true);
    expect(falso.registros(B_INV, T_MOV)).toHaveLength(10);
  });

  it('sin entradas no lee ni escribe', async () => {
    const { falso } = montar();
    expect(await inv.crearMovimientosProducto(cred(), [])).toEqual([]);
    expect(falso.llamadas).toHaveLength(0);
  });
});

describe('crearMovimientoProducto (uno solo)', () => {
  it('escribe ubicacion_origen_id cuando viene', async () => {
    const { falso } = montar();
    await inv.crearMovimientoProducto(cred(), salida(0));
    const fields = (falso.escrituras()[0].body as { records: Array<{ fields: Record<string, unknown> }> }).records[0].fields;
    expect(fields.ubicacion_origen_id).toBe('SIRIUS-REM-0310');
  });

  it('sigue creando sin vincular cuando no hay fila de stock (y lo reporta)', async () => {
    montar({ conStock: false });
    const r = await inv.crearMovimientoProducto(cred(), salida(0));
    expect(r.vinculadoAlStock).toBe(false);
  });
});

describe('documentosPorDestino', () => {
  it('una lectura por destino, escapada, solo del producto', async () => {
    const { falso } = montar();
    falso.sembrar(B_INV, T_MOV, { product_id: PURO, produccion_destino_id: "SIRIUS-REM-0310", documento_referencia: 'DESP-SIRIUS-REM-0310-S-00900' });
    falso.sembrar(B_INV, T_MOV, { product_id: PURO, produccion_destino_id: 'SIRIUS-REM-0311', documento_referencia: 'DESP-SIRIUS-REM-0311-S-00900' });
    falso.sembrar(B_INV, T_MOV, { product_id: 'OTRO', produccion_destino_id: 'SIRIUS-REM-0310', documento_referencia: 'AJENO' });

    const docs = await inv.documentosPorDestino(cred(), 'SIRIUS-REM-0310');
    expect([...docs]).toEqual(['DESP-SIRIUS-REM-0310-S-00900']);
    const lectura = falso.llamadas.find((l) => l.tabla === T_MOV)!;
    expect(lectura.params.get('filterByFormula')).toBe(
      `AND({product_id} = '${PURO}',{produccion_destino_id} = 'SIRIUS-REM-0310')`
    );

    await inv.documentosPorDestino(cred(), "X' & '");
    expect(falso.llamadas.at(-1)!.params.get('filterByFormula')).toContain("\\'");
  });

  it('lanza si la lectura falla o falta el destino', async () => {
    montar({ fallar: (_n, metodo, tabla) => metodo === 'GET' && tabla === T_MOV });
    await expect(inv.documentosPorDestino(cred(), 'SIRIUS-REM-0310')).rejects.toThrow();
    await expect(inv.documentosPorDestino(cred(), '')).rejects.toThrow();
    await expect(inv.documentosPorDestino(null, 'SIRIUS-REM-0310')).rejects.toThrow();
  });
});

describe('biochar puro: crearSalidasBiocharPuro y documentosSalidaBiochar', () => {
  it('escribe Salidas de biochar puro por lote, con kg, bache y remisión', async () => {
    const { falso, stockId } = montar();
    const r = await bio.crearSalidasBiocharPuro([
      {
        kg: 75.256,
        bacheOrigen: 'S-00901',
        produccionDestino: 'SIRIUS-REM-0310',
        documentoReferencia: 'DESP-SIRIUS-REM-0310-S-00901',
        motivo: 'Despacho',
        fecha: '2026-10-21',
        ubicacionOrigen: 'SIRIUS-REM-0310',
        ubicacionDestino: 'CL-0902',
      },
    ]);
    expect(r).toEqual([{ documentoReferencia: 'DESP-SIRIUS-REM-0310-S-00901', movimientoId: expect.any(String) }]);
    const fields = (falso.escrituras()[0].body as { records: Array<{ fields: Record<string, unknown> }> }).records[0].fields;
    expect(fields).toMatchObject({
      product_id: PURO,
      tipo_movimiento: 'Salida',
      cantidad: 75.26,
      unidad_medida: 'kg',
      bache_origen_id: 'S-00901',
      ubicacion_origen_id: 'SIRIUS-REM-0310',
      Stock_Actual: [stockId],
    });

    expect([...(await bio.documentosSalidaBiochar('SIRIUS-REM-0310'))]).toEqual(['DESP-SIRIUS-REM-0310-S-00901']);
  });
});

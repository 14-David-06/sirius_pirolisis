/**
 * @jest-environment node
 */

/**
 * Estado del pedido según lo REMITIDO, por producto.
 *
 * Lo que se protege: que `Enviado` solo aparezca cuando salió todo lo de cada
 * producto (un pedido mixto no está enviado porque sobró Blend), que una línea
 * de otro producto lo deje parcial, que las canceladas y las del laboratorio no
 * cuenten, y que PiroliApp nunca pise un `Completado` o `Cancelado` del CRM.
 * Datos inventados.
 */

import { AirtableFalso, resumenEscritura } from '@/test-utils/airtable-falso';

const B_REM = 'baseRemFalsa';
const B_PED = 'basePedFalsa';
const T = { remisiones: 'tblRemisiones', pedidos: 'tblPedidos', detalles: 'tblDetalles' };
const BLEND = 'PRODUCTO-BLEND-FALSO';
const PURO = 'PRODUCTO-PURO-FALSO';

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B_REM,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_PEDIDOS_CORE_BASE_ID: B_PED,
    AIRTABLE_PEDIDOS_CORE_PEDIDOS_TABLE: T.pedidos,
    AIRTABLE_PEDIDOS_CORE_DETALLES_TABLE: T.detalles,
    AIRTABLE_PEDIDOS_CORE_TOKEN: 'token-falso',
    AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID: BLEND,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PURO,
  });
}

type Modulo = typeof import('@/lib/pedidos-pirolisis-estado');
let mod: Modulo;

beforeAll(async () => {
  entorno();
  mod = await import('@/lib/pedidos-pirolisis-estado');
});

afterEach(() => jest.restoreAllMocks());

function escenario(o: {
  estado?: string;
  lineas: Array<[string, number]>;
  remisiones?: Array<{ estado: string; notas: string; kg?: number; area?: string; pedido?: string }>;
}) {
  const falso = new AirtableFalso();
  const detalles = o.lineas.map(([producto, kg]) =>
    falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': producto, 'Cantidad Pedido': kg })
  );
  // Un detalle de OTRO pedido con el mismo producto: no debe sumar.
  falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': BLEND, 'Cantidad Pedido': 9999 });
  const pedidoId = falso.sembrar(B_PED, T.pedidos, {
    'ID Pedido Core': 'SIRIUS-PED-0901',
    Estado: o.estado ?? 'Procesando',
    'ID Cliente Core': 'CL-0901',
    'ID Area Cliente': 'AC-0901',
    'Fecha de Pedido': '2026-10-21T03:30:00.000Z',
    Notas: 'Pedido de prueba',
    'Detalles del Pedido': detalles,
  });
  (o.remisiones ?? []).forEach((r, i) =>
    falso.sembrar(B_REM, T.remisiones, {
      ID: `SIRIUS-REM-${String(300 + i).padStart(4, '0')}`,
      numeracion: 202 + i,
      'Area Origen': r.area ?? 'Producción',
      'ID Pedido': r.pedido ?? 'SIRIUS-PED-0901',
      Estado: r.estado,
      'Notas de Remisión': r.notas,
      'Total Cantidad Remitida': r.kg ?? 0,
    })
  );
  jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
  return { falso, pedidoId };
}

function patchesDePedido(falso: AirtableFalso) {
  return falso.escrituras().filter((e) => e.tabla === T.pedidos).map(resumenEscritura);
}

describe('leerPedidoConLineas', () => {
  it('trae el pedido con TODAS sus líneas por el link, y la fecha en Bogotá', async () => {
    const { pedidoId } = escenario({ lineas: [[BLEND, 100], [PURO, 200], ['OTRO-PRODUCTO', 5]] });
    const p = await mod.leerPedidoConLineas('SIRIUS-PED-0901');
    expect(p).toEqual({
      recordId: pedidoId,
      codigo: 'SIRIUS-PED-0901',
      estado: 'Procesando',
      idCliente: 'CL-0901',
      idAreaCliente: 'AC-0901',
      // 03:30 UTC del 21 es todavía el 20 en Bogotá.
      fecha: '2026-10-20',
      notas: 'Pedido de prueba',
      lineas: [
        { productoId: BLEND, kg: 100 },
        { productoId: PURO, kg: 200 },
        { productoId: 'OTRO-PRODUCTO', kg: 5 },
      ],
    });
  });

  it('null si no existe; el código va escapado', async () => {
    const { falso } = escenario({ lineas: [] });
    expect(await mod.leerPedidoConLineas("SIRIUS-PED-0901' , TRUE(), '")).toBeNull();
    expect(falso.llamadas[0].params.get('filterByFormula')).toBe(
      "{ID Pedido Core} = 'SIRIUS-PED-0901\\' , TRUE(), \\''"
    );
  });
});

describe('actualizarEstadoPedidoPirolisis', () => {
  it('mixto: Blend cubierto pero biochar no → Enviado Parcial', async () => {
    const { falso, pedidoId } = escenario({
      lineas: [[BLEND, 100], [PURO, 200]],
      remisiones: [
        { estado: 'Pendiente', notas: '[lote:BLEND-A] Biochar Blend', kg: 100 },
        { estado: 'En Tránsito', notas: '[bache:S-00140=150.00] Biochar', kg: 150 },
      ],
    });
    const paso = await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901');
    expect(paso).toMatchObject({ step: 'estado_pedido', ok: true });
    expect(patchesDePedido(falso)).toEqual([
      { metodo: 'PATCH', tabla: T.pedidos, recordId: pedidoId, body: { fields: { Estado: 'Enviado Parcial' } } },
    ]);
  });

  it('cada producto cubierto (biochar por sus marcas, no por el rollup) → Enviado; Borrador cuenta', async () => {
    const { falso } = escenario({
      lineas: [[BLEND, 100], [PURO, 200]],
      remisiones: [
        { estado: 'Entregada', notas: '[lote:BLEND-A] Biochar Blend', kg: 100 },
        // El rollup muestra 0 decimales: 199 no puede dejar parcial lo que salió completo.
        { estado: 'Borrador', notas: '[bache:S-00140=120.00] [bache:S-00141=80.00] Biochar', kg: 199 },
      ],
    });
    await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901');
    expect(patchesDePedido(falso).map((p) => (p.body as { fields: { Estado: string } }).fields.Estado)).toEqual(['Enviado']);
  });

  it('no cuentan las canceladas, las del laboratorio ni las de otro pedido', async () => {
    const { falso } = escenario({
      lineas: [[BLEND, 100]],
      remisiones: [
        { estado: 'Cancelada', notas: '[lote:BLEND-A] Biochar Blend', kg: 100 },
        { estado: 'Pendiente', notas: '[lote:BLEND-A] biológicos', kg: 100, area: 'Laboratorio' },
        { estado: 'Pendiente', notas: '[lote:BLEND-B] Biochar Blend', kg: 100, pedido: 'SIRIUS-PED-0902' },
        { estado: 'Pendiente', notas: '[lote:BLEND-C] Biochar Blend', kg: 40 },
      ],
    });
    const paso = await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901');
    expect(paso.detail).toMatchObject({ remitido: { [BLEND]: 40 }, estado: 'Enviado Parcial' });
    expect(patchesDePedido(falso)).toHaveLength(1);
  });

  it('una línea de otro producto (laboratorio) deja el pedido parcial', async () => {
    const { falso } = escenario({
      lineas: [[BLEND, 100], ['OTRO-PRODUCTO', 1]],
      remisiones: [{ estado: 'Pendiente', notas: '[lote:BLEND-A] Biochar Blend', kg: 100 }],
    });
    await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901');
    expect((patchesDePedido(falso)[0].body as { fields: { Estado: string } }).fields.Estado).toBe('Enviado Parcial');
  });

  it.each(['Completado', 'Cancelado'])('nunca pisa un pedido %s', async (estado) => {
    const { falso } = escenario({
      estado,
      lineas: [[BLEND, 100]],
      remisiones: [{ estado: 'Pendiente', notas: '[lote:BLEND-A] Biochar Blend', kg: 10 }],
    });
    const paso = await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901');
    expect(paso).toMatchObject({ ok: true, skipped: true });
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('si ya tiene el estado que corresponde, no escribe (idempotente)', async () => {
    const { falso } = escenario({
      estado: 'Enviado',
      lineas: [[BLEND, 100]],
      remisiones: [{ estado: 'Pendiente', notas: '[lote:BLEND-A] Biochar Blend', kg: 100 }],
    });
    expect(await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901')).toMatchObject({ ok: true, skipped: true });
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('pedido sin líneas: usa el respaldo de kg de Blend; sin respaldo no afirma que esté completo', async () => {
    const con = escenario({ lineas: [], remisiones: [{ estado: 'Pendiente', notas: '[lote:BLEND-A] Biochar Blend', kg: 50 }] });
    await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901', { kgSolicitadosBlendRespaldo: 50 });
    expect((patchesDePedido(con.falso)[0].body as { fields: { Estado: string } }).fields.Estado).toBe('Enviado');
    jest.restoreAllMocks();

    const sin = escenario({ lineas: [], remisiones: [{ estado: 'Pendiente', notas: '[lote:BLEND-A] Biochar Blend', kg: 50 }] });
    await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901');
    expect((patchesDePedido(sin.falso)[0].body as { fields: { Estado: string } }).fields.Estado).toBe('Enviado Parcial');
  });

  it.each([
    ['solo remisiones canceladas', [{ estado: 'Cancelada', notas: '[bache:S-00140=50.00] Biochar', kg: 50 }]],
    ['ninguna remisión', []],
  ])('sin kg remitidos (%s): skipped, no lo deja en Enviado Parcial', async (_n, remisiones) => {
    const { falso } = escenario({ estado: 'Recibido', lineas: [[PURO, 200]], remisiones });
    const paso = await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0901');
    expect(paso).toMatchObject({ step: 'estado_pedido', ok: true, skipped: true });
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('pedido inexistente o lectura caída: ok:false sin escribir (best-effort)', async () => {
    const { falso } = escenario({ lineas: [] });
    const paso = await mod.actualizarEstadoPedidoPirolisis('SIRIUS-PED-0999');
    expect(paso).toMatchObject({ ok: false });
    expect(falso.escrituras()).toHaveLength(0);
  });
});

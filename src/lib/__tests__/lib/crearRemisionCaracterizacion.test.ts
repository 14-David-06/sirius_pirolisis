/**
 * @jest-environment node
 */

/**
 * Caracterización de `crearRemision()` (despacho de Biochar Blend).
 *
 * Se escribió ANTES de sacar lo genérico a `remisiones-core.ts`, contra el código
 * de ese momento, y fija las ESCRITURAS exactas que hace hoy: método, tabla y
 * cuerpo de cada POST/PATCH/DELETE, en orden. Es la red del refactor: la remisión
 * de Blend es un documento comercial que ya se emite en producción, y un campo
 * de más o de menos en el Core no falla con error, sale mal impreso o descuadra
 * el inventario. Las lecturas no se fijan: un refactor puede leer distinto.
 *
 * Única diferencia admitida después del refactor: la marca `[desp:<uuid>]` en
 * las notas cuando el despacho trae su llave (último caso).
 *
 * Datos inventados: ningún cliente, cédula ni record ID real.
 */

import { AirtableFalso, resumenEscritura } from '@/test-utils/airtable-falso';

const B_REM = 'baseRemFalsa';
const B_INV = 'baseInvFalsa';
const B_PED = 'basePedFalsa';
const B_CLI = 'baseCliFalsa';
const T = {
  remisiones: 'tblRemisiones',
  productos: 'tblProductos',
  personas: 'tblPersonas',
  movimientos: 'tblMovimientos',
  stock: 'tblStock',
  pedidos: 'tblPedidos',
  detalles: 'tblDetalles',
  clientes: 'tblClientes',
  areas: 'tblAreas',
};
const PROD_BLEND = 'PRODUCTO-BLEND-FALSO';
const PROD_PURO = 'PRODUCTO-PURO-FALSO';

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B_REM,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_TABLE_PRODUCTOS_REMITIDOS: T.productos,
    AIRTABLE_TABLE_PERSONAS_REMISION: T.personas,
    AIRTABLE_BASE_SIRIUS_INVENTARIO: B_INV,
    AIRTABLE_API_KEY_SIRIUS_INVENTARIO: 'token-falso',
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: T.movimientos,
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK: T.stock,
    AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID: PROD_BLEND,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PROD_PURO,
    AIRTABLE_PEDIDOS_CORE_BASE_ID: B_PED,
    AIRTABLE_PEDIDOS_CORE_PEDIDOS_TABLE: T.pedidos,
    AIRTABLE_PEDIDOS_CORE_DETALLES_TABLE: T.detalles,
    AIRTABLE_PEDIDOS_CORE_TOKEN: 'token-falso',
    AIRTABLE_CLIENTES_BASE_ID: B_CLI,
    AIRTABLE_CLIENTES_TABLE_ID: T.clientes,
    AIRTABLE_CLIENTES_AREAS_TABLE_ID: T.areas,
    AIRTABLE_CLIENTES_TOKEN: 'token-falso',
  });
  // La tabla de baches de PiroliApp no hace falta: sin ella la composición cae a
  // la fórmula, que no es lo que se caracteriza.
  delete process.env.AIRTABLE_BACHES_TABLE_ID;
}

/** Remisiones Core con su fórmula `ID`, el autonumber y el rollup de productos. */
function nuevoCore(o: { fallar?: ConstructorParameters<typeof AirtableFalso>[0]['fallar'] } = {}) {
  const falso = new AirtableFalso({
    fallar: o.fallar,
    alCrear: {
      [`${B_REM}/${T.remisiones}`]: (_f, n) => ({ numeracion: n }),
    },
    computados: {
      [`${B_REM}/${T.remisiones}`]: (rec, f) => ({
        ID: `SIRIUS-REM-${String(98 + Number(rec.fields.numeracion)).padStart(4, '0')}`,
        'Fecha de Remisión': rec.createdTime,
        'Total Cantidad Remitida': f
          .registros(B_REM, T.productos)
          .filter((p) => ((p.fields['Remisión vinculada'] as string[]) ?? []).includes(rec.id))
          .reduce((t, p) => t + Number(p.fields.Cantidad ?? 0), 0),
      }),
    },
  });
  // La próxima remisión es la 0230.
  falso.autonumeroDesde(B_REM, T.remisiones, 131);
  falso.sembrar(B_CLI, T.clientes, { ID: 'CL-0901', Cliente: 'Finca Sintética S.A.S.' });
  falso.sembrar(B_CLI, T.areas, { ID: 'AC-0901', 'Nombre Area': 'Sanidad Vegetal' });
  const stockId = falso.sembrar(B_INV, T.stock, { producto_id: PROD_BLEND });
  return { falso, stockId };
}

function sembrarPedido(falso: AirtableFalso, kgPedido: number) {
  const pedidoId = falso.sembrar(B_PED, T.pedidos, {
    'ID Pedido Core': 'SIRIUS-PED-0901',
    Estado: 'Procesando',
    'ID Cliente Core': 'CL-0901',
  });
  const detalleId = falso.sembrar(B_PED, T.detalles, {
    Pedido: [pedidoId],
    'ID Producto Core': PROD_BLEND,
    'Cantidad Pedido': kgPedido,
  });
  falso.registros(B_PED, T.pedidos); // fuerza la tabla
  const pedido = falso.registro(B_PED, T.pedidos, pedidoId)!;
  // El link inverso, como lo mantiene Airtable.
  (pedido.fields as Record<string, unknown>)['Detalles del Pedido'] = [detalleId];
  falso.sembrar(B_PED, T.pedidos, { ...pedido.fields }, pedidoId);
  return pedidoId;
}

type Modulo = typeof import('@/lib/blend-remisiones-core');
let mod: Modulo;

beforeAll(async () => {
  entorno();
  mod = await import('@/lib/blend-remisiones-core');
});

let espia: jest.SpyInstance;
afterEach(() => {
  espia?.mockRestore();
});

function instalar(falso: AirtableFalso) {
  espia = jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
}

const LOTE = 'BLEND-2026-10-01-SIRIUS-PED-0901';

describe('crearRemision — caracterización de las escrituras', () => {
  it('un lote, con transportista y área: documento, producto, persona, salida y estado del pedido', async () => {
    const { falso, stockId } = nuevoCore();
    const pedidoId = sembrarPedido(falso, 100);
    instalar(falso);

    const r = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901',
      idCliente: 'CL-0901',
      idAreaCliente: 'AC-0901',
      lote: LOTE,
      kg: 100,
      responsableEntrega: 'Operario Uno Prueba',
      transportista: { nombre: 'Conductor Ficticio Pérez', cedula: '10203040', telefono: '+57 3000000000' },
      observaciones: 'Entrega en finca',
      fechaDespacho: '2026-10-21',
    });

    expect(r.ok).toBe(true);
    expect(r.remision?.codigo).toBe('SIRIUS-REM-0230');
    expect(r.steps.map((s) => [s.step, s.ok])).toEqual([
      ['remision', true],
      ['producto_remitido', true],
      ['transportista', true],
      ['inventario', true],
      ['estado_pedido', true],
    ]);

    const remId = r.remision!.recordId;
    const personaId = falso.registros(B_REM, T.personas)[0].id;
    expect(falso.escrituras().map(resumenEscritura)).toEqual([
      {
        metodo: 'POST',
        tabla: T.remisiones,
        body: {
          records: [
            {
              fields: {
                'Area Origen': 'Producción',
                Estado: 'En Tránsito',
                'Notas de Remisión': `[lote:${LOTE}] Biochar Blend — Entrega en finca`,
                'ID Cliente': 'CL-0901',
                'ID Pedido': 'SIRIUS-PED-0901',
                'ID Area Cliente': 'AC-0901',
                'Responsable Entrega': 'Operario Uno Prueba',
                'Fecha Pedido Despachado': '2026-10-21',
              },
            },
          ],
        },
      },
      {
        metodo: 'POST',
        tabla: T.productos,
        body: {
          records: [
            {
              fields: {
                'ID Producto': PROD_BLEND,
                Cantidad: 100,
                Unidad: 'Kg',
                'Remisión vinculada': [remId],
                Notas: `Lote ${LOTE}`,
              },
            },
          ],
        },
      },
      {
        metodo: 'POST',
        tabla: T.personas,
        body: {
          records: [
            {
              fields: {
                'Nombre Completo': 'Conductor Ficticio Pérez',
                Cedula: '10203040',
                'Tipo de Usuario': 'Transportista',
                'Base Origen': 'PiroliApp (Pirolisis)',
                Teléfono: '+57 3000000000',
              },
            },
          ],
        },
      },
      { metodo: 'PATCH', tabla: T.remisiones, recordId: remId, body: { fields: { Personas: [personaId] } } },
      {
        metodo: 'POST',
        tabla: T.movimientos,
        body: {
          records: [
            {
              fields: {
                product_id: PROD_BLEND,
                tipo_movimiento: 'Salida',
                cantidad: 100,
                unidad_medida: 'kg',
                ubicacion_origen_id: 'SIRIUS-REM-0230',
                ubicacion_destino_id: 'CL-0901',
                motivo: 'Despacho Remisión',
                documento_referencia: 'DESP-SIRIUS-REM-0230',
                responsable: 'Operario Uno Prueba',
                fecha_movimiento: '2026-10-21T12:00:00.000Z',
                observaciones: `Despacho de Biochar Blend del lote ${LOTE} al pedido SIRIUS-PED-0901.`,
                Stock_Actual: [stockId],
              },
            },
          ],
        },
      },
      { metodo: 'PATCH', tabla: T.pedidos, recordId: pedidoId, body: { fields: { Estado: 'Enviado' } } },
    ]);
  });

  it('varios lotes, sin transportista: marcas de reparto, una fila y una Salida por lote, pedido parcial', async () => {
    const { falso, stockId } = nuevoCore();
    const pedidoId = sembrarPedido(falso, 200);
    instalar(falso);

    const r = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901',
      idCliente: 'CL-0901',
      lote: 'BLEND-2026-10-01',
      kg: 100,
      reparto: [
        { lote: 'BLEND-2026-10-01', kg: 60.004 },
        { lote: 'BLEND-2026-10-02', kg: 39.996 },
      ],
      responsableEntrega: 'Operario Uno Prueba',
      fechaDespacho: '2026-10-21',
    });

    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => [s.step, s.ok])).toEqual([
      ['remision', true],
      ['producto_remitido', true],
      ['inventario:BLEND-2026-10-01', true],
      ['inventario:BLEND-2026-10-02', true],
      ['estado_pedido', true],
    ]);
    const remId = r.remision!.recordId;
    const escrituras = falso.escrituras().map(resumenEscritura);

    expect(escrituras[0]).toEqual({
      metodo: 'POST',
      tabla: T.remisiones,
      body: {
        records: [
          {
            fields: {
              'Area Origen': 'Producción',
              Estado: 'Pendiente',
              'Notas de Remisión':
                '[lote:BLEND-2026-10-01] [lote:BLEND-2026-10-02] ' +
                '[kg-lote:BLEND-2026-10-01=60] [kg-lote:BLEND-2026-10-02=40] Biochar Blend',
              'ID Cliente': 'CL-0901',
              'ID Pedido': 'SIRIUS-PED-0901',
              'Responsable Entrega': 'Operario Uno Prueba',
              'Fecha Pedido Despachado': '2026-10-21',
            },
          },
        ],
      },
    });
    expect(escrituras[1]).toEqual({
      metodo: 'POST',
      tabla: T.productos,
      body: {
        records: [
          { fields: { 'ID Producto': PROD_BLEND, Cantidad: 60, Unidad: 'Kg', 'Remisión vinculada': [remId], Notas: 'Lote BLEND-2026-10-01' } },
          { fields: { 'ID Producto': PROD_BLEND, Cantidad: 40, Unidad: 'Kg', 'Remisión vinculada': [remId], Notas: 'Lote BLEND-2026-10-02' } },
        ],
      },
    });
    const salidas = escrituras.filter((e) => e.tabla === T.movimientos);
    expect(salidas.map((s) => (s.body as { records: Array<{ fields: Record<string, unknown> }> }).records[0].fields)).toEqual([
      expect.objectContaining({
        cantidad: 60,
        documento_referencia: 'DESP-SIRIUS-REM-0230-BLEND-2026-10-01',
        ubicacion_origen_id: 'SIRIUS-REM-0230',
        observaciones: 'Despacho de Biochar Blend del lote BLEND-2026-10-01 al pedido SIRIUS-PED-0901.',
        Stock_Actual: [stockId],
      }),
      expect.objectContaining({
        cantidad: 40,
        documento_referencia: 'DESP-SIRIUS-REM-0230-BLEND-2026-10-02',
        observaciones: 'Despacho de Biochar Blend del lote BLEND-2026-10-02 al pedido SIRIUS-PED-0901.',
      }),
    ]);
    expect(escrituras.at(-1)).toEqual({
      metodo: 'PATCH',
      tabla: T.pedidos,
      recordId: pedidoId,
      body: { fields: { Estado: 'Enviado Parcial' } },
    });
    expect(escrituras).toHaveLength(5);
  });

  it('si falla el producto remitido, borra la remisión y no toca inventario ni pedido', async () => {
    const { falso } = nuevoCore({
      fallar: (ll) => (ll.metodo === 'POST' && ll.tabla === T.productos ? { status: 422 } : null),
    });
    sembrarPedido(falso, 100);
    instalar(falso);

    const r = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901',
      idCliente: 'CL-0901',
      lote: LOTE,
      kg: 100,
      responsableEntrega: 'Operario Uno Prueba',
      fechaDespacho: '2026-10-21',
    });

    expect(r.ok).toBe(false);
    expect(r.remision).toBeNull();
    expect(r.steps.map((s) => [s.step, s.ok])).toEqual([
      ['remision', true],
      ['producto_remitido', false],
    ]);
    const escrituras = falso.escrituras();
    expect(escrituras.map((e) => [e.metodo, e.tabla])).toEqual([
      ['POST', T.remisiones],
      ['POST', T.productos],
      ['DELETE', T.remisiones],
    ]);
    expect(falso.registros(B_REM, T.remisiones)).toHaveLength(0);
  });

  it('una Salida que ya existe no se duplica (llave documento_referencia)', async () => {
    const { falso } = nuevoCore();
    sembrarPedido(falso, 100);
    falso.sembrar(B_INV, T.movimientos, {
      documento_referencia: 'DESP-SIRIUS-REM-0230',
      tipo_movimiento: 'Salida',
      product_id: PROD_BLEND,
      cantidad: 100,
      ubicacion_origen_id: 'SIRIUS-REM-0230',
    });
    instalar(falso);

    const r = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901',
      idCliente: 'CL-0901',
      lote: LOTE,
      kg: 100,
      responsableEntrega: 'Operario Uno Prueba',
      fechaDespacho: '2026-10-21',
    });

    expect(r.steps.find((s) => s.step === 'inventario')).toMatchObject({ ok: true, skipped: true });
    expect(falso.escrituras().filter((e) => e.tabla === T.movimientos)).toHaveLength(0);
  });

  it('con llave de despacho: [desp:<uuid>] antes de la etiqueta, y el reintento no escribe', async () => {
    const { falso } = nuevoCore();
    sembrarPedido(falso, 100);
    instalar(falso);
    const idDespacho = '0b6f3a52-6d1e-4c8a-9f3e-2a1b4c5d6e7f';
    const input = {
      idPedido: 'SIRIUS-PED-0901',
      idCliente: 'CL-0901',
      lote: LOTE,
      kg: 100,
      responsableEntrega: 'Operario Uno Prueba',
      observaciones: 'Entrega en finca',
      fechaDespacho: '2026-10-21',
      idDespacho,
    };

    const primera = await mod.crearRemision(input);
    expect(primera.ok).toBe(true);
    const post = falso.escrituras()[0].body as { records: Array<{ fields: Record<string, unknown> }> };
    expect(post.records[0].fields['Notas de Remisión']).toBe(
      `[lote:${LOTE}] [desp:${idDespacho}] Biochar Blend — Entrega en finca`
    );
    expect(primera.remision?.idDespacho).toBe(idDespacho);

    const antes = falso.escrituras().length;
    const segunda = await mod.crearRemision(input);
    expect(segunda).toMatchObject({ ok: true, yaExistia: true });
    expect(segunda.remision?.codigo).toBe(primera.remision?.codigo);
    expect(falso.escrituras()).toHaveLength(antes);
  });

  it('con llave: si otra petición emitió primero, descarta la propia y responde yaExistia sin Salida', async () => {
    const idDespacho = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
    let ajena = '';
    const { falso } = nuevoCore({
      // La otra petición emite con la MISMA llave mientras esta emite la suya:
      // no estaba en el paso 0 y aparece al releer, con menor numeración.
      fallar: (ll) => {
        if (!ajena && ll.metodo === 'POST' && ll.tabla === T.remisiones) {
          // Toma el autonumber antes que la propia (0230; la propia sale 0231).
          ajena = falso.sembrar(B_REM, T.remisiones, {
            'Area Origen': 'Producción',
            Estado: 'Pendiente',
            'ID Pedido': 'SIRIUS-PED-0901',
            'ID Cliente': 'CL-0901',
            'Notas de Remisión': `[lote:${LOTE}] [desp:${idDespacho}] Biochar Blend`,
          });
        }
        return null;
      },
    });
    sembrarPedido(falso, 100);
    instalar(falso);

    const r = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901',
      idCliente: 'CL-0901',
      lote: LOTE,
      kg: 100,
      responsableEntrega: 'Operario Uno Prueba',
      fechaDespacho: '2026-10-21',
      idDespacho,
    });

    expect(r).toMatchObject({ ok: true, yaExistia: true });
    expect(r.remision?.codigo).toBe('SIRIUS-REM-0230');
    expect(r.steps.find((s) => s.step === 'lider')).toMatchObject({ ok: true, detail: { descartada: 'SIRIUS-REM-0231' } });
    // Solo queda la líder; ni Salida ni estado de pedido desde aquí.
    expect(falso.registros(B_REM, T.remisiones).map((x) => x.id)).toEqual([ajena]);
    expect(falso.registros(B_REM, T.productos)).toHaveLength(0);
    expect(falso.escrituras().filter((e) => e.tabla === T.movimientos || e.tabla === T.pedidos)).toEqual([]);
  });

  it('con llave: el reintento (yaExistia) completa una Salida que falló en el intento original', async () => {
    let fallarSalida = true;
    const { falso, stockId } = nuevoCore({
      fallar: (ll) => (fallarSalida && ll.metodo === 'POST' && ll.tabla === T.movimientos ? { status: 422 } : null),
    });
    sembrarPedido(falso, 100);
    instalar(falso);
    const input = {
      idPedido: 'SIRIUS-PED-0901',
      idCliente: 'CL-0901',
      lote: LOTE,
      kg: 100,
      responsableEntrega: 'Operario Uno Prueba',
      fechaDespacho: '2026-10-21',
      idDespacho: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
    };

    const primera = await mod.crearRemision(input);
    expect(primera.steps.find((s) => s.step === 'inventario')).toMatchObject({ ok: false });

    fallarSalida = false;
    const antes = falso.escrituras().length;
    const segunda = await mod.crearRemision(input);
    expect(segunda).toMatchObject({ ok: true, yaExistia: true });
    expect(segunda.steps.find((s) => s.step === 'inventario')).toMatchObject({ ok: true });
    expect(segunda.steps.find((s) => s.step === 'inventario')?.skipped).toBeFalsy();
    const nuevas = falso.escrituras().slice(antes).map(resumenEscritura);
    expect(nuevas).toEqual([
      {
        metodo: 'POST',
        tabla: T.movimientos,
        body: {
          records: [
            {
              fields: expect.objectContaining({
                cantidad: 100,
                documento_referencia: 'DESP-SIRIUS-REM-0230',
                ubicacion_origen_id: 'SIRIUS-REM-0230',
                responsable: 'Operario Uno Prueba',
                fecha_movimiento: '2026-10-21T12:00:00.000Z',
                Stock_Actual: [stockId],
              }),
            },
          ],
        },
      },
    ]);

    // Y un tercer intento ya no escribe: la Salida está.
    const despues = falso.escrituras().length;
    await mod.crearRemision(input);
    expect(falso.escrituras()).toHaveLength(despues);
  });

  it('una llave de despacho mal formada no llega a Airtable', async () => {
    const { falso } = nuevoCore();
    instalar(falso);
    const r = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901', idCliente: 'CL-0901', lote: LOTE, kg: 10, responsableEntrega: 'X Y',
      idDespacho: "x') , TRUE()",
    });
    expect(r.ok).toBe(false);
    expect(falso.llamadas).toHaveLength(0);
  });

  it('kg inválidos o un reparto que no cuadra: no escribe nada', async () => {
    const { falso } = nuevoCore();
    instalar(falso);

    const cero = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901', idCliente: 'CL-0901', lote: LOTE, kg: 0, responsableEntrega: 'X Y',
    });
    const descuadre = await mod.crearRemision({
      idPedido: 'SIRIUS-PED-0901', idCliente: 'CL-0901', lote: LOTE, kg: 100, responsableEntrega: 'X Y',
      reparto: [{ lote: 'BLEND-A', kg: 50 }, { lote: 'BLEND-B', kg: 40 }],
    });

    expect(cero.ok).toBe(false);
    expect(descuadre.ok).toBe(false);
    expect(cero.steps[0].step).toBe('validacion');
    expect(descuadre.steps[0].step).toBe('validacion');
    expect(falso.llamadas).toHaveLength(0);
  });
});

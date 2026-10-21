/**
 * @jest-environment node
 */

/**
 * Contrato del despacho comercial de biochar puro (`despacho-biochar.ts`) con las
 * cinco bases que toca: Pedidos, Remisiones, Inventario Production y Clients Core,
 * y PiroliApp.
 *
 * Lo que se protege:
 *  - el ensayo NO escribe nada y reparte FIFO sobre lo DESPACHABLE (saldo del
 *    Core menos lo prometido en otro Borrador);
 *  - la confirmación sigue el orden del ancla en Borrador: remisión → lectura →
 *    transportista → local → core:S → activar → lo demás;
 *  - la Salida lleva los campos de la sección B y el link a Stock_Actual en el POST;
 *  - un fallo en el Core deja la remisión en Borrador (500) y «completar» la termina;
 *  - repetir con la misma llave no emite otra remisión, y completar dos veces no
 *    escribe la segunda;
 *  - anular con inventario escrito es 409; sin inventario, pasa a Cancelada;
 *  - las validaciones del pedido y del reparto (409) no escriben.
 *
 * Doble de Airtable en memoria, `fetch` espiado y entorno inyectado antes de
 * importar. Sin RECEPCION_SECRET el paso `enlace` queda `skipped` (no es
 * producción). Datos inventados.
 */

import { AirtableFalso, resumenEscritura, type LlamadaAirtable } from '@/test-utils/airtable-falso';

jest.setTimeout(30_000);

const B = { ped: 'basePedFalsa', rem: 'baseRemFalsa', inv: 'baseInvFalsa', cli: 'baseCliFalsa', loc: 'baseLocFalsa' };
const T = {
  pedidos: 'tblPedidos',
  detallesPedido: 'tblDetallesPedido',
  remisiones: 'tblRemisiones',
  productos: 'tblProductos',
  personas: 'tblPersonas',
  movimientos: 'tblMovimientos',
  stock: 'tblStock',
  clientes: 'tblClientes',
  areas: 'tblAreas',
  baches: 'tblBaches',
  remLocal: 'tblRemLocal',
  detalles: 'tblDetalles',
};
const PURO = 'PRODUCTO-PURO-FALSO';
const BLEND = 'PRODUCTO-BLEND-FALSO';
const CLIENTE = 'CLIENTE FALSO S.A.S.';
const UUID_OTRO = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID: B.loc,
    AIRTABLE_BACHES_TABLE_ID: T.baches,
    AIRTABLE_REMISIONES_BACHES_TABLE_ID: T.remLocal,
    AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID: T.detalles,
    AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID: 'Fecha Evento',
    AIRTABLE_REMISIONES_REALIZA_REGISTRO_FIELD_ID: 'Realiza Registro',
    AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID: 'Observaciones',
    AIRTABLE_REMISIONES_CLIENTE_FIELD_ID: 'Cliente',
    AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID: 'Bache Pirolisis Alterado',
    AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID: 'Cantidad Especificada (KG)',
    AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID: 'Remisiones Baches Pirolisis',
    AIRTABLE_DETALLE_BACHE_PIROLISIS_FIELD_ID: 'Bache Pirolisis',
    AIRTABLE_DETALLE_ID_PRODUCCION_BLEND_FIELD_ID: 'ID Produccion Blend',
    AIRTABLE_PEDIDOS_CORE_BASE_ID: B.ped,
    AIRTABLE_PEDIDOS_CORE_PEDIDOS_TABLE: T.pedidos,
    AIRTABLE_PEDIDOS_CORE_DETALLES_TABLE: T.detallesPedido,
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B.rem,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_TABLE_PRODUCTOS_REMITIDOS: T.productos,
    AIRTABLE_TABLE_PERSONAS_REMISION: T.personas,
    AIRTABLE_BASE_SIRIUS_INVENTARIO: B.inv,
    AIRTABLE_API_KEY_SIRIUS_INVENTARIO: 'token-falso',
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: T.movimientos,
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_STOCK: T.stock,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PURO,
    AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID: BLEND,
    AIRTABLE_CLIENTES_BASE_ID: B.cli,
    AIRTABLE_CLIENTES_TABLE_ID: T.clientes,
    AIRTABLE_CLIENTES_AREAS_TABLE_ID: T.areas,
    AIRTABLE_CLIENTES_TOKEN: 'token-falso',
    FACTOR_SECUESTRO_CO2: '2.5',
  });
  delete process.env.RECEPCION_SECRET;
  delete process.env.EMPRESA_NIT;
}

type Modulo = typeof import('@/lib/despacho-biochar');
let m: Modulo;

beforeAll(async () => {
  entorno();
  m = await import('@/lib/despacho-biochar');
});

afterEach(() => jest.restoreAllMocks());

interface Escenario {
  falso: AirtableFalso;
  baches: Record<string, string>;
  pedidoId: string;
  /** Activa o desactiva un fallo en caliente. */
  fallo: { activo: ((ll: LlamadaAirtable) => boolean) | null };
}

/**
 * Pedido SIRIUS-PED-0901 de 300 kg de biochar para CL-0901; baches S-00140 (100 kg),
 * S-00141 (200 kg) y S-00142 (50 kg) en el Core y en PiroliApp.
 */
function escenario(o: { lineas?: Array<{ producto: string; kg: number }>; estadoPedido?: string } = {}): Escenario {
  const fallo: Escenario['fallo'] = { activo: null };
  const falso: AirtableFalso = new AirtableFalso({
    fallar: (ll) => (fallo.activo?.(ll) ? { status: 422 } : null),
    alCrear: { [`${B.rem}/${T.remisiones}`]: (f, n) => ({ numeracion: f.numeracion ?? n }) },
    computados: {
      [`${B.rem}/${T.remisiones}`]: (rec) => ({
        ID: `SIRIUS-REM-${String(98 + Number(rec.fields.numeracion)).padStart(4, '0')}`,
      }),
      [`${B.rem}/${T.personas}`]: (rec) => ({ 'Codigo Persona Remision': `PER-REM-${rec.id.slice(-4)}` }),
      [`${B.loc}/${T.remLocal}`]: (rec, f) => ({
        'Detalle Cantidades Bache Pirolisis': f
          .registros(B.loc, T.detalles)
          .filter((d) => ((d.fields['Remisiones Baches Pirolisis'] as string[]) ?? []).includes(rec.id))
          .map((d) => d.id),
      }),
      [`${B.inv}/${T.stock}`]: (rec, f) => {
        let saldo = 0;
        for (const mv of f.registros(B.inv, T.movimientos)) {
          if (mv.fields.product_id !== rec.fields.producto_id) continue;
          saldo += (mv.fields.tipo_movimiento === 'Entrada' ? 1 : -1) * Number(mv.fields.cantidad);
        }
        return { stock_actual: saldo };
      },
    },
  });
  falso.autonumeroDesde(B.rem, T.remisiones, 802);

  // Clients Core
  const areaId = falso.sembrar(B.cli, T.areas, { ID: 'AC-0901', 'Nombre Area': 'Sanidad', 'Estado Area': 'Activo' });
  falso.sembrar(B.cli, T.clientes, { ID: 'CL-0901', Cliente: CLIENTE, distancia_bodega_km: 12, 'Areas Cliente': [areaId] });
  falso.sembrar(B.cli, T.clientes, { ID: 'CL-0902', Cliente: 'OTRO CLIENTE FALSO', distancia_bodega_km: 30 });

  // Pedidos Core
  const lineas = o.lineas ?? [{ producto: PURO, kg: 300 }];
  const pedidoId = 'recPEDIDOFALSO901';
  const detalleIds = lineas.map((l) =>
    falso.sembrar(B.ped, T.detallesPedido, { 'ID Producto Core': l.producto, 'Cantidad Pedido': l.kg, Pedido: [pedidoId] })
  );
  falso.sembrar(
    B.ped,
    T.pedidos,
    {
      'ID Pedido Core': 'SIRIUS-PED-0901',
      Estado: o.estadoPedido ?? 'Recibido',
      'ID Cliente Core': 'CL-0901',
      'ID Area Cliente': 'AC-0901',
      'Fecha de Pedido': '2026-10-20T15:00:00.000Z',
      'Detalles del Pedido': detalleIds,
    },
    pedidoId
  );
  falso.sembrar(B.ped, T.pedidos, {
    'ID Pedido Core': 'SIRIUS-PED-0902',
    Estado: 'Recibido',
    'ID Cliente Core': 'CL-0902',
    'Detalles del Pedido': [],
  });

  // Inventario Production Core
  falso.sembrar(B.inv, T.stock, { producto_id: PURO });
  const baches: Record<string, string> = {};
  for (const [codigo, kg] of [['S-00140', 100], ['S-00141', 200], ['S-00142', 50]] as const) {
    falso.sembrar(B.inv, T.movimientos, {
      product_id: PURO,
      tipo_movimiento: 'Entrada',
      cantidad: kg,
      bache_origen_id: codigo,
      documento_referencia: `BODEGA-${codigo}`,
    });
    baches[codigo] = falso.sembrar(B.loc, T.baches, {
      'Codigo Bache': codigo,
      'Estado Bache': 'Bache Completo Bodega',
      'Total Cantidad Actual Biochar Seco': kg,
    });
  }

  return { falso, baches, pedidoId, fallo };
}

function instalar(e: Escenario) {
  jest.spyOn(global, 'fetch').mockImplementation(e.falso.fetch as typeof fetch);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
}

const entradaBase = {
  idPedido: 'SIRIUS-PED-0901',
  responsableEntrega: 'Operario Prueba',
  realizaRegistro: 'Usuario Prueba',
  fechaDespacho: '2026-10-21',
};

const transportista = { nombre: 'Conductor Prueba', cedula: '1234567' };

async function ensayar(kg: number) {
  return m.despacharPedidoBiochar({ ...entradaBase, kg }, { dryRun: true });
}

function remisionDelCore(e: Escenario) {
  return e.falso.registros(B.rem, T.remisiones).find((r) => r.fields['ID Pedido'] === 'SIRIUS-PED-0901');
}

describe('ensayo', () => {
  it('no escribe nada y reparte FIFO sobre lo despachable', async () => {
    const e = escenario();
    // Otro pedido tiene un despacho a medias que ya prometió 30 kg de S-00140.
    e.falso.sembrar(B.rem, T.remisiones, {
      numeracion: 700,
      'Area Origen': 'Producción',
      Estado: 'Borrador',
      'ID Pedido': 'SIRIUS-PED-0902',
      'ID Cliente': 'CL-0902',
      'Notas de Remisión': `[bache:S-00140=30.00] [desp:${UUID_OTRO}] Biochar`,
    });
    instalar(e);

    const r = await ensayar(200);

    expect(e.falso.escrituras()).toHaveLength(0);
    expect(r.plan.idDespacho).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.plan.kg).toBe(200);
    expect(r.plan.reparto.map((b) => [b.bache, b.kg, b.comprometido, b.disponible])).toEqual([
      ['S-00140', 70, 30, 70],
      ['S-00141', 130, 0, 200],
    ]);
    expect(r.plan.reparto[0].estadoNuevo).toBe('Bache Incompleto');
    expect(r.plan.pedido).toEqual({
      codigo: 'SIRIUS-PED-0901',
      cliente: CLIENTE,
      idCliente: 'CL-0901',
      kgSolicitados: 300,
      kgDespachados: 0,
      kgPendientes: 300,
    });
    expect(r.plan.areaCliente).toEqual({ codigo: 'AC-0901', nombre: 'Sanidad' });
    expect(r.plan.co2SecuestradoKg).toBe(500);
    expect(r.plan.biochar.disponibleDespachable).toBe(320);
    expect(r.plan.estadoPedidoResultante).toBe('Enviado Parcial');
    expect(r.plan.despachoIncompleto).toBeNull();
  });

  it('sin kg despacha lo pendiente, recortado a lo despachable', async () => {
    const e = escenario({ lineas: [{ producto: PURO, kg: 1000 }] });
    instalar(e);
    const r = await m.despacharPedidoBiochar({ ...entradaBase }, { dryRun: true });
    expect(r.plan.kg).toBe(350);
    expect(r.plan.reparto.map((b) => b.bache)).toEqual(['S-00140', 'S-00141', 'S-00142']);
  });

  it.each([
    ['más de lo pendiente', {}, 301, /solo le faltan 300,00 kg/],
    ['más de lo despachable', { lineas: [{ producto: PURO, kg: 1000 }] }, 400, /hay 350,00 kg de biochar despachable/],
    ['pedido sin línea 0015', { lineas: [{ producto: BLEND, kg: 500 }] }, 10, /no tiene una línea de biochar/],
    ['pedido cerrado', { estadoPedido: 'Completado' }, 10, /ya no está pendiente/],
  ])('409 por %s, sin escribir', async (_n, o, kg, error) => {
    const e = escenario(o as Parameters<typeof escenario>[0]);
    instalar(e);
    await expect(ensayar(kg as number)).rejects.toThrow(error as RegExp);
    await expect(ensayar(kg as number)).rejects.toBeInstanceOf(m.DespachoBiocharInvalido);
    expect(e.falso.escrituras()).toHaveLength(0);
  });

  it('un Borrador del mismo pedido bloquea y lo nombra', async () => {
    const e = escenario();
    e.falso.sembrar(B.rem, T.remisiones, {
      numeracion: 700,
      'Area Origen': 'Producción',
      Estado: 'Borrador',
      'ID Pedido': 'SIRIUS-PED-0901',
      'ID Cliente': 'CL-0901',
      'Notas de Remisión': `[bache:S-00140=10.00] [desp:${UUID_OTRO}] Biochar`,
    });
    instalar(e);
    const err = await ensayar(10).catch((x) => x);
    expect(err).toBeInstanceOf(m.DespachoBiocharInvalido);
    expect(err.despachoIncompleto).toEqual({ codigo: 'SIRIUS-REM-0798', estado: 'Borrador' });
  });

  it('una lectura caída es LecturaCoreFallida (503), no "no hay pedido"', async () => {
    const e = escenario();
    e.fallo.activo = (ll) => ll.base === B.ped;
    instalar(e);
    await expect(ensayar(10)).rejects.toBeInstanceOf(m.LecturaCoreFallida);
  });
});

describe('confirmación', () => {
  it('escribe en el orden del ancla en Borrador, con la Salida de la sección B', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(200);

    const r = await m.despacharPedidoBiochar({
      ...entradaBase,
      kg: 200,
      idDespacho: plan.idDespacho,
      reparto: plan.reparto.map((b) => ({ bache: b.bache, kg: b.kg })),
      transportista,
      observaciones: 'Entrega en portería',
    });

    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.step)).toEqual([
      'remision',
      'producto_remitido',
      'lectura',
      'transportista',
      'local',
      'core:S-00140',
      'core:S-00141',
      'activar',
      'estado_baches',
      'verificacion_saldo',
      'estado_pedido',
      'enlace',
      'documento',
    ]);
    expect(r.steps.filter((s) => !s.ok && !s.skipped)).toEqual([]);
    expect(r.steps.find((s) => s.step === 'enlace')).toMatchObject({ ok: false, skipped: true });

    const codigo = 'SIRIUS-REM-0901';
    expect(r.remision?.codigo).toBe(codigo);
    expect(r.remision?.estado).toBe('En Tránsito');
    expect(r.remision?.bachesRemitidos).toEqual([{ bache: 'S-00140', kg: 100 }, { bache: 'S-00141', kg: 100 }]);

    // Orden de las escrituras por base: el inventario va DESPUÉS del Borrador y
    // ANTES de activar.
    const esc = e.falso.escrituras().map((l) => `${l.metodo} ${l.tabla}${l.body && (l.body as { fields?: { Estado?: string } }).fields?.Estado ? `:${(l.body as { fields: { Estado: string } }).fields.Estado}` : ''}`);
    const i = (s: string) => esc.findIndex((x) => x.startsWith(s));
    expect(i(`POST ${T.remisiones}`)).toBeLessThan(i(`POST ${T.remLocal}`));
    expect(i(`POST ${T.remLocal}`)).toBeLessThan(i(`POST ${T.movimientos}`));
    expect(i(`POST ${T.movimientos}`)).toBeLessThan(i(`PATCH ${T.remisiones}:En Tránsito`));

    // La remisión nace en Borrador, con las marcas y una fila 0015 por el total.
    const post = e.falso.escrituras().find((l) => l.metodo === 'POST' && l.tabla === T.remisiones)!;
    expect((post.body as { records: Array<{ fields: Record<string, unknown> }> }).records[0].fields).toMatchObject({
      Estado: 'Borrador',
      'Area Origen': 'Producción',
      'ID Area Cliente': 'AC-0901',
      'Notas de Remisión': `[bache:S-00140=100.00] [bache:S-00141=100.00] [desp:${plan.idDespacho}] Biochar — Entrega en portería`,
    });
    const producto = e.falso.escrituras().find((l) => l.tabla === T.productos)!;
    expect((producto.body as { records: Array<{ fields: Record<string, unknown> }> }).records).toEqual([
      { fields: expect.objectContaining({ 'ID Producto': PURO, Cantidad: 200, Unidad: 'Kg', Notas: 'Baches S-00140 (100,00 kg), S-00141 (100,00 kg)' }) },
    ]);

    // Las Salidas: una por bache, en UN POST de hasta 10, vinculadas al stock.
    const salidas = e.falso.escrituras().filter((l) => l.metodo === 'POST' && l.tabla === T.movimientos);
    expect(salidas).toHaveLength(1);
    const stockId = e.falso.registros(B.inv, T.stock)[0].id;
    expect((salidas[0].body as { records: Array<{ fields: Record<string, unknown> }> }).records[0].fields).toEqual({
      product_id: PURO,
      tipo_movimiento: 'Salida',
      cantidad: 100,
      unidad_medida: 'kg',
      motivo: 'Despacho Remisión',
      documento_referencia: `DESP-${codigo}-S-00140`,
      fecha_movimiento: '2026-10-21T12:00:00.000Z',
      bache_origen_id: 'S-00140',
      produccion_destino_id: codigo,
      responsable: 'Operario Prueba',
      observaciones: `Despacho comercial de Biochar del bache S-00140 al pedido SIRIUS-PED-0901 (remisión ${codigo}).`,
      ubicacion_destino_id: 'CL-0901',
      ubicacion_origen_id: codigo,
      Stock_Actual: [stockId],
    });

    // La vista local: UNA remisión con el nombre exacto del cliente y la marca.
    const locales = e.falso.registros(B.loc, T.remLocal);
    expect(locales).toHaveLength(1);
    expect(locales[0].fields).toMatchObject({
      Cliente: CLIENTE,
      'Realiza Registro': 'Usuario Prueba',
      'Fecha Evento': '2026-10-21',
      Observaciones: `Despacho comercial de Biochar · pedido SIRIUS-PED-0901 · remisión ${codigo}\nEntrega en portería\n[DESPACHO:${codigo}]`,
    });
    expect(e.falso.registros(B.loc, T.detalles).map((d) => d.fields['Cantidad Especificada (KG)'])).toEqual([100, 100]);

    // Estados: S-00140 queda vacío; S-00141 a medias; el pedido, parcial.
    expect(e.falso.registro(B.loc, T.baches, e.baches['S-00140'])?.fields['Estado Bache']).toBe('Bache Agotado');
    expect(e.falso.registro(B.loc, T.baches, e.baches['S-00141'])?.fields['Estado Bache']).toBe('Bache Incompleto');
    expect(e.falso.registro(B.ped, T.pedidos, e.pedidoId)?.fields.Estado).toBe('Enviado Parcial');
    // El documento quedó adjunto.
    expect(remisionDelCore(e)?.fields['Documento Remision']).toEqual([expect.objectContaining({ filename: `${codigo}.pdf` })]);

    // Repetir la confirmación con la misma llave no escribe NADA.
    const antes = e.falso.escrituras().length;
    const otra = await m.despacharPedidoBiochar({
      ...entradaBase,
      kg: 200,
      idDespacho: plan.idDespacho,
      reparto: plan.reparto.map((b) => ({ bache: b.bache, kg: b.kg })),
      transportista,
    });
    expect(otra.yaExistia).toBe(true);
    expect(otra.ok).toBe(true);
    expect(otra.remision?.codigo).toBe(codigo);
    expect(e.falso.escrituras().slice(antes).map(resumenEscritura)).toEqual([]);
    expect(e.falso.registros(B.rem, T.remisiones)).toHaveLength(1);
  });

  it('un reparto que ya no cabe es 409 sin escribir', async () => {
    const e = escenario();
    instalar(e);
    await expect(
      m.despacharPedidoBiochar({
        ...entradaBase,
        kg: 150,
        idDespacho: '0b6f3a52-6d1e-4c8a-9f3e-2a1b4c5d6e7f',
        reparto: [{ bache: 'S-00140', kg: 150 }],
      })
    ).rejects.toThrow(/saldo cambió/);
    expect(e.falso.escrituras()).toHaveLength(0);
  });

  it('un fallo en el Core deja Borrador; «completar» lo termina y la segunda vez no escribe', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(120);
    e.fallo.activo = (ll) => ll.metodo === 'POST' && ll.tabla === T.movimientos;

    const r = await m.despacharPedidoBiochar({
      ...entradaBase,
      kg: 120,
      idDespacho: plan.idDespacho,
      reparto: plan.reparto.map((b) => ({ bache: b.bache, kg: b.kg })),
    });

    expect(r.ok).toBe(false);
    expect(r.steps.map((s) => [s.step, s.ok])).toEqual([
      ['remision', true],
      ['producto_remitido', true],
      ['lectura', true],
      ['local', true],
      ['core:S-00140', false],
      ['core:S-00141', false],
    ]);
    expect(remisionDelCore(e)?.fields.Estado).toBe('Borrador');

    // Anular con inventario escrito (la vista local) no procede.
    await expect(m.completarDespachoBiochar('SIRIUS-REM-0901', { realizaRegistro: 'Usuario Prueba', accion: 'anular' }))
      .rejects.toThrow(/ya tiene inventario escrito/);

    e.fallo.activo = null;
    const c = await m.completarDespachoBiochar('SIRIUS-REM-0901', { realizaRegistro: 'Usuario Prueba' });
    expect(c.ok).toBe(true);
    expect(c.yaCompleto).toBe(false);
    expect(c.steps.find((s) => s.step === 'local')).toMatchObject({ ok: true, skipped: true });
    expect(c.steps.filter((s) => s.step.startsWith('core:')).every((s) => s.ok && !s.skipped)).toBe(true);
    expect(remisionDelCore(e)?.fields.Estado).toBe('Pendiente');
    // Sin duplicar el consumo local.
    expect(e.falso.registros(B.loc, T.detalles)).toHaveLength(2);

    const antes = e.falso.escrituras().length;
    const c2 = await m.completarDespachoBiochar('SIRIUS-REM-0901', { realizaRegistro: 'Usuario Prueba' });
    expect(c2).toMatchObject({ ok: true, yaCompleto: true });
    expect(e.falso.escrituras().slice(antes)).toEqual([]);
  });

  it('anular un Borrador sin inventario lo pasa a Cancelada', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(50);
    e.fallo.activo = (ll) => ll.metodo === 'POST' && ll.tabla === T.remLocal;

    const r = await m.despacharPedidoBiochar({
      ...entradaBase,
      kg: 50,
      idDespacho: plan.idDespacho,
      reparto: plan.reparto.map((b) => ({ bache: b.bache, kg: b.kg })),
    });
    expect(r.ok).toBe(false);
    expect(r.steps.find((s) => s.step === 'local')?.ok).toBe(false);
    expect(e.falso.escrituras().some((l) => l.tabla === T.movimientos)).toBe(false);

    e.fallo.activo = null;
    const a = await m.completarDespachoBiochar('SIRIUS-REM-0901', { realizaRegistro: 'Usuario Prueba', accion: 'anular' });
    expect(a.ok).toBe(true);
    expect(remisionDelCore(e)?.fields.Estado).toBe('Cancelada');

    // Anulada ya no se completa ni se anula otra vez.
    await expect(m.completarDespachoBiochar('SIRIUS-REM-0901', { realizaRegistro: 'Usuario Prueba' }))
      .rejects.toBeInstanceOf(m.DespachoBiocharInvalido);
  });

  it('completar una remisión ajena o inexistente es RemisionBiocharNoEncontrada', async () => {
    const e = escenario();
    e.falso.sembrar(B.rem, T.remisiones, {
      numeracion: 15,
      'Area Origen': 'Laboratorio',
      Estado: 'Borrador',
      'Notas de Remisión': '[bache:S-00140=5.00] Biochar',
    });
    instalar(e);
    await expect(m.completarDespachoBiochar('SIRIUS-REM-0113', { realizaRegistro: 'x' })).rejects.toBeInstanceOf(
      m.RemisionBiocharNoEncontrada
    );
    await expect(m.completarDespachoBiochar('SIRIUS-REM-9999', { realizaRegistro: 'x' })).rejects.toBeInstanceOf(
      m.RemisionBiocharNoEncontrada
    );
    expect(e.falso.escrituras()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Robustez: documentos anulados o recibidos, carreras entre instancias y fallos
// después de emitir. Cada caso escribía inventario (o lo perdía de vista) antes
// del arreglo.
// ─────────────────────────────────────────────────────────────────────────────

const CODIGO = 'SIRIUS-REM-0901';

/** Cambia el estado de la remisión del Core como lo haría otra app (no por el módulo). */
async function fijarEstado(e: Escenario, estado: string) {
  const rec = remisionDelCore(e)!;
  await e.falso.fetch(`https://api.airtable.com/v0/${B.rem}/${T.remisiones}/${rec.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Estado: estado } }),
  });
}

function confirmarCon(plan: { idDespacho: string; kg: number; reparto: Array<{ bache: string; kg: number }> }) {
  return m.despacharPedidoBiochar({
    ...entradaBase,
    kg: plan.kg,
    idDespacho: plan.idDespacho,
    reparto: plan.reparto.map((b) => ({ bache: b.bache, kg: b.kg })),
  });
}

const escribeInventario = (l: LlamadaAirtable) =>
  (l.tabla === T.movimientos && l.metodo === 'POST') || l.tabla === T.remLocal || l.tabla === T.detalles;

describe('robustez', () => {
  it('un reintento con la misma llave sobre una remisión ANULADA es 409 y no escribe inventario', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(50);
    e.fallo.activo = (ll) => ll.metodo === 'POST' && ll.tabla === T.remLocal;
    expect((await confirmarCon(plan)).ok).toBe(false);
    e.fallo.activo = null;
    await m.completarDespachoBiochar(CODIGO, { realizaRegistro: 'Usuario Prueba', accion: 'anular' });
    expect(remisionDelCore(e)?.fields.Estado).toBe('Cancelada');

    const antes = e.falso.escrituras().length;
    const err = await confirmarCon(plan).catch((x) => x);
    expect(err).toBeInstanceOf(m.DespachoBiocharInvalido);
    expect(err.message).toMatch(/anulada/);
    expect(e.falso.escrituras().slice(antes)).toEqual([]);
  });

  it('completar una remisión ENTREGADA y completa es yaCompleto, sin escribir ni fallar', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(120);
    expect((await confirmarCon(plan)).ok).toBe(true);
    await fijarEstado(e, 'Entregada');

    const antes = e.falso.escrituras().length;
    const c = await m.completarDespachoBiochar(CODIGO, { realizaRegistro: 'Usuario Prueba' });
    expect(c).toMatchObject({ ok: true, yaCompleto: true });
    expect(c.steps.filter((s) => !s.ok && !s.skipped)).toEqual([]);
    expect(e.falso.escrituras().slice(antes)).toEqual([]);
    expect(remisionDelCore(e)?.fields.Estado).toBe('Entregada');
  });

  it('completar una remisión ENTREGADA a la que le falta inventario es 409 y no lo escribe', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(120);
    e.fallo.activo = (ll) => ll.metodo === 'POST' && ll.tabla === T.movimientos;
    expect((await confirmarCon(plan)).ok).toBe(false);
    e.fallo.activo = null;
    await fijarEstado(e, 'Entregada');

    const antes = e.falso.escrituras().length;
    const err = await m.completarDespachoBiochar(CODIGO, { realizaRegistro: 'Usuario Prueba' }).catch((x) => x);
    expect(err).toBeInstanceOf(m.DespachoBiocharInvalido);
    expect(err.message).toMatch(/Entregada/);
    expect(e.falso.escrituras().slice(antes)).toEqual([]);
    expect(e.falso.registros(B.inv, T.movimientos).filter((mv) => mv.fields.tipo_movimiento === 'Salida')).toHaveLength(0);
  });

  it('un reintento con la misma llave que encuentra un Borrador NO lo completa: 409 con despachoIncompleto', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(120);
    e.fallo.activo = (ll) => ll.metodo === 'POST' && ll.tabla === T.movimientos;
    expect((await confirmarCon(plan)).ok).toBe(false);
    e.fallo.activo = null;

    const antes = e.falso.escrituras().length;
    const err = await confirmarCon(plan).catch((x) => x);
    expect(err).toBeInstanceOf(m.DespachoBiocharInvalido);
    expect(err.despachoIncompleto).toEqual({ codigo: CODIGO, estado: 'Borrador' });
    expect(e.falso.escrituras().slice(antes)).toEqual([]);
    expect(remisionDelCore(e)?.fields.Estado).toBe('Borrador');
  });

  it('el que pierde el chequeo de líder descarta su remisión y responde «en curso» sin escribir inventario', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(200);
    // Otra instancia emite con la MISMA llave mientras esta emite la suya: su
    // remisión tiene menor numeración y aparece al releer, no antes.
    let ajena = '';
    e.fallo.activo = (ll) => {
      if (!ajena && ll.metodo === 'POST' && ll.tabla === T.remisiones) {
        ajena = e.falso.sembrar(B.rem, T.remisiones, {
          numeracion: 700,
          'Area Origen': 'Producción',
          Estado: 'Borrador',
          'ID Pedido': 'SIRIUS-PED-0901',
          'ID Cliente': 'CL-0901',
          'Notas de Remisión': `[bache:S-00140=100.00] [bache:S-00141=100.00] [desp:${plan.idDespacho}] Biochar`,
        });
      }
      return false;
    };

    const err = await confirmarCon(plan).catch((x) => x);
    expect(err).toBeInstanceOf(m.DespachoEnCurso);
    expect(err.codigoRemision).toBe('SIRIUS-REM-0798');
    // La propia se borró; la ajena sigue intacta, en Borrador y sin inventario.
    expect(e.falso.registros(B.rem, T.remisiones).map((r) => r.id)).toEqual([ajena]);
    expect(e.falso.registros(B.rem, T.productos)).toHaveLength(0);
    expect(e.falso.escrituras().filter(escribeInventario)).toEqual([]);
  });

  it('relee las Salidas justo antes del POST y escribe solo las que falten', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(200);
    // Otra instancia escribe la Salida de S-00140 mientras esta escribe la vista local.
    let sembrada = false;
    e.fallo.activo = (ll) => {
      if (!sembrada && ll.metodo === 'POST' && ll.tabla === T.remLocal) {
        sembrada = true;
        e.falso.sembrar(B.inv, T.movimientos, {
          product_id: PURO,
          tipo_movimiento: 'Salida',
          cantidad: 100,
          bache_origen_id: 'S-00140',
          produccion_destino_id: CODIGO,
          documento_referencia: `DESP-${CODIGO}-S-00140`,
        });
      }
      return false;
    };

    const r = await confirmarCon(plan);
    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.step === 'core:S-00140')).toMatchObject({ ok: true, skipped: true });
    const posts = e.falso.escrituras().filter((l) => l.metodo === 'POST' && l.tabla === T.movimientos);
    const refs = posts.flatMap((p) =>
      (p.body as { records: Array<{ fields: Record<string, unknown> }> }).records.map((x) => x.fields.documento_referencia)
    );
    expect(refs).toEqual([`DESP-${CODIGO}-S-00141`]);
  });

  it('un error de completarInterno DESPUÉS de emitir es paso crítico con el código, no un 503 sin rastro', async () => {
    const e = escenario();
    instalar(e);
    const { plan } = await ensayar(120);
    // La lectura de las Salidas del Core se cae, pero solo después de emitir el Borrador.
    let emitida = false;
    e.fallo.activo = (ll) => {
      if (ll.metodo === 'POST' && ll.tabla === T.remisiones) emitida = true;
      return emitida && ll.metodo === 'GET' && ll.tabla === T.movimientos;
    };

    const r = await confirmarCon(plan);
    expect(r.ok).toBe(false);
    expect(r.codigoRemision).toBe(CODIGO);
    const paso = r.steps.find((s) => s.step === 'completar');
    expect(paso).toMatchObject({ ok: false });
    expect(paso?.error).toMatch(/No se pudo leer/);
    expect(remisionDelCore(e)?.fields.Estado).toBe('Borrador');
    expect(e.falso.escrituras().filter(escribeInventario)).toEqual([]);
  });
});

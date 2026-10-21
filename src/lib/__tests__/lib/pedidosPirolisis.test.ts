/**
 * @jest-environment node
 */

/**
 * Pedidos de pirólisis: Blend (0016) y biochar puro (0015).
 *
 * Lo que se protege:
 *  1. CARACTERIZACIÓN de `listarPedidosBlend()`: se escribió contra el código
 *     anterior al cambio y tiene que seguir pasando igual. La pantalla de bodega y
 *     el despacho de Blend leen esa lista, y agregar el biochar no puede mover ni
 *     un kg de lo que ya mostraban.
 *  2. `clasificarPedidos()` (puro): pedido solo 0015, solo 0016 y mixto; el
 *     respaldo por `Origen del Pedido` solo para Blend; lo despachado del biochar
 *     sale de las marcas de sus remisiones no canceladas, Borrador incluido.
 *
 * Datos inventados: ningún record ID, cédula ni nombre real.
 */

import { AirtableFalso } from '@/test-utils/airtable-falso';
import type { RemisionCruda } from '@/lib/remision-pirolisis.constants';

const B_PED = 'basePedFalsa';
const B_REM = 'baseRemFalsa';
const B_INV = 'baseInvFalsa';
const B_CLI = 'baseCliFalsa';
const T = {
  pedidos: 'tblPedidos',
  detalles: 'tblDetalles',
  remisiones: 'tblRemisiones',
  movimientos: 'tblMovimientos',
  clientes: 'tblClientes',
};
const BLEND = 'PRODUCTO-BLEND-FALSO';
const PURO = 'PRODUCTO-PURO-FALSO';
const LAB = 'PRODUCTO-LAB-FALSO';

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_PEDIDOS_CORE_BASE_ID: B_PED,
    AIRTABLE_PEDIDOS_CORE_PEDIDOS_TABLE: T.pedidos,
    AIRTABLE_PEDIDOS_CORE_DETALLES_TABLE: T.detalles,
    AIRTABLE_PEDIDOS_CORE_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B_REM,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_BASE_SIRIUS_INVENTARIO: B_INV,
    AIRTABLE_API_KEY_SIRIUS_INVENTARIO: 'token-falso',
    AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS: T.movimientos,
    AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID: BLEND,
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PURO,
    AIRTABLE_CLIENTES_BASE_ID: B_CLI,
    AIRTABLE_CLIENTES_TABLE_ID: T.clientes,
    AIRTABLE_CLIENTES_TOKEN: 'token-falso',
  });
}

type Modulo = typeof import('@/lib/pedidos-blend-core');
let mod: Modulo;

beforeAll(async () => {
  entorno();
  mod = await import('@/lib/pedidos-blend-core');
});

afterEach(() => jest.restoreAllMocks());

/**
 * El escenario de la caracterización: los casos que la lista de Blend ya
 * resolvía (detalle, notas, sin dato, varias líneas, detalle huérfano, pedido
 * ajeno, remisión del laboratorio del mismo pedido, Salida sin remisión).
 */
function sembrarHistoria(falso: AirtableFalso, o: { conBiochar?: boolean } = {}) {
  falso.sembrar(B_CLI, T.clientes, { ID: 'CL-0901', Cliente: 'Cliente Falso Uno' });
  falso.sembrar(B_CLI, T.clientes, { ID: 'CL-0902', Cliente: '  Cliente Falso Dos  ' });

  const dA = falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': BLEND, 'Cantidad Pedido': 1000 });
  const dC1 = falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': BLEND, 'Cantidad Pedido': 200 });
  const dC2 = falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': BLEND, 'Cantidad Pedido': 300.5 });
  const dD = falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': LAB, 'Cantidad Pedido': 50 });
  // Detalle de Blend que perdió su link al pedido: no suma a nadie.
  falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': BLEND, 'Cantidad Pedido': 777 });

  const extra: Record<string, string[]> = { A: [dA], C: [dC1, dC2], D: [dD] };
  if (o.conBiochar) {
    // Mixto: la misma A pide también biochar puro; F pide solo biochar.
    extra.A.push(falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': PURO, 'Cantidad Pedido': 300 }));
    extra.F = [
      falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': PURO, 'Cantidad Pedido': 400 }),
      falso.sembrar(B_PED, T.detalles, { 'ID Producto Core': PURO, 'Cantidad Pedido': 100.25 }),
    ];
  }

  const ped = (codigo: string, fields: Record<string, unknown>, detalles: string[] = []) =>
    falso.sembrar(B_PED, T.pedidos, { 'ID Pedido Core': codigo, ...fields, 'Detalles del Pedido': detalles });

  const idA = ped('SIRIUS-PED-0901', {
    Estado: 'Procesando',
    'ID Cliente Core': 'CL-0901',
    'ID Area Cliente': ' AC-0901 ',
    'Fecha de Pedido': '2026-10-05T15:00:00.000Z',
    Notas: 'Producto: Biochar Blend | KG: 999 — Empaque: Big Bag | entregar en la mañana',
  }, extra.A);
  const idB = ped('SIRIUS-PED-0902', {
    Estado: 'Recibido',
    'Origen del Pedido': 'PiroliApp (Pirolisis)',
    'ID Cliente Core': 'CL-0902',
    'Fecha de Pedido': '2026-09-20T15:00:00.000Z',
    Notas: 'Producto: Biochar Blend | KG: 1.500,5 — Empaque: Lona',
  });
  const idC = ped('SIRIUS-PED-0903', {
    Estado: 'Completado',
    'ID Cliente Core': 'CL-0999',
    'Fecha de Pedido': '2026-08-01T15:00:00.000Z',
  }, extra.C);
  const idD = ped('SIRIUS-PED-0904', {
    Estado: 'Procesando',
    'Origen del Pedido': 'DataLab (Laboratorio)',
    'ID Cliente Core': 'CL-0901',
    'Fecha de Pedido': '2026-07-01T15:00:00.000Z',
  }, extra.D);
  const idE = ped('SIRIUS-PED-0905', {
    Estado: 'Enviado',
    'Origen del Pedido': 'PiroliApp (Pirolisis)',
    'Fecha de Pedido': '2026-09-10T15:00:00.000Z',
  });
  const idG = ped('SIRIUS-PED-0907', {
    Estado: 'Enviado Parcial',
    'Origen del Pedido': 'PiroliApp (Pirolisis)',
    'ID Cliente Core': 'CL-0901',
    Notas: 'KG: 80',
  });
  let idF = '';
  if (o.conBiochar) {
    idF = ped('SIRIUS-PED-0906', {
      Estado: 'Procesando',
      'Origen del Pedido': 'PiroliApp (Pirolisis)',
      'ID Cliente Core': 'CL-0902',
      'Fecha de Pedido': '2026-10-10T15:00:00.000Z',
      Notas: 'Empaque: Lona | llamar antes',
    }, extra.F);
  }

  const rem = (n: number, fields: Record<string, unknown>) =>
    falso.sembrar(B_REM, T.remisiones, {
      ID: `SIRIUS-REM-${String(n).padStart(4, '0')}`,
      numeracion: n - 98,
      ...fields,
    });
  rem(301, { 'ID Pedido': 'SIRIUS-PED-0901', 'Area Origen': 'Producción', Estado: 'Entregada', 'Notas de Remisión': '[lote:BLEND-2026-10-06-SIRIUS-PED-0901] Biochar Blend', 'Total Cantidad Remitida': 500 });
  // Del laboratorio, del mismo pedido: hoy la lista de Blend la muestra.
  rem(302, { 'ID Pedido': 'SIRIUS-PED-0901', 'Area Origen': 'Laboratorio', Estado: 'Borrador', 'Notas de Remisión': 'Muestras' });
  rem(303, { 'ID Pedido': 'SIRIUS-PED-0903', 'Area Origen': 'Producción', Estado: 'Entregada', 'Notas de Remisión': '[lote:BLEND-2026-08-02] Biochar Blend', 'Total Cantidad Remitida': 500 });
  rem(304, { 'Area Origen': 'Producción', Estado: 'Cancelada', 'Notas de Remisión': '[blend:TEST-DIAG]' });
  if (o.conBiochar) {
    rem(305, { 'ID Pedido': 'SIRIUS-PED-0901', 'Area Origen': 'Producción', Estado: 'Entregada', 'Notas de Remisión': '[bache:S-00901=100.00] [bache:S-00902=50.50] Biochar', 'Total Cantidad Remitida': 151 });
    rem(306, { 'ID Pedido': 'SIRIUS-PED-0906', 'Area Origen': 'Producción', Estado: 'Cancelada', 'Notas de Remisión': '[bache:S-00903=999.00] Biochar' });
    rem(307, { 'ID Pedido': 'SIRIUS-PED-0906', 'Area Origen': 'Producción', Estado: 'Borrador', 'Notas de Remisión': '[bache:S-00903=120.00] Biochar — [bache:S-00999=500.00] escrito a mano' });
    rem(308, { 'ID Pedido': 'SIRIUS-PED-0906', 'Area Origen': 'Producción', Estado: 'En Tránsito', 'Notas de Remisión': '[bache:S-00904=30.25] Biochar' });
  }

  const mov = (fields: Record<string, unknown>) => falso.sembrar(B_INV, T.movimientos, fields);
  mov({ product_id: BLEND, tipo_movimiento: 'Salida', cantidad: 400, ubicacion_origen_id: 'SIRIUS-REM-0301' });
  mov({ product_id: BLEND, tipo_movimiento: 'Salida', cantidad: 100.25, ubicacion_origen_id: 'SIRIUS-REM-0301' });
  mov({ product_id: BLEND, tipo_movimiento: 'Salida', cantidad: 500, ubicacion_origen_id: 'SIRIUS-REM-0303' });
  mov({ product_id: BLEND, tipo_movimiento: 'Entrada', cantidad: 9000, ubicacion_origen_id: 'SIRIUS-REM-0301' });
  mov({ product_id: BLEND, tipo_movimiento: 'Salida', cantidad: 33, ubicacion_origen_id: '' });
  mov({ product_id: PURO, tipo_movimiento: 'Salida', cantidad: 70, ubicacion_origen_id: 'SIRIUS-REM-0301' });

  return { idA, idB, idC, idD, idE, idF, idG };
}

/** Lo que `listarPedidosBlend()` devolvía ANTES del cambio para `sembrarHistoria()`. */
function esperadoBlend(ids: ReturnType<typeof sembrarHistoria>) {
  const [g, b, a, e, c] = [
    {
      recordId: ids.idG,
      codigo: 'SIRIUS-PED-0907',
      estado: 'Enviado Parcial',
      pendiente: true,
      idCliente: 'CL-0901',
      clienteNombre: 'Cliente Falso Uno',
      idAreaCliente: '',
      fecha: '',
      kgSolicitados: 80,
      kgDespachados: 0,
      kgPendientes: 80,
      fuenteKg: 'notas',
      empaque: '',
      observaciones: '',
      remisiones: [],
    },
    {
      recordId: ids.idB,
      codigo: 'SIRIUS-PED-0902',
      estado: 'Recibido',
      pendiente: true,
      idCliente: 'CL-0902',
      clienteNombre: 'Cliente Falso Dos',
      idAreaCliente: '',
      fecha: '2026-09-20',
      kgSolicitados: 1.5,
      kgDespachados: 0,
      kgPendientes: 1.5,
      fuenteKg: 'notas',
      empaque: 'Lona',
      observaciones: '',
      remisiones: [],
    },
    {
      recordId: ids.idA,
      codigo: 'SIRIUS-PED-0901',
      estado: 'Procesando',
      pendiente: true,
      idCliente: 'CL-0901',
      clienteNombre: 'Cliente Falso Uno',
      idAreaCliente: 'AC-0901',
      fecha: '2026-10-05',
      kgSolicitados: 1000,
      kgDespachados: 500.25,
      kgPendientes: 499.75,
      fuenteKg: 'detalle',
      empaque: 'Big Bag',
      observaciones: 'entregar en la mañana',
      remisiones: ['SIRIUS-REM-0301', 'SIRIUS-REM-0302'],
    },
    {
      recordId: ids.idE,
      codigo: 'SIRIUS-PED-0905',
      estado: 'Enviado',
      pendiente: false,
      idCliente: '',
      clienteNombre: '—',
      idAreaCliente: '',
      fecha: '2026-09-10',
      kgSolicitados: 0,
      kgDespachados: 0,
      kgPendientes: 0,
      fuenteKg: 'sin-dato',
      empaque: '',
      observaciones: '',
      remisiones: [],
    },
    {
      recordId: ids.idC,
      codigo: 'SIRIUS-PED-0903',
      estado: 'Completado',
      pendiente: false,
      idCliente: 'CL-0999',
      clienteNombre: 'CL-0999',
      idAreaCliente: '',
      fecha: '2026-08-01',
      kgSolicitados: 500.5,
      kgDespachados: 500,
      kgPendientes: 0.5,
      fuenteKg: 'detalle',
      empaque: '',
      observaciones: '',
      remisiones: ['SIRIUS-REM-0303'],
    },
  ];
  // Pendientes del más viejo al más nuevo (sin fecha va al final); cerrados al revés.
  return [b, a, g, e, c];
}

function montar(o: { conBiochar?: boolean; fallar?: (url: string) => boolean } = {}) {
  const falso = new AirtableFalso({
    fallar: (ll) => (o.fallar?.(ll.url) ? { status: 503 } : null),
    // El link inverso `Pedido` del detalle lo llena Airtable: aquí se deriva de
    // `Detalles del Pedido`. Un detalle que ningún pedido apunta queda sin link.
    computados: {
      [`${B_PED}/${T.detalles}`]: (rec, f) => {
        const pedidos = f
          .registros(B_PED, T.pedidos)
          .filter((p) => ((p.fields['Detalles del Pedido'] as string[] | undefined) ?? []).includes(rec.id))
          .map((p) => p.id);
        return pedidos.length ? { Pedido: pedidos } : {};
      },
    },
  });
  const ids = sembrarHistoria(falso, o);
  jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  return { falso, ids };
}

describe('listarPedidosBlend (caracterización: la salida no cambia)', () => {
  it('devuelve exactamente lo de antes', async () => {
    const { ids } = montar();
    expect(await mod.listarPedidosBlend()).toEqual(esperadoBlend(ids));
  });

  it('con pedidos y remisiones de biochar en las mismas bases, el Blend sigue igual', async () => {
    const { ids } = montar({ conBiochar: true });
    const lista = await mod.listarPedidosBlend();
    // La remisión de biochar del pedido mixto aparece en la lista de remisiones
    // del pedido, como cualquier otra remisión del pedido: así era antes.
    const esperado = esperadoBlend(ids).map((p) =>
      p.codigo === 'SIRIUS-PED-0901' ? { ...p, remisiones: [...p.remisiones, 'SIRIUS-REM-0305'] } : p
    );
    expect(lista).toEqual(esperado);
  });

  it('si Remisiones Core falla, los pedidos salen con 0 despachado, no se esconden', async () => {
    const { ids } = montar({ fallar: (url) => url.includes(T.remisiones) });
    const lista = await mod.listarPedidosBlend();
    const esperado = esperadoBlend(ids).map((p) => ({
      ...p,
      kgDespachados: 0,
      kgPendientes: p.kgSolicitados,
      remisiones: [],
    }));
    expect(lista).toEqual(esperado);
  });

  it('si los Pedidos no se pueden leer, lanza (la ruta lo vuelve null)', async () => {
    montar({ fallar: (url) => url.includes(T.pedidos) });
    await expect(mod.listarPedidosBlend()).rejects.toThrow();
  });
});

describe('listarPedidosPirolisis', () => {
  it('separa Blend y biochar; el Blend es el mismo de listarPedidosBlend', async () => {
    const { ids } = montar({ conBiochar: true });
    const r = await mod.listarPedidosPirolisis();
    expect(r).not.toBeNull();
    expect(r!.blend.map((p) => ({ ...p, producto: undefined, despachoIncompleto: undefined }))).toEqual(
      (await mod.listarPedidosBlend())!.map((p) => ({ ...p, producto: undefined, despachoIncompleto: undefined }))
    );
    expect(r!.blend.every((p) => p.producto === 'blend' && p.despachoIncompleto === null)).toBe(true);

    expect(r!.biochar).toEqual([
      {
        recordId: ids.idA,
        codigo: 'SIRIUS-PED-0901',
        estado: 'Procesando',
        pendiente: true,
        idCliente: 'CL-0901',
        clienteNombre: 'Cliente Falso Uno',
        idAreaCliente: 'AC-0901',
        fecha: '2026-10-05',
        kgSolicitados: 300,
        kgDespachados: 150.5,
        kgPendientes: 149.5,
        fuenteKg: 'detalle',
        empaque: 'Big Bag',
        observaciones: 'entregar en la mañana',
        remisiones: ['SIRIUS-REM-0305'],
        producto: 'biochar',
        despachoIncompleto: null,
      },
      {
        recordId: ids.idF,
        codigo: 'SIRIUS-PED-0906',
        estado: 'Procesando',
        pendiente: true,
        idCliente: 'CL-0902',
        clienteNombre: 'Cliente Falso Dos',
        idAreaCliente: '',
        fecha: '2026-10-10',
        kgSolicitados: 500.25,
        // 120 del Borrador (solo lo anterior a « — ») + 30,25 en tránsito; la cancelada no.
        kgDespachados: 150.25,
        kgPendientes: 350,
        fuenteKg: 'detalle',
        empaque: 'Lona',
        observaciones: 'llamar antes',
        remisiones: ['SIRIUS-REM-0306', 'SIRIUS-REM-0307', 'SIRIUS-REM-0308'],
        producto: 'biochar',
        despachoIncompleto: 'SIRIUS-REM-0307',
      },
    ]);
  });

  it('pide los detalles de los dos productos en UNA lectura, con la fórmula escapada', async () => {
    const { falso } = montar({ conBiochar: true });
    await mod.listarPedidosPirolisis();
    const lecturas = falso.llamadas.filter((l) => l.tabla === T.detalles);
    expect(lecturas).toHaveLength(1);
    expect(lecturas[0].params.get('filterByFormula')).toBe(
      `OR({ID Producto Core} = '${BLEND}', {ID Producto Core} = '${PURO}')`
    );
    // Una lectura por tabla: nada de N+1.
    for (const t of Object.values(T)) {
      expect(falso.llamadas.filter((l) => l.tabla === t).length).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clasificarPedidos (puro)
// ─────────────────────────────────────────────────────────────────────────────

function pedido(id: string, codigo: string, fields: Record<string, unknown> = {}) {
  return { id, fields: { 'ID Pedido Core': codigo, Estado: 'Procesando', 'ID Cliente Core': 'CL-0001', ...fields } };
}
function detalle(pedidoId: string | null, producto: string, kg: number) {
  return { id: `det-${Math.random()}`, fields: { ...(pedidoId ? { Pedido: [pedidoId] } : {}), 'ID Producto Core': producto, 'Cantidad Pedido': kg } };
}
function remision(codigo: string, pedidoCodigo: string, estado: string, notas: string, numeracion: number, area = 'Producción'): RemisionCruda {
  return {
    recordId: `rec-${codigo}`,
    codigo,
    numeracion,
    estado,
    areaOrigen: area,
    idPedido: pedidoCodigo,
    idCliente: 'CL-0001',
    idAreaCliente: '',
    notas,
    kgRollup: 0,
    fechaDespacho: '',
    fechaRecibido: '',
    personasIds: [],
    documentos: [],
  };
}
const productos = { blend: BLEND, biochar: PURO };

describe('clasificarPedidos', () => {
  it('pedido solo de biochar: va solo a biochar', () => {
    const r = mod.clasificarPedidos({
      pedidos: [pedido('p1', 'SIRIUS-PED-0001')],
      detalles: [detalle('p1', PURO, 250)],
      remisiones: [],
      salidasBlend: [],
      clientes: { 'CL-0001': 'Cliente Prueba' },
      productos,
    });
    expect(r.blend).toEqual([]);
    expect(r.biochar).toHaveLength(1);
    expect(r.biochar[0]).toMatchObject({ codigo: 'SIRIUS-PED-0001', producto: 'biochar', kgSolicitados: 250, kgPendientes: 250, fuenteKg: 'detalle', clienteNombre: 'Cliente Prueba' });
  });

  it('pedido solo de Blend: va solo a Blend', () => {
    const r = mod.clasificarPedidos({
      pedidos: [pedido('p1', 'SIRIUS-PED-0001')],
      detalles: [detalle('p1', BLEND, 800)],
      remisiones: [],
      salidasBlend: [],
      clientes: {},
      productos,
    });
    expect(r.biochar).toEqual([]);
    expect(r.blend).toHaveLength(1);
    expect(r.blend[0]).toMatchObject({ producto: 'blend', kgSolicitados: 800, despachoIncompleto: null });
  });

  it('pedido mixto: aparece en las dos listas, cada una con SUS kg', () => {
    const r = mod.clasificarPedidos({
      pedidos: [pedido('p1', 'SIRIUS-PED-0001')],
      detalles: [detalle('p1', BLEND, 800), detalle('p1', PURO, 200), detalle('p1', LAB, 5)],
      remisiones: [remision('SIRIUS-REM-0500', 'SIRIUS-PED-0001', 'Pendiente', '[bache:S-00001=200.00] Biochar', 1)],
      salidasBlend: [{ id: 's1', fields: { cantidad: 300, ubicacion_origen_id: 'SIRIUS-REM-0499' } }],
      clientes: {},
      productos,
    });
    expect(r.blend[0]).toMatchObject({ kgSolicitados: 800, kgDespachados: 0 });
    expect(r.biochar[0]).toMatchObject({ kgSolicitados: 200, kgDespachados: 200, kgPendientes: 0, remisiones: ['SIRIUS-REM-0500'] });
  });

  it('origen PiroliApp sin detalle → Blend (respaldo de siempre); con detalle 0015 → solo biochar', () => {
    const origen = { 'Origen del Pedido': 'PiroliApp (Pirolisis)', Notas: 'KG: 40' };
    const r = mod.clasificarPedidos({
      pedidos: [pedido('p1', 'SIRIUS-PED-0001', origen), pedido('p2', 'SIRIUS-PED-0002', origen)],
      detalles: [detalle('p2', PURO, 60)],
      remisiones: [],
      salidasBlend: [],
      clientes: {},
      productos,
    });
    expect(r.blend.map((p) => p.codigo)).toEqual(['SIRIUS-PED-0001']);
    expect(r.blend[0]).toMatchObject({ kgSolicitados: 40, fuenteKg: 'notas' });
    expect(r.biochar.map((p) => p.codigo)).toEqual(['SIRIUS-PED-0002']);
    // Para biochar las notas no son respaldo de kg: el detalle manda.
    expect(r.biochar[0]).toMatchObject({ kgSolicitados: 60, fuenteKg: 'detalle' });
  });

  it('biochar: suma marcas de remisiones no canceladas (Borrador incluido) y solo de biochar', () => {
    const r = mod.clasificarPedidos({
      pedidos: [pedido('p1', 'SIRIUS-PED-0001')],
      detalles: [detalle('p1', PURO, 1000)],
      remisiones: [
        remision('SIRIUS-REM-0510', 'SIRIUS-PED-0001', 'Entregada', '[bache:S-00001=100.00] [bache:S-00002=50.00] Biochar', 3),
        remision('SIRIUS-REM-0511', 'SIRIUS-PED-0001', 'Borrador', '[bache:S-00003=25.50] Biochar', 4),
        remision('SIRIUS-REM-0512', 'SIRIUS-PED-0001', 'Cancelada', '[bache:S-00004=999.00] Biochar', 5),
        // Del laboratorio, con una marca de bache escrita: no es de PiroliApp.
        remision('SIRIUS-REM-0513', 'SIRIUS-PED-0001', 'Pendiente', '[bache:S-00005=10.00]', 6, 'Laboratorio'),
        // De Blend del mismo pedido: no suma al biochar.
        remision('SIRIUS-REM-0514', 'SIRIUS-PED-0001', 'Entregada', '[lote:BLEND-2026-10-01] Biochar Blend', 7),
        // De otro pedido.
        remision('SIRIUS-REM-0515', 'SIRIUS-PED-0002', 'Borrador', '[bache:S-00006=10.00] Biochar', 2),
      ],
      salidasBlend: [],
      clientes: {},
      productos,
    });
    expect(r.biochar[0]).toMatchObject({
      kgDespachados: 175.5,
      kgPendientes: 824.5,
      despachoIncompleto: 'SIRIUS-REM-0511',
      remisiones: ['SIRIUS-REM-0510', 'SIRIUS-REM-0511', 'SIRIUS-REM-0512'],
    });
  });

  it('un sobre-despacho no es deuda negativa', () => {
    const r = mod.clasificarPedidos({
      pedidos: [pedido('p1', 'SIRIUS-PED-0001')],
      detalles: [detalle('p1', PURO, 100)],
      remisiones: [remision('SIRIUS-REM-0520', 'SIRIUS-PED-0001', 'Entregada', '[bache:S-00001=120.00] Biochar', 1)],
      salidasBlend: [],
      clientes: {},
      productos,
    });
    expect(r.biochar[0].kgPendientes).toBe(0);
  });

  it('sin id de biochar configurado, no inventa pedidos de biochar', () => {
    const r = mod.clasificarPedidos({
      pedidos: [pedido('p1', 'SIRIUS-PED-0001')],
      detalles: [detalle('p1', PURO, 100)],
      remisiones: [],
      salidasBlend: [],
      clientes: {},
      productos: { blend: BLEND, biochar: '' },
    });
    expect(r).toEqual({ blend: [], biochar: [] });
  });
});

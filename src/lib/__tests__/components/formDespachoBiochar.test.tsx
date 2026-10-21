/**
 * El despacho de biochar puro en el DOM, con las APIs simuladas por URL.
 *
 * Lo que importa probar aquí es el contrato con el servidor: el ensayo muestra el
 * plan, la confirmación reenvía la llave y el reparto TAL CUAL (recalcularlo
 * caería en otros baches), un 401 dice qué hacer, un 500 separa lo que quedó a
 * medias, y un Borrador deja solo [Completar] / [Anular]. Datos inventados.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  FormDespachoBiochar,
  SeccionPedidosBiochar,
  type PedidoBiocharUI,
} from '@/app/inventario-bodega-sirius/despacho-biochar';

const PEDIDO: PedidoBiocharUI = {
  recordId: 'recPEDIDOPRUEBA001',
  codigo: 'SIRIUS-PED-9001',
  estado: 'Recibido',
  pendiente: true,
  idCliente: 'CL-9001',
  clienteNombre: 'FINCA DE PRUEBA SAS',
  idAreaCliente: '',
  fecha: '2026-10-20',
  kgSolicitados: 300,
  kgDespachados: 0,
  kgPendientes: 300,
  fuenteKg: 'detalle',
  empaque: '',
  observaciones: '',
  remisiones: [],
  producto: 'biochar',
  despachoIncompleto: null,
};

const ID_DESPACHO = '11111111-2222-4333-8444-555555555555';

const PLAN = {
  idDespacho: ID_DESPACHO,
  pedido: {
    codigo: PEDIDO.codigo,
    cliente: PEDIDO.clienteNombre,
    idCliente: PEDIDO.idCliente,
    kgSolicitados: 300,
    kgDespachados: 0,
    kgPendientes: 300,
  },
  areaCliente: null,
  kg: 200,
  co2SecuestradoKg: 400,
  reparto: [
    {
      bache: 'S-09001',
      kg: 75,
      saldoCore: 75,
      comprometido: 0,
      disponible: 75,
      disponibleDespues: 0,
      estadoActual: 'Bache Completo Bodega',
      estadoNuevo: 'Bache Agotado',
    },
    {
      bache: 'S-09002',
      kg: 125,
      saldoCore: 400,
      comprometido: 0,
      disponible: 400,
      disponibleDespues: 275,
      estadoActual: 'Bache Completo Bodega',
      estadoNuevo: 'Bache Incompleto',
    },
  ],
  biochar: { kgCore: 475, kgBaches: 475, divergencia: 0, disponibleDespachable: 475 },
  estadoPedidoResultante: 'Enviado Parcial',
  despachoIncompleto: null,
  advertencias: ['Advertencia de prueba'],
};

type Respuesta = { status: number; cuerpo: unknown };
let llamadas: Array<{ url: string; cuerpo: Record<string, unknown> | null }>;

/**
 * `despachos` se consume en orden, una respuesta por POST al despacho. Lo demás
 * (sesión, personal, áreas) responde siempre lo mismo.
 */
function simular({ me = 200, despachos = [] as Respuesta[], completar = [] as Respuesta[] } = {}) {
  llamadas = [];
  const colaDespacho = [...despachos];
  const colaCompletar = [...completar];
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string, init?: RequestInit) => {
    llamadas.push({ url, cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
    let r: Respuesta;
    if (url.startsWith('/api/me')) r = { status: me, cuerpo: {} };
    else if (url.startsWith('/api/clientes/personal')) r = { status: 200, cuerpo: { personal: [] } };
    else if (url.startsWith('/api/clientes/areas')) r = { status: 200, cuerpo: { areas: [] } };
    else if (url.endsWith('/despachar-biochar/completar')) r = colaCompletar.shift() ?? { status: 599, cuerpo: {} };
    else if (url.endsWith('/despachar-biochar')) r = colaDespacho.shift() ?? { status: 599, cuerpo: {} };
    else throw new Error(`fetch inesperado: ${url}`);
    return Promise.resolve({
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: () => null },
      json: async () => r.cuerpo,
    });
  });
}

const despachosA = () => llamadas.filter((l) => l.url.endsWith('/despachar-biochar'));

function montar(pedido: PedidoBiocharUI = PEDIDO) {
  const onListo = jest.fn();
  render(
    <FormDespachoBiochar
      pedido={pedido}
      kgBodega={475}
      baches={[
        { codigo: 'S-09001', kg: 75 },
        { codigo: 'S-09002', kg: 400 },
      ]}
      onListo={onListo}
      onCancelar={jest.fn()}
    />
  );
  return { onListo };
}

async function hastaElPlan() {
  const kg = await screen.findByLabelText(/KG a despachar/);
  fireEvent.change(kg, { target: { value: '200' } });
  const ver = screen.getByRole('button', { name: 'Ver qué se va a escribir' });
  await waitFor(() => expect(ver).toBeEnabled());
  fireEvent.click(ver);
  await screen.findByText('Esto es lo que se va a escribir:');
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FormDespachoBiochar', () => {
  it('ensaya, muestra el plan y confirma reenviando la llave y el reparto tal cual', async () => {
    simular({
      despachos: [
        { status: 200, cuerpo: { success: true, dryRun: true, plan: PLAN } },
        {
          status: 200,
          cuerpo: {
            success: true,
            message: 'Remisión SIRIUS-REM-9001 emitida por 200 kg de biochar de 2 bache(s).',
            plan: PLAN,
            remision: { codigo: 'SIRIUS-REM-9001', kg_total: 200 },
            recepcion: { url: 'https://piroliapp.example/recibir#v1.x', venceEl: '2026-10-28', qrDataUrl: null },
            steps: [{ step: 'remision', ok: true }],
          },
        },
      ],
    });
    montar();
    await hastaElPlan();

    // El ensayo pidió el TOTAL, sin llave ni reparto.
    expect(despachosA()[0].cuerpo).toMatchObject({ dryRun: true, idPedido: PEDIDO.codigo, kg: 200 });
    expect(despachosA()[0].cuerpo).not.toHaveProperty('idDespacho');

    const reparto = screen.getByRole('list', { name: 'Reparto por bache' });
    expect(reparto).toHaveTextContent('S-09001');
    expect(reparto).toHaveTextContent('Bache Agotado');
    expect(reparto).toHaveTextContent('S-09002');
    expect(screen.getByText(ID_DESPACHO)).toBeInTheDocument();
    expect(screen.getByText(/Enviado Parcial/)).toBeInTheDocument();
    expect(screen.getByText(/Advertencia de prueba/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar despacho' }));
    expect(await screen.findByText(/Remisión SIRIUS-REM-9001 emitida/)).toBeInTheDocument();

    const confirmacion = despachosA()[1].cuerpo!;
    expect(confirmacion).toMatchObject({ dryRun: false, idDespacho: ID_DESPACHO, kg: 200 });
    expect(confirmacion.reparto).toEqual([
      { bache: 'S-09001', kg: 75 },
      { bache: 'S-09002', kg: 125 },
    ]);
    // El bloque de recepción quedó a la vista.
    expect(screen.getByLabelText('Enlace de recepción de SIRIUS-REM-9001')).toBeInTheDocument();
  });

  it('con la sesión vencida avisa y no deja ensayar', async () => {
    simular({ me: 401 });
    montar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión venció');
    expect(screen.getByRole('link', { name: 'vuelve a iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('button', { name: 'Ver qué se va a escribir' })).toBeDisabled();
  });

  it('un 401 al confirmar muestra el aviso de sesión', async () => {
    simular({
      despachos: [
        { status: 200, cuerpo: { success: true, dryRun: true, plan: PLAN } },
        { status: 401, cuerpo: { success: false, error: 'Sesión vencida' } },
      ],
    });
    montar();
    await hastaElPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar despacho' }));
    expect(await screen.findByText(/Tu sesión venció/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar despacho' })).toBeDisabled();
  });

  it('un 500 muestra el error legible y separa lo que quedó a medias; Reintentar reusa la llave', async () => {
    const fallo = {
      status: 500,
      cuerpo: {
        success: false,
        error: 'No se pudo escribir la salida del bache S-09002',
        remision: { codigo: 'SIRIUS-REM-9002' },
        steps: [
          { step: 'remision', ok: true },
          { step: 'core:S-09002', ok: false, error: 'Airtable 422' },
          { step: 'enlace', ok: false, skipped: true },
        ],
      },
    };
    simular({
      despachos: [{ status: 200, cuerpo: { success: true, dryRun: true, plan: PLAN } }, fallo, fallo],
    });
    montar();
    await hastaElPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar despacho' }));

    expect(await screen.findByText('No se pudo escribir la salida del bache S-09002')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pasos que quedaron a medias' })).toHaveTextContent('S-09002');
    expect(screen.getByRole('list', { name: 'Pasos que no aplicaron' })).toHaveTextContent('enlace');
    expect(screen.getByText(/SIRIUS-REM-9002/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(despachosA()).toHaveLength(3));
    expect(despachosA()[2].cuerpo).toMatchObject({ idDespacho: ID_DESPACHO, dryRun: false });
  });

  it('un 500 sin remisión releída nombra el Borrador por codigoRemision; Reintentar lleva a Completar', async () => {
    simular({
      despachos: [
        { status: 200, cuerpo: { success: true, dryRun: true, plan: PLAN } },
        {
          status: 500,
          cuerpo: {
            success: false,
            error: 'No se pudo leer las Salidas del Core',
            remision: null,
            codigoRemision: 'SIRIUS-REM-9004',
            steps: [{ step: 'completar', ok: false, error: 'No se pudo leer las Salidas del Core' }],
          },
        },
        {
          status: 409,
          cuerpo: {
            success: false,
            error: 'El despacho ya tiene la remisión SIRIUS-REM-9004 en Borrador: complétela o anúlela.',
            despachoIncompleto: { codigo: 'SIRIUS-REM-9004', estado: 'Borrador' },
          },
        },
      ],
    });
    montar();
    await hastaElPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar despacho' }));

    expect(await screen.findByText(/SIRIUS-REM-9004/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Completar' })).toBeInTheDocument();
  });

  it('con un despacho en Borrador solo ofrece Completar o Anular', async () => {
    simular({
      completar: [
        {
          status: 200,
          cuerpo: {
            success: true,
            yaCompleto: false,
            remision: { codigo: 'SIRIUS-REM-9003', kg_total: 50 },
            recepcion: null,
            steps: [],
          },
        },
      ],
    });
    montar({ ...PEDIDO, despachoIncompleto: 'SIRIUS-REM-9003' });

    expect(screen.getByText(/quedó a medias/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anular' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver qué se va a escribir' })).toBeNull();
    expect(screen.queryByLabelText(/KG a despachar/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Completar' }));
    expect(await screen.findByText('Despacho SIRIUS-REM-9003 completado.')).toBeInTheDocument();
    const completar = llamadas.find((l) => l.url.endsWith('/completar'))!;
    expect(completar.cuerpo).toEqual({ remision: 'SIRIUS-REM-9003', accion: 'completar' });
  });

  it('un 409 del ensayo por un Borrador pasa al modo Completar/Anular', async () => {
    simular({
      despachos: [
        {
          status: 409,
          cuerpo: {
            success: false,
            error: 'El pedido tiene un despacho en Borrador',
            despachoIncompleto: { codigo: 'SIRIUS-REM-9004', estado: 'Borrador' },
          },
        },
      ],
    });
    montar();
    const kg = await screen.findByLabelText(/KG a despachar/);
    fireEvent.change(kg, { target: { value: '100' } });
    const ver = screen.getByRole('button', { name: 'Ver qué se va a escribir' });
    await waitFor(() => expect(ver).toBeEnabled());
    fireEvent.click(ver);
    expect(await screen.findByRole('button', { name: 'Completar' })).toBeInTheDocument();
    expect(screen.getByText(/SIRIUS-REM-9004/)).toBeInTheDocument();
  });

  it('no deja pedir más de lo que le falta al pedido', async () => {
    simular();
    montar();
    const kg = await screen.findByLabelText(/KG a despachar/);
    fireEvent.change(kg, { target: { value: '350' } });
    expect(screen.getAllByText(/Al pedido solo le faltan/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Ver qué se va a escribir' })).toBeDisabled();
  });
});

describe('SeccionPedidosBiochar', () => {
  it('un pedido con Borrador ofrece Completar en vez de Despachar', () => {
    const onDespachar = jest.fn();
    const onCompletar = jest.fn();
    render(
      <SeccionPedidosBiochar
        pedidos={[
          PEDIDO,
          { ...PEDIDO, recordId: 'recPEDIDOPRUEBA002', codigo: 'SIRIUS-PED-9002', despachoIncompleto: 'SIRIUS-REM-9005' },
        ]}
        cargando={false}
        kgBodega={475}
        onDespachar={onDespachar}
        onCompletar={onCompletar}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Despachar' }));
    expect(onDespachar).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'SIRIUS-PED-9001' }));
    fireEvent.click(screen.getByRole('button', { name: 'Completar despacho' }));
    expect(onCompletar).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'SIRIUS-PED-9002' }));
  });

  it('sin biochar en bodega no deja despachar', () => {
    render(
      <SeccionPedidosBiochar
        pedidos={[PEDIDO]}
        cargando={false}
        kgBodega={0}
        onDespachar={jest.fn()}
        onCompletar={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Despachar' })).toBeDisabled();
    expect(screen.getByText('Sin biochar en bodega')).toBeInTheDocument();
  });

  it('distingue «no se pudo leer» de «no hay pedidos»', () => {
    const { rerender } = render(
      <SeccionPedidosBiochar pedidos={null} cargando={false} kgBodega={10} onDespachar={jest.fn()} onCompletar={jest.fn()} />
    );
    expect(screen.getByText(/No se pudo leer Sirius Pedidos Core/)).toBeInTheDocument();
    rerender(
      <SeccionPedidosBiochar pedidos={[]} cargando={false} kgBodega={10} onDespachar={jest.fn()} onCompletar={jest.fn()} />
    );
    expect(screen.getByText(/no tiene pedidos de Biochar/)).toBeInTheDocument();
  });
});

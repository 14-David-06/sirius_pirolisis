/**
 * La página pública `/recibir` en el DOM, con `/api/recibir/*` simulado.
 *
 * Se prueba lo que el reductor solo no garantiza: que el token se lea del
 * fragmento y desaparezca de la URL, que el foco llegue al h1 de cada paso (es
 * lo que anuncia el cambio a un lector de pantalla), que los errores lleguen con
 * `role="alert"` y `aria-invalid`, y que el botón no se pueda pulsar dos veces
 * mientras el servidor responde. Datos inventados.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FlujoRecepcion from '@/app/recibir/FlujoRecepcion';

const TOKEN = 'v1.recAAAAAAAAAAAAAA.abc12.ABCDEFGHIJKLMNOPQRSTUV';

type Simulada = { status: number; cuerpo: unknown; headers?: Record<string, string> };

const CONSULTA_PENDIENTE: Simulada = {
  status: 200,
  cuerpo: {
    estado: 'pendiente',
    remision: {
      codigo: 'SIRIUS-REM-9001',
      producto: 'Biochar',
      kg: 200,
      cliente: 'FINCA DE PRUEBA SAS',
      area: 'Sanidad',
      fechaDespacho: '2026-10-21',
    },
    venceEl: '2026-10-28',
    textoVersion: '2026-10-21',
  },
};

let fetchMock: jest.Mock;

function respuesta(s: Simulada) {
  return {
    status: s.status,
    ok: s.status < 300,
    headers: { get: (k: string) => s.headers?.[k] ?? null },
    json: async () => s.cuerpo,
  };
}

/** Cada llamada consume la siguiente respuesta; `pendiente` deja una sin resolver. */
function simular(...respuestas: (Simulada | 'pendiente')[]) {
  const cola = [...respuestas];
  fetchMock = jest.fn(() => {
    const s = cola.shift();
    if (!s) throw new Error('fetch inesperado');
    if (s === 'pendiente') return new Promise(() => {});
    return Promise.resolve(respuesta(s));
  });
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
}

function cuerpoDe(n: number): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[n][1].body as string);
}

function abrirCon(hash: string) {
  window.history.replaceState(null, '', `/recibir${hash}`);
}

beforeEach(() => {
  window.sessionStorage.clear();
  abrirCon('');
});

async function hastaCedula() {
  simularYAbrir();
  await screen.findByLabelText(/Número de cédula/);
}

function simularYAbrir() {
  abrirCon(`#${TOKEN}`);
  render(<FlujoRecepcion />);
}

describe('FlujoRecepcion', () => {
  it('sin token muestra «enlace incompleto» y no llama al servidor', async () => {
    simular();
    render(<FlujoRecepcion />);
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Enlace incompleto' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h1).toHaveFocus();
  });

  it('lee el token del fragmento, lo guarda en sessionStorage y lo quita de la URL', async () => {
    simular(CONSULTA_PENDIENTE);
    await hastaCedula();
    expect(window.location.hash).toBe('');
    expect(window.sessionStorage.getItem('piroliapp:recibir:token')).toBe(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/recibir/consultar');
    expect(cuerpoDe(0)).toEqual({ token: TOKEN });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'omit' });
  });

  it('al recargar sin fragmento usa el token guardado', async () => {
    window.sessionStorage.setItem('piroliapp:recibir:token', TOKEN);
    simular(CONSULTA_PENDIENTE);
    render(<FlujoRecepcion />);
    await screen.findByLabelText(/Número de cédula/);
    expect(cuerpoDe(0)).toEqual({ token: TOKEN });
  });

  it('muestra el resumen y pone el foco en el h1', async () => {
    simular(CONSULTA_PENDIENTE);
    await hastaCedula();
    expect(screen.getByText('Remisión SIRIUS-REM-9001')).toBeInTheDocument();
    expect(screen.getByText(/FINCA DE PRUEBA SAS · Área Sanidad/)).toBeInTheDocument();
    expect(screen.getByText(/Vence el 28 de octubre de 2026/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Confirmar recepción' })).toHaveFocus();
  });

  it('una cédula inválida se marca en línea con role="alert" y aria-invalid, sin llamar al servidor', async () => {
    simular(CONSULTA_PENDIENTE);
    await hastaCedula();
    const campo = screen.getByLabelText(/Número de cédula/);
    fireEvent.change(campo, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Revise lo siguiente');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el botón mientras envía', async () => {
    simular(CONSULTA_PENDIENTE, 'pendiente');
    await hastaCedula();
    fireEvent.change(screen.getByLabelText(/Número de cédula/), { target: { value: '1.234.567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    const boton = await screen.findByRole('button', { name: /Verificando/ });
    expect(boton).toBeDisabled();
    expect(cuerpoDe(1)).toEqual({ token: TOKEN, cedula: '1234567' });
  });

  it('cédula conocida: muestra lo enmascarado, el aviso, y confirma en modo conocida', async () => {
    simular(
      CONSULTA_PENDIENTE,
      { status: 200, cuerpo: { conocida: true, nombre: 'Ana M. P.', correo: 'a***z@correo.test' } },
      {
        status: 200,
        cuerpo: {
          ok: true,
          codigo: 'SIRIUS-REM-9001',
          fechaRecibido: '2026-10-21',
          recibidaEn: '2026-10-21T20:04:05.000Z',
          correo: { estado: 'enviado', a: 'a***z@correo.test' },
        },
      },
    );
    await hastaCedula();
    fireEvent.change(screen.getByLabelText(/Número de cédula/), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    const h1 = await screen.findByRole('heading', { level: 1, name: '¿Es usted Ana M. P.?' });
    expect(h1).toHaveFocus();
    expect(screen.getByText('Le enviaremos la remisión al correo que tenemos registrado.')).toBeInTheDocument();
    // El correo registrado no se muestra, ni enmascarado. (El único `@` que queda
    // es el canal de derechos del aviso legal, que la Ley 1581 exige.)
    expect(document.body.textContent).not.toContain('correo.test');
    expect(screen.getByText(/Sus datos ya están registrados en Sirius/)).toBeInTheDocument();
    // Sin correo escrito no hay casilla.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    const exito = await screen.findByRole('heading', { level: 1, name: 'Recepción confirmada' });
    expect(exito).toHaveFocus();
    expect(screen.getByText(/Le enviamos la remisión a su correo/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@/);
    expect(cuerpoDe(2)).toEqual({ token: TOKEN, cedula: '1234567', modo: 'conocida', textoVersion: '2026-10-21' });
  });

  it('en la conocida, escribir un correo exige la casilla', async () => {
    simular(CONSULTA_PENDIENTE, { status: 200, cuerpo: { conocida: true, nombre: 'Ana M. P.', correo: null } });
    await hastaCedula();
    fireEvent.change(screen.getByLabelText(/Número de cédula/), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { level: 1, name: '¿Es usted Ana M. P.?' });

    fireEvent.change(screen.getByLabelText(/Correo para recibir/), { target: { value: 'ana@correo.test' } });
    const casilla = screen.getByRole('checkbox');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    expect(screen.getByRole('alert')).toHaveTextContent('autorizar el tratamiento');
    expect(casilla).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('«No soy yo» lleva al registro con la cédula, y confirma en modo nueva', async () => {
    simular(
      CONSULTA_PENDIENTE,
      { status: 200, cuerpo: { conocida: true, nombre: 'Ana M. P.', correo: null } },
      {
        status: 207,
        cuerpo: {
          ok: true,
          codigo: 'SIRIUS-REM-9001',
          fechaRecibido: '2026-10-21',
          recibidaEn: '2026-10-21T20:04:05.000Z',
          correo: { estado: 'no_enviado', a: null },
        },
      },
    );
    await hastaCedula();
    fireEvent.change(screen.getByLabelText(/Número de cédula/), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { level: 1, name: '¿Es usted Ana M. P.?' });
    fireEvent.click(screen.getByRole('button', { name: 'No soy yo' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Complete sus datos' })).toHaveFocus();
    expect(screen.getByText('•••• 4567')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'Luis Prueba Inventado' } });
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '3001234567' } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'luis@correo.test' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }));

    await screen.findByRole('heading', { level: 1, name: 'Recepción confirmada' });
    expect(screen.getByText(/El correo no salió en este momento/)).toBeInTheDocument();
    expect(cuerpoDe(2)).toEqual({
      token: TOKEN,
      cedula: '1234567',
      modo: 'nueva',
      nuevo: { nombre: 'Luis Prueba Inventado', celular: '+57 3001234567', correo: 'luis@correo.test' },
      autorizaDatos: true,
      textoVersion: '2026-10-21',
    });
  });

  it('el registro sin casilla no se envía', async () => {
    simular(CONSULTA_PENDIENTE, { status: 200, cuerpo: { conocida: false } });
    await hastaCedula();
    fireEvent.change(screen.getByLabelText(/Número de cédula/), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { level: 1, name: 'Complete sus datos' });
    expect(screen.getByText(/No encontramos el documento/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'Luis Prueba Inventado' } });
    fireEvent.change(screen.getByLabelText(/Celular/), { target: { value: '3001234567' } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'luis@correo.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recepción' }));
    expect(screen.getByRole('alert')).toHaveTextContent('autorizar el tratamiento');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('enlace vencido: pantalla de error con la fecha', async () => {
    simular({ status: 410, cuerpo: { ok: false, error: 'enlace_vencido', venceEl: '2026-10-20' } });
    simularYAbrir();
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Este enlace venció' });
    expect(h1).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Venció el 20 de octubre de 2026');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('remisión ya recibida al abrir', async () => {
    simular({ status: 200, cuerpo: { ...CONSULTA_PENDIENTE.cuerpo as object, estado: 'recibida', fechaRecibido: '2026-10-21' } });
    simularYAbrir();
    await screen.findByRole('heading', { level: 1, name: 'Esta remisión ya fue recibida' });
    expect(screen.getByRole('alert')).toHaveTextContent('Se confirmó el 21 de octubre de 2026');
  });

  it('429 dice cuánto esperar y ofrece reintentar con lo digitado', async () => {
    simular(CONSULTA_PENDIENTE, {
      status: 429,
      cuerpo: { ok: false, error: 'demasiados_intentos' },
      headers: { 'Retry-After': '300' },
    });
    await hastaCedula();
    fireEvent.change(screen.getByLabelText(/Número de cédula/), { target: { value: '1234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('heading', { level: 1, name: 'Demasiados intentos' });
    expect(screen.getByRole('alert')).toHaveTextContent('Espere 5 minutos');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText(/Número de cédula/)).toHaveValue('1234567');
  });

  it('sin red al consultar ofrece reintentar, y reintentar vuelve a consultar', async () => {
    fetchMock = jest.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(respuesta(CONSULTA_PENDIENTE));
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    simularYAbrir();
    await screen.findByRole('heading', { level: 1, name: 'No pudimos completar la confirmación' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    });
    await screen.findByLabelText(/Número de cédula/);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

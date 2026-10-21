/**
 * Las piezas compartidas de la bodega: lo que separa «quedó a medias» de «no
 * aplicó», el diálogo que no se deja cerrar mientras escribe, el aviso de sesión
 * vencida y el bloque del enlace de recepción. Datos inventados.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Modal,
  PasosConProblema,
  nombrePaso,
  useSesionServidor,
} from '@/app/inventario-bodega-sirius/componentes';
import {
  BloqueRecepcion,
  EstadoRemisionBadge,
  RemisionEmitida,
  TEXTO_RECEPCION,
} from '@/app/inventario-bodega-sirius/recepcion';

const RECEPCION = {
  url: 'https://piroliapp.example/recibir#v1.recPRUEBA0000000001.abc12.ABCDEFGHIJKLMNOPQRSTUV',
  venceEl: '2026-10-28',
  qrDataUrl: 'data:image/png;base64,AAAA',
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PasosConProblema', () => {
  it('separa lo que quedó a medias de lo que no aplicó', () => {
    render(
      <PasosConProblema
        steps={[
          { step: 'remision', ok: true },
          { step: 'documento', ok: false, error: 'Graph caído' },
          { step: 'enlace', ok: false, skipped: true, error: 'falta RECEPCION_SECRET' },
          // ok + skipped = ya estaba escrito: no es un problema y no se lista.
          { step: 'transportista', ok: true, skipped: true },
        ]}
      />
    );

    const aMedias = screen.getByRole('list', { name: 'Pasos que quedaron a medias' });
    const noAplico = screen.getByRole('list', { name: 'Pasos que no aplicaron' });
    expect(aMedias).toHaveTextContent('El PDF no quedó adjunto en el Core');
    expect(aMedias).toHaveTextContent('Graph caído');
    expect(aMedias).not.toHaveTextContent('enlace de recepción');
    expect(noAplico).toHaveTextContent('El enlace de recepción');
    expect(noAplico).not.toHaveTextContent('PDF');
    expect(screen.queryByText(/vincul/)).toBeNull();
  });

  it('no pinta nada si todo salió bien', () => {
    const { container } = render(<PasosConProblema steps={[{ step: 'remision', ok: true }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('nombra los pasos con sufijo por su código', () => {
    expect(nombrePaso('core:S-00999')).toContain('S-00999');
    expect(nombrePaso('inventario:BLEND-2026-01-01')).toContain('BLEND-2026-01-01');
    expect(nombrePaso('paso_desconocido')).toBe('paso_desconocido');
  });
});

describe('Modal', () => {
  it('se cierra con Escape y con ✕ cuando no está bloqueado', () => {
    const onCerrar = jest.fn();
    render(
      <Modal titulo="Prueba" descripcion="Descripción de prueba" onCerrar={onCerrar}>
        contenido
      </Modal>
    );
    const dialogo = screen.getByRole('dialog', { name: 'Prueba' });
    expect(dialogo).toHaveAccessibleDescription('Descripción de prueba');
    // El foco arranca en el título, dentro del diálogo.
    expect(screen.getByRole('heading', { name: 'Prueba' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCerrar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });

  it('bloqueado: ni Escape ni ✕ lo cierran', () => {
    const onCerrar = jest.fn();
    render(
      <Modal titulo="Despachando" descripcion="…" onCerrar={onCerrar} bloqueado>
        contenido
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    const cerrar = screen.getByRole('button', { name: 'Cerrar' });
    expect(cerrar).toBeDisabled();
    fireEvent.click(cerrar);
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe('useSesionServidor', () => {
  function Sonda() {
    return <p>{useSesionServidor()}</p>;
  }

  it('un 401 de /api/me es sesión vencida', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({ status: 401, ok: false });
    render(<Sonda />);
    expect(await screen.findByText('vencida')).toBeInTheDocument();
  });

  it('un fallo de red no bloquea: se deja al envío decidir', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockRejectedValue(new Error('sin red'));
    render(<Sonda />);
    expect(await screen.findByText('ok')).toBeInTheDocument();
  });
});

describe('EstadoRemisionBadge', () => {
  it('dice el estado con texto, no solo con color', () => {
    render(<EstadoRemisionBadge estado="Cancelada" />);
    expect(screen.getByText('Anulada')).toBeInTheDocument();
  });
});

describe('BloqueRecepcion', () => {
  it('muestra el QR, el enlace y comparte por WhatsApp (también al transportista)', () => {
    render(
      <BloqueRecepcion
        recepcion={RECEPCION}
        codigo="SIRIUS-REM-9001"
        producto="biochar"
        kg={200}
        telefonoTransportista="3001234567"
        nombreTransportista="Conductor Ficticio"
      />
    );

    expect(screen.getByAltText('Código QR para confirmar la recepción de SIRIUS-REM-9001')).toBeInTheDocument();
    expect(screen.getByLabelText('Enlace de recepción de SIRIUS-REM-9001')).toHaveValue(RECEPCION.url);
    expect(screen.getByText(TEXTO_RECEPCION)).toBeInTheDocument();
    expect(screen.getByText(/28 de octubre de 2026/)).toBeInTheDocument();

    const todos = screen.getByRole('link', { name: 'Compartir por WhatsApp' });
    expect(todos.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(todos.getAttribute('href') ?? '')).toContain(RECEPCION.url);

    const alTransportista = screen.getByRole('link', { name: 'WhatsApp a Conductor Ficticio' });
    expect(alTransportista.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);

    expect(screen.getByRole('link', { name: /Descargar remisión/ }).getAttribute('href')).toBe(
      '/api/pirolisis/blend/remision/pdf?remision=SIRIUS-REM-9001'
    );
  });

  it('copiar avisa por aria-live', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BloqueRecepcion recepcion={RECEPCION} codigo="SIRIUS-REM-9001" producto="blend" kg={10} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(RECEPCION.url);
  });

  it('sin enlace configurado solo ofrece el PDF', () => {
    render(<BloqueRecepcion recepcion={null} codigo="SIRIUS-REM-9001" producto="blend" kg={10} />);
    expect(screen.getByText(/no está configurada en este servidor/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Descargar remisión/ })).toBeInTheDocument();
  });
});

describe('RemisionEmitida', () => {
  it('muestra los pasos con problema y el bloque de recepción', async () => {
    const onCerrar = jest.fn();
    render(
      <RemisionEmitida
        codigo="SIRIUS-REM-9001"
        mensaje="Remisión SIRIUS-REM-9001 emitida."
        steps={[{ step: 'enlace', ok: false, skipped: true }]}
        recepcion={RECEPCION}
        producto="blend"
        kg={500}
        onCerrar={onCerrar}
      />
    );
    expect(screen.getByText('Remisión SIRIUS-REM-9001 emitida.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pasos que no aplicaron' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pasos que quedaron a medias' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });
});

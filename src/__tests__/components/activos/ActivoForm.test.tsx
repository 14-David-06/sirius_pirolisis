/**
 * Tests del formulario de alta y edición de activos.
 * Componente: src/components/activos/ActivoForm.tsx
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivoForm from '@/components/activos/ActivoForm';
import {
  actualizarActivo,
  crearActivo,
  listarTiposActivo,
  listarUbicaciones,
} from '@/lib/activos.client';
import type { ActivoFijoRecord } from '@/types/activos';

jest.mock('@/lib/activos.client');

const mockCrear = crearActivo as jest.MockedFunction<typeof crearActivo>;
const mockActualizar = actualizarActivo as jest.MockedFunction<typeof actualizarActivo>;
const mockTipos = listarTiposActivo as jest.MockedFunction<typeof listarTiposActivo>;
const mockUbicaciones = listarUbicaciones as jest.MockedFunction<typeof listarUbicaciones>;

const onSuccess = jest.fn();
const onCancel = jest.fn();

const ACTIVO_EXISTENTE: ActivoFijoRecord = {
  id: 'recACTIVO1',
  createdTime: '2026-07-01T00:00:00.000Z',
  fields: {
    codigo: 'ACT-0017',
    nombre: 'Máquina de Coser Costales',
    descripcion: '',
    estado: 'Operativo',
    tipoIds: [],
    tipos: [],
    categorias: [],
    ubicacionId: '',
    ubicacion: '',
    area: '',
    numeroSerie: '',
    marca: '',
    modelo: '',
    proveedor: '',
    fechaAdquisicion: null,
    valorAdquisicion: 0,
    fechaVencimiento: null,
    proximoMantenimiento: null,
    notas: '',
    completo: false,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTipos.mockResolvedValue([
    {
      id: 'recTIPO1',
      nombre: 'Herramientas Eléctricas',
      categoria: 'Herramienta',
      descripcion: '',
      requiereVencimiento: false,
      requiereMantenimiento: true,
      vidaUtil: 7,
    },
  ]);
  mockUbicaciones.mockResolvedValue([
    {
      id: 'recUBIC1',
      nombre: 'Planta Pirólisis',
      tipo: 'Planta',
      descripcion: '',
      codigoArea: 'SIRIUS-AREA-0009',
    },
  ]);
  mockCrear.mockResolvedValue(undefined);
  mockActualizar.mockResolvedValue(undefined);
});

/** Espera a que los selectores terminen de cargar sus catálogos. */
async function renderFormulario(props: Partial<React.ComponentProps<typeof ActivoForm>> = {}) {
  const vista = render(<ActivoForm onSuccess={onSuccess} onCancel={onCancel} {...props} />);
  await waitFor(() => expect(mockUbicaciones).toHaveBeenCalled());
  await screen.findByLabelText(/Ubicación actual/i);
  return vista;
}

describe('ActivoForm — alta', () => {
  it('muestra las secciones y los campos principales', async () => {
    await renderFormulario();

    expect(screen.getByText('Identificación')).toBeInTheDocument();
    expect(screen.getByText('Estado y ubicación')).toBeInTheDocument();
    expect(screen.getByText('Adquisición')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre del activo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Número de serie/i)).toHaveValue('');
    expect(screen.getByLabelText(/Marca/i)).toHaveValue('');
    expect(screen.getByLabelText(/Modelo/i)).toHaveValue('');
  });

  it('solo ofrece estados válidos para un registro nuevo', async () => {
    await renderFormulario();

    const select = screen.getByLabelText(/Estado operativo/i) as HTMLSelectElement;
    const opciones = [...select.options].map((opcion) => opcion.value);

    expect(select.value).toBe('Operativo');
    expect(opciones).not.toContain('Dado de Baja');
    expect(opciones).not.toContain('En Reparación');
  });

  it('exige nombre, tipo y ubicación', async () => {
    const user = userEvent.setup();
    await renderFormulario();

    await user.click(screen.getByRole('button', { name: 'Registrar activo' }));

    expect(await screen.findByText(/El nombre del activo es requerido/i)).toBeInTheDocument();
    expect(screen.getByText(/Selecciona al menos un tipo de activo/i)).toBeInTheDocument();
    // El mismo texto es el placeholder del <select>, así que se busca el
    // mensaje de error concreto (un <p>, no una <option>).
    expect(screen.getByText('Selecciona una ubicación', { selector: 'p' })).toBeInTheDocument();
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('rechaza un valor de adquisición negativo', async () => {
    const user = userEvent.setup();
    await renderFormulario();

    await user.type(screen.getByLabelText(/Nombre del activo/i), 'Taladro');
    await user.type(screen.getByLabelText(/Valor de adquisición/i), '-1000');
    await user.click(screen.getByRole('button', { name: 'Registrar activo' }));

    expect(await screen.findByText(/El valor no puede ser negativo/i)).toBeInTheDocument();
    expect(mockCrear).not.toHaveBeenCalled();
  });

  it('envía el activo con tipo y ubicación como arrays de record IDs', async () => {
    const user = userEvent.setup();
    await renderFormulario();

    await user.type(screen.getByLabelText(/Nombre del activo/i), 'Taladro percutor');

    // Selector múltiple de tipos: abrir y elegir.
    await user.click(screen.getByLabelText(/Tipo de activo/i));
    await user.click(screen.getByRole('checkbox', { name: /Herramientas Eléctricas/i }));

    await user.selectOptions(screen.getByLabelText(/Ubicación actual/i), 'recUBIC1');
    await user.type(screen.getByLabelText(/Valor de adquisición/i), '450000');

    await user.click(screen.getByRole('button', { name: 'Registrar activo' }));

    await waitFor(() => expect(mockCrear).toHaveBeenCalledTimes(1));

    expect(mockCrear).toHaveBeenCalledWith(
      expect.objectContaining({
        'Nombre del Activo': 'Taladro percutor',
        'Tipo de Activo': ['recTIPO1'],
        'Ubicación Actual': ['recUBIC1'],
        'Estado Operativo': 'Operativo',
        'Valor de Adquisición': 450000,
      })
    );
    expect(onSuccess).toHaveBeenCalledWith('Activo registrado exitosamente');
  });

  it('muestra el error devuelto por la API', async () => {
    const user = userEvent.setup();
    mockCrear.mockRejectedValueOnce(new Error('UNKNOWN_FIELD_NAME'));
    await renderFormulario();

    await user.type(screen.getByLabelText(/Nombre del activo/i), 'Taladro');
    await user.click(screen.getByLabelText(/Tipo de activo/i));
    await user.click(screen.getByRole('checkbox', { name: /Herramientas Eléctricas/i }));
    await user.selectOptions(screen.getByLabelText(/Ubicación actual/i), 'recUBIC1');
    await user.click(screen.getByRole('button', { name: 'Registrar activo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('UNKNOWN_FIELD_NAME');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('cancela sin enviar nada', async () => {
    const user = userEvent.setup();
    await renderFormulario();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mockCrear).not.toHaveBeenCalled();
  });
});

describe('ActivoForm — edición', () => {
  it('precarga los datos del activo', async () => {
    await renderFormulario({ activo: ACTIVO_EXISTENTE });

    expect(screen.getByLabelText(/Nombre del activo/i)).toHaveValue(
      'Máquina de Coser Costales'
    );
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('ofrece todos los estados, incluidos los de excepción', async () => {
    await renderFormulario({ activo: ACTIVO_EXISTENTE });

    const select = screen.getByLabelText(/Estado operativo/i) as HTMLSelectElement;
    const opciones = [...select.options].map((opcion) => opcion.value);

    expect(opciones).toContain('En Reparación');
    expect(opciones).toContain('Dado de Baja');
  });

  it('permite completar un activo heredado sin tipo ni ubicación', async () => {
    const user = userEvent.setup();
    await renderFormulario({ activo: ACTIVO_EXISTENTE });

    await user.click(screen.getByLabelText(/Tipo de activo/i));
    await user.click(screen.getByRole('checkbox', { name: /Herramientas Eléctricas/i }));
    await user.selectOptions(screen.getByLabelText(/Ubicación actual/i), 'recUBIC1');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockActualizar).toHaveBeenCalledTimes(1));

    expect(mockActualizar).toHaveBeenCalledWith('recACTIVO1', {
      'Tipo de Activo': ['recTIPO1'],
      'Ubicación Actual': ['recUBIC1'],
    });
  });

  it('avisa cuando no hay nada que guardar', async () => {
    const user = userEvent.setup();
    await renderFormulario({ activo: ACTIVO_EXISTENTE });

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/No hay cambios/i);
    expect(mockActualizar).not.toHaveBeenCalled();
  });
});

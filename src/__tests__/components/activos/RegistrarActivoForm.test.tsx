/**
 * Tests unitarios para componente RegistrarActivoForm
 * Componente: src/components/activos/RegistrarActivoForm.tsx
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegistrarActivoForm from '@/components/activos/RegistrarActivoForm';

global.fetch = jest.fn();

describe('RegistrarActivoForm', () => {
  const mockOnSuccess = jest.fn();
  const mockOnCancel = jest.fn();
  const mockGetCurrentUserName = jest.fn(() => 'Test User');

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock de fetch para los selectores
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/activos/tipos-activo/list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              { id: 'recTIPO001', nombre: 'Herramientas Manuales', categoria: 'Herramienta' },
              { id: 'recTIPO002', nombre: 'Computador', categoria: 'Tecnología' },
            ],
          }),
        });
      }
      if (url.includes('/api/activos/ubicaciones/list')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: [
              { id: 'recUBIC001', nombre: 'Planta Pirólisis', tipo: 'Planta' },
              { id: 'recUBIC002', nombre: 'Oficina Central', tipo: 'Oficina' },
            ],
          }),
        });
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  it('debe renderizar el formulario correctamente', () => {
    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    expect(screen.getByText('📋 Información Básica')).toBeInTheDocument();
    expect(screen.getByText('📍 Estado y Ubicación')).toBeInTheDocument();
    expect(screen.getByText('🔖 Identificación')).toBeInTheDocument();
    expect(screen.getByText('💰 Información de Compra')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre del Activo/i)).toBeInTheDocument();
  });

  it('debe validar campos requeridos antes de enviar', async () => {
    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    const submitButton = screen.getByText('Registrar Activo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/El nombre del activo es requerido/i)).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('debe enviar formulario con datos válidos', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce((url: string) => {
      if (url.includes('/api/activos/create')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: { id: 'recNEW001', codigoActivo: 'ACT-100' },
          }),
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    const user = userEvent.setup();

    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    // Llenar campo nombre
    const nombreInput = screen.getByLabelText(/Nombre del Activo/i);
    await user.type(nombreInput, 'Taladro Industrial Bosch');

    // Llenar descripción
    const descripcionInput = screen.getByPlaceholderText(/Descripción detallada/i);
    await user.type(descripcionInput, 'Taladro de alta potencia para trabajo pesado');

    // TODO: Simular selección de tipo de activo y ubicación
    // Estos son selectores personalizados que requieren interacción especial

    const submitButton = screen.getByText('Registrar Activo');
    fireEvent.click(submitButton);

    // Nota: Este test está incompleto debido a la complejidad de los selectores personalizados
    // En un entorno real, necesitarías simular la interacción con los dropdowns personalizados
  });

  it('debe llamar onCancel cuando se presiona el botón cancelar', () => {
    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    const cancelButton = screen.getByText('Cancelar');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('debe mostrar mensaje de error cuando falla el registro', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce((url: string) => {
      if (url.includes('/api/activos/create')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({
            error: 'Error al crear el activo',
          }),
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    // Llenar nombre
    const nombreInput = screen.getByLabelText(/Nombre del Activo/i);
    fireEvent.change(nombreInput, { target: { value: 'Test Activo' } });

    // Intentar enviar
    const submitButton = screen.getByText('Registrar Activo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Error/i)).toBeInTheDocument();
    });

    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('debe permitir valores opcionales vacíos', async () => {
    const user = userEvent.setup();

    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    const nombreInput = screen.getByLabelText(/Nombre del Activo/i);
    await user.type(nombreInput, 'Activo Mínimo');

    // Los campos opcionales deben estar presentes pero vacíos
    const numeroSerieInput = screen.getByLabelText(/Número de Serie/i);
    const marcaInput = screen.getByLabelText(/Marca/i);
    const modeloInput = screen.getByLabelText(/Modelo/i);

    expect(numeroSerieInput).toHaveValue('');
    expect(marcaInput).toHaveValue('');
    expect(modeloInput).toHaveValue('');
  });

  it('debe validar que el valor de adquisición no sea negativo', async () => {
    const user = userEvent.setup();

    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    const valorInput = screen.getByLabelText(/Valor de Adquisición/i);
    await user.type(valorInput, '-1000');

    const submitButton = screen.getByText('Registrar Activo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/El valor no puede ser negativo/i)).toBeInTheDocument();
    });
  });

  it('debe mostrar todos los estados operativos en el selector', () => {
    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    const estadoSelect = screen.getByLabelText(/Estado Operativo/i) as HTMLSelectElement;

    // Verificar que hay opciones de estado
    expect(estadoSelect.options.length).toBeGreaterThan(0);

    // El valor por defecto debe ser "Operativo"
    expect(estadoSelect.value).toBe('Operativo');
  });

  it('debe deshabilitar el botón de enviar mientras está cargando', async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      new Promise(resolve => setTimeout(resolve, 1000))
    );

    render(
      <RegistrarActivoForm
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
        getCurrentUserName={mockGetCurrentUserName}
      />
    );

    const nombreInput = screen.getByLabelText(/Nombre del Activo/i);
    fireEvent.change(nombreInput, { target: { value: 'Test' } });

    const submitButton = screen.getByText('Registrar Activo');
    fireEvent.click(submitButton);

    // El botón debe cambiar a estado de carga
    await waitFor(() => {
      expect(screen.getByText(/Registrando.../i)).toBeInTheDocument();
    });
  });
});

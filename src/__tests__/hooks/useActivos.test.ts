/**
 * Tests unitarios para hook useActivos
 * Hook: src/lib/useActivos.ts
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useActivos } from '@/lib/useActivos';

global.fetch = jest.fn();

describe('useActivos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('debe cargar activos exitosamente', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'recACTIVO001',
            codigoActivo: 'ACT-001',
            nombreActivo: 'Taladro Industrial',
            estadoOperativo: 'Operativo',
          },
          {
            id: 'recACTIVO002',
            codigoActivo: 'ACT-002',
            nombreActivo: 'Laptop Dell',
            estadoOperativo: 'Disponible en Almacén',
          },
        ],
        total: 2,
      }),
    });

    const { result } = renderHook(() => useActivos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.activos).toHaveLength(2);
    expect(result.current.data?.total).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('debe manejar errores de carga', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    const { result } = renderHook(() => useActivos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('debe aplicar filtros correctamente', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'recACTIVO001',
            codigoActivo: 'ACT-001',
            nombreActivo: 'Taladro Industrial',
            estadoOperativo: 'Operativo',
          },
        ],
        total: 1,
      }),
    });

    const filters = {
      estado: 'Operativo' as const,
    };

    const { result } = renderHook(() => useActivos(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verificar que el fetch fue llamado con los filtros
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toContain('estado=Operativo');
  });

  it('debe calcular estadísticas correctamente', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'recACTIVO001',
            estadoOperativo: 'Operativo',
            valorAdquisicion: 1000000,
          },
          {
            id: 'recACTIVO002',
            estadoOperativo: 'Operativo',
            valorAdquisicion: 2000000,
          },
          {
            id: 'recACTIVO003',
            estadoOperativo: 'En Mantenimiento',
            valorAdquisicion: 500000,
          },
        ],
        total: 3,
      }),
    });

    const { result } = renderHook(() => useActivos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const data = result.current.data!;

    expect(data.getActivosOperativos()).toHaveLength(2);
    expect(data.getActivosEnMantenimiento()).toHaveLength(1);
    expect(data.getValorTotal()).toBe(3500000);
  });

  it('debe retornar activos disponibles correctamente', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'recACTIVO001',
            estadoOperativo: 'Disponible en Almacén',
            responsableAsignado: null,
          },
          {
            id: 'recACTIVO002',
            estadoOperativo: 'Operativo',
            responsableAsignado: 'Juan Pérez',
          },
          {
            id: 'recACTIVO003',
            estadoOperativo: 'Disponible en Almacén',
            responsableAsignado: null,
          },
        ],
        total: 3,
      }),
    });

    const { result } = renderHook(() => useActivos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const disponibles = result.current.data!.getActivosDisponibles();
    expect(disponibles).toHaveLength(2);
    expect(disponibles.every(a => !a.responsableAsignado)).toBe(true);
  });

  it('debe calcular el conteo por categoría', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: 'rec1', categoria: ['Herramienta'] },
          { id: 'rec2', categoria: ['Herramienta'] },
          { id: 'rec3', categoria: ['Tecnología'] },
          { id: 'rec4', categoria: ['Vehículo'] },
        ],
        total: 4,
      }),
    });

    const { result } = renderHook(() => useActivos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const conteo = result.current.data!.getConteoPorCategoria();
    expect(conteo['Herramienta']).toBe(2);
    expect(conteo['Tecnología']).toBe(1);
    expect(conteo['Vehículo']).toBe(1);
  });

  it('debe identificar activos con vencimiento próximo', async () => {
    const hoy = new Date();
    const en15Dias = new Date(hoy.getTime() + 15 * 24 * 60 * 60 * 1000);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'recACTIVO001',
            nombreActivo: 'Extintor CO2',
            fechaVencimiento: en15Dias.toISOString().split('T')[0],
            diasParaVencimiento: 15,
          },
          {
            id: 'recACTIVO002',
            nombreActivo: 'Extintor PQS',
            fechaVencimiento: '2027-01-01',
            diasParaVencimiento: 180,
          },
        ],
        total: 2,
      }),
    });

    const { result } = renderHook(() => useActivos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const proximosVencer = result.current.data!.getActivosProximosVencer();
    expect(proximosVencer).toHaveLength(1);
    expect(proximosVencer[0].nombreActivo).toBe('Extintor CO2');
  });

  it('debe filtrar por búsqueda de texto', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 'rec1',
            nombreActivo: 'Taladro Industrial Bosch',
            codigoActivo: 'ACT-001',
          },
          {
            id: 'rec2',
            nombreActivo: 'Laptop Dell',
            codigoActivo: 'ACT-002',
          },
        ],
        total: 2,
      }),
    });

    const filters = { search: 'Taladro' };
    const { result } = renderHook(() => useActivos(filters));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(fetchCall[0]).toContain('search=Taladro');
  });
});

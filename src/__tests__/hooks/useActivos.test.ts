/**
 * Tests del hook useActivos.
 * Hook: src/lib/useActivos.ts
 *
 * El contrato que se verifica: `/api/activos/list` devuelve el parque completo
 * con los campos ya normalizados y TODO el filtrado ocurre en memoria (una sola
 * petición, sin importar cuántos filtros se apliquen).
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useActivos } from '@/lib/useActivos';
import type { ActivoFijoRecord, ActivosFilters } from '@/types/activos';

global.fetch = jest.fn();

/** Construye un registro con la forma que emite /api/activos/list. */
function activo(
  id: string,
  fields: Partial<ActivoFijoRecord['fields']>
): ActivoFijoRecord {
  return {
    id,
    createdTime: '2026-07-01T00:00:00.000Z',
    fields: {
      codigo: `ACT-${id}`,
      nombre: 'Activo',
      estado: 'Operativo',
      categorias: [],
      tipos: [],
      tipoIds: [],
      ubicacion: '',
      ubicacionId: '',
      area: '',
      responsable: '',
      asignado: false,
      valorAdquisicion: 0,
      diasVencimiento: null,
      completo: true,
      ...fields,
    },
  };
}

function mockList(records: ActivoFijoRecord[]) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ records, total: records.length }),
  });
}

/** Espera a que el hook termine la carga inicial. */
async function renderActivos(records: ActivoFijoRecord[], filters?: ActivosFilters) {
  mockList(records);
  const vista = renderHook(({ f }: { f?: ActivosFilters }) => useActivos(f), {
    initialProps: { f: filters },
  });
  await waitFor(() => expect(vista.result.current.loading).toBe(false));
  return vista;
}

const PARQUE = [
  activo('0001', {
    nombre: 'Taladro Dewalt',
    categorias: ['Herramienta'],
    tipos: ['Herramientas Eléctricas'],
    tipoIds: ['recTIPO1'],
    ubicacion: 'Planta Pirólisis',
    ubicacionId: 'recUBIC1',
    area: 'Pirólisis',
    valorAdquisicion: 1_000_000,
    marca: 'Dewalt',
  }),
  activo('0002', {
    nombre: 'Laptop Dell',
    categorias: ['Tecnología'],
    ubicacion: 'Oficina Central',
    ubicacionId: 'recUBIC2',
    responsable: 'Juan Pérez',
    asignado: true,
    valorAdquisicion: 2_000_000,
  }),
  activo('0003', {
    nombre: 'Extintor CO2',
    categorias: ['Seguridad'],
    estado: 'En Reparación',
    ubicacion: 'Planta Pirólisis',
    diasVencimiento: 10,
    fechaVencimiento: '2026-08-07',
    valorAdquisicion: 500_000,
  }),
  activo('0004', {
    nombre: 'Juego de Llaves Stanley',
    estado: 'Incompleto',
    completo: false,
  }),
  activo('0005', {
    nombre: 'Compresor viejo',
    estado: 'Dado de Baja',
    categorias: ['Equipo Industrial'],
    valorAdquisicion: 3_000_000,
  }),
];

describe('useActivos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carga los activos y expone los registros', async () => {
    const { result } = await renderActivos(PARQUE);

    expect(result.current.error).toBeNull();
    expect(result.current.registros).toHaveLength(5);
    expect(result.current.getTotalActivos()).toBe(5);
  });

  it('maneja errores de red', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useActivos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toBeNull();
  });

  it('explica el error cuando el módulo no está configurado', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Módulo de Activos Fijos no configurado' }),
    });

    const { result } = renderHook(() => useActivos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toContain('AIRTABLE_ACTIVOS_CORE_BASE_ID');
  });

  it('no vuelve a consultar Airtable al cambiar un filtro', async () => {
    const { result, rerender } = await renderActivos(PARQUE);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    rerender({ f: { estado: 'Operativo' } });
    await waitFor(() => expect(result.current.registrosFiltrados).toHaveLength(2));

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('filtra por categoría, estado y asignación', async () => {
    const { result, rerender } = await renderActivos(PARQUE, { categoria: 'Herramienta' });
    expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['0001']);

    rerender({ f: { estado: 'En Reparación' } });
    await waitFor(() => expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['0003']));

    rerender({ f: { asignacion: 'asignados' } });
    await waitFor(() => expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['0002']));
  });

  it('busca sin distinguir tildes ni mayúsculas, y en varios campos', async () => {
    const { result, rerender } = await renderActivos(PARQUE, { busqueda: 'PIROLISIS' });
    // "Pirólisis" (con tilde) coincide con la búsqueda sin tilde.
    expect(result.current.registrosFiltrados).toHaveLength(2);

    rerender({ f: { busqueda: 'dewalt' } });
    await waitFor(() => expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['0001']));

    rerender({ f: { busqueda: 'juan' } });
    await waitFor(() => expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['0002']));
  });

  it('combina búsqueda con los demás filtros', async () => {
    const { result } = await renderActivos(PARQUE, {
      busqueda: 'planta',
      estado: 'Operativo',
    });

    expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['0001']);
  });

  it('agrupa por categoría y deja "Sin clasificar" al final', async () => {
    const { result } = await renderActivos(PARQUE);

    const grupos = Object.keys(result.current.getActivosByCategoria());
    expect(grupos).toContain('Herramienta');
    expect(grupos[grupos.length - 1]).toBe('Sin clasificar');
  });

  it('lista las categorías y ubicaciones presentes en los datos', async () => {
    const { result } = await renderActivos(PARQUE);

    expect(result.current.categoriasDisponibles).toEqual(
      expect.arrayContaining(['Herramienta', 'Seguridad', 'Sin clasificar', 'Tecnología'])
    );
    expect(result.current.ubicacionesDisponibles).toEqual([
      'Oficina Central',
      'Planta Pirólisis',
    ]);
  });

  it('separa asignados de disponibles', async () => {
    const { result } = await renderActivos(PARQUE);

    expect(result.current.getActivosAsignados().map((r) => r.id)).toEqual(['0002']);
    // Disponible = sin responsable y en un estado entregable. "En Reparación",
    // "Incompleto" y "Dado de Baja" no se pueden entregar.
    expect(result.current.getActivosDisponibles().map((r) => r.id)).toEqual(['0001']);
  });

  it('identifica activos incompletos', async () => {
    const { result } = await renderActivos(PARQUE);

    expect(result.current.getActivosIncompletos().map((r) => r.id)).toEqual(['0004']);
  });

  it('clasifica vencimientos próximos y vencidos', async () => {
    const { result } = await renderActivos([
      ...PARQUE,
      activo('0006', { nombre: 'Extintor PQS', diasVencimiento: -5 }),
      activo('0007', { nombre: 'Extintor lejano', diasVencimiento: 180 }),
    ]);

    expect(result.current.getActivosProximosAVencer(30).map((r) => r.id)).toEqual(['0003']);
    expect(result.current.getActivosVencidos().map((r) => r.id)).toEqual(['0006']);
  });

  it('excluye los activos dados de baja del valor total', async () => {
    const { result } = await renderActivos(PARQUE);

    // 1.000.000 + 2.000.000 + 500.000; el compresor de baja (3.000.000) no cuenta.
    expect(result.current.getValorTotalActivos()).toBe(3_500_000);
  });

  it('nunca devuelve record IDs como ubicación', async () => {
    const { result } = await renderActivos(PARQUE);

    for (const registro of result.current.registros) {
      expect(result.current.getActivoUbicacion(registro)).not.toMatch(/^rec/);
    }
  });
});

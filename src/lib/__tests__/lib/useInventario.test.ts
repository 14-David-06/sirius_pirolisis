import { renderHook, waitFor } from '@testing-library/react';
import { useInventario } from '@/lib/useInventario';
import type { InventarioRecord } from '@/types/inventario';

global.fetch = jest.fn();

/** Registro tal como lo devuelve /api/inventario/list (campos normalizados). */
function record(fields: Record<string, unknown>): InventarioRecord {
  return { id: String(fields.id ?? '1'), fields, createdTime: '2026-07-27' };
}

function mockList(records: InventarioRecord[]) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ records }),
  });
}

describe('useInventario — getters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList([]);
  });

  test('getItemName lee el nombre del Core', () => {
    const { result } = renderHook(() => useInventario());
    expect(result.current.getItemName(record({ Nombre: 'Abono 4G' }))).toBe('Abono 4G');
  });

  test('getItemName cae al fallback si no hay nombre', () => {
    const { result } = renderHook(() => useInventario());
    expect(result.current.getItemName(record({}))).toBe('Sin nombre');
  });

  test('getMinStock usa el mínimo del Core y cae al default del área (2 und)', () => {
    const { result } = renderHook(() => useInventario());

    expect(result.current.getMinStock(record({ stock_minimo: 5 }))).toBe(5);
    // Sin umbral en el Core, todo insumo consumible tiene mínimo 2.
    expect(result.current.getMinStock(record({ stock_minimo: 0 }))).toBe(2);
    expect(result.current.getMinStock(record({}))).toBe(2);
  });

  test('getItemUnit devuelve el símbolo de la unidad base', () => {
    const { result } = renderHook(() => useInventario());

    expect(result.current.getItemUnit(record({ unidad: 'kg' }))).toBe('kg');
    expect(result.current.getItemUnit(record({ unidad: 'L' }))).toBe('L');
    expect(result.current.getItemUnit(record({ unidad: 'und' }))).toBe('und');
  });

  test('getItemUnit cae a "Unidad Medida" y nunca a un texto genérico erróneo', () => {
    const { result } = renderHook(() => useInventario());

    expect(result.current.getItemUnit(record({ 'Unidad Medida': 'Litro' }))).toBe('Litro');
    expect(result.current.getItemUnit(record({}))).toBe('und');
  });

  test('getItemStockTotal lee el stock calculado por el Core', () => {
    const { result } = renderHook(() => useInventario());

    expect(result.current.getItemStockTotal(record({ stock_actual: 14.8 }))).toBe(14.8);
    expect(result.current.getItemStockTotal(record({ 'Total Cantidad Stock': 150 }))).toBe(150);
    expect(result.current.getItemStockTotal(record({}))).toBe(0);
  });

  test('getItemEstado normaliza el estado derivado del stock', () => {
    const { result } = renderHook(() => useInventario());

    expect(result.current.getItemEstado(record({ estado_calculado: 'agotado' }))).toBe('agotado');
    expect(result.current.getItemEstado(record({ estado_calculado: 'por_agotarse' }))).toBe('por_agotarse');
    // "Stock"/"Activo" son valores del catálogo, no de disponibilidad.
    expect(result.current.getItemEstado(record({ 'Estado Insumo': 'Stock' }))).toBe('disponible');
  });
});

describe('useInventario — derivados', () => {
  const insumos = [
    record({ id: '1', Nombre: 'Rodamiento UC 208 FAG', stock_actual: 4, stock_minimo: 5, unidad: 'und', estado_calculado: 'por_agotarse' }),
    record({ id: '2', Nombre: 'Abono 4G', stock_actual: 33614, stock_minimo: 0, unidad: 'kg', estado_calculado: 'disponible' }),
    record({ id: '3', Nombre: 'Brocha de 2"', stock_actual: 0, stock_minimo: 0, unidad: 'und', estado_calculado: 'agotado' }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockList(insumos);
  });

  test('lista los insumos en una sola secuencia alfabética, sin agrupar', async () => {
    const { result } = renderHook(() => useInventario());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getItemsOrdenados().map((r) => r.fields.Nombre)).toEqual([
      'Abono 4G',
      'Brocha de 2"',
      'Rodamiento UC 208 FAG',
    ]);
  });

  test('separa "por agotarse" (bajo el mínimo) de "agotado" (sin stock)', async () => {
    const { result } = renderHook(() => useInventario());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getLowStockItems().map((r) => r.id)).toEqual(['1']);
    expect(result.current.getSinStockItems().map((r) => r.id)).toEqual(['3']);
  });

  // Con el default de 2 und, un insumo sin mínimo en el Core igual alerta: es el
  // punto de tener un umbral por defecto.
  test('alerta con el mínimo por defecto cuando el Core no tiene umbral', async () => {
    mockList([record({ id: '9', Nombre: 'Sin mínimo', stock_actual: 1, stock_minimo: 0 })]);
    const { result } = renderHook(() => useInventario());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getLowStockItems().map((r) => r.id)).toEqual(['9']);
  });

  test('filtra por estado derivado', async () => {
    const { result } = renderHook(() => useInventario({ estado: 'agotado' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['3']);
  });

  test('busca por nombre sin distinguir tildes ni mayúsculas', async () => {
    const { result } = renderHook(() => useInventario({ busqueda: 'ABONO' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['2']);
  });
});

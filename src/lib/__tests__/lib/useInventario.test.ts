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

  test('getItemCategory usa los nombres resueltos, no los record IDs', () => {
    const { result } = renderHook(() => useInventario());
    const item = record({
      Nombre: 'Codo 3" acero Inox 304',
      // El campo crudo del Core es un array de record IDs: leerlo directo
      // pintaba los "rec…" en pantalla.
      Categoria: ['recFAKECATEGORIA1', 'recFAKECATEGORIA2'],
      categorias: ['Infraestructura y Construcción', 'Repuestos y Refacciones'],
    });

    expect(result.current.getItemCategory(item)).toBe('Infraestructura y Construcción');
    expect(result.current.getItemCategory(item)).not.toMatch(/^rec/);
    expect(result.current.getItemCategories(item)).toEqual([
      'Infraestructura y Construcción',
      'Repuestos y Refacciones',
    ]);
  });

  test('getItemCategory devuelve "Sin categoría" cuando no hay ninguna', () => {
    const { result } = renderHook(() => useInventario());
    expect(result.current.getItemCategory(record({}))).toBe('Sin categoría');
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
    record({ id: '1', Nombre: 'Rodamiento UC 208 FAG', categorias: ['Repuestos y Refacciones'], stock_actual: 4, stock_minimo: 5, unidad: 'und', estado_calculado: 'por_agotarse' }),
    record({ id: '2', Nombre: 'Abono 4G', categorias: ['Insumos de Producción'], stock_actual: 33614, stock_minimo: 0, unidad: 'kg', estado_calculado: 'disponible' }),
    record({ id: '3', Nombre: 'Brocha de 2"', categorias: ['Herramientas Manuales'], stock_actual: 0, stock_minimo: 0, unidad: 'und', estado_calculado: 'agotado' }),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockList(insumos);
  });

  test('agrupa por categoría legible y en orden alfabético', async () => {
    const { result } = renderHook(() => useInventario());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Object.keys(result.current.getItemsByCategory())).toEqual([
      'Herramientas Manuales',
      'Insumos de Producción',
      'Repuestos y Refacciones',
    ]);
  });

  test('categoriasDisponibles se construye con los datos reales', async () => {
    const { result } = renderHook(() => useInventario());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.categoriasDisponibles).toEqual([
      'Herramientas Manuales',
      'Insumos de Producción',
      'Repuestos y Refacciones',
    ]);
  });

  test('separa "por agotarse" (bajo el mínimo) de "agotado" (sin stock)', async () => {
    const { result } = renderHook(() => useInventario());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getLowStockItems().map((r) => r.id)).toEqual(['1']);
    expect(result.current.getSinStockItems().map((r) => r.id)).toEqual(['3']);
  });

  test('no marca stock bajo cuando el insumo no tiene mínimo definido', async () => {
    mockList([record({ id: '9', Nombre: 'Sin mínimo', stock_actual: 1, stock_minimo: 0 })]);
    const { result } = renderHook(() => useInventario());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getLowStockItems()).toHaveLength(0);
  });

  test('filtra por categoría', async () => {
    const { result } = renderHook(() => useInventario({ categoria: 'Insumos de Producción' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['2']);
  });

  test('filtra por estado derivado', async () => {
    const { result } = renderHook(() => useInventario({ estado: 'agotado' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['3']);
  });

  test('busca sin distinguir tildes ni mayúsculas', async () => {
    const { result } = renderHook(() => useInventario({ busqueda: 'PRODUCCION' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.registrosFiltrados.map((r) => r.id)).toEqual(['2']);
  });
});

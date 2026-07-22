import { renderHook } from '@testing-library/react';
import { useInventario } from '@/lib/useInventario';

// Mock fetch
global.fetch = jest.fn();

describe('useInventario hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getItemName devuelve el nombre correcto', () => {
    const { result } = renderHook(() => useInventario());
    const mockRecord = { 
      id: '1', 
      fields: { 'Insumo': 'Hidróxido de Sodio' },
      createdTime: '2024-01-01'
    };
    
    expect(result.current.getItemName(mockRecord)).toBe('Hidróxido de Sodio');
  });

  test('getItemName devuelve fallback si no hay nombre', () => {
    const { result } = renderHook(() => useInventario());
    const mockRecord = { 
      id: '1', 
      fields: {}, 
      createdTime: '2024-01-01' 
    };
    
    expect(result.current.getItemName(mockRecord)).toBe('Sin nombre');
  });

  test('getItemCategory devuelve la categoría correcta', () => {
    const { result } = renderHook(() => useInventario());
    const mockRecord = { 
      id: '1', 
      fields: { 'Categoría': 'Químicos' },
      createdTime: '2024-01-01'
    };
    
    expect(result.current.getItemCategory(mockRecord)).toBe('Químicos');
  });

  test('getItemStockTotal devuelve el stock correcto', () => {
    const { result } = renderHook(() => useInventario());
    const mockRecord = { 
      id: '1', 
      fields: { 'Total Cantidad Stock': 150 },
      createdTime: '2024-01-01'
    };
    
    expect(result.current.getItemStockTotal(mockRecord)).toBe(150);
  });

  test('getItemStockTotal devuelve 0 si no hay stock', () => {
    const { result } = renderHook(() => useInventario());
    const mockRecord = { 
      id: '1', 
      fields: {},
      createdTime: '2024-01-01'
    };
    
    expect(result.current.getItemStockTotal(mockRecord)).toBe(0);
  });
});

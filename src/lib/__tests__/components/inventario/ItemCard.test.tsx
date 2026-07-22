import { render, screen } from '@testing-library/react';
import ItemCard from '@/components/inventario/ItemCard';

describe('ItemCard', () => {
  const mockGetters = {
    getItemName: (item: any) => item.fields['Insumo'] || 'Test Item',
    getItemCategory: () => 'Químicos',
    getItemCategoriaInsumo: () => '',
    getItemEstado: () => 'disponible',
    getItemPresentacion: () => 'Kilogramos',
    getItemCantidadPresentacion: () => 25,
    getItemStockTotal: () => 100,
    getItemDescription: () => 'Descripción de prueba',
    getItemEntradas: () => [],
    getItemSalidas: () => [],
  };

  test('muestra el nombre del item', () => {
    const mockItem = { 
      id: '1', 
      fields: { 'Insumo': 'Hidróxido de Sodio' }, 
      createdTime: '2024-01-01' 
    };
    
    render(<ItemCard item={mockItem} {...mockGetters} />);
    
    expect(screen.getByText('Hidróxido de Sodio')).toBeInTheDocument();
  });

  test('muestra la categoría del item', () => {
    const mockItem = { 
      id: '1', 
      fields: { 'Insumo': 'Test' }, 
      createdTime: '2024-01-01' 
    };
    
    render(<ItemCard item={mockItem} {...mockGetters} />);
    
    expect(screen.getByText(/Categoría: Químicos/)).toBeInTheDocument();
  });

  test('muestra el stock disponible', () => {
    const mockItem = { 
      id: '1', 
      fields: { 'Insumo': 'Test' }, 
      createdTime: '2024-01-01' 
    };
    
    render(<ItemCard item={mockItem} {...mockGetters} />);
    
    expect(screen.getByText(/Stock Disponible: 100/)).toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import InventarioTable from '@/components/inventario/InventarioTable';

describe('InventarioTable', () => {
  const mockGetters = {
    getItemName: (item: any) => item.fields['Insumo'] || 'Test',
    getItemCategory: () => 'Químicos',
    getItemCategoriaInsumo: () => '',
    getItemEstado: () => 'disponible',
    getItemPresentacion: () => 'kg',
    getItemCantidadPresentacion: () => 25,
    getItemStockTotal: () => 100,
    getItemDescription: () => '',
    getItemEntradas: () => [],
    getItemSalidas: () => [],
  };

  const mockCategories = {
    'Químicos': [
      { id: '1', fields: { 'Insumo': 'Hidróxido' }, createdTime: '2024-01-01' }
    ]
  };

  test('muestra el título de la tabla', () => {
    render(<InventarioTable categories={mockCategories} {...mockGetters} />);
    expect(screen.getByText('Inventario por Categorías')).toBeInTheDocument();
  });

  test('muestra los filtros de categoría y estado', () => {
    render(<InventarioTable categories={mockCategories} {...mockGetters} />);
    expect(screen.getByText('Categoría')).toBeInTheDocument();
    expect(screen.getByText('Estado')).toBeInTheDocument();
  });

  test('muestra botón de limpiar filtros cuando hay filtros activos', () => {
    render(<InventarioTable categories={mockCategories} {...mockGetters} />);
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'lona' } });
    expect(screen.getByText(/Limpiar filtros/)).toBeInTheDocument();
  });

  test('muestra las categorías con items', () => {
    render(<InventarioTable categories={mockCategories} {...mockGetters} />);
    expect(screen.getByText(/Químicos.*1 items/)).toBeInTheDocument();
  });
});

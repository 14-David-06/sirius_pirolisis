import { render, screen } from '@testing-library/react';
import ItemCard from '@/components/inventario/ItemCard';
import type { InventarioRecord } from '@/types/inventario';

describe('ItemCard', () => {
  const mockGetters = {
    getItemName: (item: InventarioRecord) => String(item.fields['Nombre'] ?? 'Test Item'),
    getItemCodigo: () => 'SIRIUS-INS-0042',
    getItemStockTotal: () => 33614,
    getMinStock: () => 0,
    getItemUnit: () => 'kg',
    getItemEstado: () => 'disponible' as const,
    getItemMovimientos: () => ['recA', 'recB'],
  };

  const mockItem: InventarioRecord = {
    id: '1',
    fields: { 'Nombre': 'Abono 4G' },
    createdTime: '2024-01-01',
  };

  test('muestra el nombre y el código del insumo', () => {
    render(<ItemCard item={mockItem} {...mockGetters} />);

    expect(screen.getByText('Abono 4G')).toBeInTheDocument();
    expect(screen.getByText('SIRIUS-INS-0042')).toBeInTheDocument();
  });

  test('muestra el stock con su unidad y separador de miles', () => {
    render(<ItemCard item={mockItem} {...mockGetters} />);

    expect(screen.getByText('33.614')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
  });

  test('muestra el estado derivado del stock', () => {
    render(<ItemCard item={mockItem} {...mockGetters} />);

    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  test('marca como agotado cuando no hay stock', () => {
    render(
      <ItemCard
        item={mockItem}
        {...mockGetters}
        getItemStockTotal={() => 0}
        getItemEstado={() => 'agotado' as const}
      />
    );

    expect(screen.getByText('Agotado')).toBeInTheDocument();
  });

  test('muestra el stock mínimo solo cuando está definido', () => {
    const { rerender } = render(<ItemCard item={mockItem} {...mockGetters} />);
    expect(screen.queryByText(/Mínimo/)).not.toBeInTheDocument();

    rerender(<ItemCard item={mockItem} {...mockGetters} getMinStock={() => 5} />);
    expect(screen.getByText(/Mínimo/)).toBeInTheDocument();
  });
});

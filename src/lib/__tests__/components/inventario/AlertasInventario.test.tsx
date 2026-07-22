import { render, screen } from '@testing-library/react';
import AlertasInventario from '@/components/inventario/AlertasInventario';

describe('AlertasInventario', () => {
  const mockGetters = {
    getItemName: (item: any) => item.fields['Insumo'] || 'Test',
    getItemCategory: () => 'Químicos',
    getItemDescription: () => 'Test descripción',
    getItemQuantity: () => 5,
    getItemUnit: () => 'kg',
  };

  test('no renderiza nada si no hay items', () => {
    const { container } = render(<AlertasInventario items={[]} {...mockGetters} />);
    expect(container.firstChild).toBeNull();
  });

  test('muestra alertas cuando hay items con stock bajo', () => {
    const items = [
      { id: '1', fields: { 'Insumo': 'Hidróxido' }, createdTime: '2024-01-01' }
    ];
    render(<AlertasInventario items={items} {...mockGetters} />);
    expect(screen.getByText('Hidróxido')).toBeInTheDocument();
    expect(screen.getByText(/Stock bajo/)).toBeInTheDocument();
  });
});

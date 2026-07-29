import { render, screen } from '@testing-library/react';
import AlertasInventario from '@/components/inventario/AlertasInventario';
import type { InventarioRecord } from '@/types/inventario';

describe('AlertasInventario', () => {
  const mockGetters = {
    getItemName: (item: InventarioRecord) => String(item.fields['Nombre'] ?? 'Test'),
    getItemCodigo: () => 'SIRIUS-INS-0065',
    getItemStockTotal: (item: InventarioRecord) => Number(item.fields['stock_actual'] ?? 0),
    getMinStock: () => 5,
    getItemUnit: () => 'und',
  };

  test('no renderiza nada si no hay insumos por reponer', () => {
    const { container } = render(
      <AlertasInventario itemsStockBajo={[]} itemsSinStock={[]} {...mockGetters} />
    );

    expect(container.firstChild).toBeNull();
  });

  test('muestra los insumos bajo el stock mínimo con su unidad', () => {
    const itemsStockBajo: InventarioRecord[] = [
      { id: '1', fields: { 'Nombre': 'Rodamiento UC 208 FAG', stock_actual: 4 }, createdTime: '2024-01-01' },
    ];

    render(<AlertasInventario itemsStockBajo={itemsStockBajo} itemsSinStock={[]} {...mockGetters} />);

    expect(screen.getByText('Rodamiento UC 208 FAG')).toBeInTheDocument();
    expect(screen.getByText('4 und')).toBeInTheDocument();
    expect(screen.getByText('Mínimo 5 und')).toBeInTheDocument();
  });

  test('lista primero los agotados', () => {
    const itemsSinStock: InventarioRecord[] = [
      { id: 'a', fields: { 'Nombre': 'Agotado', stock_actual: 0 }, createdTime: '2024-01-01' },
    ];
    const itemsStockBajo: InventarioRecord[] = [
      { id: 'b', fields: { 'Nombre': 'Por agotarse', stock_actual: 3 }, createdTime: '2024-01-01' },
    ];

    render(
      <AlertasInventario
        itemsStockBajo={itemsStockBajo}
        itemsSinStock={itemsSinStock}
        {...mockGetters}
      />
    );

    const nombres = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(nombres[0]).toContain('Agotado');
    expect(nombres[1]).toContain('Por agotarse');
  });

  test('cuenta el total de insumos que requieren reposición', () => {
    const items: InventarioRecord[] = [
      { id: 'a', fields: { 'Nombre': 'Uno', stock_actual: 0 }, createdTime: '2024-01-01' },
      { id: 'b', fields: { 'Nombre': 'Dos', stock_actual: 0 }, createdTime: '2024-01-01' },
    ];

    render(<AlertasInventario itemsStockBajo={[]} itemsSinStock={items} {...mockGetters} />);

    const encabezado = screen.getByRole('heading', { level: 2 });
    expect(encabezado).toHaveTextContent('Requieren reposición');
    expect(encabezado).toHaveTextContent('2');
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import InventarioTable from '@/components/inventario/InventarioTable';
import type { InventarioRecord } from '@/types/inventario';

describe('InventarioTable', () => {
  const mockGetters = {
    getItemName: (item: InventarioRecord) => String(item.fields['Nombre'] ?? 'Test'),
    getItemCodigo: () => 'SIRIUS-INS-0065',
    getItemStockTotal: () => 14.8,
    getMinStock: () => 2,
    getItemUnit: () => 'L',
    getItemEstado: () => 'disponible' as const,
    getItemMovimientos: () => ['recA'],
  };

  const items: InventarioRecord[] = [
    { id: '1', fields: { 'Nombre': 'Biológicos DataLab' }, createdTime: '2024-01-01' },
  ];

  const baseProps = {
    items,
    filtroEstado: '' as const,
    busqueda: '',
    onFiltroEstadoChange: jest.fn(),
    onBusquedaChange: jest.fn(),
    totalSinFiltrar: 1,
    ...mockGetters,
  };

  test('muestra el título y el conteo de insumos', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Insumos' })).toBeInTheDocument();
    expect(screen.getByText('1 insumos')).toBeInTheDocument();
  });

  test('expone buscador y filtro de estado accesibles por etiqueta', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
  });

  // Los consumibles del área ya no se clasifican por categoría.
  test('no ofrece filtro ni agrupación por categoría', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument();
  });

  test('notifica los cambios de filtro al contenedor', () => {
    const onFiltroEstadoChange = jest.fn();
    render(<InventarioTable {...baseProps} onFiltroEstadoChange={onFiltroEstadoChange} />);

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'agotado' } });

    expect(onFiltroEstadoChange).toHaveBeenCalledWith('agotado');
  });

  test('muestra "Limpiar" solo cuando hay filtros activos', () => {
    const { rerender } = render(<InventarioTable {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Limpiar/ })).not.toBeInTheDocument();

    rerender(<InventarioTable {...baseProps} busqueda="rodamiento" />);
    expect(screen.getByRole('button', { name: /Limpiar/ })).toBeInTheDocument();
  });

  // jsdom no aplica media queries, así que se renderizan a la vez la tabla
  // (≥ md) y las tarjetas (< md): cada dato aparece dos veces.
  test('lista los insumos con su stock formateado y su unidad', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.getAllByText('Biológicos DataLab').length).toBeGreaterThan(0);
    expect(screen.getAllByText('14,8').length).toBeGreaterThan(0);
    expect(screen.getAllByText('L').length).toBeGreaterThan(0);
  });

  test('informa cuando ningún insumo coincide con los filtros', () => {
    render(<InventarioTable {...baseProps} items={[]} busqueda="inexistente" />);

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(
      screen.getByText('Ningún insumo coincide con los filtros aplicados.')
    ).toBeInTheDocument();
  });
});

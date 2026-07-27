import { render, screen, fireEvent } from '@testing-library/react';
import InventarioTable from '@/components/inventario/InventarioTable';
import type { InventarioRecord } from '@/types/inventario';

describe('InventarioTable', () => {
  const mockGetters = {
    getItemName: (item: InventarioRecord) => String(item.fields['Nombre'] ?? 'Test'),
    getItemCodigo: () => 'SIRIUS-INS-0065',
    getItemCategories: () => ['Insumos de Producción'],
    getItemStockTotal: () => 14.8,
    getMinStock: () => 0,
    getItemUnit: () => 'L',
    getItemEstado: () => 'disponible' as const,
    getItemMovimientos: () => ['recA'],
  };

  const mockCategories: Record<string, InventarioRecord[]> = {
    'Insumos de Producción': [
      { id: '1', fields: { 'Nombre': 'Biológicos DataLab' }, createdTime: '2024-01-01' },
    ],
  };

  const baseProps = {
    categories: mockCategories,
    categoriasDisponibles: ['Insumos de Producción', 'Repuestos y Refacciones'],
    filtroCategoria: '',
    filtroEstado: '' as const,
    busqueda: '',
    onFiltroCategoriaChange: jest.fn(),
    onFiltroEstadoChange: jest.fn(),
    onBusquedaChange: jest.fn(),
    totalSinFiltrar: 1,
    ...mockGetters,
  };

  test('muestra el título y el conteo de insumos', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.getByText('Insumos por categoría')).toBeInTheDocument();
    expect(screen.getByText('1 insumos')).toBeInTheDocument();
  });

  test('expone buscador y filtros accesibles por etiqueta', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.getByLabelText('Buscar')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
  });

  test('llena el selector con las categorías disponibles', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.getByRole('option', { name: 'Repuestos y Refacciones' })).toBeInTheDocument();
  });

  test('notifica los cambios de filtro al contenedor', () => {
    const onFiltroCategoriaChange = jest.fn();
    render(<InventarioTable {...baseProps} onFiltroCategoriaChange={onFiltroCategoriaChange} />);

    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Repuestos y Refacciones' },
    });

    expect(onFiltroCategoriaChange).toHaveBeenCalledWith('Repuestos y Refacciones');
  });

  test('muestra "Limpiar" solo cuando hay filtros activos', () => {
    const { rerender } = render(<InventarioTable {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Limpiar/ })).not.toBeInTheDocument();

    rerender(<InventarioTable {...baseProps} busqueda="rodamiento" />);
    expect(screen.getByRole('button', { name: /Limpiar/ })).toBeInTheDocument();
  });

  test('muestra la categoría como grupo con su contador', () => {
    render(<InventarioTable {...baseProps} />);

    const grupo = screen.getByRole('button', { expanded: true });
    expect(grupo).toHaveTextContent('Insumos de Producción');
    expect(grupo).toHaveTextContent('1');
  });

  test('colapsa y expande el grupo de categoría', () => {
    render(<InventarioTable {...baseProps} />);

    const grupo = screen.getByRole('button', { expanded: true });
    fireEvent.click(grupo);

    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  // jsdom no aplica media queries, así que se renderizan a la vez la tabla
  // (≥ md) y las tarjetas (< md): cada dato aparece dos veces.
  test('muestra el stock formateado con su unidad', () => {
    render(<InventarioTable {...baseProps} />);

    expect(screen.getAllByText('14,8').length).toBeGreaterThan(0);
    expect(screen.getAllByText('L').length).toBeGreaterThan(0);
  });

  test('informa cuando ningún insumo coincide con los filtros', () => {
    render(<InventarioTable {...baseProps} categories={{}} busqueda="inexistente" />);

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(
      screen.getByText('Ningún insumo coincide con los filtros aplicados.')
    ).toBeInTheDocument();
  });
});

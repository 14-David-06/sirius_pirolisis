import { render, screen } from '@testing-library/react';
import EstadisticasGenerales from '@/components/inventario/EstadisticasGenerales';

describe('EstadisticasGenerales', () => {
  const baseProps = {
    totalItems: 26,
    totalCategorias: 7,
    itemsStockBajo: 3,
    itemsSinStock: 2,
  };

  test('muestra los cuatro indicadores con sus valores', () => {
    render(<EstadisticasGenerales {...baseProps} />);

    expect(screen.getByText('26')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('etiqueta cada indicador', () => {
    render(<EstadisticasGenerales {...baseProps} />);

    expect(screen.getByText('Insumos')).toBeInTheDocument();
    expect(screen.getByText('Categorías')).toBeInTheDocument();
    expect(screen.getByText('Por agotarse')).toBeInTheDocument();
    expect(screen.getByText('Agotados')).toBeInTheDocument();
  });

  test('formatea las cantidades con separador de miles', () => {
    render(<EstadisticasGenerales {...baseProps} totalItems={1234} />);

    expect(screen.getByText('1.234')).toBeInTheDocument();
  });

  // No debe existir un "total de unidades": el inventario mezcla und, kg y L,
  // así que sumarlas daría una cifra sin significado.
  test('no muestra un total de unidades', () => {
    render(<EstadisticasGenerales {...baseProps} />);

    expect(screen.queryByText(/Total Unidades/i)).not.toBeInTheDocument();
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });
});

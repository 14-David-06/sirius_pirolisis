import { render, screen } from '@testing-library/react';
import EstadisticasGenerales from '@/components/inventario/EstadisticasGenerales';

describe('EstadisticasGenerales', () => {
  test('muestra el total de items correctamente', () => {
    render(<EstadisticasGenerales totalItems={25} totalCategorias={5} itemsStockBajo={3} />);
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  test('muestra el total de categorías', () => {
    render(<EstadisticasGenerales totalItems={25} totalCategorias={5} itemsStockBajo={3} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('muestra items con stock bajo', () => {
    render(<EstadisticasGenerales totalItems={25} totalCategorias={5} itemsStockBajo={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

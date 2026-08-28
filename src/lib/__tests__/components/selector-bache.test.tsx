/**
 * El selector de bache de la salida de bodega.
 *
 * Se prueba porque reemplazó a un `<select>` nativo, y un combobox hecho a mano
 * tiene tres formas de romperse en silencio que el nativo no tenía: que el panel
 * no abra, que el filtro no encuentre el código como lo escribe el operador, y que
 * Enter envíe el formulario en vez de elegir. Las tres se ven igual desde afuera:
 * "no aparece el bache".
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { SelectorBache } from '@/app/inventario-bodega-sirius/SelectorBache';

const BACHES = [
  { codigo: 'S-00184', kg: 579.48, kgIngresado: 579.48, kgConsumido: 0, lotes: [], estado: 'completo' as const },
  { codigo: 'S-00814', kg: 500, kgIngresado: 500, kgConsumido: 0, lotes: [], estado: 'completo' as const },
  { codigo: 'S-00300', kg: 120.5, kgIngresado: 500, kgConsumido: 379.5, lotes: [], estado: 'parcial' as const },
];

function abrir() {
  fireEvent.click(screen.getByRole('button', { expanded: false }));
}

describe('SelectorBache', () => {
  it('abre el panel y lista todos los baches', () => {
    render(<SelectorBache baches={BACHES} valor="S-00184" onCambio={jest.fn()} />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    abrir();

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('3 de 3 baches con biochar')).toBeInTheDocument();
  });

  it.each([
    ['184', ['S-00184']],
    ['s-184', ['S-00184']],
    ['00184', ['S-00184']],
    ['S-00184', ['S-00184']],
  ])('encuentra S-00184 escribiendo %s', (consulta, esperados) => {
    render(<SelectorBache baches={BACHES} valor="" onCambio={jest.fn()} />);
    abrir();
    fireEvent.change(screen.getByLabelText('Buscar bache'), { target: { value: consulta } });

    const visibles = screen.getAllByRole('option').map((o) => o.textContent);
    for (const codigo of esperados) {
      expect(visibles.some((t) => t?.includes(codigo))).toBe(true);
    }
  });

  it('no confunde S-00184 con S-00814', () => {
    render(<SelectorBache baches={BACHES} valor="" onCambio={jest.fn()} />);
    abrir();
    fireEvent.change(screen.getByLabelText('Buscar bache'), { target: { value: '814' } });

    const visibles = screen.getAllByRole('option').map((o) => o.textContent);
    expect(visibles).toHaveLength(1);
    expect(visibles[0]).toContain('S-00814');
  });

  it('elige con clic y cierra', () => {
    const onCambio = jest.fn();
    render(<SelectorBache baches={BACHES} valor="S-00184" onCambio={onCambio} />);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /S-00300/ }));

    expect(onCambio).toHaveBeenCalledWith('S-00300');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('Enter elige el resaltado y NO envía el formulario', () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const onCambio = jest.fn();
    render(
      <form onSubmit={onSubmit}>
        <SelectorBache baches={BACHES} valor="S-00184" onCambio={onCambio} />
      </form>
    );
    abrir();
    const buscador = screen.getByLabelText('Buscar bache');
    fireEvent.change(buscador, { target: { value: '300' } });
    fireEvent.keyDown(buscador, { key: 'Enter' });

    expect(onCambio).toHaveBeenCalledWith('S-00300');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dice que no hay coincidencias en vez de dejar la lista vacía', () => {
    render(<SelectorBache baches={BACHES} valor="" onCambio={jest.fn()} />);
    abrir();
    fireEvent.change(screen.getByLabelText('Buscar bache'), { target: { value: '99999' } });

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/Ningún bache en bodega coincide/)).toBeInTheDocument();
  });

  it('avisa cuando no hay ni un bache que ofrecer', () => {
    render(<SelectorBache baches={[]} valor="" onCambio={jest.fn()} />);
    abrir();

    expect(screen.getByText('0 de 0 baches con biochar')).toBeInTheDocument();
  });

  describe('baches que existen pero no tienen biochar', () => {
    const SIN = [
      { codigo: 'S-00251', motivo: 'falta el monitoreo de laboratorio' },
      { codigo: 'S-00252', motivo: 'falta el monitoreo de laboratorio' },
    ];

    it('los muestra con el motivo, pero no como opción elegible', () => {
      render(<SelectorBache baches={BACHES} valor="" onCambio={jest.fn()} noDisponibles={SIN} />);
      abrir();

      expect(screen.getByText('S-00251')).toBeInTheDocument();
      expect(screen.getAllByText('falta el monitoreo de laboratorio')).toHaveLength(2);
      // Elegibles siguen siendo solo los que tienen biochar.
      expect(screen.getAllByRole('option')).toHaveLength(3);
      expect(screen.getByText('3 de 3 baches con biochar · 2 sin biochar que sacar')).toBeInTheDocument();
    });

    it('se encuentran al buscarlos: es el caso que motivó mostrarlos', () => {
      render(<SelectorBache baches={BACHES} valor="" onCambio={jest.fn()} noDisponibles={SIN} />);
      abrir();
      fireEvent.change(screen.getByLabelText('Buscar bache'), { target: { value: '251' } });

      expect(screen.getByText('S-00251')).toBeInTheDocument();
      expect(screen.getByText('falta el monitoreo de laboratorio')).toBeInTheDocument();
    });

    it('no dice "ningún bache coincide" cuando el único hallazgo está bloqueado', () => {
      render(<SelectorBache baches={[]} valor="" onCambio={jest.fn()} noDisponibles={SIN} />);
      abrir();
      fireEvent.change(screen.getByLabelText('Buscar bache'), { target: { value: '252' } });

      expect(screen.queryByText(/Ningún bache en bodega coincide/)).not.toBeInTheDocument();
      expect(screen.getByText('S-00252')).toBeInTheDocument();
    });

    it('Enter no elige uno bloqueado', () => {
      const onCambio = jest.fn();
      render(<SelectorBache baches={BACHES} valor="" onCambio={onCambio} noDisponibles={SIN} />);
      abrir();
      const buscador = screen.getByLabelText('Buscar bache');
      fireEvent.change(buscador, { target: { value: '251' } });
      fireEvent.keyDown(buscador, { key: 'Enter' });

      expect(onCambio).not.toHaveBeenCalled();
    });
  });
});

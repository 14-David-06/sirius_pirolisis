/**
 * @jest-environment node
 */

/**
 * `conCandado`: dentro de una instancia, dos operaciones con la misma clave no
 * corren a la vez (dos despachos no leen el mismo saldo; dos confirmaciones no
 * mandan dos correos), la clave se libera aunque la operación falle, y una espera
 * que se agota no rompe el orden de los que siguen.
 */

import { CandadoOcupado, conCandado } from '@/lib/candado';

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('conCandado', () => {
  it('serializa las llamadas con la misma clave, en orden de llegada', async () => {
    const eventos: string[] = [];
    const tarea = (nombre: string, ms: number) => async () => {
      eventos.push(`inicia ${nombre}`);
      await dormir(ms);
      eventos.push(`termina ${nombre}`);
      return nombre;
    };

    const resultados = await Promise.all([
      conCandado('despacho-biochar', tarea('a', 30)),
      conCandado('despacho-biochar', tarea('b', 5)),
      conCandado('despacho-biochar', tarea('c', 1)),
    ]);

    expect(resultados).toEqual(['a', 'b', 'c']);
    expect(eventos).toEqual(['inicia a', 'termina a', 'inicia b', 'termina b', 'inicia c', 'termina c']);
  });

  it('claves distintas no se esperan entre sí', async () => {
    const eventos: string[] = [];
    await Promise.all([
      conCandado('recepcion:recPRUEBA00000001', async () => {
        eventos.push('inicia 1');
        await dormir(20);
        eventos.push('termina 1');
      }),
      conCandado('recepcion:recPRUEBA00000002', async () => {
        eventos.push('inicia 2');
        await dormir(1);
        eventos.push('termina 2');
      }),
    ]);
    expect(eventos.slice(0, 2).sort()).toEqual(['inicia 1', 'inicia 2']);
  });

  it('libera la clave aunque la operación falle, también si lanza sin ser async', async () => {
    await expect(
      conCandado('clave-con-fallas', async () => {
        throw new Error('falla async');
      })
    ).rejects.toThrow('falla async');

    const sincrona = (() => {
      throw new Error('falla síncrona');
    }) as () => Promise<never>;
    await expect(conCandado('clave-con-fallas', sincrona)).rejects.toThrow('falla síncrona');

    await expect(conCandado('clave-con-fallas', async () => 'sigue')).resolves.toBe('sigue');
  });

  it('se rinde con CandadoOcupado si la anterior no termina a tiempo, sin correr la operación', async () => {
    let soltar!: () => void;
    const larga = conCandado(
      'clave-ocupada',
      () => new Promise<string>((r) => (soltar = () => r('larga')))
    );
    const noCorre = jest.fn(async () => 'no debió correr');

    const rendida = conCandado('clave-ocupada', noCorre, { esperaMaxMs: 20 });
    await expect(rendida).rejects.toBeInstanceOf(CandadoOcupado);
    await expect(rendida).rejects.toThrow('clave-ocupada');
    expect(noCorre).not.toHaveBeenCalled();

    // La que llega después sigue esperando a la que de verdad tiene la clave, no
    // a la que se rindió.
    const eventos: string[] = [];
    const siguiente = conCandado('clave-ocupada', async () => {
      eventos.push('siguiente');
      return 'ok';
    });
    await dormir(15);
    expect(eventos).toEqual([]);

    soltar();
    await expect(larga).resolves.toBe('larga');
    await expect(siguiente).resolves.toBe('ok');
    expect(eventos).toEqual(['siguiente']);
  });

  it('una clave libre corre de inmediato, sin esperar ni temporizadores', async () => {
    const inicio = Date.now();
    await expect(conCandado('clave-libre', async () => 42)).resolves.toBe(42);
    expect(Date.now() - inicio).toBeLessThan(50);
  });
});

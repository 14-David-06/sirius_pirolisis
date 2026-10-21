/**
 * @jest-environment node
 */

/**
 * La confirmación del despacho de Blend corre bajo `conCandado('despacho-blend')`.
 *
 * Lo que se protege: dentro de una instancia, dos confirmaciones (dos pedidos,
 * o un doble clic con la misma llave) no leen el mismo saldo ni pasan las dos el
 * chequeo de la llave antes de que la primera emita. El ensayo no escribe y no
 * toma el candado. Las lecturas se cortan en seco (Pedidos Core "caído"): basta
 * con ver quién entra al candado, sin escribir nada. Datos inventados.
 */

jest.mock('@/lib/candado', () => {
  const real = jest.requireActual('@/lib/candado');
  return { ...real, conCandado: jest.fn(real.conCandado) };
});
jest.mock('@/lib/pedidos-blend-core', () => ({
  ...jest.requireActual('@/lib/pedidos-blend-core'),
  listarPedidosBlend: jest.fn(async () => null),
}));
jest.mock('@/lib/blend-inventario-core', () => ({
  ...jest.requireActual('@/lib/blend-inventario-core'),
  credencialesBlend: jest.fn(() => null),
  resumenBlend: jest.fn(async () => null),
}));

import { conCandado } from '@/lib/candado';
import { despacharPedidoBlend, DespachoInvalido } from '@/lib/despacho-blend';

const entrada = {
  idPedido: 'SIRIUS-PED-0901',
  responsableEntrega: 'Operario Prueba',
  idDespacho: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
};

beforeEach(() => {
  (conCandado as jest.Mock).mockClear();
  global.fetch = jest.fn(async () => {
    throw new Error('fetch no permitido en este test');
  }) as jest.Mock;
});

it('la confirmación entra al candado despacho-blend', async () => {
  await expect(despacharPedidoBlend(entrada)).rejects.toBeInstanceOf(DespachoInvalido);
  expect(conCandado).toHaveBeenCalledTimes(1);
  expect((conCandado as jest.Mock).mock.calls[0][0]).toBe('despacho-blend');
});

it('el ensayo no toma el candado', async () => {
  await expect(despacharPedidoBlend(entrada, { dryRun: true })).rejects.toBeInstanceOf(DespachoInvalido);
  expect(conCandado).not.toHaveBeenCalled();
});

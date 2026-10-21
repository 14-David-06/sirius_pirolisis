/**
 * @jest-environment node
 */

/**
 * Formato del código de remisión en `/api/pirolisis/remisiones/[codigo]/enlace` y
 * `/reenviar`.
 *
 * Lo que se protege: que esas dos rutas acepten el mismo formato que el resto de
 * la app (`SIRIUS-REM-` + 4 o MÁS dígitos). Con `\d{4}` exactos, a partir de
 * SIRIUS-REM-10000 el enlace y el reenvío responderían 400 a una remisión real.
 *
 * Un código válido pasa la forma: el enlace se detiene en la configuración (503,
 * sin RECEPCION_SECRET) y el reenvío llega a `reenviarComprobante`, que aquí es
 * un doble. Sin red ni correo. Datos inventados.
 */

jest.mock('@/lib/serverSession', () => ({
  ServerSessionManager: {
    getSession: jest.fn(async () => ({ user: { id: 'usuario-falso', Nombre: 'Usuario', Apellido: 'Prueba' } })),
  },
}));

// Nunca se reenvía nada de verdad: basta saber si la forma dejó pasar el código.
const mockReenviar = jest.fn(async () => ({ status: 200, body: { steps: [] } }));
jest.mock('@/lib/recepcion/recepcion', () => ({
  reenviarComprobante: (...a: unknown[]) => (mockReenviar as (...x: unknown[]) => unknown)(...a),
}));

import { POST as enlace } from '@/app/api/pirolisis/remisiones/[codigo]/enlace/route';
import { POST as reenviar } from '@/app/api/pirolisis/remisiones/[codigo]/reenviar/route';

const request = {} as never;
const params = (codigo: string) => ({ params: Promise.resolve({ codigo }) });

beforeAll(() => {
  delete process.env.RECEPCION_SECRET;
});

beforeEach(() => {
  // Ni una llamada a la red: si la forma pasara a una lectura, fallaría ruidoso.
  global.fetch = jest.fn(async () => {
    throw new Error('fetch no permitido en este test');
  }) as jest.Mock;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe.each([
  ['enlace', enlace],
  ['reenviar', reenviar],
])('%s', (_n, handler) => {
  it('acepta un código de 5 dígitos (pasa la forma)', async () => {
    const r = await handler(request, params('SIRIUS-REM-10001'));
    expect(r.status).not.toBe(400);
  });

  it.each(['SIRIUS-REM-123', 'SIRIUS-REM-12a4', 'REM-0001'])('rechaza %s con 400', async (codigo) => {
    const r = await handler(request, params(codigo));
    expect(r.status).toBe(400);
  });
});

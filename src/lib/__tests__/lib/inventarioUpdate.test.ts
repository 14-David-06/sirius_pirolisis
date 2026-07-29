/**
 * @jest-environment node
 *
 * (jsdom no define los globales Request/Response que necesita next/server.)
 */

/**
 * PATCH /api/inventario/update/[id] — aislamiento por área.
 *
 * Sirius Insumos Core es una base compartida entre áreas, así que la guarda que
 * impide editar un insumo ajeno es la parte crítica de este endpoint: si se cae,
 * Pirólisis puede renombrar insumos de Blend o Laboratorio.
 */

const AREA = 'SIRIUS-AREA-TEST';

// Se mockea la config en vez de tocar process.env: los valores reales vienen de
// .env.local y no deben influir en el test (ni el test escribir en el Core real).
jest.mock('@/lib/config', () => ({
  config: {
    airtable: {
      insumosCoreToken: 'patTEST',
      insumosCoreBaseId: 'appTEST',
      insumosTableId: 'tblTEST',
      pirolisisAreaCode: 'SIRIUS-AREA-TEST',
      insumoFields: { nombre: undefined, stockMinimo: undefined },
    },
  },
}));

import { PATCH } from '@/app/api/inventario/update/[id]/route';

/** Request mínimo: el handler solo usa `json()`. */
function request(body: unknown) {
  return { json: async () => body } as never;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Respuesta de Airtable para el GET del insumo y el PATCH posterior. */
function airtableRecord(area: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: 'recINSUMO', fields: { Nombre: 'Lona', 'ID Area Origen': area } }),
  };
}

describe('PATCH /api/inventario/update/[id]', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as jest.Mock;
  });

  test('actualiza el insumo cuando pertenece al área', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(airtableRecord(AREA)) // GET
      .mockResolvedValueOnce(airtableRecord(AREA)); // PATCH

    const response = await PATCH(request({ nombre: 'Lona negra', stockMinimo: 4 }), params('recINSUMO'));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const [, patchInit] = (global.fetch as jest.Mock).mock.calls[1];
    expect(patchInit.method).toBe('PATCH');
  });

  test('rechaza con 403 y sin escribir si el insumo es de otra área', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(airtableRecord('SIRIUS-AREA-OTRA'));

    const response = await PATCH(request({ nombre: 'Secuestrado' }), params('recAJENO'));

    expect(response.status).toBe(403);
    // Solo el GET de verificación: nunca se llegó a escribir.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rechaza con 403 el insumo sin área asignada', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(airtableRecord(''));

    const response = await PATCH(request({ stockMinimo: 9 }), params('recSINAREA'));

    expect(response.status).toBe(403);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('valida el cuerpo antes de consultar Airtable', async () => {
    const vacio = await PATCH(request({ nombre: '   ' }), params('recINSUMO'));
    expect(vacio.status).toBe(400);

    const negativo = await PATCH(request({ stockMinimo: -1 }), params('recINSUMO'));
    expect(negativo.status).toBe(400);

    const sinCambios = await PATCH(request({}), params('recINSUMO'));
    expect(sinCambios.status).toBe(400);

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

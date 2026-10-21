/**
 * @jest-environment node
 */

/**
 * Contrato de `consumo-local-bache.ts` con la base de PiroliApp.
 *
 * Lo que se protege:
 *  - UNA remisión local por consumo (eUse cuenta cada fila como un viaje), con el
 *    nombre del cliente y la marca, y un detalle por bache con sus kg;
 *  - los detalles van en POST de 10 y sin `ID Produccion Blend`;
 *  - si el PRIMER lote de detalles falla se borra la remisión (si no, su marca
 *    haría pasar por escrito un consumo que no descontó nada);
 *  - un reintento crea solo lo que falta y nunca hace PATCH de un link;
 *  - los baches se leen por código en lotes, no uno por uno.
 *
 * Doble de Airtable en memoria y entorno inyectado antes de importar. Los field
 * IDs del entorno son los nombres, para que el doble evalúe las fórmulas.
 */

import { AirtableFalso, resumenEscritura, type LlamadaAirtable } from '@/test-utils/airtable-falso';

const BASE = 'basePiroliFalsa';
const T = { baches: 'tblBaches', remisiones: 'tblRemLocal', detalles: 'tblDetalles' };

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID: BASE,
    AIRTABLE_BACHES_TABLE_ID: T.baches,
    AIRTABLE_REMISIONES_BACHES_TABLE_ID: T.remisiones,
    AIRTABLE_DETALLE_CANTIDADES_REMISION_TABLE_ID: T.detalles,
    AIRTABLE_REMISIONES_FECHA_EVENTO_FIELD_ID: 'Fecha Evento',
    AIRTABLE_REMISIONES_REALIZA_REGISTRO_FIELD_ID: 'Realiza Registro',
    AIRTABLE_REMISIONES_OBSERVACIONES_FIELD_ID: 'Observaciones',
    AIRTABLE_REMISIONES_CLIENTE_FIELD_ID: 'Cliente',
    AIRTABLE_REMISIONES_BACHE_PIROLISIS_ALTERADO_FIELD_ID: 'Bache Pirolisis Alterado',
    AIRTABLE_DETALLE_CANTIDAD_ESPECIFICADA_FIELD_ID: 'Cantidad Especificada (KG)',
    AIRTABLE_DETALLE_REMISION_BACHE_FIELD_ID: 'Remisiones Baches Pirolisis',
    AIRTABLE_DETALLE_BACHE_PIROLISIS_FIELD_ID: 'Bache Pirolisis',
    AIRTABLE_DETALLE_ID_PRODUCCION_BLEND_FIELD_ID: 'ID Produccion Blend',
  });
}

function nuevaBase(o: { fallar?: (ll: LlamadaAirtable) => { status: number } | null } = {}) {
  const falso: AirtableFalso = new AirtableFalso({
    prefijo: 'LOCAL',
    fallar: o.fallar,
    computados: {
      // El link inverso remisión → detalles lo mantiene Airtable.
      [`${BASE}/${T.remisiones}`]: (rec, f) => ({
        'Detalle Cantidades Bache Pirolisis': f
          .registros(BASE, T.detalles)
          .filter((d) => ((d.fields['Remisiones Baches Pirolisis'] as string[]) ?? []).includes(rec.id))
          .map((d) => d.id),
      }),
    },
  });
  return falso;
}

type Modulo = typeof import('@/lib/consumo-local-bache');
let m: Modulo;

beforeAll(async () => {
  entorno();
  m = await import('@/lib/consumo-local-bache');
});

afterEach(() => jest.restoreAllMocks());

function instalar(falso: AirtableFalso) {
  jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);
  jest.spyOn(console, 'error').mockImplementation(() => {});
}

function sembrarBaches(falso: AirtableFalso, n: number, desde = 140) {
  const ids: Record<string, string> = {};
  for (let k = 0; k < n; k++) {
    const codigo = `S-${String(desde + k).padStart(5, '0')}`;
    ids[codigo] = falso.sembrar(BASE, T.baches, { 'Codigo Bache': codigo, 'Estado Bache': 'Bache Completo Bodega' });
  }
  return ids;
}

const MARCA = '[DESPACHO:SIRIUS-REM-0901]';

describe('resolverBachesPorCodigo', () => {
  it('lee por código en lotes de 50 y marca los migrados', async () => {
    const falso = nuevaBase();
    instalar(falso);
    const ids = sembrarBaches(falso, 60);
    falso.sembrar(BASE, T.baches, { 'Codigo Bache': 'S-00083', 'Estado Bache': 'Bache Agotado', 'Origen Registro': 'Migrado PiroliApp V2' });

    const codigos = [...Object.keys(ids), 'S-00083', 'S-09999'];
    const mapa = await m.resolverBachesPorCodigo(codigos);

    expect(mapa.size).toBe(61);
    expect(mapa.get('S-00140')).toEqual({ id: ids['S-00140'], codigo: 'S-00140', estado: 'Bache Completo Bodega', origenRegistro: '' });
    expect(mapa.get('S-00083')?.origenRegistro).toBe('Migrado PiroliApp V2');
    expect(mapa.has('S-09999')).toBe(false);
    // 62 códigos → 2 lecturas, no 62.
    expect(falso.llamadas.filter((l) => l.tabla === T.baches)).toHaveLength(2);
  });

  it('no consulta un código que no tiene la forma S-XXXXX', async () => {
    const falso = nuevaBase();
    instalar(falso);
    await expect(m.resolverBachesPorCodigo(["S-00140') OR (1"])).rejects.toThrow(/inválido/);
    expect(falso.llamadas).toHaveLength(0);
  });
});

describe('escribirConsumoLocal', () => {
  const entrada = (lineas: Array<{ bacheId: string; codigo: string; kg: number }>) => ({
    marca: MARCA,
    fecha: '2026-10-21',
    realizaRegistro: 'Usuario Prueba',
    cliente: 'CLIENTE FALSO S.A.S.',
    descripcion: 'Despacho comercial de Biochar · pedido SIRIUS-PED-0901 · remisión SIRIUS-REM-0901',
    lineas,
  });

  it('UNA remisión con todos los baches y un detalle por bache, en POST de 10', async () => {
    const falso = nuevaBase();
    instalar(falso);
    const ids = sembrarBaches(falso, 12);
    const lineas = Object.entries(ids).map(([codigo, bacheId], n) => ({ bacheId, codigo, kg: 10 + n }));

    const paso = await m.escribirConsumoLocal(entrada(lineas), null);

    expect(paso).toMatchObject({ step: 'local', ok: true });
    const escrituras = falso.escrituras().map(resumenEscritura);
    expect(escrituras.map((e) => [e.metodo, e.tabla])).toEqual([
      ['POST', T.remisiones],
      ['POST', T.detalles],
      ['POST', T.detalles],
    ]);
    const remFields = (escrituras[0].body as { records: Array<{ fields: Record<string, unknown> }> }).records[0].fields;
    expect(remFields).toEqual({
      'Bache Pirolisis Alterado': Object.values(ids),
      Observaciones: `Despacho comercial de Biochar · pedido SIRIUS-PED-0901 · remisión SIRIUS-REM-0901\n${MARCA}`,
      'Fecha Evento': '2026-10-21',
      'Realiza Registro': 'Usuario Prueba',
      Cliente: 'CLIENTE FALSO S.A.S.',
    });
    const detalles = [escrituras[1], escrituras[2]].flatMap(
      (e) => (e.body as { records: Array<{ fields: Record<string, unknown> }> }).records
    );
    expect(detalles).toHaveLength(12);
    expect((escrituras[1].body as { records: unknown[] }).records).toHaveLength(10);
    for (const d of detalles) expect(d.fields).not.toHaveProperty('ID Produccion Blend');
    expect(detalles[0].fields).toEqual({
      'Cantidad Especificada (KG)': 10,
      'Remisiones Baches Pirolisis': [expect.any(String)],
      'Bache Pirolisis': [ids['S-00140']],
    });

    // Y se lee de vuelta tal cual.
    const leido = await m.leerConsumoLocal(MARCA);
    expect(leido?.kgPorBacheId.get(ids['S-00141'])).toBe(11);
    expect(leido?.kgPorBacheId.size).toBe(12);
  });

  it('si el primer lote de detalles falla, borra la remisión', async () => {
    const falso = nuevaBase({ fallar: (ll) => (ll.metodo === 'POST' && ll.tabla === T.detalles ? { status: 422 } : null) });
    instalar(falso);
    const ids = sembrarBaches(falso, 2);

    const paso = await m.escribirConsumoLocal(
      entrada(Object.entries(ids).map(([codigo, bacheId]) => ({ bacheId, codigo, kg: 5 }))),
      null
    );

    expect(paso.ok).toBe(false);
    expect(paso.error).toMatch(/se borró la remisión local/);
    expect(falso.escrituras().map((e) => e.metodo)).toEqual(['POST', 'POST', 'DELETE']);
    expect(falso.registros(BASE, T.remisiones)).toHaveLength(0);
  });

  it('un reintento crea solo los detalles que faltan, sin PATCH', async () => {
    const falso = nuevaBase();
    instalar(falso);
    const ids = sembrarBaches(falso, 3);
    const remId = falso.sembrar(BASE, T.remisiones, { Observaciones: `algo\n${MARCA}` });
    falso.sembrar(BASE, T.detalles, {
      'Cantidad Especificada (KG)': 40,
      'Remisiones Baches Pirolisis': [remId],
      'Bache Pirolisis': [ids['S-00140']],
    });

    const previo = await m.leerConsumoLocal(MARCA);
    expect(previo).toEqual({ remisionId: remId, kgPorBacheId: new Map([[ids['S-00140'], 40]]) });

    const lineas = [
      { bacheId: ids['S-00140'], codigo: 'S-00140', kg: 40 },
      { bacheId: ids['S-00141'], codigo: 'S-00141', kg: 25 },
    ];
    const paso = await m.escribirConsumoLocal(entrada(lineas), previo);
    expect(paso.ok).toBe(true);
    const escrituras = falso.escrituras().map(resumenEscritura);
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0]).toMatchObject({ metodo: 'POST', tabla: T.detalles });
    expect((escrituras[0].body as { records: unknown[] }).records).toEqual([
      { fields: { 'Cantidad Especificada (KG)': 25, 'Remisiones Baches Pirolisis': [remId], 'Bache Pirolisis': [ids['S-00141']] } },
    ]);

    // Completo: no escribe nada.
    const otraVez = await m.escribirConsumoLocal(entrada(lineas), await m.leerConsumoLocal(MARCA));
    expect(otraVez).toMatchObject({ ok: true, skipped: true });
    expect(falso.escrituras()).toHaveLength(1);
  });

  it('una cantidad distinta a la escrita es un error y no toca nada', async () => {
    const falso = nuevaBase();
    instalar(falso);
    const ids = sembrarBaches(falso, 1);
    const previo = { remisionId: 'recLOCAL000000099', kgPorBacheId: new Map([[ids['S-00140'], 30]]) };
    const paso = await m.escribirConsumoLocal(entrada([{ bacheId: ids['S-00140'], codigo: 'S-00140', kg: 40 }]), previo);
    expect(paso.ok).toBe(false);
    expect(paso.error).toMatch(/S-00140: 30 kg escritos, 40 kg esperados/);
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('sin remisión con la marca, leerConsumoLocal da null; si la lectura falla, lanza', async () => {
    const falso = nuevaBase();
    instalar(falso);
    expect(await m.leerConsumoLocal(MARCA)).toBeNull();

    const caido = nuevaBase({ fallar: () => ({ status: 503 }) });
    jest.restoreAllMocks();
    instalar(caido);
    await expect(m.leerConsumoLocal(MARCA)).rejects.toThrow(/503/);
  });
});

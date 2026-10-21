/**
 * @jest-environment node
 */

/**
 * Contrato de `remisiones-core.ts` con Sirius Remisiones Core.
 *
 * Lo que se protege, en orden de lo caro que sería romperlo:
 *  - la recepción escribe en UN PATCH (estado, fecha, receptor unido a los que
 *    había y la marca con hora) y detecta la carrera releyendo;
 *  - nunca se escribe `Remisiones Relacionadas` (el inverso del link);
 *  - la cédula se compara normalizada y va escapada en la fórmula;
 *  - una remisión del laboratorio o de prueba nunca se lee como de PiroliApp;
 *  - el Borrador se activa solo desde Borrador, y lo que se descarta se borra
 *    producto primero.
 *
 * Doble de Airtable en memoria, `fetch` espiado y entorno inyectado antes de
 * importar. Datos inventados.
 */

import { AirtableFalso, resumenEscritura, type LlamadaAirtable } from '@/test-utils/airtable-falso';

const B_REM = 'baseRemFalsa';
const B_CLI = 'baseCliFalsa';
const T = { remisiones: 'tblRemisiones', productos: 'tblProductos', personas: 'tblPersonas', clientes: 'tblClientes' };
const PROD_PURO = 'PRODUCTO-PURO-FALSO';
const UUID = '0b6f3a52-6d1e-4c8a-9f3e-2a1b4c5d6e7f';
const UUID_OTRO = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function entorno() {
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B_REM,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_TABLE_PRODUCTOS_REMITIDOS: T.productos,
    AIRTABLE_TABLE_PERSONAS_REMISION: T.personas,
    AIRTABLE_CLIENTES_BASE_ID: B_CLI,
    AIRTABLE_CLIENTES_TABLE_ID: T.clientes,
    AIRTABLE_CLIENTES_TOKEN: 'token-falso',
    AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: PROD_PURO,
  });
}

function nuevoCore(o: { fallar?: (ll: LlamadaAirtable) => { status: number } | null } = {}) {
  const falso = new AirtableFalso({
    fallar: o.fallar,
    alCrear: { [`${B_REM}/${T.remisiones}`]: (f, n) => ({ numeracion: f.numeracion ?? n }) },
    computados: {
      [`${B_REM}/${T.remisiones}`]: (rec) => ({
        ID: `SIRIUS-REM-${String(98 + Number(rec.fields.numeracion)).padStart(4, '0')}`,
      }),
      [`${B_REM}/${T.personas}`]: (rec) => ({ 'Codigo Persona Remision': `PER-REM-${rec.id.slice(-4)}` }),
    },
    externo: (url) => (url.includes('recibida') ? { status: 200, bytes: new Uint8Array([37, 80, 68, 70]) } : null),
  });
  falso.autonumeroDesde(B_REM, T.remisiones, 131);
  return falso;
}

type Modulo = typeof import('@/lib/remisiones-core');
type Constantes = typeof import('@/lib/remision-pirolisis.constants');
let rc: Modulo;
let k: Constantes;

beforeAll(async () => {
  entorno();
  rc = await import('@/lib/remisiones-core');
  k = await import('@/lib/remision-pirolisis.constants');
});

afterEach(() => jest.restoreAllMocks());

function instalar(falso: AirtableFalso, envoltorio?: (f: typeof fetch) => typeof fetch) {
  const base = falso.fetch as typeof fetch;
  jest.spyOn(global, 'fetch').mockImplementation(envoltorio ? envoltorio(base) : base);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
}

function nuncaRemisionesRelacionadas(falso: AirtableFalso) {
  for (const e of falso.escrituras()) {
    expect(JSON.stringify(e.body ?? {})).not.toContain('Remisiones Relacionadas');
  }
}

const baseRemision = {
  'Area Origen': 'Producción',
  'ID Cliente': 'CL-0901',
  'ID Pedido': 'SIRIUS-PED-0901',
};

describe('emitirDocumentoRemision', () => {
  it('biochar en Borrador: Producción, notas con marcas y UNA fila 0015 por el total', async () => {
    const falso = nuevoCore();
    instalar(falso);
    const notas = k.notasRemisionBiochar(
      [{ bache: 'S-00140', kg: 75 }, { bache: 'S-00141', kg: 125 }],
      UUID,
      'Entrega parcial'
    );

    const r = await rc.emitirDocumentoRemision({
      estado: 'Borrador',
      notas,
      productos: [{ productoId: PROD_PURO, kg: 200, notas: 'Baches S-00140 (75,00 kg), S-00141 (125,00 kg)' }],
      idCliente: 'CL-0901',
      idPedido: 'SIRIUS-PED-0901',
      idAreaCliente: 'AC-0901',
      responsableEntrega: 'Operario Uno Prueba',
      fechaDespacho: '2026-10-21',
    });

    expect(r.ok).toBe(true);
    expect(r.productoIds).toHaveLength(1);
    expect(r.steps.map((s) => [s.step, s.ok])).toEqual([['remision', true], ['producto_remitido', true]]);
    expect(falso.escrituras().map(resumenEscritura)).toEqual([
      {
        metodo: 'POST',
        tabla: T.remisiones,
        body: {
          records: [{
            fields: {
              'Area Origen': 'Producción',
              Estado: 'Borrador',
              'Notas de Remisión': `[bache:S-00140=75.00] [bache:S-00141=125.00] [desp:${UUID}] Biochar — Entrega parcial`,
              'ID Cliente': 'CL-0901',
              'ID Pedido': 'SIRIUS-PED-0901',
              'ID Area Cliente': 'AC-0901',
              'Responsable Entrega': 'Operario Uno Prueba',
              'Fecha Pedido Despachado': '2026-10-21',
            },
          }],
        },
      },
      {
        metodo: 'POST',
        tabla: T.productos,
        body: {
          records: [{
            fields: {
              'ID Producto': PROD_PURO,
              Cantidad: 200,
              Unidad: 'Kg',
              'Remisión vinculada': [r.remisionRecordId],
              Notas: 'Baches S-00140 (75,00 kg), S-00141 (125,00 kg)',
            },
          }],
        },
      },
    ]);
  });

  it('si falla el producto, borra lo creado: productos del lote anterior primero, después la remisión', async () => {
    let posts = 0;
    const falso = nuevoCore({
      fallar: (ll) => (ll.metodo === 'POST' && ll.tabla === T.productos && ++posts === 2 ? { status: 422 } : null),
    });
    instalar(falso);

    const r = await rc.emitirDocumentoRemision({
      estado: 'Pendiente',
      notas: '[lote:BLEND-A] Biochar Blend',
      productos: Array.from({ length: 12 }, (_, i) => ({ productoId: 'P', kg: 1 + i, notas: `L${i}` })),
      idCliente: 'CL-0901',
      idPedido: 'SIRIUS-PED-0901',
      responsableEntrega: 'Operario Uno Prueba',
      fechaDespacho: '2026-10-21',
    });

    expect(r.ok).toBe(false);
    expect(r.remisionRecordId).toBeNull();
    const esc = falso.escrituras().map(resumenEscritura);
    expect(esc.map((e) => [e.metodo, e.tabla])).toEqual([
      ['POST', T.remisiones],
      ['POST', T.productos],
      ['POST', T.productos],
      ['DELETE', T.productos],
      ['DELETE', T.remisiones],
    ]);
    // Airtable acepta 10 por POST: el primer lote tenía 10.
    expect((esc[1].body as { records: unknown[] }).records).toHaveLength(10);
    expect(esc[3].records).toHaveLength(10);
    expect(falso.registros(B_REM, T.remisiones)).toHaveLength(0);
    expect(falso.registros(B_REM, T.productos)).toHaveLength(0);
  });

  it('rechaza sin escribir un estado inicial que no sea Borrador, Pendiente o En Tránsito', async () => {
    const falso = nuevoCore();
    instalar(falso);
    const r = await rc.emitirDocumentoRemision({
      estado: 'Entregada' as 'Borrador',
      notas: 'x',
      productos: [{ productoId: 'P', kg: 1, notas: '' }],
      idCliente: 'CL-0901',
      idPedido: 'SIRIUS-PED-0901',
      responsableEntrega: 'X',
      fechaDespacho: '2026-10-21',
    });
    expect(r.ok).toBe(false);
    expect(falso.llamadas).toHaveLength(0);
  });
});

describe('activarRemision', () => {
  it('Borrador → En Tránsito con un PATCH solo del estado', async () => {
    const falso = nuevoCore();
    const id = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Borrador', 'Notas de Remisión': '[bache:S-00140=1.00] Biochar' });
    instalar(falso);
    const paso = await rc.activarRemision(id, 'En Tránsito');
    expect(paso).toMatchObject({ step: 'activar', ok: true });
    expect(falso.escrituras().map(resumenEscritura)).toEqual([
      { metodo: 'PATCH', tabla: T.remisiones, recordId: id, body: { fields: { Estado: 'En Tránsito' } } },
    ]);
  });

  it('ya activa es un reintento (skipped); Cancelada no se toca', async () => {
    const falso = nuevoCore();
    const activa = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Pendiente' });
    const cancelada = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Cancelada' });
    instalar(falso);
    expect(await rc.activarRemision(activa, 'Pendiente')).toMatchObject({ ok: true, skipped: true });
    expect(await rc.activarRemision(cancelada, 'Pendiente')).toMatchObject({ ok: false });
    expect(falso.escrituras()).toHaveLength(0);
  });
});

describe('descartarRemision', () => {
  it('borra los productos en lotes de 10 y después la remisión', async () => {
    const falso = nuevoCore();
    const rem = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Borrador' });
    const prods = Array.from({ length: 11 }, () => falso.sembrar(B_REM, T.productos, { 'Remisión vinculada': [rem] }));
    instalar(falso);
    await rc.descartarRemision(rem, prods);
    const esc = falso.escrituras().map(resumenEscritura);
    expect(esc.map((e) => [e.metodo, e.tabla])).toEqual([
      ['DELETE', T.productos],
      ['DELETE', T.productos],
      ['DELETE', T.remisiones],
    ]);
    expect(esc[0].records).toHaveLength(10);
  });
});

describe('lecturas crudas', () => {
  function sembrarMezcla(falso: AirtableFalso) {
    falso.sembrar(B_REM, T.remisiones, { ...baseRemision, numeracion: 140, Estado: 'Pendiente', 'Notas de Remisión': '[lote:BLEND-A] Biochar Blend' });
    falso.sembrar(B_REM, T.remisiones, { ...baseRemision, numeracion: 135, Estado: 'Borrador', 'Notas de Remisión': `[bache:S-00140=10.00] [desp:${UUID}] Biochar` });
    // DataLab, aunque alguien haya escrito una marca.
    falso.sembrar(B_REM, T.remisiones, { ...baseRemision, numeracion: 120, 'Area Origen': 'Laboratorio', Estado: 'Borrador', 'Notas de Remisión': '[lote:BLEND-A] biológicos' });
    // Prueba vieja de la sincronización.
    falso.sembrar(B_REM, T.remisiones, { ...baseRemision, numeracion: 72, Estado: 'Cancelada', 'Notas de Remisión': '[blend:TEST-DIAG]' });
    // La marca está en el texto del operador, no en el prefijo.
    falso.sembrar(B_REM, T.remisiones, { ...baseRemision, numeracion: 150, Estado: 'Pendiente', 'Notas de Remisión': `Biochar — ver [bache:S-00999=500] [desp:${UUID_OTRO}]` });
  }

  it('soloPirolisis: solo las de Producción con marca antes de « — », ordenadas por numeración', async () => {
    const falso = nuevoCore();
    sembrarMezcla(falso);
    instalar(falso);
    const rs = await rc.listarRemisionesCrudas({ soloPirolisis: true });
    expect(rs.map((r) => r.codigo)).toEqual(['SIRIUS-REM-0233', 'SIRIUS-REM-0238']);
  });

  it('marcaDespacho: la llave exacta, y nunca la escrita por el operador', async () => {
    const falso = nuevoCore();
    sembrarMezcla(falso);
    instalar(falso);
    expect((await rc.listarRemisionesCrudas({ marcaDespacho: UUID })).map((r) => r.numeracion)).toEqual([135]);
    expect(await rc.listarRemisionesCrudas({ marcaDespacho: UUID_OTRO })).toEqual([]);
  });

  it('una llave mal formada lanza antes de consultar', async () => {
    const falso = nuevoCore();
    instalar(falso);
    await expect(rc.listarRemisionesCrudas({ marcaDespacho: "x') , TRUE(" })).rejects.toThrow();
    expect(falso.llamadas).toHaveLength(0);
  });

  it('los filtros van escapados en la fórmula', async () => {
    const falso = nuevoCore();
    instalar(falso);
    await rc.listarRemisionesCrudas({ pedido: "PED' , TRUE(), '", cliente: 'CL\\' });
    const formula = falso.llamadas[0].params.get('filterByFormula')!;
    expect(formula).toContain("{ID Pedido} = 'PED\\' , TRUE(), \\''");
    expect(formula).toContain("{ID Cliente} = 'CL\\\\'");
  });

  it('leerRemisionCruda: por código o record ID; null si no existe; lanza si la lectura falla', async () => {
    const falso = nuevoCore();
    const id = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Pendiente' });
    instalar(falso);
    expect((await rc.leerRemisionCruda('SIRIUS-REM-0230'))?.recordId).toBe(id);
    expect((await rc.leerRemisionCruda(id))?.codigo).toBe('SIRIUS-REM-0230');
    expect(await rc.leerRemisionCruda('recNOEXISTE0000001'.slice(0, 17))).toBeNull();
    expect(await rc.leerRemisionCruda('SIRIUS-REM-9999')).toBeNull();

    const caido = nuevoCore({ fallar: () => ({ status: 503 }) });
    jest.restoreAllMocks();
    instalar(caido);
    await expect(rc.leerRemisionCruda('SIRIUS-REM-0230')).rejects.toThrow('503');
  });
});

describe('personas', () => {
  it('buscarOCrearPersona compara la cédula normalizada: «10.203.040» ya existe como 10203040', async () => {
    const falso = nuevoCore();
    const existente = falso.sembrar(B_REM, T.personas, { Cedula: '10.203.040 ', 'Tipo de Usuario': 'Transportista', 'Nombre Completo': 'Persona Ficticia Uno' });
    instalar(falso);
    const id = await rc.buscarOCrearPersona({ nombre: 'Persona Ficticia Uno', cedula: '10203040', tipo: 'Transportista' });
    expect(id).toBe(existente);
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('buscarOCrearPersona guarda la cédula normalizada y escapa lo que no lo es', async () => {
    const falso = nuevoCore();
    instalar(falso);
    await rc.buscarOCrearPersona({ nombre: 'Persona Ficticia Dos', cedula: ' 20.304.050 ', tipo: 'Transportista' });
    const creada = falso.escrituras()[0].body as { records: Array<{ fields: Record<string, unknown> }> };
    expect(creada.records[0].fields).toMatchObject({ Cedula: '20304050', 'Base Origen': 'PiroliApp (Pirolisis)' });

    await rc.buscarOCrearPersona({ nombre: 'X', cedula: "1' , TRUE(), '", tipo: 'Transportista' });
    const formula = falso.llamadas.filter((l) => l.metodo === 'GET').at(-1)!.params.get('filterByFormula')!;
    expect(formula).toContain("= '1\\' , TRUE(), \\''");
    nuncaRemisionesRelacionadas(falso);
  });

  it('crearPersonaRemision valida el correo ANTES de escribir (un email inválido es un 422)', async () => {
    const falso = nuevoCore();
    instalar(falso);
    await expect(
      rc.crearPersonaRemision({ nombre: 'Receptora Ficticia', cedula: '30405060', tipo: 'Receptor', correo: 'no es correo', baseOrigen: 'PiroliApp (Pirolisis)' })
    ).rejects.toThrow('Correo');
    expect(falso.llamadas).toHaveLength(0);

    const id = await rc.crearPersonaRemision({
      nombre: 'Receptora Ficticia', cedula: '30.405.060', tipo: 'Receptor', correo: 'Receptora@Ejemplo.test',
      telefono: '+57 3000000001', baseOrigen: 'Sirius Clients Core', idOrigen: 'CL-0901-PER-0001',
    });
    expect(id).toMatch(/^rec/);
    expect(falso.escrituras().map(resumenEscritura)).toEqual([{
      metodo: 'POST',
      tabla: T.personas,
      body: { records: [{ fields: {
        'Nombre Completo': 'Receptora Ficticia',
        Cedula: '30405060',
        'Tipo de Usuario': 'Receptor',
        'Base Origen': 'Sirius Clients Core',
        'Correo Electrónico': 'receptora@ejemplo.test',
        Teléfono: '+57 3000000001',
        'ID Origen': 'CL-0901-PER-0001',
      } }] },
    }]);
  });

  it('completarCorreoPersona solo escribe si estaba vacío', async () => {
    const falso = nuevoCore();
    const sin = falso.sembrar(B_REM, T.personas, { 'Nombre Completo': 'A B' });
    const con = falso.sembrar(B_REM, T.personas, { 'Nombre Completo': 'C D', 'Correo Electrónico': 'previo@ejemplo.test' });
    instalar(falso);
    expect(await rc.completarCorreoPersona(sin, 'nuevo@ejemplo.test')).toBe(true);
    expect(await rc.completarCorreoPersona(con, 'otro@ejemplo.test')).toBe(false);
    expect(falso.escrituras().map(resumenEscritura)).toEqual([
      { metodo: 'PATCH', tabla: T.personas, recordId: sin, body: { fields: { 'Correo Electrónico': 'nuevo@ejemplo.test' } } },
    ]);
  });

  it('leerPersonas: una lectura por cada 50, en el orden pedido', async () => {
    const falso = nuevoCore();
    const ids = Array.from({ length: 51 }, (_, i) => falso.sembrar(B_REM, T.personas, { 'Nombre Completo': `P ${i}` }));
    instalar(falso);
    const ps = await rc.leerPersonas([...ids].reverse());
    expect(ps.map((p) => p.recordId)).toEqual([...ids].reverse());
    expect(falso.llamadas.filter((l) => l.tabla === T.personas)).toHaveLength(2);
  });
});

describe('marcarRemisionEntregada', () => {
  const INSTANTE = new Date('2026-10-21T20:04:05.000Z');

  function remisionPendiente(falso: AirtableFalso, estado = 'En Tránsito') {
    const transportista = falso.sembrar(B_REM, T.personas, { 'Tipo de Usuario': 'Transportista' });
    const receptor = falso.sembrar(B_REM, T.personas, { 'Tipo de Usuario': 'Receptor' });
    const rem = falso.sembrar(B_REM, T.remisiones, {
      ...baseRemision,
      Estado: estado,
      Personas: [transportista],
      'Notas de Remisión': '[bache:S-00140=10.00] Biochar — Dejar en la bodega 2',
    });
    return { rem, transportista, receptor };
  }

  it('un solo PATCH: Entregada, fecha, receptor UNIDO a los previos y la marca antes de « — »', async () => {
    const falso = nuevoCore();
    const { rem, transportista, receptor } = remisionPendiente(falso);
    instalar(falso);
    const marca = k.marcaRecibida(INSTANTE);

    const r = await rc.marcarRemisionEntregada({ recordId: rem, receptorId: receptor, fecha: '2026-10-21', marca });

    expect(r.resultado).toBe('ok');
    expect(r.remision.estado).toBe('Entregada');
    expect(falso.escrituras().map(resumenEscritura)).toEqual([{
      metodo: 'PATCH',
      tabla: T.remisiones,
      recordId: rem,
      body: { fields: {
        Estado: 'Entregada',
        'Fecha Recibido': '2026-10-21',
        Personas: [transportista, receptor],
        'Notas de Remisión': `[bache:S-00140=10.00] ${marca} Biochar — Dejar en la bodega 2`,
      } },
    }]);
    nuncaRemisionesRelacionadas(falso);
  });

  it('ya entregada o no recibible (Borrador, Cancelada): no escribe', async () => {
    const falso = nuevoCore();
    const a = remisionPendiente(falso, 'Entregada');
    const b = remisionPendiente(falso, 'Borrador');
    const c = remisionPendiente(falso, 'Cancelada');
    instalar(falso);
    const marca = k.marcaRecibida(INSTANTE);
    expect((await rc.marcarRemisionEntregada({ recordId: a.rem, receptorId: a.receptor, fecha: '2026-10-21', marca })).resultado).toBe('ya-entregada');
    expect((await rc.marcarRemisionEntregada({ recordId: b.rem, receptorId: b.receptor, fecha: '2026-10-21', marca })).resultado).toBe('no-recibible');
    expect((await rc.marcarRemisionEntregada({ recordId: c.rem, receptorId: c.receptor, fecha: '2026-10-21', marca })).resultado).toBe('no-recibible');
    expect(falso.escrituras()).toHaveLength(0);
  });

  it('carrera: si al releer la marca no es la propia, otra confirmación ganó', async () => {
    const falso = nuevoCore();
    const { rem, receptor } = remisionPendiente(falso);
    const ajena = k.marcaRecibida(new Date('2026-10-21T20:04:04.000Z'));
    // Otra instancia escribe su marca justo después de nuestro PATCH.
    instalar(falso, (f) => async (url, init) => {
      const res = await f(url, init);
      if (init?.method === 'PATCH') {
        const actual = falso.registro(B_REM, T.remisiones, rem)!;
        falso.sembrar(B_REM, T.remisiones, {
          ...actual.fields,
          'Notas de Remisión': `[bache:S-00140=10.00] ${ajena} Biochar`,
        }, rem);
      }
      return res;
    });

    const r = await rc.marcarRemisionEntregada({ recordId: rem, receptorId: receptor, fecha: '2026-10-21', marca: k.marcaRecibida(INSTANTE) });
    expect(r.resultado).toBe('carrera');
  });

  it('rechaza una marca que no es [recibida:ISO] sin tocar Airtable', async () => {
    const falso = nuevoCore();
    const { rem, receptor } = remisionPendiente(falso);
    instalar(falso);
    await expect(rc.marcarRemisionEntregada({ recordId: rem, receptorId: receptor, fecha: '2026-10-21', marca: '[correo:2026-10-21T20:04:05.000Z]' })).rejects.toThrow();
    expect(falso.llamadas).toHaveLength(0);
  });
});

describe('marcas y documento', () => {
  it('agregarMarcaRemision reemplaza la del mismo tipo y conserva el texto del operador', async () => {
    const falso = nuevoCore();
    const rem = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Entregada', 'Notas de Remisión': '[lote:BLEND-A] [correo:2026-10-20T10:00:00.000Z] Biochar Blend — Obs' });
    instalar(falso);
    const marca = k.marcaCorreo(new Date('2026-10-21T20:00:00.000Z'));
    await rc.agregarMarcaRemision(rem, marca);
    expect(falso.escrituras().map(resumenEscritura)).toEqual([
      { metodo: 'PATCH', tabla: T.remisiones, recordId: rem, body: { fields: { 'Notas de Remisión': `[lote:BLEND-A] ${marca} Biochar Blend — Obs` } } },
    ]);
  });

  it('adjuntarDocumento sube primero y deja solo el nuevo', async () => {
    const falso = nuevoCore();
    const rem = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Pendiente' });
    instalar(falso);
    await rc.adjuntarDocumento(rem, new Uint8Array([1, 2, 3]), 'SIRIUS-REM-0230.pdf');
    await rc.adjuntarDocumento(rem, new Uint8Array([4, 5]), 'SIRIUS-REM-0230-recibida.pdf');
    const esc = falso.escrituras();
    expect(esc.map((e) => [e.metodo, e.host])).toEqual([
      ['POST', 'content.airtable.com'],
      ['POST', 'content.airtable.com'],
      ['PATCH', 'api.airtable.com'],
    ]);
    const docs = falso.registro(B_REM, T.remisiones, rem)!.fields['Documento Remision'] as Array<{ filename: string }>;
    expect(docs.map((d) => d.filename)).toEqual(['SIRIUS-REM-0230-recibida.pdf']);
  });

  it('descargarDocumento trae el adjunto con ese sufijo, o null', async () => {
    const falso = nuevoCore();
    const rem = falso.sembrar(B_REM, T.remisiones, { ...baseRemision, Estado: 'Entregada' });
    instalar(falso);
    expect(await rc.descargarDocumento(rem, '-recibida.pdf')).toBeNull();
    await rc.adjuntarDocumento(rem, new Uint8Array([9]), 'SIRIUS-REM-0230-recibida.pdf');
    const bytes = await rc.descargarDocumento(rem, '-recibida.pdf');
    expect(Array.from(bytes!)).toEqual([37, 80, 68, 70]);
  });
});

describe('datosCliente', () => {
  it('nombre exacto y distancia; lanza si el cliente no existe', async () => {
    const falso = nuevoCore();
    falso.sembrar(B_CLI, T.clientes, { ID: 'CL-0901', Cliente: ' Finca Sintética S.A.S. ', distancia_bodega_km: 42.5 });
    falso.sembrar(B_CLI, T.clientes, { ID: 'CL-0902', Cliente: 'Otra Finca' });
    instalar(falso);
    expect(await rc.datosCliente('CL-0901')).toEqual({ nombre: 'Finca Sintética S.A.S.', distanciaKm: 42.5 });
    expect(await rc.datosCliente('CL-0902')).toEqual({ nombre: 'Otra Finca', distanciaKm: null });
    await expect(rc.datosCliente('CL-0999')).rejects.toThrow('no existe');
  });
});

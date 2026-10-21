/**
 * @jest-environment node
 */

/**
 * El orquestador de la recepción pública (`recepcion.ts`): consultar,
 * identificar y confirmar, más el reenvío interno.
 *
 * Lo que se protege, en orden de lo caro que sería romperlo:
 *  - el token se verifica ANTES de leer nada, y todo lo inválido es el mismo 404;
 *  - la prueba de la autorización se guarda ANTES que el dato personal, y sin la
 *    tabla no se escribe nada (503);
 *  - una carrera perdida no manda correo; un reintento con la misma cédula es 200
 *    `yaRecibida` sin correo;
 *  - el correo va al receptor con la copia fija, y la marca `[correo:]` solo se
 *    escribe si salió de verdad;
 *  - Clients Core nunca recibe una escritura (prueba de punta a punta con el
 *    doble de Airtable y `fetch` espiado).
 *
 * La mayoría de los casos corre sobre las dependencias de fixtures (en memoria)
 * con espías encima. Datos inventados.
 */

import { NextRequest } from 'next/server';
import { AirtableFalso } from '@/test-utils/airtable-falso';
import type { CorreoSaliente, ResultadoEnvio } from '@/lib/correo/graph';
import type { DepsRecepcion, ConfirmarInput } from '@/lib/recepcion/recepcion';

const B_REM = 'baseRemFalsa';
const B_CLI = 'baseCliFalsa';
const B_PIRO = 'basePiroFalsa';
const T = {
  remisiones: 'tblRemisiones',
  productos: 'tblProductos',
  personas: 'tblPersonas',
  clientes: 'tblClientes',
  personal: 'tblPersonal',
  autorizaciones: 'tblAutorizaciones',
};
const SECRETO = 'secreto-de-prueba-recepcion-0123456789abcdef';
const VERSION = '2026-10-21';

type Rec = typeof import('@/lib/recepcion/recepcion');
type Fix = typeof import('@/lib/recepcion/fixtures');
let rec: Rec;
let fx: Fix;

beforeAll(async () => {
  for (const v of ['CORREO_MODO', 'CORREO_REDIRIGIR_A', 'CORREO_GUARDAR_EN', 'VERCEL_ENV', 'RECEPCION_FIXTURES', 'RECEPCION_CORREO_CC']) {
    delete process.env[v];
  }
  Object.assign(process.env, {
    AIRTABLE_GLOBAL_TOKEN: 'token-falso',
    AIRTABLE_TOKEN: 'token-falso',
    AIRTABLE_BASE_ID: B_PIRO,
    AIRTABLE_AUTORIZACIONES_DATOS_TABLE_ID: T.autorizaciones,
    AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE: B_REM,
    AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE: 'token-falso',
    AIRTABLE_TABLE_REMISIONES: T.remisiones,
    AIRTABLE_TABLE_PRODUCTOS_REMITIDOS: T.productos,
    AIRTABLE_TABLE_PERSONAS_REMISION: T.personas,
    AIRTABLE_CLIENTES_BASE_ID: B_CLI,
    AIRTABLE_CLIENTES_TABLE_ID: T.clientes,
    AIRTABLE_CLIENTES_PERSONAL_TABLE_ID: T.personal,
    AIRTABLE_CLIENTES_TOKEN: 'token-falso',
    RECEPCION_SECRET: SECRETO,
  });
  rec = await import('@/lib/recepcion/recepcion');
  fx = await import('@/lib/recepcion/fixtures');
});

beforeEach(() => {
  fx.reiniciarFixtures();
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const AHORA = new Date('2026-10-21T20:04:00.000Z');

/** Las dependencias de fixtures con un registro del orden de las llamadas que escriben. */
function deps(cambios: Partial<DepsRecepcion> = {}) {
  const base = fx.crearDepsFixtures();
  const orden: string[] = [];
  const correos: CorreoSaliente[] = [];
  let modo: ResultadoEnvio['modo'] = 'simular';
  const d: DepsRecepcion = {
    ...base,
    ahora: () => AHORA,
    registrarAutorizacion: jest.fn(async (e) => {
      orden.push('autorizacion');
      return base.registrarAutorizacion(e);
    }),
    crearPersona: jest.fn(async (p) => {
      orden.push('crearPersona');
      return base.crearPersona(p);
    }),
    completarCorreo: jest.fn(async (id, c) => {
      orden.push('completarCorreo');
      return base.completarCorreo(id, c);
    }),
    marcarEntregada: jest.fn(async (i) => {
      orden.push('marcarEntregada');
      return base.marcarEntregada(i);
    }),
    adjuntar: jest.fn(async (id, b, n) => {
      orden.push(`adjuntar:${n}`);
      return base.adjuntar(id, b, n);
    }),
    enviarCorreo: jest.fn(async (c) => {
      orden.push('correo');
      correos.push(c);
      return { modo, enviado: modo !== 'simular', destinatarios: c.para.length + (c.cc?.length ?? 0), intentos: modo === 'simular' ? 0 : 1 };
    }),
    marcarCorreo: jest.fn(async (id, m) => {
      orden.push('marcarCorreo');
      return base.marcarCorreo(id, m);
    }),
    ...cambios,
  };
  return {
    d,
    orden,
    correos,
    enviarDeVerdad: () => {
      modo = 'enviar';
    },
  };
}

const token = (id: string, dias = 7) => fx.tokenFixture(id, AHORA, dias);
const ID = () => fx.FIXTURE_IDS;
const CED = () => fx.CEDULAS_FIXTURES;

function confirmar(p: Partial<ConfirmarInput>): ConfirmarInput {
  return {
    token: token(ID().biocharEnTransito),
    cedula: CED().transportista,
    modo: 'conocida',
    meta: { ip: '203.0.113.7', userAgent: 'jest' },
    ...p,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('token', () => {
  it('formato, firma alterada y remisión inexistente dan el mismo 404, sin leer nada', async () => {
    const leer = jest.fn(async () => null);
    const { d } = deps({ leerRemision: leer });
    const bueno = token(ID().biocharEnTransito);
    const alterado = bueno.slice(0, -2) + (bueno.endsWith('AA') ? 'BB' : 'AA');
    for (const t of ['basura', alterado, '']) {
      const r = await rec.consultarRecepcion(t, d);
      expect(r).toEqual({ status: 404, body: { ok: false, error: 'enlace_invalido' } });
    }
    expect(leer).not.toHaveBeenCalled();
    // Auténtico pero de una remisión que no existe: también 404.
    expect((await rec.consultarRecepcion(fx.tokenFixture('recNOEXISTE000001', AHORA), d)).status).toBe(404);
  });

  it('vencido → 410 con la fecha; sin secreto → 503', async () => {
    const { d } = deps();
    const r = await rec.consultarRecepcion(token(ID().biocharEnTransito, -3), d);
    expect(r).toEqual({ status: 410, body: { ok: false, error: 'enlace_vencido', venceEl: '2026-10-18' } });
    const sin = deps({ verificarToken: () => ({ ok: false, motivo: 'no_configurado' }) });
    expect((await rec.consultarRecepcion('x', sin.d)).status).toBe(503);
  });

  it('una remisión ajena (DataLab) es el mismo 404', async () => {
    const { d } = deps();
    const original = d.leerRemision;
    d.leerRemision = async (id) => {
      const r = await original(id);
      return r ? { ...r, areaOrigen: 'Laboratorio' } : null;
    };
    expect((await rec.consultarRecepcion(token(ID().biocharEnTransito), d)).status).toBe(404);
  });
});

describe('consultar', () => {
  it('devuelve el resumen sin datos personales', async () => {
    const { d } = deps();
    const r = await rec.consultarRecepcion(token(ID().biocharEnTransito), d);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      estado: 'pendiente',
      remision: {
        codigo: 'SIRIUS-REM-9002',
        producto: 'Biochar',
        kg: 400.5,
        cliente: 'FINCA DE PRUEBA S.A.S.',
        area: 'Sanidad',
        fechaDespacho: expect.any(String),
      },
      venceEl: '2026-10-28',
      textoVersion: VERSION,
    });
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain(CED().transportista);
    expect(texto).not.toContain('Pedro');
    expect(texto).not.toContain('rec');
  });

  it('dice el estado de una entregada, una anulada y un borrador', async () => {
    const { d } = deps();
    const ent = await rec.consultarRecepcion(token(ID().entregada), d);
    expect(ent.body).toMatchObject({ estado: 'recibida', fechaRecibido: '2026-10-01' });
    expect((await rec.consultarRecepcion(token(ID().cancelada), d)).body.estado).toBe('anulada');
    const original = d.leerRemision;
    d.leerRemision = async (id) => {
      const r = await original(id);
      return r ? { ...r, estado: 'Borrador' } : null;
    };
    expect((await rec.consultarRecepcion(token(ID().blendPendiente), d)).body.estado).toBe('no_despachada');
  });
});

describe('identificar', () => {
  it('cédula inválida → 400', async () => {
    const { d } = deps();
    expect((await rec.identificarReceptor(token(ID().biocharEnTransito), '12', d)).body.error).toBe('cedula_invalida');
  });

  it('conocida: nombre y correo enmascarados, nunca la cédula', async () => {
    const { d } = deps();
    const r = await rec.identificarReceptor(token(ID().biocharEnTransito), CED().personalConCorreo, d);
    expect(r).toEqual({ status: 200, body: { conocida: true, nombre: 'Carlos S. F.', correo: 'c***o@example.com' } });
    const t = await rec.identificarReceptor(token(ID().biocharEnTransito), '99.000.001', d);
    expect(t.body).toEqual({ conocida: true, nombre: 'Pedro P. E.', correo: null });
    expect(JSON.stringify(t.body)).not.toContain('99000001');
  });

  it('desconocida → {conocida:false}; entregada → 409', async () => {
    const { d } = deps();
    expect((await rec.identificarReceptor(token(ID().biocharEnTransito), '12345678', d)).body).toEqual({ conocida: false });
    const r = await rec.identificarReceptor(token(ID().entregada), CED().transportista, d);
    expect(r).toEqual({ status: 409, body: { ok: false, error: 'ya_recibida', fechaRecibido: '2026-10-01' } });
  });
});

describe('confirmar', () => {
  it('persona nueva: la autorización va ANTES de crear la persona, y el correo al receptor con copia', async () => {
    const { d, orden, correos } = deps();
    const r = await rec.confirmarRecepcion(
      confirmar({
        cedula: '1.234.567',
        modo: 'nueva',
        nuevo: { nombre: 'Juana Prueba Ficticia', celular: '300 000 0099', correo: 'Juana@Example.com' },
        autorizaDatos: true,
        textoVersion: VERSION,
      }),
      d
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ok: true,
      codigo: 'SIRIUS-REM-9002',
      fechaRecibido: '2026-10-21',
      recibidaEn: '2026-10-21T20:04:00.000Z',
      correo: { estado: 'simulado', a: 'j***a@example.com' },
    });
    expect(orden).toEqual([
      'autorizacion',
      'crearPersona',
      'marcarEntregada',
      'adjuntar:SIRIUS-REM-9002-recibida.pdf',
      'correo',
    ]);
    expect(d.registrarAutorizacion).toHaveBeenCalledWith(
      expect.objectContaining({ remision: 'SIRIUS-REM-9002', cedula: '1234567', datos: ['nombre', 'cédula', 'celular', 'correo'] })
    );
    expect(d.crearPersona).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'Receptor', cedula: '1234567', telefono: '+57 3000000099', correo: 'juana@example.com', idOrigen: 'RECEPCION-ENLACE:SIRIUS-REM-9002' })
    );
    expect(correos[0].para).toEqual(['juana@example.com']);
    expect(correos[0].cc).toEqual(['adm@siriusregenerative.com', 'david@siriusregenerative.com']);
    expect(correos[0].responderA).toBe('adm@siriusregenerative.com');
    expect(correos[0].adjuntos?.[0]?.nombre).toBe('SIRIUS-REM-9002-recibida.pdf');
    // Simulado: no hay marca de correo.
    expect(d.marcarCorreo).not.toHaveBeenCalled();
    // El cuerpo público no lleva pasos ni la cédula.
    expect(JSON.stringify(r.body)).not.toMatch(/steps|1234567/);
    expect(r.steps.map((s) => s.step)).toEqual(['autorizacion_datos', 'receptor', 'remision', 'documento', 'correo', 'marca_correo']);
  });

  it('sin la tabla de autorizaciones, los datos nuevos dan 503 SIN escribir nada', async () => {
    const { d, orden } = deps({ autorizacionesConfiguradas: () => false });
    const r = await rec.confirmarRecepcion(
      confirmar({
        cedula: '1234567',
        modo: 'nueva',
        nuevo: { nombre: 'Juana Prueba Ficticia', celular: '3000000099', correo: 'juana@example.com' },
        autorizaDatos: true,
        textoVersion: VERSION,
      }),
      d
    );
    expect(r).toMatchObject({ status: 503, body: { ok: false, error: 'no_disponible' } });
    expect(orden).toEqual([]);
  });

  it('sin la tabla, una persona conocida que no trae datos nuevos sí confirma', async () => {
    const { d } = deps({ autorizacionesConfiguradas: () => false });
    const r = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), d);
    expect(r.status).toBe(200);
  });

  it('si la prueba de la autorización falla, no se crea la persona', async () => {
    const { d, orden } = deps({
      registrarAutorizacion: jest.fn(async () => ({ step: 'autorizacion_datos', ok: false, error: 'Airtable POST 500' })),
    });
    const r = await rec.confirmarRecepcion(
      confirmar({
        cedula: '1234567',
        modo: 'nueva',
        nuevo: { nombre: 'Juana Prueba Ficticia', celular: '3000000099', correo: 'juana@example.com' },
        autorizaDatos: true,
        textoVersion: VERSION,
      }),
      d
    );
    expect(r.status).toBe(503);
    expect(orden).toEqual([]);
  });

  it('valida: sin autorización, texto viejo, datos inválidos y cédula desconocida', async () => {
    const { d, orden } = deps();
    const nuevo = { nombre: 'Juana Prueba Ficticia', celular: '3000000099', correo: 'juana@example.com' };
    expect((await rec.confirmarRecepcion(confirmar({ modo: 'nueva', nuevo, textoVersion: VERSION }), d)).body.error).toBe('falta_autorizacion');
    expect((await rec.confirmarRecepcion(confirmar({ modo: 'nueva', nuevo, autorizaDatos: true, textoVersion: '2020-01-01' }), d)).status).toBe(409);
    const malos = await rec.confirmarRecepcion(
      confirmar({ modo: 'nueva', nuevo: { nombre: 'J', celular: '12', correo: 'no' }, autorizaDatos: true, textoVersion: VERSION }),
      d
    );
    expect(malos.body).toEqual({ ok: false, error: 'datos_invalidos', campos: ['nombre', 'celular', 'correo'] });
    expect((await rec.confirmarRecepcion(confirmar({ cedula: '55555555' }), d)).body.error).toBe('requiere_registro');
    expect((await rec.confirmarRecepcion(confirmar({ cedula: 'x' }), d)).body.error).toBe('cedula_invalida');
    expect(orden).toEqual([]);
  });

  it('transportista conocido sin correo: copia Receptor, sin autorización, correo solo a la copia', async () => {
    const { d, correos } = deps();
    const r = await rec.confirmarRecepcion(confirmar({}), d);
    expect(r.status).toBe(200);
    expect(r.body.correo).toEqual({ estado: 'sin_correo', a: null });
    expect(d.registrarAutorizacion).not.toHaveBeenCalled();
    expect(d.crearPersona).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'Receptor', baseOrigen: 'PiroliApp (Pirolisis)', idOrigen: 'PER-REM-F001', nombre: 'Pedro Prueba Ejemplo' })
    );
    expect(correos[0].para).toEqual(['adm@siriusregenerative.com', 'david@siriusregenerative.com']);
    expect(correos[0].cc).toEqual([]);
    expect(correos[0].html).toContain('Copia interna');
  });

  it('Personal Cliente: copia Receptor con origen Clients Core y su correo de avisos', async () => {
    const { d, correos } = deps();
    const r = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), d);
    expect(r.status).toBe(200);
    expect(d.crearPersona).toHaveBeenCalledWith(
      expect.objectContaining({ baseOrigen: 'Sirius Clients Core', idOrigen: 'CL-9001-PER-9001', correo: 'carlos.simulado@example.com' })
    );
    expect(correos[0].para).toEqual(['carlos.simulado@example.com']);
  });

  it('un Receptor del cliente se reutiliza y el correo va a su dirección REGISTRADA', async () => {
    const { d, correos } = deps();
    const r = await rec.confirmarRecepcion(
      confirmar({ cedula: CED().receptorPrevio, correo: 'otro@example.com', autorizaDatos: true, textoVersion: VERSION }),
      d
    );
    expect(r.status).toBe(200);
    expect(d.crearPersona).not.toHaveBeenCalled();
    expect(d.completarCorreo).not.toHaveBeenCalled();
    expect(d.registrarAutorizacion).not.toHaveBeenCalled();
    expect(correos[0].para).toEqual(['ana.ensayo@example.com']);
    expect(d.marcarEntregada).toHaveBeenCalledWith(expect.objectContaining({ receptorId: 'recFIXPERSONA0002' }));
  });

  it('a un Receptor sin correo solo se le completa el que escribe, con autorización previa', async () => {
    const base = deps();
    const original = base.d.candidatos;
    base.d.candidatos = async (r) =>
      (await original(r)).map((c) => (c.personaId === 'recFIXPERSONA0002' ? { ...c, correo: null } : c));
    const { d, orden } = base;
    const r = await rec.confirmarRecepcion(
      confirmar({ cedula: CED().receptorPrevio, correo: 'ana.nueva@example.com', autorizaDatos: true, textoVersion: VERSION }),
      d
    );
    expect(r.status).toBe(200);
    expect(orden.slice(0, 2)).toEqual(['autorizacion', 'completarCorreo']);
    expect(d.completarCorreo).toHaveBeenCalledWith('recFIXPERSONA0002', 'ana.nueva@example.com');
    expect(d.registrarAutorizacion).toHaveBeenCalledWith(expect.objectContaining({ datos: ['correo'] }));
  });

  it('«No soy yo»: persona nueva anotada, sin tocar la existente', async () => {
    const { d } = deps();
    await rec.confirmarRecepcion(
      confirmar({
        cedula: CED().transportista,
        modo: 'nueva',
        nuevo: { nombre: 'Otra Persona Distinta', celular: '3000000098', correo: 'otra@example.com' },
        autorizaDatos: true,
        textoVersion: VERSION,
      }),
      d
    );
    expect(d.crearPersona).toHaveBeenCalledWith(
      expect.objectContaining({ idOrigen: 'RECEPCION-ENLACE:SIRIUS-REM-9002:NO-SOY-YO', nombre: 'Otra Persona Distinta' })
    );
    expect(d.completarCorreo).not.toHaveBeenCalled();
  });

  it('el correo enviado de verdad deja la marca [correo:]', async () => {
    const x = deps();
    x.enviarDeVerdad();
    const r = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), x.d);
    expect(r.status).toBe(200);
    expect(r.body.correo).toEqual({ estado: 'enviado', a: 'c***o@example.com' });
    expect(x.d.marcarCorreo).toHaveBeenCalledWith(ID().biocharEnTransito, '[correo:2026-10-21T20:04:00.000Z]');
  });

  it('si Graph falla: 207, sin marca de correo, y la recepción queda', async () => {
    const { d } = deps({
      enviarCorreo: jest.fn(async () => {
        throw new Error('Graph 503 para juana@example.com');
      }),
    });
    const r = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), d);
    expect(r.status).toBe(207);
    expect(r.body).toMatchObject({ ok: true, correo: { estado: 'no_enviado' } });
    expect(d.marcarCorreo).not.toHaveBeenCalled();
    const fallo = r.steps.find((s) => s.step === 'correo');
    expect(fallo?.ok).toBe(false);
    expect(fallo?.error).not.toContain('@');
    expect((await d.leerRemision(ID().biocharEnTransito))?.estado).toBe('Entregada');
  });

  it('si el documento falla, el correo igual sale (207)', async () => {
    const { d } = deps({ adjuntar: jest.fn(async () => { throw new Error('upload 500'); }) });
    const r = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), d);
    expect(r.status).toBe(207);
    expect(d.enviarCorreo).toHaveBeenCalledTimes(1);
  });

  it('carrera perdida: 409 y NO manda correo', async () => {
    const { d } = deps();
    d.marcarEntregada = jest.fn(async (i) => ({
      resultado: 'carrera' as const,
      remision: (await d.leerRemision(i.recordId))!,
    }));
    const r = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), d);
    expect(r).toMatchObject({ status: 409, body: { ok: false, error: 'recibida_por_otra_persona' } });
    expect(d.enviarCorreo).not.toHaveBeenCalled();
  });

  it('reintento con la misma cédula: 200 yaRecibida sin correo; otra cédula: 409', async () => {
    const { d } = deps();
    const primera = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), d);
    expect(primera.status).toBe(200);
    const otra = await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), d);
    expect(otra).toMatchObject({ status: 200, body: { ok: true, yaRecibida: true, codigo: 'SIRIUS-REM-9002' } });
    expect(d.enviarCorreo).toHaveBeenCalledTimes(1);
    const ajena = await rec.confirmarRecepcion(confirmar({ cedula: CED().transportista }), d);
    expect(ajena).toMatchObject({ status: 409, body: { ok: false, error: 'ya_recibida' } });
  });

  it('anulada → 410; borrador → 409; sin escribir', async () => {
    const { d, orden } = deps();
    expect((await rec.confirmarRecepcion(confirmar({ token: token(ID().cancelada) }), d)).status).toBe(410);
    const original = d.leerRemision;
    d.leerRemision = async (id) => {
      const r = await original(id);
      return r ? { ...r, estado: 'Borrador' } : null;
    };
    const b = await rec.confirmarRecepcion(confirmar({}), d);
    expect(b).toMatchObject({ status: 409, body: { error: 'no_despachada' } });
    expect(orden).toEqual([]);
  });
});

describe('reenviarComprobante', () => {
  it('reenvía a los destinatarios de siempre con «Reenvío:» y regenera el documento si falta', async () => {
    const x = deps();
    await rec.confirmarRecepcion(confirmar({ cedula: CED().personalConCorreo }), x.d);
    x.enviarDeVerdad();
    const r = await rec.reenviarComprobante('SIRIUS-REM-9002', x.d);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, correo: { estado: 'enviado', para: ['c***o@example.com'], soloCopia: false } });
    expect(x.correos[1].asunto.startsWith('Reenvío: ')).toBe(true);
    expect(x.correos[1].para).toEqual(['carlos.simulado@example.com']);
    // El documento archivado se reutiliza: no se adjunta otra vez.
    expect(x.d.adjuntar).toHaveBeenCalledTimes(1);
  });

  it('409 si no fue recibida por enlace', async () => {
    const { d } = deps();
    expect((await rec.reenviarComprobante('SIRIUS-REM-9002', d)).status).toBe(409);
    expect((await rec.reenviarComprobante('SIRIUS-REM-9999', d)).status).toBe(404);
  });
});

describe('de punta a punta contra el doble de Airtable', () => {
  it('confirma una persona nueva: autorización en PiroliApp, nada escrito en Clients Core', async () => {
    const falso = new AirtableFalso({
      computados: {
        [`${B_REM}/${T.personas}`]: (r) => ({ 'Codigo Persona Remision': `PER-REM-${r.id.slice(-4)}` }),
      },
    });
    const transp = falso.sembrar(B_REM, T.personas, {
      'Nombre Completo': 'Pedro Ficticio',
      Cedula: '99000001',
      'Tipo de Usuario': 'Transportista',
    });
    const remId = falso.sembrar(B_REM, T.remisiones, {
      ID: 'SIRIUS-REM-9300',
      numeracion: 9202,
      Estado: 'En Tránsito',
      'Area Origen': 'Producción',
      'ID Pedido': 'SIRIUS-PED-9001',
      'ID Cliente': 'CL-9001',
      'Notas de Remisión': '[bache:S-09001=120.00] Biochar',
      'Fecha Pedido Despachado': '2026-10-21',
      Personas: [transp],
    });
    falso.sembrar(B_CLI, T.clientes, { ID: 'CL-9001', Cliente: 'FINCA DE PRUEBA', 'Personal Clientes': [] });
    jest.spyOn(global, 'fetch').mockImplementation(falso.fetch as typeof fetch);

    const { firmarTokenRecepcion } = await import('@/lib/recepcion/token');
    const { finDelDiaBogotaSeg } = await import('@/lib/fecha-bogota');
    // Firmado con el secreto real pero con una vigencia que esta app no emite: 404.
    const eterno = firmarTokenRecepcion(remId, finDelDiaBogotaSeg('2099-01-01'), SECRETO);
    expect((await rec.consultarRecepcion(eterno)).status).toBe(404);
    const valido = firmarTokenRecepcion(remId, Math.floor(Date.now() / 1000) + 3 * 24 * 3600, SECRETO);

    const r = await rec.confirmarRecepcion({
      token: valido,
      cedula: '12345678',
      modo: 'nueva',
      nuevo: { nombre: 'Juana Prueba Ficticia', celular: '3000000099', correo: 'juana@example.com' },
      autorizaDatos: true,
      textoVersion: VERSION,
      meta: { ip: '203.0.113.7', userAgent: 'jest' },
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, codigo: 'SIRIUS-REM-9300', correo: { estado: 'simulado' } });

    const escrituras = falso.escrituras();
    expect(escrituras.some((l) => l.base === B_CLI)).toBe(false);
    const orden = escrituras.map((l) => `${l.metodo} ${l.base === B_PIRO ? 'piro' : l.tabla}`);
    expect(orden.indexOf(`POST piro`)).toBeGreaterThanOrEqual(0);
    expect(orden.indexOf('POST piro')).toBeLessThan(orden.indexOf(`POST ${T.personas}`));
    expect(orden.indexOf(`POST ${T.personas}`)).toBeLessThan(orden.indexOf(`PATCH ${T.remisiones}`));

    const aut = falso.registros(B_PIRO, T.autorizaciones)[0].fields;
    expect(aut).toMatchObject({ Remision: 'SIRIUS-REM-9300', Cedula: '12345678', 'Texto Version': VERSION, IP: '203.0.113.7' });
    expect(String(aut['Texto SHA256'])).toMatch(/^[0-9a-f]{64}$/);
    expect(aut).not.toHaveProperty('Correo');

    const remision = falso.registro(B_REM, T.remisiones, remId)!.fields;
    expect(remision.Estado).toBe('Entregada');
    expect(String(remision['Notas de Remisión'])).toMatch(/^\[bache:S-09001=120\.00\] \[recibida:[^\]]+\] Biochar$/);
    expect((remision.Personas as string[]).length).toBe(2);
    expect((remision['Documento Remision'] as Array<{ filename: string }>).map((a) => a.filename)).toEqual([
      'SIRIUS-REM-9300-recibida.pdf',
    ]);
    // Simulado: sin marca de correo.
    expect(String(remision['Notas de Remisión'])).not.toContain('[correo:');
  });
});

describe('atenderPublica (el esqueleto de /api/recibir/*)', () => {
  function peticion(cuerpo: string, ip = '198.51.100.1') {
    return new NextRequest('http://localhost/api/recibir/prueba', {
      method: 'POST',
      body: cuerpo,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    });
  }
  const opciones = { ruta: 'consultar' as const, porIp: { windowMs: 60_000, maxRequests: 2 } };

  it('cuerpo de más de 4 KB → 413 sin llamar al manejador', async () => {
    const atender = jest.fn();
    const r = await rec.atenderPublica(peticion(JSON.stringify({ token: 'x'.repeat(5000) }), '198.51.100.2'), opciones, atender);
    expect(r.status).toBe(413);
    expect(atender).not.toHaveBeenCalled();
  });

  it('JSON inválido → 400; respuesta con no-store, noindex y no-referrer', async () => {
    const r = await rec.atenderPublica(peticion('{no es json', '198.51.100.3'), opciones, jest.fn());
    expect(r.status).toBe(400);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('pasado el límite por IP → 429 con Retry-After', async () => {
    const atender = jest.fn(async () => ({ status: 200, body: { ok: true } }));
    const ip = '198.51.100.4';
    await rec.atenderPublica(peticion('{}', ip), opciones, atender);
    await rec.atenderPublica(peticion('{}', ip), opciones, atender);
    const r = await rec.atenderPublica(peticion('{}', ip), opciones, atender);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ ok: false, error: 'demasiados_intentos' });
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(atender).toHaveBeenCalledTimes(2);
  });

  it('límite por enlace: la huella del token, aunque cambie la IP', async () => {
    const atender = jest.fn(async () => ({ status: 200, body: { ok: true } }));
    const o = { ...opciones, porIp: { windowMs: 60_000, maxRequests: 100 }, porToken: { windowMs: 60_000, maxRequests: 1 } };
    const cuerpo = JSON.stringify({ token: 'v1.recTOKENFALSO00001.abc.xyz' });
    expect((await rec.atenderPublica(peticion(cuerpo, '198.51.100.5'), o, atender)).status).toBe(200);
    expect((await rec.atenderPublica(peticion(cuerpo, '198.51.100.6'), o, atender)).status).toBe(429);
  });

  it('un error inesperado del manejador es 500 genérico, sin el mensaje', async () => {
    const r = await rec.atenderPublica(peticion('{}', '198.51.100.7'), opciones, async () => {
      throw new Error('Airtable 422: cédula 1234567890');
    });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: 'error_interno' });
  });
});

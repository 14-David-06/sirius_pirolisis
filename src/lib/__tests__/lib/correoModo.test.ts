/**
 * @jest-environment node
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErrorCorreo, prepararMensaje, resolverModoCorreo, type CorreoSaliente } from '@/lib/correo/graph';

// `graph.server.ts` importa 'server-only', que lanza fuera de un componente de
// servidor. El mock va aquí, y no en jest.config.js, para no depender de otro paquete.
jest.mock('server-only', () => ({}));

/**
 * El modo decide si un correo le llega a un tercero. El desarrollo local y Preview
 * leen las mismas bases que producción, con correos reales de receptores reales:
 * fuera de producción, nada puede salir hacia afuera. Datos inventados.
 */

const INTERNA = 'pruebas@siriusregenerative.com';

function correo(extra: Partial<CorreoSaliente> = {}): CorreoSaliente {
  return {
    para: ['Receptora@Ejemplo.test'],
    cc: ['copia.uno@ejemplo.test', 'receptora@ejemplo.test'],
    responderA: 'respuestas@ejemplo.test',
    asunto: 'Remisión SIRIUS-REM-9999 recibida',
    html: '<!DOCTYPE html><html><body style="margin:0"><p>Contenido sintético</p></body></html>',
    adjuntos: [{ nombre: 'SIRIUS-REM-9999.pdf', contentType: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }],
    etiqueta: 'SIRIUS-REM-9999',
    ...extra,
  };
}

describe('resolverModoCorreo', () => {
  it.each<[string, string, Record<string, string>]>([
    ['producción, sin CORREO_MODO', 'enviar', { VERCEL_ENV: 'production', NODE_ENV: 'production' }],
    ['producción con CORREO_MODO=enviar', 'enviar', { VERCEL_ENV: 'production', CORREO_MODO: 'enviar' }],
    [
      'producción con redirigir (el primer despliegue)',
      'redirigir',
      { VERCEL_ENV: 'production', CORREO_MODO: 'redirigir', CORREO_REDIRIGIR_A: INTERNA },
    ],
    ['producción con simular', 'simular', { VERCEL_ENV: 'production', CORREO_MODO: 'simular' }],
    ['producción con un destino de prueba olvidado', 'enviar', { VERCEL_ENV: 'production', CORREO_REDIRIGIR_A: INTERNA }],
    ['Preview (corre con NODE_ENV=production)', 'simular', { VERCEL_ENV: 'preview', NODE_ENV: 'production' }],
    ['Preview con destino interno', 'redirigir', { VERCEL_ENV: 'preview', NODE_ENV: 'production', CORREO_REDIRIGIR_A: INTERNA }],
    ['Preview con CORREO_MODO=enviar', 'simular', { VERCEL_ENV: 'preview', NODE_ENV: 'production', CORREO_MODO: 'enviar' }],
    [
      'Preview con CORREO_MODO=enviar y destino interno',
      'redirigir',
      { VERCEL_ENV: 'preview', CORREO_MODO: 'enviar', CORREO_REDIRIGIR_A: INTERNA },
    ],
    ['desarrollo', 'simular', { NODE_ENV: 'development' }],
    ['desarrollo con CORREO_MODO=enviar', 'simular', { NODE_ENV: 'development', CORREO_MODO: 'enviar' }],
    ['tests', 'simular', { NODE_ENV: 'test' }],
    ['build de producción fuera de Vercel', 'simular', { NODE_ENV: 'production' }],
    ['build de producción fuera de Vercel con CORREO_MODO=enviar', 'simular', { NODE_ENV: 'production', CORREO_MODO: 'enviar' }],
    ['CORREO_MODO con espacios y mayúsculas', 'redirigir', { CORREO_MODO: ' Redirigir ', CORREO_REDIRIGIR_A: INTERNA }],
    ['CORREO_MODO desconocido, aun en producción', 'simular', { VERCEL_ENV: 'production', CORREO_MODO: 'graph' }],
  ])('%s → %s', (_caso, modo, env) => {
    const r = resolverModoCorreo(env);
    expect(r.modo).toBe(modo);
    expect(r.redirigirA).toBe(modo === 'redirigir' ? INTERNA : undefined);
    expect(r.motivo).not.toContain('@');
  });

  it.each([
    'pruebas@gmail.com',
    'pruebas@siriusregenerative.com.ejemplo.test',
    'pruebas@otro-siriusregenerative.com',
    'pruebas@sub.siriusregenerative.com',
    'a@siriusregenerative.com,b@siriusregenerative.com',
    'pruebas@siriusregenerative.com otra@ejemplo.test',
    'no es un correo',
  ])('nunca redirige a %s: simula', (destino) => {
    const r = resolverModoCorreo({ CORREO_MODO: 'redirigir', CORREO_REDIRIGIR_A: destino });
    expect(r).toEqual({ modo: 'simular', motivo: expect.stringContaining('CORREO_REDIRIGIR_A') });
    expect(r.motivo).not.toContain('@');
  });

  it('normaliza el destino interno', () => {
    expect(resolverModoCorreo({ CORREO_REDIRIGIR_A: '  Pruebas@SiriusRegenerative.com ' })).toMatchObject({
      modo: 'redirigir',
      redirigirA: INTERNA,
    });
  });

  it('el motivo dice por qué se ignoró CORREO_MODO=enviar', () => {
    const r = resolverModoCorreo({ VERCEL_ENV: 'preview', CORREO_MODO: 'enviar' });
    expect(r.motivo).toBe(
      'CORREO_MODO=enviar ignorado fuera de producción (VERCEL_ENV=preview); sin CORREO_REDIRIGIR_A: se simula'
    );
  });
});

describe('prepararMensaje', () => {
  it('enviar y simular: el mismo correo, normalizado', () => {
    for (const modo of ['enviar', 'simular'] as const) {
      const m = prepararMensaje(correo(), { modo });
      expect(m.para).toEqual(['receptora@ejemplo.test']);
      expect(m.cc).toEqual(['copia.uno@ejemplo.test']);
      expect(m.responderA).toBe('respuestas@ejemplo.test');
      expect(m.asunto).toBe('Remisión SIRIUS-REM-9999 recibida');
      expect(m.html).toBe(correo().html);
    }
  });

  it('redirigir: solo la dirección de prueba, [PRUEBA] y la franja con los originales enmascarados', () => {
    const m = prepararMensaje(correo(), { modo: 'redirigir', redirigirA: INTERNA });

    expect(m.para).toEqual([INTERNA]);
    expect(m.cc).toEqual([]);
    expect(m.asunto).toBe('[PRUEBA] Remisión SIRIUS-REM-9999 recibida');
    expect(m.html).toContain('Para: r***a@ejemplo.test · CC: c***o@ejemplo.test');
    expect(m.html).not.toContain('receptora@');
    expect(m.html).not.toContain('copia.uno@');
    // La franja va dentro del body y antes del contenido.
    expect(m.html.indexOf('<body style="margin:0">')).toBeLessThan(m.html.indexOf('PRUEBA'));
    expect(m.html.indexOf('PRUEBA')).toBeLessThan(m.html.indexOf('Contenido sintético'));
    expect(m.adjuntos).toHaveLength(1);
  });

  it('redirigir sin <body> pone la franja al comienzo, y no repite el prefijo', () => {
    const una = prepararMensaje(correo({ html: '<p>Contenido sintético</p>' }), { modo: 'redirigir', redirigirA: INTERNA });
    expect(una.html.startsWith('<table')).toBe(true);
    expect(prepararMensaje(una, { modo: 'redirigir', redirigirA: INTERNA }).asunto).toBe(
      '[PRUEBA] Remisión SIRIUS-REM-9999 recibida'
    );
  });

  it('una dirección con caracteres de HTML no entra a la franja', () => {
    const m = prepararMensaje(correo({ para: ["o'neil&co@ejemplo.test"], cc: [] }), { modo: 'redirigir', redirigirA: INTERNA });
    expect(m.html).toContain('Para: o***o@ejemplo.test.');
    expect(m.html).not.toContain("o'neil");
  });

  it.each([undefined, 'pruebas@gmail.com', 'pruebas@sub.siriusregenerative.com'])(
    'redirigir hacia %s: error de configuración',
    (destino) => {
      let error: unknown;
      try {
        prepararMensaje(correo(), { modo: 'redirigir', redirigirA: destino });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ErrorCorreo);
      expect(error).toMatchObject({ tipo: 'configuracion' });
    }
  );

  it('los límites valen en cualquier modo: simular avisa lo mismo que fallaría en producción', () => {
    const muchos = Array.from({ length: 11 }, (_, i) => `persona${i}@ejemplo.test`);
    for (const modo of ['enviar', 'simular', 'redirigir'] as const) {
      expect(() => prepararMensaje(correo({ para: muchos, cc: [] }), { modo, redirigirA: INTERNA })).toThrow(
        'El correo tiene 11 destinatarios; el máximo es 10'
      );
    }
  });
});

describe('enviarCorreo según el entorno', () => {
  const ENTORNO = process.env;
  const VARIABLES = [
    'VERCEL_ENV',
    'CORREO_MODO',
    'CORREO_REDIRIGIR_A',
    'CORREO_GUARDAR_EN',
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'OUTLOOK_SENDER_EMAIL',
  ];
  const GRAPH = {
    AZURE_TENANT_ID: 'tenant-sintetico',
    AZURE_CLIENT_ID: 'cliente-sintetico',
    AZURE_CLIENT_SECRET: 'secreto-sintetico-0123456789',
    OUTLOOK_SENDER_EMAIL: 'notificaciones@ejemplo.test',
  };
  let carpeta = '';

  beforeEach(() => {
    carpeta = mkdtempSync(join(tmpdir(), 'correo-simulado-'));
  });
  afterEach(() => {
    process.env = ENTORNO;
    jest.restoreAllMocks();
    rmSync(carpeta, { recursive: true, force: true });
  });

  /** Graph falso que acepta todo; el entorno se fija antes de cargar el módulo. */
  async function servidor(valores: Record<string, string>) {
    const env: Record<string, string | undefined> = { ...ENTORNO };
    for (const nombre of VARIABLES) delete env[nombre];
    process.env = { ...env, ...valores } as NodeJS.ProcessEnv;

    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/oauth2/v2.0/token')) {
        return new Response(JSON.stringify({ access_token: 'token-sintetico-AAA', expires_in: 3599 }), { status: 200 });
      }
      if (u.endsWith('/sendMail')) return new Response(null, { status: 202, headers: { 'request-id': 'req-sintetico-1' } });
      throw new Error(`URL inesperada: ${u}`);
    });
    for (const m of ['info', 'warn', 'error'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);

    jest.resetModules();
    return { ...(await import('@/lib/correo/graph.server')), fetch };
  }

  function cuerpoEnviado(fetch: jest.SpyInstance) {
    const envio = fetch.mock.calls.find(([url]) => String(url).endsWith('/sendMail'));
    return JSON.parse(String((envio?.[1] as RequestInit).body));
  }

  it('en los tests (NODE_ENV=test) simula: nada sale a la red', async () => {
    const { enviarCorreo, fetch } = await servidor({});

    await expect(enviarCorreo(correo())).resolves.toEqual({ modo: 'simular', enviado: false, destinatarios: 2, intentos: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('simular con CORREO_GUARDAR_EN deja el HTML, el PDF y un JSON con los destinatarios enmascarados', async () => {
    const { enviarCorreo, fetch } = await servidor({ CORREO_GUARDAR_EN: carpeta });

    await enviarCorreo(correo());

    const archivos = readdirSync(carpeta);
    expect(archivos.filter((a) => a.endsWith('.html'))).toHaveLength(1);
    expect(archivos.filter((a) => a.endsWith('.pdf'))).toHaveLength(1);
    const json = archivos.find((a) => a.endsWith('.json')) ?? '';
    const texto = readFileSync(join(carpeta, json), 'utf8');
    expect(JSON.parse(texto)).toMatchObject({
      etiqueta: 'SIRIUS-REM-9999',
      modo: 'simular',
      asunto: 'Remisión SIRIUS-REM-9999 recibida',
      para: ['r***a@ejemplo.test'],
      cc: ['c***o@ejemplo.test'],
      responderA: 'r***s@ejemplo.test',
      adjuntos: [{ nombre: 'SIRIUS-REM-9999.pdf', bytes: 4 }],
    });
    expect(texto).not.toContain('receptora@');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('en Preview no escribe a disco aunque CORREO_GUARDAR_EN esté definido', async () => {
    const { enviarCorreo } = await servidor({ VERCEL_ENV: 'preview', NODE_ENV: 'production', CORREO_GUARDAR_EN: carpeta });

    await expect(enviarCorreo(correo())).resolves.toMatchObject({ modo: 'simular', enviado: false });
    expect(readdirSync(carpeta)).toEqual([]);
  });

  it('redirigir: Graph recibe solo la dirección interna, con [PRUEBA]', async () => {
    const { enviarCorreo, fetch } = await servidor({ ...GRAPH, CORREO_MODO: 'redirigir', CORREO_REDIRIGIR_A: INTERNA });

    await expect(enviarCorreo(correo())).resolves.toEqual({
      modo: 'redirigir',
      enviado: true,
      destinatarios: 1,
      requestId: 'req-sintetico-1',
      intentos: 1,
    });
    const { message } = cuerpoEnviado(fetch);
    expect(message.toRecipients).toEqual([{ emailAddress: { address: INTERNA } }]);
    expect(message.ccRecipients).toBeUndefined();
    expect(message.subject).toBe('[PRUEBA] Remisión SIRIUS-REM-9999 recibida');
    expect(JSON.stringify(message)).not.toContain('receptora@ejemplo.test');
    expect(JSON.stringify(message)).not.toContain('copia.uno@ejemplo.test');
  });

  it('CORREO_MODO=enviar en Preview no le escribe a nadie', async () => {
    const { enviarCorreo, fetch } = await servidor({ ...GRAPH, VERCEL_ENV: 'preview', NODE_ENV: 'production', CORREO_MODO: 'enviar' });

    await expect(enviarCorreo(correo())).resolves.toMatchObject({ modo: 'simular', enviado: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('producción: envía a los destinatarios del correo', async () => {
    const { enviarCorreo, fetch } = await servidor({ ...GRAPH, VERCEL_ENV: 'production' });

    await expect(enviarCorreo(correo())).resolves.toEqual({
      modo: 'enviar',
      enviado: true,
      destinatarios: 2,
      requestId: 'req-sintetico-1',
      intentos: 1,
    });
    const { message } = cuerpoEnviado(fetch);
    expect(message.toRecipients).toEqual([{ emailAddress: { address: 'receptora@ejemplo.test' } }]);
    expect(message.ccRecipients).toEqual([{ emailAddress: { address: 'copia.uno@ejemplo.test' } }]);
    expect(message.subject).toBe('Remisión SIRIUS-REM-9999 recibida');
  });

  it('sin credenciales: error de configuración con los nombres de lo que falta, sin salir a la red', async () => {
    const { enviarCorreo, correoConfigurado, fetch, ErrorCorreo: ErrorDelModulo } = await servidor({
      VERCEL_ENV: 'production',
      AZURE_TENANT_ID: 'tenant-sintetico',
    });

    expect(correoConfigurado()).toEqual({
      ok: false,
      falta: ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'OUTLOOK_SENDER_EMAIL'],
    });
    const e = await enviarCorreo(correo()).then(
      () => null,
      (x: unknown) => x
    );
    expect(e).toBeInstanceOf(ErrorDelModulo);
    expect(e).toMatchObject({
      tipo: 'configuracion',
      message: 'Correo sin configurar: falta AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, OUTLOOK_SENDER_EMAIL',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('correoConfigurado: en simular no hace falta nada; con las cuatro variables, listo', async () => {
    expect((await servidor({})).correoConfigurado()).toEqual({ ok: true });
    expect((await servidor({ VERCEL_ENV: 'production', ...GRAPH })).correoConfigurado()).toEqual({ ok: true });
    expect((await servidor({ CORREO_MODO: 'redirigir', CORREO_REDIRIGIR_A: INTERNA })).correoConfigurado()).toMatchObject({
      ok: false,
    });
  });
});

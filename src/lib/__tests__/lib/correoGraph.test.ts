/**
 * @jest-environment node
 */
import { format } from 'node:util';
import { crearClienteGraph, ErrorCorreo, type CorreoSaliente, type DepsGraph } from '@/lib/correo/graph';

// `graph.server.ts` importa 'server-only', que lanza fuera de un componente de
// servidor. El mock va aquí, y no en jest.config.js, para no depender de otro paquete.
jest.mock('server-only', () => ({}));

/**
 * El transporte de Graph con un `fetch` falso: nada sale a la red y cada llamada
 * queda registrada. Todos los datos son inventados.
 */

const CFG = {
  tenantId: 'tenant-sintetico',
  clientId: 'cliente-sintetico',
  clientSecret: 'secreto-sintetico-0123456789',
  remitente: 'Notificaciones@Ejemplo.test',
};
const TOKEN = 'token-sintetico-AAA';
const URL_TOKEN = 'https://login.microsoftonline.com/tenant-sintetico/oauth2/v2.0/token';
const URL_ENVIO = 'https://graph.microsoft.com/v1.0/users/notificaciones%40ejemplo.test/sendMail';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"

type Paso = Response | Error | ((init: RequestInit) => Promise<Response>);
interface Llamada {
  url: string;
  init: RequestInit;
}

function respuesta(status: number, cuerpo?: unknown, headers: Record<string, string> = {}): Response {
  const texto = cuerpo === undefined ? null : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
  return new Response(texto, { status, headers });
}

const tokenOk = (token = TOKEN, expiraSeg = 3599) =>
  respuesta(200, { token_type: 'Bearer', expires_in: expiraSeg, access_token: token });
const aceptado = (requestId = 'req-sintetico-1') => respuesta(202, undefined, { 'request-id': requestId });

/** Nunca responde: solo termina cuando el cliente aborta por tiempo. */
const colgado = (init: RequestInit) =>
  new Promise<Response>((_, rechazar) => {
    init.signal?.addEventListener('abort', () => rechazar(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });

/** Responde en orden; la última respuesta de cada cola se repite. */
function graphFalso(colas: { token?: Paso[]; envio?: Paso[] } = {}) {
  const pendientes = { token: [...(colas.token ?? [tokenOk()])], envio: [...(colas.envio ?? [aceptado()])] };
  const llamadas: Llamada[] = [];
  const fetch = jest.fn(async (url: unknown, init: RequestInit = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    const cola = u === URL_TOKEN ? pendientes.token : u === URL_ENVIO ? pendientes.envio : null;
    if (!cola) throw new Error(`URL inesperada: ${u}`);
    const paso = (cola.length > 1 ? cola.shift() : cola[0]) as Paso;
    if (paso instanceof Error) throw paso;
    if (typeof paso === 'function') return paso(init);
    return paso.clone();
  });
  return {
    fetch,
    token: () => llamadas.filter((l) => l.url === URL_TOKEN),
    envios: () => llamadas.filter((l) => l.url === URL_ENVIO),
  };
}

function cliente(g: ReturnType<typeof graphFalso>, extra: Partial<DepsGraph> = {}) {
  const esperar = jest.fn(async (_ms: number) => undefined);
  const c = crearClienteGraph(CFG, {
    fetch: g.fetch as unknown as typeof fetch,
    ahora: () => Date.now(),
    esperar,
    ...extra,
  });
  return { c, esperar };
}

function correo(extra: Partial<CorreoSaliente> = {}): CorreoSaliente {
  return {
    para: ['receptora@ejemplo.test'],
    cc: ['copia.uno@ejemplo.test'],
    responderA: 'respuestas@ejemplo.test',
    asunto: 'Remisión SIRIUS-REM-9999 recibida',
    html: '<p>Contenido sintético</p>',
    adjuntos: [{ nombre: 'SIRIUS-REM-9999.pdf', contentType: 'application/pdf', bytes: PDF }],
    etiqueta: 'SIRIUS-REM-9999',
    ...extra,
  };
}

const cabeceras = (l: Llamada) => l.init.headers as Record<string, string>;
const cuerpoDe = (l: Llamada) => JSON.parse(String(l.init.body));
const direcciones = (lista: Array<{ emailAddress: { address: string } }> | undefined) =>
  (lista ?? []).map((d) => d.emailAddress.address);
const fallo = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as ErrorCorreo);

describe('token de aplicación', () => {
  it('se pide por client-credentials y se reutiliza mientras no vence', async () => {
    const g = graphFalso();
    const { c } = cliente(g);

    await c.enviar(correo());
    await c.enviar(correo());

    expect(g.token()).toHaveLength(1);
    expect(g.envios()).toHaveLength(2);
    const pedido = g.token()[0].init;
    expect(pedido.method).toBe('POST');
    expect(cabeceras(g.token()[0])['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(String(pedido.body)))).toEqual({
      grant_type: 'client_credentials',
      client_id: CFG.clientId,
      client_secret: CFG.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });
  });

  it('se renueva cinco minutos antes de vencer', async () => {
    let t = 1_000_000;
    const g = graphFalso({ token: [tokenOk('tok-1'), tokenOk('tok-2')] });
    const { c } = cliente(g, { ahora: () => t });

    await c.enviar(correo());
    t += (3599 - 300) * 1000 - 1;
    await c.enviar(correo());
    expect(g.token()).toHaveLength(1);

    t += 1;
    await c.enviar(correo());
    expect(g.token()).toHaveLength(2);
    expect(g.envios().map((l) => cabeceras(l).Authorization)).toEqual(['Bearer tok-1', 'Bearer tok-1', 'Bearer tok-2']);
  });

  it.each([400, 401])('credenciales rechazadas (%i): configuración, sin reintento y con la causa legible', async (status) => {
    const g = graphFalso({
      token: [
        respuesta(status, {
          error: 'invalid_client',
          error_description: `AADSTS7000222: The provided client secret keys for app '${CFG.clientId}' are expired.`,
          error_codes: [7000222],
        }),
      ],
    });
    const { c, esperar } = cliente(g);

    const e = await fallo(c.enviar(correo()));

    expect(e).toBeInstanceOf(ErrorCorreo);
    expect(e).toMatchObject({ tipo: 'configuracion', status, codigo: 'invalid_client AADSTS7000222', intentos: 0 });
    expect(e?.message).toContain('AZURE_CLIENT_SECRET) venció');
    expect(e?.message).not.toContain(CFG.clientId);
    expect(e?.message).not.toContain(CFG.clientSecret);
    expect(g.token()).toHaveLength(1);
    expect(g.envios()).toHaveLength(0);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('una caída del inicio de sesión es pasajera: un reintento', async () => {
    const g = graphFalso({ token: [respuesta(503), tokenOk()] });
    const { c, esperar } = cliente(g);

    await expect(c.enviar(correo())).resolves.toEqual({ requestId: 'req-sintetico-1', intentos: 1 });
    expect(g.token()).toHaveLength(2);
    expect(esperar).toHaveBeenCalledWith(1000);
  });
});

describe('sendMail', () => {
  it('202: remitente codificado en la URL, replyTo, adjunto en base64 y copia en Enviados', async () => {
    const g = graphFalso();
    const { c } = cliente(g);

    await expect(c.enviar(correo())).resolves.toEqual({ requestId: 'req-sintetico-1', intentos: 1 });

    const [envio] = g.envios();
    expect(envio.url).toBe(URL_ENVIO);
    expect(envio.init.method).toBe('POST');
    expect(cabeceras(envio)).toEqual({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
    expect(cuerpoDe(envio)).toEqual({
      message: {
        subject: 'Remisión SIRIUS-REM-9999 recibida',
        body: { contentType: 'HTML', content: '<p>Contenido sintético</p>' },
        toRecipients: [{ emailAddress: { address: 'receptora@ejemplo.test' } }],
        ccRecipients: [{ emailAddress: { address: 'copia.uno@ejemplo.test' } }],
        replyTo: [{ emailAddress: { address: 'respuestas@ejemplo.test' } }],
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: 'SIRIUS-REM-9999.pdf',
            contentType: 'application/pdf',
            contentBytes: Buffer.from(PDF).toString('base64'),
          },
        ],
      },
      saveToSentItems: true,
    });
  });

  it('destinatarios en minúsculas, sin repetidos y sin repetir en CC lo que ya va en Para', async () => {
    const g = graphFalso();
    const { c } = cliente(g);

    await c.enviar(
      correo({
        para: [' Receptora@Ejemplo.TEST ', 'receptora@ejemplo.test'],
        cc: ['RECEPTORA@ejemplo.test', 'copia.uno@ejemplo.test', '', 'Copia.Uno@ejemplo.test'],
      })
    );

    const { message } = cuerpoDe(g.envios()[0]);
    expect(direcciones(message.toRecipients)).toEqual(['receptora@ejemplo.test']);
    expect(direcciones(message.ccRecipients)).toEqual(['copia.uno@ejemplo.test']);
  });

  it('sin CC, sin responder a y sin adjuntos no manda esas listas', async () => {
    const g = graphFalso();
    const { c } = cliente(g);

    await c.enviar(correo({ cc: undefined, responderA: undefined, adjuntos: undefined }));

    expect(Object.keys(cuerpoDe(g.envios()[0]).message).sort()).toEqual(['body', 'subject', 'toRecipients']);
  });

  it('401: descarta el token y reintenta una vez con uno nuevo', async () => {
    const g = graphFalso({
      token: [tokenOk('tok-1'), tokenOk('tok-2')],
      envio: [respuesta(401, { error: { code: 'InvalidAuthenticationToken' } }), aceptado()],
    });
    const { c, esperar } = cliente(g);

    await expect(c.enviar(correo())).resolves.toEqual({ requestId: 'req-sintetico-1', intentos: 2 });
    expect(g.envios().map((l) => cabeceras(l).Authorization)).toEqual(['Bearer tok-1', 'Bearer tok-2']);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('401 también con el token nuevo: configuración', async () => {
    const g = graphFalso({ token: [tokenOk('tok-1'), tokenOk('tok-2')], envio: [respuesta(401)] });
    const { c } = cliente(g);

    const e = await fallo(c.enviar(correo()));

    expect(e).toMatchObject({ tipo: 'configuracion', status: 401, intentos: 2 });
    expect(g.token()).toHaveLength(2);
    expect(g.envios()).toHaveLength(2);
  });

  it.each([
    [403, 'ErrorAccessDenied'],
    [404, 'ErrorInvalidUser'],
  ])('%i: configuración, sin reintento', async (status, codigo) => {
    const g = graphFalso({
      envio: [respuesta(status, { error: { code: codigo, message: 'Access is denied for notificaciones@ejemplo.test' } })],
    });
    const { c, esperar } = cliente(g);

    const e = await fallo(c.enviar(correo()));

    expect(e).toMatchObject({ tipo: 'configuracion', status, codigo, intentos: 1 });
    expect(e?.message).not.toContain('@');
    expect(g.envios()).toHaveLength(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it.each([400, 413])('%i: el mensaje no sirve, sin reintento', async (status) => {
    const g = graphFalso({
      envio: [
        respuesta(status, {
          error: { code: 'ErrorInvalidRecipients', message: "Recipient 'receptora@ejemplo.test' is not valid" },
        }),
      ],
    });
    const { c, esperar } = cliente(g);

    const e = await fallo(c.enviar(correo()));

    expect(e).toMatchObject({ tipo: 'permanente', status, codigo: 'ErrorInvalidRecipients', intentos: 1 });
    expect(e?.message).not.toContain('@');
    expect(e?.message).not.toContain(TOKEN);
    expect(esperar).not.toHaveBeenCalled();
  });

  it.each([
    ['2', 2000],
    ['120', 3000],
    ['0', 0],
  ])('429 con Retry-After %s: espera %i ms y reintenta', async (retryAfter, ms) => {
    const g = graphFalso({ envio: [respuesta(429, undefined, { 'Retry-After': retryAfter }), aceptado()] });
    const { c, esperar } = cliente(g);

    await expect(c.enviar(correo())).resolves.toEqual({ requestId: 'req-sintetico-1', intentos: 2 });
    expect(esperar).toHaveBeenCalledTimes(1);
    expect(esperar).toHaveBeenCalledWith(ms);
  });

  it('5xx: un reintento, y si vuelve a fallar se rinde como pasajero', async () => {
    const g = graphFalso({ envio: [respuesta(500), aceptado()] });
    const { c } = cliente(g);
    await expect(c.enviar(correo())).resolves.toMatchObject({ intentos: 2 });

    const g2 = graphFalso({ envio: [respuesta(503)] });
    const { c: c2, esperar } = cliente(g2);
    const e = await fallo(c2.enviar(correo()));
    expect(e).toMatchObject({ tipo: 'transitorio', status: 503, intentos: 2 });
    expect(esperar).toHaveBeenCalledTimes(1);
    expect(esperar).toHaveBeenCalledWith(1000);
  });

  it('una falla de red se reintenta una vez y el error dice la causa, no la URL', async () => {
    const red = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    const g = graphFalso({ envio: [red(), aceptado()] });
    const { c } = cliente(g);
    await expect(c.enviar(correo())).resolves.toMatchObject({ intentos: 2 });

    const g2 = graphFalso({ envio: [red()] });
    const { c: c2 } = cliente(g2);
    const e = await fallo(c2.enviar(correo()));
    expect(e).toMatchObject({ tipo: 'transitorio', intentos: 2 });
    expect(e?.message).toBe('No se pudo conectar con Microsoft Graph (ECONNRESET)');
  });

  it('un 2xx que no es 202 no se reintenta: podría haberse aceptado', async () => {
    const g = graphFalso({ envio: [respuesta(200, {})] });
    const { c, esperar } = cliente(g);

    const e = await fallo(c.enviar(correo()));

    expect(e).toMatchObject({ tipo: 'permanente', status: 200, intentos: 1 });
    expect(esperar).not.toHaveBeenCalled();
  });
});

describe('límites de tiempo (temporizadores falsos)', () => {
  beforeEach(() => {
    // Solo el reloj y los temporizadores: las promesas y los streams de Response
    // siguen corriendo de verdad.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('un sendMail que no responde se corta a los 10 s y todo el envío no pasa de 15 s', async () => {
    const g = graphFalso({ envio: [colgado] });
    const c = crearClienteGraph(CFG, { fetch: g.fetch as unknown as typeof fetch, ahora: () => Date.now() });
    const inicio = Date.now();

    const resultado = fallo(c.enviar(correo()));
    await jest.advanceTimersByTimeAsync(10_000);
    expect(g.envios()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(g.envios()).toHaveLength(2);
    // Al segundo intento solo le quedan 4 s del presupuesto.
    await jest.advanceTimersByTimeAsync(4_000);
    const e = await resultado;

    expect(e).toBeInstanceOf(ErrorCorreo);
    expect(e).toMatchObject({ tipo: 'transitorio', intentos: 2 });
    expect(e?.message).toBe('Microsoft Graph no respondió en 4 s');
    expect(Date.now() - inicio).toBe(15_000);
    expect(g.token()).toHaveLength(1);
  });

  it('un token que no llega se corta a los 5 s, con un reintento', async () => {
    const g = graphFalso({ token: [colgado] });
    const c = crearClienteGraph(CFG, { fetch: g.fetch as unknown as typeof fetch, ahora: () => Date.now() });

    const resultado = fallo(c.enviar(correo()));
    await jest.advanceTimersByTimeAsync(5_000);
    expect(g.token()).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(g.token()).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(5_000);
    const e = await resultado;

    expect(e).toMatchObject({ tipo: 'transitorio', intentos: 0 });
    expect(e?.message).toBe('El inicio de sesión de Microsoft no respondió en 5 s');
    expect(g.envios()).toHaveLength(0);
  });
});

describe('límites del mensaje', () => {
  it('más de 10 destinatarios: permanente y sin salir a la red', async () => {
    const g = graphFalso();
    const { c } = cliente(g);
    const para = Array.from({ length: 6 }, (_, i) => `persona${i}@ejemplo.test`);
    const cc = Array.from({ length: 5 }, (_, i) => `copia${i}@ejemplo.test`);

    const e = await fallo(c.enviar(correo({ para, cc })));

    expect(e).toMatchObject({ tipo: 'permanente', intentos: 0 });
    expect(e?.message).toBe('El correo tiene 11 destinatarios; el máximo es 10');
    expect(g.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['CC con una dirección inválida', { cc: ['copia.uno@ejemplo.test', 'no es un correo'] }, 'Dirección inválida en CC (posición 2)'],
    [
      'Para con un salto de línea y otra cabecera',
      { para: ['receptora@ejemplo.test\r\nBcc: otra@ejemplo.test'] },
      'Dirección inválida en Para (posición 1)',
    ],
    ['Responder a incompleto', { responderA: 'respuestas@' }, 'Dirección inválida en Responder a'],
    ['Para sin ninguna dirección', { para: ['  '] }, 'El correo no tiene destinatarios en Para'],
  ])('%s: se rechaza sin repetir la dirección', async (_caso, extra, mensaje) => {
    const g = graphFalso();
    const { c } = cliente(g);

    const e = await fallo(c.enviar(correo(extra as Partial<CorreoSaliente>)));

    expect(e).toMatchObject({ tipo: 'permanente', message: mensaje });
    expect(g.fetch).not.toHaveBeenCalled();
  });

  it('adjuntos: solo PDF, no vacíos y hasta 3 MB en total', async () => {
    const g = graphFalso();
    const { c } = cliente(g);
    const adjunto = (bytes: Uint8Array, contentType = 'application/pdf') => ({
      adjuntos: [{ nombre: 'a.pdf', contentType: contentType as 'application/pdf', bytes }],
    });

    expect(await fallo(c.enviar(correo(adjunto(new Uint8Array(3 * 1024 * 1024 + 1)))))).toMatchObject({
      tipo: 'permanente',
      message: 'Los adjuntos pesan más de 3 MB',
    });
    expect(await fallo(c.enviar(correo(adjunto(new Uint8Array(0)))))).toMatchObject({ message: 'Adjunto 1: está vacío' });
    expect(await fallo(c.enviar(correo(adjunto(PDF, 'text/html'))))).toMatchObject({
      message: 'Adjunto 1: solo se adjuntan PDF',
    });
    expect(g.fetch).not.toHaveBeenCalled();

    // Exactamente 3 MB sí pasa.
    await expect(c.enviar(correo(adjunto(new Uint8Array(3 * 1024 * 1024))))).resolves.toMatchObject({ intentos: 1 });
  });

  it('el asunto pierde los caracteres de control y se recorta a 150', async () => {
    const g = graphFalso();
    const { c } = cliente(g);

    await c.enviar(correo({ asunto: `Remisión\r\nBcc: x\u0000 ${'a'.repeat(300)}` }));

    const { subject } = cuerpoDe(g.envios()[0]).message;
    expect(subject).not.toMatch(/[\r\n\u0000]/);
    expect(subject.startsWith('Remisión Bcc: x a')).toBe(true);
    expect(Array.from(subject)).toHaveLength(150);
    expect(subject.endsWith('…')).toBe(true);
  });

  it('configuración incompleta: error de configuración que nombra el campo, no el valor', () => {
    expect(() => crearClienteGraph({ ...CFG, clientSecret: '  ' }, { fetch, ahora: Date.now })).toThrow(
      'Configuración de Graph incompleta: clientSecret'
    );
    expect(() => crearClienteGraph({ ...CFG, remitente: 'sin-arroba' }, { fetch, ahora: Date.now })).toThrow(
      'El remitente configurado no es una dirección válida'
    );
  });
});

describe('qué queda en la consola', () => {
  const ENTORNO = process.env;

  function espiarConsola() {
    const espias = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined)
    );
    return () => espias.flatMap((s) => s.mock.calls.map((args) => format(...args))).join('\n');
  }

  afterEach(() => {
    process.env = ENTORNO;
    jest.restoreAllMocks();
  });

  it('graph.ts no escribe nada: ni al enviar ni al fallar', async () => {
    const consola = espiarConsola();
    const { c } = cliente(graphFalso());
    await c.enviar(correo());
    const { c: c2 } = cliente(graphFalso({ envio: [respuesta(403, { error: { code: 'ErrorAccessDenied' } })] }));
    await fallo(c2.enviar(correo()));

    expect(consola()).toBe('');
  });

  it('enviarCorreo deja etiqueta, modo, status e intentos: sin direcciones, cuerpo, token ni secreto', async () => {
    process.env = {
      ...ENTORNO,
      VERCEL_ENV: 'production',
      AZURE_TENANT_ID: CFG.tenantId,
      AZURE_CLIENT_ID: CFG.clientId,
      AZURE_CLIENT_SECRET: CFG.clientSecret,
      OUTLOOK_SENDER_EMAIL: 'notificaciones@ejemplo.test',
    } as NodeJS.ProcessEnv;
    delete process.env.CORREO_MODO;
    const g = graphFalso({ envio: [aceptado(), respuesta(403, { error: { code: 'ErrorAccessDenied', message: 'x@ejemplo.test' } })] });
    jest.spyOn(globalThis, 'fetch').mockImplementation(g.fetch as unknown as typeof fetch);
    const consola = espiarConsola();
    jest.resetModules();
    const { enviarCorreo, ErrorCorreo: ErrorDelModulo } = await import('@/lib/correo/graph.server');

    await expect(enviarCorreo(correo({ etiqueta: 'SIRIUS-REM-9999 <x@ejemplo.test>' }))).resolves.toEqual({
      modo: 'enviar',
      enviado: true,
      destinatarios: 2,
      requestId: 'req-sintetico-1',
      intentos: 1,
    });
    const e = await fallo(enviarCorreo(correo()));
    expect(e).toBeInstanceOf(ErrorDelModulo);
    expect(e).toMatchObject({ tipo: 'configuracion', status: 403 });

    const salida = consola();
    expect(salida).toContain('"etiqueta":"SIRIUS-REM-9999"');
    expect(salida).toContain('"status":202');
    expect(salida).toContain('"codigo":"ErrorAccessDenied"');
    expect(salida).not.toContain('@');
    expect(salida).not.toMatch(/bearer/i);
    expect(salida).not.toContain(TOKEN);
    expect(salida).not.toContain(CFG.clientSecret);
    expect(salida).not.toContain('Contenido sintético');
    expect(salida).not.toContain('Remisión SIRIUS-REM-9999 recibida');
  });
});

// src/lib/correo/graph.ts
//
// Correo por Microsoft Graph: el transporte, los modos de envío y los límites del
// mensaje. No lee el entorno ni escribe en la consola: todo entra por parámetro.
//
// ═══ POR QUÉ UNA FÁBRICA PURA ════════════════════════════════════════════════════
// El `fetch` y el reloj entran por parámetro para que los tests recorran el
// transporte completo —token, reintentos, límites de tiempo— sin red, y para que
// `scripts/probar-correo.ts` lo use sin pasar por `server-only` ni por
// `config.ts`. Quien lee las variables es `graph.server.ts`, y solo al enviar.
//
// ═══ LO QUE NO SE COPIÓ DEL LABORATORIO ══════════════════════════════════════════
// `sirius_laboratorio/src/lib/email.ts` arma el cliente MSAL al importarse (sin
// variables, el módulo cae al cargar), no tiene límite de tiempo ni reintentos,
// trata igual un secreto vencido que una caída de Graph y, cuando falla, deja en
// el log el remitente, los destinatarios y el comienzo del token. Aquí el token se
// pide con `fetch`, como en `guaicaramo_biogas/src/lib/informe/correo.ts`, sin
// dependencias nuevas; cada llamada tiene su límite; los errores se clasifican; y
// ningún mensaje de error lleva direcciones, cuerpo ni token, porque esos mensajes
// terminan en los `StepResult` que ve el operador.
//
// ═══ POR QUÉ HAY MODOS ═══════════════════════════════════════════════════════════
// El desarrollo local y Preview leen las mismas bases que producción: receptores
// reales con sus correos reales. Solo producción envía; los demás entornos
// redirigen todo a una dirección interna o lo simulan (`resolverModoCorreo`).

const URL_LOGIN = 'https://login.microsoftonline.com';
const URL_GRAPH = 'https://graph.microsoft.com/v1.0';
const ALCANCE_GRAPH = 'https://graph.microsoft.com/.default';

/** El único dominio que puede recibir un correo de prueba redirigido. */
const DOMINIO_INTERNO = 'siriusregenerative.com';
const PREFIJO_PRUEBA = '[PRUEBA]';

const TIMEOUT_TOKEN_MS = 5_000;
const TIMEOUT_ENVIO_MS = 10_000;
/**
 * Tope de todo el envío, reintentos incluidos. El correo de la recepción sale
 * dentro de la petición de quien confirma desde el celular: una Graph lenta no
 * puede dejarlo esperando más que esto.
 */
const PRESUPUESTO_MS = 15_000;
/** El token se renueva cinco minutos antes de vencer, para no usarlo en el borde. */
const MARGEN_TOKEN_SEG = 300;
const ESPERA_REINTENTO_MS = 1_000;
/** Un `Retry-After` más largo no cabe en el presupuesto: se espera esto como máximo. */
const MAX_RETRY_AFTER_MS = 3_000;

const MAX_DESTINATARIOS = 10;
const MAX_ASUNTO = 150;
/**
 * Graph admite adjuntos en línea de unos 3 MB: la petición entera tiene un tope
 * de 4 MB y el base64 la infla un tercio. El PDF de una remisión pesa ~42 KB.
 */
const MAX_ADJUNTOS_BYTES = 3 * 1024 * 1024;

const AGOTADO = 'Se agotó el tiempo para enviar el correo';

/**
 * Los rechazos de Azure más comunes, en palabras del operador. El código va
 * también en `ErrorCorreo.codigo`, pero los mensajes pasan por `sanearError()`,
 * que borra las secuencias de seis dígitos: sin esta frase, «el secreto venció»
 * (AADSTS7000222, que ya pasó una vez con estas credenciales) llegaría ilegible.
 */
const RECHAZOS_AZURE: Record<string, string> = {
  AADSTS7000222: 'el secreto de la aplicación (AZURE_CLIENT_SECRET) venció',
  AADSTS7000215: 'el secreto de la aplicación (AZURE_CLIENT_SECRET) no es válido',
  AADSTS700016: 'la aplicación (AZURE_CLIENT_ID) no existe en el tenant',
  AADSTS90002: 'el tenant (AZURE_TENANT_ID) no existe',
  AADSTS900023: 'AZURE_TENANT_ID no tiene un formato válido',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────────

export interface ConfigGraph {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Buzón desde el que sale el correo (`OUTLOOK_SENDER_EMAIL`). */
  remitente: string;
}

export interface AdjuntoCorreo {
  nombre: string;
  contentType: 'application/pdf';
  bytes: Uint8Array;
}

export interface CorreoSaliente {
  para: string[];
  cc?: string[];
  responderA?: string;
  asunto: string;
  html: string;
  adjuntos?: AdjuntoCorreo[];
  /** Lo único del correo que llega al log, p. ej. `SIRIUS-REM-0232`. */
  etiqueta: string;
}

export type ModoCorreo = 'enviar' | 'redirigir' | 'simular';

export interface ModoResuelto {
  modo: ModoCorreo;
  /** Solo en `redirigir`: la dirección interna que recibe todo. */
  redirigirA?: string;
  /** Por qué se eligió el modo. Va al log: nunca lleva direcciones. */
  motivo: string;
}

export interface ResultadoEnvio {
  modo: ModoCorreo;
  /** Graph lo aceptó. En `redirigir` también, pero le llegó solo a la dirección de prueba. */
  enviado: boolean;
  /** Direcciones a las que se dirigió de verdad (en `redirigir`, una). */
  destinatarios: number;
  requestId?: string;
  /** Envíos a Graph; 0 si no salió a la red. */
  intentos: number;
}

export type TipoErrorCorreo = 'configuracion' | 'permanente' | 'transitorio';

/**
 * Por qué no salió un correo. El `tipo` decide qué hacer: `configuracion` no se
 * arregla reintentando (credenciales, permiso, buzón); `permanente` es el mensaje
 * mismo; `transitorio` puede salir más tarde.
 */
export class ErrorCorreo extends Error {
  /** Envíos a Graph que alcanzaron a salir antes del error. */
  intentos = 0;

  constructor(
    mensaje: string,
    readonly tipo: TipoErrorCorreo,
    readonly status?: number,
    /** Código de Graph o de Azure (`ErrorAccessDenied`, `AADSTS7000222`): sin datos personales. */
    readonly codigo?: string
  ) {
    super(mensaje);
    this.name = 'ErrorCorreo';
  }
}

export interface DepsGraph {
  fetch: typeof fetch;
  /** Epoch en ms. Lo usan la caché del token y el presupuesto de tiempo. */
  ahora: () => number;
  esperar?: (ms: number) => Promise<void>;
}

export interface OpcionesEnvio {
  /** Límite de cada llamada a `sendMail`. */
  timeoutMs?: number;
  /** Límite de todo el envío, reintentos incluidos. */
  presupuestoMs?: number;
}

export interface ClienteGraph {
  enviar(c: CorreoSaliente, o?: OpcionesEnvio): Promise<{ requestId?: string; intentos: number }>;
}

// ─── Direcciones ──────────────────────────────────────────────────────────────────

/** Un solo `@`, sin espacios ni caracteres que rompan el JSON o el HTML. */
const RE_DIRECCION =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function normalizarDireccion(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

/** Para una dirección ya normalizada. */
function esDireccionValida(d: string): boolean {
  if (d.length > 254 || d.indexOf('@') > 64) return false;
  return RE_DIRECCION.test(d);
}

/**
 * Una sola dirección de `@siriusregenerative.com`. Es la condición para que el
 * modo `redirigir` —y el script de prueba— manden algo: un error de configuración
 * nunca debe convertir una prueba en un correo a un tercero.
 */
export function esDireccionInterna(valor: unknown): boolean {
  const d = normalizarDireccion(valor);
  return esDireccionValida(d) && d.endsWith(`@${DOMINIO_INTERNO}`);
}

/**
 * `juan.perez@gmail.com` → `j***z@gmail.com`. Solo deja letras y dígitos del
 * usuario, y letras, dígitos, `.` y `-` del dominio: la salida se puede meter en
 * HTML o en un archivo sin escapar nada, sea cual sea la entrada.
 */
function enmascararDireccion(valor: string): string {
  const d = normalizarDireccion(valor);
  const arroba = d.lastIndexOf('@');
  const usuario = arroba > 0 ? d.slice(0, arroba) : d;
  const dominio = arroba > 0 ? d.slice(arroba + 1).replace(/[^a-z0-9.-]/g, '') : '';
  const visible = (ch: string | undefined) => (ch && /^[a-z0-9]$/.test(ch) ? ch : '*');
  const final = usuario.length > 2 ? visible(usuario[usuario.length - 1]) : '';
  return `${visible(usuario[0])}***${final}${dominio ? `@${dominio}` : ''}`;
}

/** Los destinatarios en la forma que puede quedar en un archivo o en una franja. */
export function destinatariosEnmascarados(c: Pick<CorreoSaliente, 'para' | 'cc' | 'responderA'>): {
  para: string[];
  cc: string[];
  responderA: string | null;
} {
  return {
    para: (c.para ?? []).map(enmascararDireccion),
    cc: (c.cc ?? []).map(enmascararDireccion),
    responderA: c.responderA ? enmascararDireccion(c.responderA) : null,
  };
}

// ─── Modo ─────────────────────────────────────────────────────────────────────────

/**
 * Qué hacer con un correo en este entorno.
 *
 * `enviar` exige `VERCEL_ENV=production`, por defecto o con `CORREO_MODO=enviar`.
 * NODE_ENV no sirve para decidirlo: Preview también corre con
 * NODE_ENV=production, y desde Preview se lee la misma base que en producción.
 * Fuera de producción, `CORREO_MODO=enviar` se ignora.
 *
 * Fuera de producción (o con `CORREO_MODO=redirigir`) se redirige si
 * `CORREO_REDIRIGIR_A` es UNA dirección interna; si no, se simula. Ante cualquier
 * duda (un valor desconocido, un destino externo) la respuesta es no enviar.
 */
export function resolverModoCorreo(env: Record<string, string | undefined>): ModoResuelto {
  const vercel = (env.VERCEL_ENV ?? '').trim().toLowerCase();
  const produccion = vercel === 'production';
  const pedido = (env.CORREO_MODO ?? '').trim().toLowerCase();
  const destinoCrudo = (env.CORREO_REDIRIGIR_A ?? '').trim();
  const destino = esDireccionInterna(destinoCrudo) ? normalizarDireccion(destinoCrudo) : undefined;
  const entorno = `VERCEL_ENV=${vercel.replace(/[^a-z]/g, '') || 'sin definir'}`;

  const sinEnviar = (porque: string): ModoResuelto => {
    if (destino) return { modo: 'redirigir', redirigirA: destino, motivo: `${porque}; todo va a CORREO_REDIRIGIR_A` };
    const falta = destinoCrudo
      ? 'CORREO_REDIRIGIR_A no es una sola dirección del dominio siriusregenerative.com'
      : 'sin CORREO_REDIRIGIR_A';
    return { modo: 'simular', motivo: `${porque}; ${falta}: se simula` };
  };

  switch (pedido) {
    case '':
      return produccion ? { modo: 'enviar', motivo: 'VERCEL_ENV=production' } : sinEnviar(`fuera de producción (${entorno})`);
    case 'enviar':
      return produccion
        ? { modo: 'enviar', motivo: 'CORREO_MODO=enviar con VERCEL_ENV=production' }
        : sinEnviar(`CORREO_MODO=enviar ignorado fuera de producción (${entorno})`);
    case 'redirigir':
      return destino
        ? { modo: 'redirigir', redirigirA: destino, motivo: 'CORREO_MODO=redirigir' }
        : {
            modo: 'simular',
            motivo:
              'CORREO_MODO=redirigir sin un CORREO_REDIRIGIR_A válido (una sola dirección del dominio siriusregenerative.com): se simula',
          };
    case 'simular':
      return { modo: 'simular', motivo: 'CORREO_MODO=simular' };
    default:
      return sinEnviar('CORREO_MODO no reconocido (enviar, redirigir o simular)');
  }
}

// ─── Mensaje ──────────────────────────────────────────────────────────────────────

/** C0, DEL, C1 y los separadores de línea de Unicode. */
function esControl(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029;
}

/** El asunto viaja a un encabezado: sin caracteres de control y con un tope de largo. */
function limpiarAsunto(asunto: unknown): string {
  const limpio = Array.from(typeof asunto === 'string' ? asunto : '')
    .map((ch) => (esControl(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const letras = Array.from(limpio);
  return letras.length <= MAX_ASUNTO ? limpio : `${letras.slice(0, MAX_ASUNTO - 1).join('').trimEnd()}…`;
}

function nombreAdjunto(nombre: unknown): string {
  return Array.from(typeof nombre === 'string' ? nombre : '')
    .filter((ch) => !esControl(ch))
    .join('')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim()
    .slice(0, 120);
}

/**
 * Normaliza y valida una lista. Las entradas vacías se descartan (una coma de más
 * en una variable de entorno no es un error); una dirección inválida sí lo es, y
 * el mensaje dice dónde está sin repetirla.
 */
function normalizarLista(lista: readonly string[] | undefined, campo: string): string[] {
  const vistas = new Set<string>();
  (Array.isArray(lista) ? lista : []).forEach((cruda, i) => {
    const d = normalizarDireccion(cruda);
    if (!d) return;
    if (!esDireccionValida(d)) {
      throw new ErrorCorreo(`Dirección inválida en ${campo} (posición ${i + 1})`, 'permanente');
    }
    vistas.add(d);
  });
  return [...vistas];
}

function normalizarAdjuntos(adjuntos: readonly AdjuntoCorreo[] | undefined): AdjuntoCorreo[] {
  let total = 0;
  const salida = (Array.isArray(adjuntos) ? adjuntos : []).map((a, i) => {
    if (a?.contentType !== 'application/pdf') {
      throw new ErrorCorreo(`Adjunto ${i + 1}: solo se adjuntan PDF`, 'permanente');
    }
    // `ArrayBuffer.isView` y no `instanceof Uint8Array`: un Buffer o unos bytes de
    // otro contexto (los tests de Jest corren en una VM) fallarían el instanceof.
    if (!ArrayBuffer.isView(a.bytes) || a.bytes.byteLength === 0) {
      throw new ErrorCorreo(`Adjunto ${i + 1}: está vacío`, 'permanente');
    }
    const nombre = nombreAdjunto(a.nombre);
    if (!nombre) throw new ErrorCorreo(`Adjunto ${i + 1}: no tiene nombre`, 'permanente');
    total += a.bytes.byteLength;
    return { nombre, contentType: a.contentType, bytes: a.bytes };
  });
  if (total > MAX_ADJUNTOS_BYTES) throw new ErrorCorreo('Los adjuntos pesan más de 3 MB', 'permanente');
  return salida;
}

/**
 * El correo en minúsculas, sin repetidos, sin repetir en CC lo que ya va en Para,
 * y dentro de los límites. Idempotente: se aplica al preparar y otra vez al
 * enviar, porque el script de prueba llama al cliente directo.
 */
function normalizarCorreo(c: CorreoSaliente): CorreoSaliente {
  const para = normalizarLista(c.para, 'Para');
  if (!para.length) throw new ErrorCorreo('El correo no tiene destinatarios en Para', 'permanente');
  const enPara = new Set(para);
  const cc = normalizarLista(c.cc, 'CC').filter((d) => !enPara.has(d));
  const total = para.length + cc.length;
  if (total > MAX_DESTINATARIOS) {
    throw new ErrorCorreo(`El correo tiene ${total} destinatarios; el máximo es ${MAX_DESTINATARIOS}`, 'permanente');
  }
  const responderA = normalizarDireccion(c.responderA);
  if (responderA && !esDireccionValida(responderA)) {
    throw new ErrorCorreo('Dirección inválida en Responder a', 'permanente');
  }
  const asunto = limpiarAsunto(c.asunto);
  if (!asunto) throw new ErrorCorreo('El correo no tiene asunto', 'permanente');
  if (typeof c.html !== 'string' || !c.html.trim()) {
    throw new ErrorCorreo('El correo no tiene cuerpo', 'permanente');
  }
  return {
    para,
    cc,
    ...(responderA ? { responderA } : {}),
    asunto,
    html: c.html,
    adjuntos: normalizarAdjuntos(c.adjuntos),
    etiqueta: c.etiqueta,
  };
}

/** Franja de un correo redirigido: a quién habría ido en producción. */
function franjaRedirigido(original: { para: string[]; cc?: string[] }): string {
  const m = destinatariosEnmascarados(original);
  const a = `Para: ${m.para.join(', ')}${m.cc.length ? ` · CC: ${m.cc.join(', ')}` : ''}`;
  // Sin escapeHtml a propósito: `enmascararDireccion` solo deja [a-z0-9*@.-].
  // Colores sólidos con bgcolor: Outlook descarta los degradados y el texto
  // claro quedaba sobre fondo blanco (pasó con el correo del laboratorio).
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'bgcolor="#FFF4CE" style="background-color:#FFF4CE;border-bottom:2px solid #C8A600;">' +
    '<tr><td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;' +
    'line-height:19px;color:#3B2F00;">' +
    `<strong>PRUEBA: correo redirigido.</strong> En producción habría ido a ${a}.` +
    '</td></tr></table>'
  );
}

/** Justo después de `<body…>` si el HTML lo trae; si no, al comienzo. */
function conFranja(html: string, franja: string): string {
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body) return franja + html;
  const fin = body.index + body[0].length;
  return html.slice(0, fin) + franja + html.slice(fin);
}

/**
 * El correo tal como sale en `modo`: validado y normalizado, y en `redirigir`
 * con Para = la dirección de prueba, sin CC, `[PRUEBA]` en el asunto y una franja
 * con los destinatarios originales enmascarados. Lanza `ErrorCorreo` si el
 * correo no cumple los límites, en cualquier modo: así una simulación avisa de
 * lo mismo que fallaría en producción.
 */
export function prepararMensaje(c: CorreoSaliente, m: { modo: ModoCorreo; redirigirA?: string }): CorreoSaliente {
  const correo = normalizarCorreo(c);
  if (m.modo !== 'redirigir') return correo;

  if (!esDireccionInterna(m.redirigirA)) {
    throw new ErrorCorreo(
      'El modo redirigir necesita CORREO_REDIRIGIR_A: una sola dirección del dominio siriusregenerative.com',
      'configuracion'
    );
  }
  const asunto = correo.asunto.startsWith(PREFIJO_PRUEBA)
    ? correo.asunto
    : limpiarAsunto(`${PREFIJO_PRUEBA} ${correo.asunto}`);
  return {
    ...correo,
    para: [normalizarDireccion(m.redirigirA)],
    cc: [],
    asunto,
    html: conFranja(correo.html, franjaRedirigido(correo)),
  };
}

// ─── Transporte ───────────────────────────────────────────────────────────────────

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

function cuerpoSendMail(c: CorreoSaliente) {
  const direccion = (address: string) => ({ emailAddress: { address } });
  return {
    message: {
      subject: c.asunto,
      body: { contentType: 'HTML', content: c.html },
      toRecipients: c.para.map(direccion),
      ...(c.cc?.length ? { ccRecipients: c.cc.map(direccion) } : {}),
      ...(c.responderA ? { replyTo: [direccion(c.responderA)] } : {}),
      ...(c.adjuntos?.length
        ? {
            attachments: c.adjuntos.map((a) => ({
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: a.nombre,
              contentType: a.contentType,
              contentBytes: base64(a.bytes),
            })),
          }
        : {}),
    },
    // Los Enviados de la cuenta remitente son el único registro de lo que salió.
    saveToSentItems: true,
  };
}

async function leerJson(res: Response): Promise<Record<string, unknown> | null> {
  // `text()` fuera del try: si el límite de tiempo corta la lectura, eso es un
  // timeout y lo tiene que ver `conLimite`, no un JSON inválido.
  const texto = await res.text();
  try {
    const datos: unknown = JSON.parse(texto);
    return datos && typeof datos === 'object' ? (datos as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Solo el `error.code` de Graph, nunca `error.message`: Graph repite ahí la
 * dirección que rechazó.
 */
function codigoErrorGraph(datos: Record<string, unknown> | null): string | undefined {
  const error = datos?.error;
  const codigo = error && typeof error === 'object' ? (error as Record<string, unknown>).code : undefined;
  return typeof codigo === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(codigo) ? codigo : undefined;
}

/**
 * `invalid_client AADSTS7000222`. Nunca `error_description`: trae el ID de la
 * aplicación, la hora y un trace ID, y no agrega nada que el código no diga.
 */
function codigoErrorToken(datos: Record<string, unknown> | null): string | undefined {
  if (!datos) return undefined;
  const partes: string[] = [];
  if (typeof datos.error === 'string' && /^[a-z_]{1,60}$/.test(datos.error)) partes.push(datos.error);
  const primero = Array.isArray(datos.error_codes) ? datos.error_codes[0] : undefined;
  if (typeof primero === 'number' && Number.isInteger(primero) && primero > 0) partes.push(`AADSTS${primero}`);
  return partes.length ? partes.join(' ') : undefined;
}

/** `ENOTFOUND`, `ECONNRESET`… El mensaje de un error de red puede traer la URL, que lleva el remitente. */
function causaDeRed(e: unknown): string {
  const causa = (e as { cause?: { code?: unknown } } | null)?.cause?.code;
  const nombre = typeof causa === 'string' ? causa : (e as { name?: unknown } | null)?.name;
  return typeof nombre === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(nombre) ? nombre : 'desconocido';
}

/** Corre `fn` con un límite de tiempo y traduce el corte y las fallas de red a `ErrorCorreo`. */
async function conLimite<T>(ms: number, servicio: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (ms <= 0) throw new ErrorCorreo(AGOTADO, 'transitorio');
  const controlador = new AbortController();
  let vencido = false;
  const temporizador = setTimeout(() => {
    vencido = true;
    controlador.abort();
  }, ms);
  try {
    return await fn(controlador.signal);
  } catch (e) {
    if (e instanceof ErrorCorreo) throw e;
    if (vencido) {
      const sujeto = servicio.charAt(0).toUpperCase() + servicio.slice(1);
      throw new ErrorCorreo(`${sujeto} no respondió en ${Math.ceil(ms / 1000)} s`, 'transitorio');
    }
    throw new ErrorCorreo(`No se pudo conectar con ${servicio} (${causaDeRed(e)})`, 'transitorio');
  } finally {
    clearTimeout(temporizador);
  }
}

function esperaPorRetryAfter(valor: string | null, ahora: number): number | undefined {
  if (!valor) return undefined;
  const v = valor.trim();
  let ms: number;
  if (/^\d+$/.test(v)) ms = Number(v) * 1000;
  else {
    const fecha = Date.parse(v);
    if (Number.isNaN(fecha)) return undefined;
    ms = fecha - ahora;
  }
  return Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

function errorDeEnvio(status: number, codigo?: string): ErrorCorreo {
  const http = `HTTP ${status}${codigo ? ` · ${codigo}` : ''}`;
  const error = (mensaje: string, tipo: TipoErrorCorreo) => new ErrorCorreo(mensaje, tipo, status, codigo);
  if (status === 401) {
    return error(
      `Graph rechazó la autorización (${http}): revise el permiso de aplicación Mail.Send y el consentimiento del administrador`,
      'configuracion'
    );
  }
  if (status === 403) {
    return error(
      `Graph negó el envío (${http}): falta el permiso Mail.Send con consentimiento del administrador, o una política de acceso bloquea el buzón remitente`,
      'configuracion'
    );
  }
  if (status === 404) return error(`Graph no encontró el buzón remitente (${http}): revise OUTLOOK_SENDER_EMAIL`, 'configuracion');
  if (status === 429) return error(`Graph limitó los envíos (${http})`, 'transitorio');
  if (status >= 500) return error(`Graph no está disponible (${http})`, 'transitorio');
  if (status === 413) return error(`Graph rechazó el mensaje por tamaño (${http})`, 'permanente');
  if (status === 400) return error(`Graph rechazó el mensaje (${http})`, 'permanente');
  // Cualquier otra cosa —incluido un 2xx que no sea 202— no se reintenta: si
  // Graph alcanzó a aceptarlo, reintentar duplicaría el correo.
  return error(`Graph respondió ${http} al enviar; se esperaba 202`, 'permanente');
}

type RespuestaEnvio =
  | { aceptado: true; requestId?: string }
  | { aceptado: false; status: number; codigo?: string; retryAfter: string | null };

/**
 * Cliente de `sendMail` con token de aplicación (client-credentials).
 *
 * - Token: se pide con `fetch`, con 5 s de límite, y se guarda hasta cinco
 *   minutos antes de vencer. Un 400/401 de Azure es configuración: sin reintento.
 * - Envío: `POST /users/{remitente}/sendMail`, que responde 202. Un 401 descarta
 *   el token y se reintenta una vez; 403 y 404 son configuración; 400 y 413, el
 *   mensaje; 429, 5xx, la red o el límite de 10 s, pasajeros: un reintento, con
 *   `Retry-After` de 3 s como máximo. Todo dentro de 15 s.
 *
 * Un reintento después de un timeout o de un 5xx puede duplicar el correo si
 * Graph alcanzó a aceptar el primero. Se acepta: llega dos veces y se ve en la
 * copia, mejor que no llegar.
 */
export function crearClienteGraph(cfg: ConfigGraph, deps: DepsGraph): ClienteGraph {
  const tenantId = (cfg.tenantId ?? '').trim();
  const clientId = (cfg.clientId ?? '').trim();
  const clientSecret = (cfg.clientSecret ?? '').trim();
  const remitente = normalizarDireccion(cfg.remitente);
  const faltan = Object.entries({ tenantId, clientId, clientSecret, remitente })
    .filter(([, valor]) => !valor)
    .map(([campo]) => campo);
  if (faltan.length) throw new ErrorCorreo(`Configuración de Graph incompleta: ${faltan.join(', ')}`, 'configuracion');
  if (!esDireccionValida(remitente)) {
    throw new ErrorCorreo('El remitente configurado no es una dirección válida', 'configuracion');
  }

  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)));
  const urlToken = `${URL_LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const urlEnvio = `${URL_GRAPH}/users/${encodeURIComponent(remitente)}/sendMail`;
  const cuerpoToken = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: ALCANCE_GRAPH,
  }).toString();

  let cache: { token: string; venceEn: number } | null = null;

  async function obtenerToken(limiteMs: number): Promise<string> {
    if (cache && deps.ahora() < cache.venceEn) return cache.token;
    cache = null;
    const r = await conLimite(limiteMs, 'el inicio de sesión de Microsoft', async (signal) => {
      const res = await deps.fetch(urlToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpoToken,
        signal,
      });
      return { status: res.status, datos: await leerJson(res) };
    });

    const token = typeof r.datos?.access_token === 'string' ? r.datos.access_token : '';
    if (r.status >= 200 && r.status < 300 && token) {
      const vigencia = Number(r.datos?.expires_in);
      const utilSeg = Number.isFinite(vigencia) ? Math.max(0, vigencia - MARGEN_TOKEN_SEG) : 0;
      cache = { token, venceEn: deps.ahora() + utilSeg * 1000 };
      return token;
    }

    const codigo = codigoErrorToken(r.datos);
    const http = `HTTP ${r.status}${codigo ? ` · ${codigo}` : ''}`;
    if (r.status === 429 || r.status >= 500) {
      throw new ErrorCorreo(`El inicio de sesión de Microsoft no está disponible (${http})`, 'transitorio', r.status, codigo);
    }
    if (r.status >= 200 && r.status < 300) {
      throw new ErrorCorreo('El inicio de sesión de Microsoft respondió sin token', 'transitorio', r.status);
    }
    const aadsts = codigo?.split(' ').find((p) => p.startsWith('AADSTS'));
    const causa = (aadsts && RECHAZOS_AZURE[aadsts]) || 'revise AZURE_TENANT_ID, AZURE_CLIENT_ID y AZURE_CLIENT_SECRET';
    throw new ErrorCorreo(`Azure rechazó las credenciales de la aplicación (${http}): ${causa}`, 'configuracion', r.status, codigo);
  }

  return {
    async enviar(c, o = {}) {
      const correo = normalizarCorreo(c);
      const cuerpo = JSON.stringify(cuerpoSendMail(correo));
      const timeoutMs = o.timeoutMs ?? TIMEOUT_ENVIO_MS;
      const presupuestoMs = o.presupuestoMs ?? PRESUPUESTO_MS;
      const inicio = deps.ahora();
      const restante = () => presupuestoMs - (deps.ahora() - inicio);

      let intentos = 0;
      let tokenRenovado = false;
      let reintentoUsado = false;

      for (;;) {
        let fallo: ErrorCorreo;
        let esperaMs = ESPERA_REINTENTO_MS;
        try {
          if (restante() <= 0) throw new ErrorCorreo(AGOTADO, 'transitorio');
          const token = await obtenerToken(Math.min(TIMEOUT_TOKEN_MS, restante()));
          const r = await conLimite<RespuestaEnvio>(Math.min(timeoutMs, restante()), 'Microsoft Graph', async (signal) => {
            intentos += 1;
            const res = await deps.fetch(urlEnvio, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: cuerpo,
              signal,
            });
            if (res.status === 202) return { aceptado: true, requestId: res.headers.get('request-id') ?? undefined };
            return {
              aceptado: false,
              status: res.status,
              codigo: codigoErrorGraph(await leerJson(res)),
              retryAfter: res.headers.get('retry-after'),
            };
          });
          if (r.aceptado) return { requestId: r.requestId, intentos };

          if (r.status === 401 && !tokenRenovado) {
            // Un token que Azure revocó antes de tiempo: se pide otro una sola vez.
            tokenRenovado = true;
            cache = null;
            continue;
          }
          fallo = errorDeEnvio(r.status, r.codigo);
          esperaMs = esperaPorRetryAfter(r.retryAfter, deps.ahora()) ?? ESPERA_REINTENTO_MS;
        } catch (e) {
          fallo = e instanceof ErrorCorreo ? e : new ErrorCorreo(`Falla inesperada al enviar (${causaDeRed(e)})`, 'permanente');
        }

        fallo.intentos = intentos;
        if (fallo.tipo !== 'transitorio' || reintentoUsado || esperaMs >= restante()) throw fallo;
        reintentoUsado = true;
        await esperar(esperaMs);
      }
    },
  };
}

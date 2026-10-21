// src/app/recibir/recepcion.estado.ts
//
// La máquina de pasos de la página pública `/recibir`, como funciones puras:
// el reductor, la validación de lo que se digita, los cuerpos que van a
// `/api/recibir/*` y la lectura de sus respuestas.
//
// Puro a propósito: la página la abre un desconocido desde un QR, en un celular
// con mala señal, y cada camino (cédula conocida, nueva, «No soy yo», enlace
// vencido, 429, caída del servidor) tiene que poder probarse sin red ni DOM.
//
// Solo importa módulos sin dependencias de servidor: entra en el bundle del
// navegador.

import {
  esCorreoValido,
  nombreValido,
  normalizarCedula,
  normalizarCelularCO,
  normalizarCorreo,
  normalizarNombre,
} from '@/lib/recepcion/datos-personales';
import {
  esErrorRecepcion,
  MENSAJES_RECEPCION,
  TEXTO_AUTORIZACION_DATOS,
  type DetalleErrorRecepcion,
  type ErrorRecepcion,
} from '@/lib/recepcion/textos';

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Lo que devuelve `consultar`: sin datos personales. */
export interface ResumenRemision {
  codigo: string;
  producto: string;
  kg: number;
  cliente: string;
  area: string | null;
  fechaDespacho: string;
}

export interface ExitoRecepcion {
  codigo: string;
  /** `YYYY-MM-DD` en Bogotá. */
  fechaRecibido: string;
  /** Instante ISO de la confirmación. */
  recibidaEn: string;
  yaRecibida: boolean;
  correo: { estado: 'enviado' | 'simulado' | 'no_enviado' | 'sin_correo'; a: string | null };
}

/**
 * Error que solo conoce la página: se abrió `/recibir` sin el fragmento. Pasa
 * cuando WhatsApp o un lector de QR cortan el enlace en el `#`, y no vale la pena
 * preguntarle al servidor por un token que no existe.
 */
export type ErrorPagina = ErrorRecepcion | 'enlace_incompleto';

export const MENSAJE_ENLACE_INCOMPLETO = {
  titulo: 'Enlace incompleto',
  texto:
    'El enlace llegó cortado. Ábralo de nuevo desde el mensaje o escanee otra vez el código QR ' +
    'de la remisión. Si sigue igual, pida uno nuevo a quien le despachó el producto.',
};

export type PasoCedula = { tipo: 'cedula' };
export type PasoConocida = { tipo: 'conocida'; nombre: string; correo: string | null };
/** `no_soy_yo`: la cédula era de alguien registrado, pero la persona dijo que no es ella. */
export type PasoRegistro = { tipo: 'registro'; motivo: 'no_encontrada' | 'no_soy_yo' };
export type PasoFormulario = PasoCedula | PasoConocida | PasoRegistro;

export type PasoRecepcion =
  | { tipo: 'cargando' }
  | PasoFormulario
  /** El formulario de `desde` sigue a la vista, bloqueado, mientras responde el servidor. */
  | { tipo: 'enviando'; desde: PasoFormulario }
  | { tipo: 'exito'; datos: ExitoRecepcion }
  | {
      tipo: 'error';
      codigo: ErrorPagina;
      detalle: DetalleErrorRecepcion;
      /** A dónde lleva «Reintentar»: volver a consultar, o al formulario con lo digitado. */
      volverA: 'consultar' | PasoFormulario | null;
    };

export type CampoRecepcion =
  | 'cedula'
  | 'nombre'
  | 'celular'
  | 'correo'
  | 'autoriza'
  | 'correoConocida'
  | 'autorizaConocida'
  | 'general';

export type ErroresCampos = Partial<Record<CampoRecepcion, string>>;

/**
 * Lo digitado. Vive solo en memoria: el celular puede ser el de la finca o el del
 * conductor, y nada de esto debe quedar en `localStorage` ni en `sessionStorage`.
 */
export interface Borrador {
  cedula: string;
  nombre: string;
  celular: string;
  correo: string;
  autoriza: boolean;
  /** Correo opcional que agrega una persona ya registrada. */
  correoConocida: string;
  autorizaConocida: boolean;
}

export interface EstadoRecepcion {
  paso: PasoRecepcion;
  token: string | null;
  resumen: ResumenRemision | null;
  venceEl: string | null;
  /** La cédula canónica que respondió `identificar`: es la que se confirma. */
  cedula: string | null;
  borrador: Borrador;
  errores: ErroresCampos;
}

export type EstadoConsulta = 'pendiente' | 'recibida' | 'anulada' | 'no_despachada';

export type AccionRecepcion =
  | { tipo: 'token'; token: string | null }
  | {
      tipo: 'consultado';
      estado: EstadoConsulta;
      resumen: ResumenRemision;
      venceEl: string | null;
      fechaRecibido?: string | null;
    }
  | { tipo: 'campo'; campo: keyof Borrador; valor: string | boolean }
  | { tipo: 'errores'; errores: ErroresCampos }
  | { tipo: 'enviar' }
  | { tipo: 'identificado'; cedula: string; conocida: true; nombre: string; correo: string | null }
  | { tipo: 'identificado'; cedula: string; conocida: false }
  | { tipo: 'no_soy_yo' }
  | { tipo: 'cambiar_cedula' }
  | { tipo: 'confirmado'; datos: ExitoRecepcion }
  | { tipo: 'fallo'; codigo: ErrorRecepcion; detalle?: DetalleErrorRecepcion; campos?: string[] }
  | { tipo: 'reintentar' };

export const BORRADOR_VACIO: Borrador = {
  cedula: '',
  nombre: '',
  celular: '',
  correo: '',
  autoriza: false,
  correoConocida: '',
  autorizaConocida: false,
};

export const ESTADO_INICIAL: EstadoRecepcion = {
  paso: { tipo: 'cargando' },
  token: null,
  resumen: null,
  venceEl: null,
  cedula: null,
  borrador: BORRADOR_VACIO,
  errores: {},
};

// ── Mensajes en línea ────────────────────────────────────────────────────────

export const MENSAJES_CAMPO: Record<Exclude<CampoRecepcion, 'general'>, string> = {
  cedula: MENSAJES_RECEPCION.cedula_invalida.texto,
  nombre: 'Escriba su nombre y al menos un apellido, solo con letras.',
  celular: 'Escriba un celular de 10 dígitos que empiece por 3, o un número con indicativo (+).',
  correo: 'Revise el correo: debe tener la forma nombre@dominio.com.',
  autoriza: MENSAJES_RECEPCION.falta_autorizacion.texto,
  correoConocida: 'Revise el correo: debe tener la forma nombre@dominio.com.',
  autorizaConocida: MENSAJES_RECEPCION.falta_autorizacion.texto,
};

/**
 * Errores del servidor que se corrigen en el mismo formulario. El resto (enlace
 * vencido, ya recibida, 429, caída) reemplaza la pantalla completa.
 */
const ERRORES_EN_LINEA: ReadonlySet<ErrorRecepcion> = new Set<ErrorRecepcion>([
  'cedula_invalida',
  'datos_invalidos',
  'falta_autorizacion',
]);

/** Los que no dependen de lo que hizo la persona: tiene sentido volver a intentar. */
const ERRORES_REINTENTABLES: ReadonlySet<ErrorRecepcion> = new Set<ErrorRecepcion>([
  'demasiados_intentos',
  'no_disponible',
  'error_interno',
]);

function erroresEnLinea(
  codigo: ErrorRecepcion,
  desde: PasoFormulario,
  campos: string[] | undefined,
): ErroresCampos {
  if (codigo === 'cedula_invalida') return { cedula: MENSAJES_CAMPO.cedula };
  if (codigo === 'falta_autorizacion') {
    return desde.tipo === 'conocida'
      ? { autorizaConocida: MENSAJES_CAMPO.autorizaConocida }
      : { autoriza: MENSAJES_CAMPO.autoriza };
  }
  // datos_invalidos: el servidor nombra los campos. Se traducen al formulario
  // que estaba a la vista; un nombre que no se reconoce va al resumen general.
  const errores: ErroresCampos = {};
  for (const campo of campos ?? []) {
    if (desde.tipo === 'conocida' && campo === 'correo') errores.correoConocida = MENSAJES_CAMPO.correoConocida;
    else if (campo === 'cedula') errores.cedula = MENSAJES_CAMPO.cedula;
    else if (desde.tipo === 'registro' && (campo === 'nombre' || campo === 'celular' || campo === 'correo')) {
      errores[campo] = MENSAJES_CAMPO[campo];
    }
  }
  if (!Object.keys(errores).length) errores.general = MENSAJES_RECEPCION.datos_invalidos.texto;
  return errores;
}

// ── Reductor ─────────────────────────────────────────────────────────────────

function esFormulario(paso: PasoRecepcion): paso is PasoFormulario {
  return paso.tipo === 'cedula' || paso.tipo === 'conocida' || paso.tipo === 'registro';
}

export function reducirRecepcion(estado: EstadoRecepcion, accion: AccionRecepcion): EstadoRecepcion {
  switch (accion.tipo) {
    case 'token':
      if (!accion.token) {
        return {
          ...estado,
          token: null,
          paso: { tipo: 'error', codigo: 'enlace_incompleto', detalle: {}, volverA: null },
        };
      }
      return { ...estado, token: accion.token, paso: { tipo: 'cargando' } };

    case 'consultado': {
      const base = { ...estado, resumen: accion.resumen, venceEl: accion.venceEl };
      if (accion.estado === 'pendiente') return { ...base, paso: { tipo: 'cedula' } };
      const codigo: ErrorRecepcion =
        accion.estado === 'recibida' ? 'ya_recibida' : accion.estado === 'anulada' ? 'anulada' : 'no_despachada';
      return {
        ...base,
        paso: {
          tipo: 'error',
          codigo,
          detalle: accion.fechaRecibido ? { fechaRecibido: accion.fechaRecibido } : {},
          volverA: null,
        },
      };
    }

    case 'campo': {
      const borrador = { ...estado.borrador, [accion.campo]: accion.valor } as Borrador;
      // Corregir un campo apaga su error; el resumen general también, porque ya
      // no describe el formulario que está a la vista.
      const { [accion.campo]: _quitado, general: _general, ...errores } = estado.errores as Record<string, string>;
      // Vaciar el correo opcional hace innecesaria la casilla que lo acompañaba.
      if (accion.campo === 'correoConocida' && !String(accion.valor).trim()) delete errores.autorizaConocida;
      return { ...estado, borrador, errores };
    }

    case 'errores':
      return { ...estado, errores: accion.errores };

    case 'enviar':
      if (!esFormulario(estado.paso)) return estado;
      return { ...estado, errores: {}, paso: { tipo: 'enviando', desde: estado.paso } };

    case 'identificado':
      if (estado.paso.tipo !== 'enviando') return estado;
      return {
        ...estado,
        cedula: accion.cedula,
        errores: {},
        paso: accion.conocida
          ? { tipo: 'conocida', nombre: accion.nombre, correo: accion.correo }
          : { tipo: 'registro', motivo: 'no_encontrada' },
      };

    case 'no_soy_yo':
      if (estado.paso.tipo !== 'conocida') return estado;
      return {
        ...estado,
        errores: {},
        borrador: { ...estado.borrador, correoConocida: '', autorizaConocida: false },
        paso: { tipo: 'registro', motivo: 'no_soy_yo' },
      };

    case 'cambiar_cedula':
      if (!esFormulario(estado.paso)) return estado;
      return { ...estado, cedula: null, errores: {}, paso: { tipo: 'cedula' } };

    case 'confirmado':
      return { ...estado, errores: {}, paso: { tipo: 'exito', datos: accion.datos } };

    case 'fallo': {
      const desde = estado.paso.tipo === 'enviando' ? estado.paso.desde : null;
      if (desde && ERRORES_EN_LINEA.has(accion.codigo)) {
        return { ...estado, paso: desde, errores: erroresEnLinea(accion.codigo, desde, accion.campos) };
      }
      // La persona «conocida» dejó de serlo entre identificar y confirmar (se
      // borró, o cambió el alcance del cliente): se le piden sus datos.
      if (desde && accion.codigo === 'requiere_registro') {
        return { ...estado, errores: {}, paso: { tipo: 'registro', motivo: 'no_encontrada' } };
      }
      const volverA = ERRORES_REINTENTABLES.has(accion.codigo)
        ? (desde ?? (estado.paso.tipo === 'cargando' ? 'consultar' : null))
        : null;
      return {
        ...estado,
        paso: { tipo: 'error', codigo: accion.codigo, detalle: accion.detalle ?? {}, volverA },
      };
    }

    case 'reintentar': {
      if (estado.paso.tipo !== 'error' || !estado.paso.volverA) return estado;
      const volverA = estado.paso.volverA;
      return { ...estado, errores: {}, paso: volverA === 'consultar' ? { tipo: 'cargando' } : volverA };
    }
  }
}

/**
 * Identifica la pantalla para mover el foco al h1 solo cuando cambia de verdad:
 * `enviando` muestra el mismo formulario, y robarle el foco ahí haría que el
 * lector de pantalla repita el título a mitad del envío.
 */
export function clavePantalla(paso: PasoRecepcion): string {
  const visible = paso.tipo === 'enviando' ? paso.desde : paso;
  return visible.tipo === 'error' ? `error:${visible.codigo}` : visible.tipo;
}

// ── Validación y cuerpos de las peticiones ───────────────────────────────────

export type Validacion<T> = { ok: true; valor: T } | { ok: false; errores: ErroresCampos };

export function validarCedula(b: Borrador): Validacion<string> {
  const cedula = normalizarCedula(b.cedula);
  return cedula ? { ok: true, valor: cedula } : { ok: false, errores: { cedula: MENSAJES_CAMPO.cedula } };
}

/** El correo que agrega una persona conocida: opcional, pero con autorización si lo escribe. */
export function validarConocida(b: Borrador): Validacion<{ correo: string | null }> {
  if (!b.correoConocida.trim()) return { ok: true, valor: { correo: null } };
  const errores: ErroresCampos = {};
  if (!esCorreoValido(b.correoConocida)) errores.correoConocida = MENSAJES_CAMPO.correoConocida;
  if (!b.autorizaConocida) errores.autorizaConocida = MENSAJES_CAMPO.autorizaConocida;
  return Object.keys(errores).length
    ? { ok: false, errores }
    : { ok: true, valor: { correo: normalizarCorreo(b.correoConocida) } };
}

export function validarRegistro(b: Borrador): Validacion<{ nombre: string; celular: string; correo: string }> {
  const errores: ErroresCampos = {};
  const celular = normalizarCelularCO(b.celular);
  if (!nombreValido(b.nombre)) errores.nombre = MENSAJES_CAMPO.nombre;
  if (!celular) errores.celular = MENSAJES_CAMPO.celular;
  if (!esCorreoValido(b.correo)) errores.correo = MENSAJES_CAMPO.correo;
  if (!b.autoriza) errores.autoriza = MENSAJES_CAMPO.autoriza;
  if (Object.keys(errores).length || !celular) return { ok: false, errores };
  return {
    ok: true,
    valor: { nombre: normalizarNombre(b.nombre), celular, correo: normalizarCorreo(b.correo) },
  };
}

/**
 * Cuerpo de `POST /api/recibir/confirmar` (contrato D.11).
 *
 * `textoVersion` es la del texto que la página MOSTRÓ, no la que dijo el servidor
 * en `consultar`: la prueba de la autorización tiene que acreditar lo que la
 * persona leyó. Si el servidor ya va en otra versión responde
 * `texto_desactualizado` y la página pide recargar.
 */
export function cuerpoConfirmar(
  token: string,
  cedula: string,
  modo: 'conocida',
  datos: { correo: string | null },
): Record<string, unknown>;
export function cuerpoConfirmar(
  token: string,
  cedula: string,
  modo: 'nueva',
  datos: { nombre: string; celular: string; correo: string },
): Record<string, unknown>;
export function cuerpoConfirmar(
  token: string,
  cedula: string,
  modo: 'conocida' | 'nueva',
  datos: { correo: string | null } | { nombre: string; celular: string; correo: string },
): Record<string, unknown> {
  const textoVersion = TEXTO_AUTORIZACION_DATOS.version;
  if (modo === 'nueva') {
    return { token, cedula, modo, nuevo: datos, autorizaDatos: true, textoVersion };
  }
  const { correo } = datos as { correo: string | null };
  return correo
    ? { token, cedula, modo, correo, autorizaDatos: true, textoVersion }
    : { token, cedula, modo, textoVersion };
}

// ── Lectura de respuestas ────────────────────────────────────────────────────

/**
 * `Retry-After` en segundos. Acepta los dos formatos de HTTP (segundos o fecha);
 * lo ilegible da undefined y el mensaje cae al genérico «unos minutos».
 */
export function segundosRetryAfter(valor: string | null | undefined, ahora: number = Date.now()): number | undefined {
  if (!valor) return undefined;
  const texto = valor.trim();
  if (/^\d+$/.test(texto)) return Number(texto);
  const instante = Date.parse(texto);
  if (Number.isNaN(instante)) return undefined;
  return Math.max(0, Math.ceil((instante - ahora) / 1000));
}

/** Un código de error a partir del HTTP, cuando el cuerpo no trae uno reconocible. */
function codigoPorEstado(status: number): ErrorRecepcion {
  if (status === 404) return 'enlace_invalido';
  if (status === 410) return 'enlace_vencido';
  if (status === 429) return 'demasiados_intentos';
  if (status === 413) return 'datos_invalidos';
  if (status === 503) return 'no_disponible';
  return 'error_interno';
}

/**
 * Convierte una respuesta de error en la acción `fallo`. Lo que no se reconoce
 * —un HTML de error del proxy, un cuerpo vacío— se trata por el código HTTP,
 * nunca se muestra crudo.
 */
export function falloDeRespuesta(
  status: number,
  cuerpo: unknown,
  retryAfter?: string | null,
): Extract<AccionRecepcion, { tipo: 'fallo' }> {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>;
  const codigo = esErrorRecepcion(c.error) ? c.error : codigoPorEstado(status);
  const detalle: DetalleErrorRecepcion = {};
  if (typeof c.venceEl === 'string') detalle.venceEl = c.venceEl;
  if (typeof c.fechaRecibido === 'string') detalle.fechaRecibido = c.fechaRecibido;
  const espera = segundosRetryAfter(retryAfter);
  if (espera !== undefined) detalle.reintentarEnSeg = espera;
  const campos = Array.isArray(c.campos) ? c.campos.filter((x): x is string => typeof x === 'string') : undefined;
  return { tipo: 'fallo', codigo, detalle, ...(campos ? { campos } : {}) };
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function leerConsulta(cuerpo: unknown): Extract<AccionRecepcion, { tipo: 'consultado' }> | null {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>;
  const r = (c.remision && typeof c.remision === 'object' ? c.remision : null) as Record<string, unknown> | null;
  const estados: EstadoConsulta[] = ['pendiente', 'recibida', 'anulada', 'no_despachada'];
  if (!r || !estados.includes(c.estado as EstadoConsulta) || !texto(r.codigo)) return null;
  return {
    tipo: 'consultado',
    estado: c.estado as EstadoConsulta,
    resumen: {
      codigo: texto(r.codigo),
      producto: texto(r.producto),
      kg: typeof r.kg === 'number' && Number.isFinite(r.kg) ? r.kg : 0,
      cliente: texto(r.cliente),
      area: texto(r.area) || null,
      fechaDespacho: texto(r.fechaDespacho),
    },
    venceEl: texto(c.venceEl) || null,
    fechaRecibido: texto(c.fechaRecibido) || null,
  };
}

export function leerExito(cuerpo: unknown): ExitoRecepcion | null {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>;
  if (c.ok !== true || !texto(c.codigo)) return null;
  const correo = (c.correo && typeof c.correo === 'object' ? c.correo : {}) as Record<string, unknown>;
  const estados = ['enviado', 'simulado', 'no_enviado', 'sin_correo'] as const;
  const estadoCorreo = estados.find((e) => e === correo.estado) ?? 'no_enviado';
  return {
    codigo: texto(c.codigo),
    fechaRecibido: texto(c.fechaRecibido),
    recibidaEn: texto(c.recibidaEn),
    yaRecibida: c.yaRecibida === true,
    correo: { estado: estadoCorreo, a: texto(correo.a) || null },
  };
}

/** Título y texto de una pantalla de error, con el dato del caso. */
export function tituloError(codigo: ErrorPagina): string {
  return codigo === 'enlace_incompleto' ? MENSAJE_ENLACE_INCOMPLETO.titulo : MENSAJES_RECEPCION[codigo].titulo;
}

/**
 * El token del fragmento (`#v1.rec….….…`). No valida la firma —eso es del
 * servidor, que es quien tiene el secreto—, solo descarta lo que no puede ser un
 * token, para no mandarle al servidor cualquier cosa que traiga la URL.
 */
export function tokenDeFragmento(hash: string): string | null {
  let crudo = (hash ?? '').replace(/^#/, '').trim();
  try {
    crudo = decodeURIComponent(crudo);
  } catch {
    // Un `%` suelto: se usa tal cual y que el servidor lo rechace.
  }
  return crudo && crudo.length <= 200 && /^[A-Za-z0-9._-]+$/.test(crudo) ? crudo : null;
}

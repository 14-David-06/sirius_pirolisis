// src/lib/recepcion/recepcion.ts
// ⚠️ SERVER-SIDE ONLY. La recepción de una remisión por enlace: consultar,
// identificar a quien recibe y confirmar. Lo usan las rutas públicas
// `/api/recibir/*` y el reenvío interno del comprobante.
//
// ═══ EL ORDEN ES LA SEGURIDAD ═════════════════════════════════════════════════
// 1. El token se verifica (formato, firma, vencimiento) ANTES de tocar Airtable.
//    Formato o firma inválidos, remisión inexistente y remisión ajena responden el
//    mismo 404: quien no tiene un enlace auténtico no aprende nada.
// 2. Con datos personales nuevos, la PRUEBA de la autorización se guarda antes
//    que los datos (Ley 1581). Sin la tabla, 503 sin escribir nada.
// 3. La remisión pasa a `Entregada` en UN PATCH y se relee después: si la marca
//    `[recibida:ISO]` no es la propia, otra confirmación ganó y esta NO manda
//    correo (409).
// 4. Documento, enlace público, correo y Flujo de caja son best-effort (207): la recepción ya
//    quedó registrada, que es lo que importa, y lo que falte se completa desde la
//    bodega o con `scripts/registrar-remisiones-flujo-caja.ts`.
//
// ═══ LO QUE NUNCA SALE ═══════════════════════════════════════════════════════
// Las respuestas públicas no llevan pasos internos, mensajes de Airtable ni datos
// de terceros: nombre y correo enmascarados, nunca la cédula. Los logs llevan el
// código de la remisión y los pasos `{step, ok, skipped}`, nada personal.

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { config } from '../config';
import { obtenerAreaCliente } from '../areas-cliente-core';
import { resolverRemision, type RemisionBlend } from '../blend-remisiones-core';
import { generarPdfRemision } from '../blend-remision-pdf';
import { CandadoOcupado, conCandado } from '../candado';
import { enviarCorreo, ErrorCorreo, type CorreoSaliente, type ResultadoEnvio } from '../correo/graph.server';
import { fechaBogota } from '../fecha-bogota';
import { registrarRemisionFlujoCaja } from '../flujo-caja-remisiones';
import { publicarDocumentoRemision } from '../remision-documento-s3.server';
import { sanearError } from '../log-seguro';
import {
  adjuntarDocumento,
  agregarMarcaRemision,
  BASE_ORIGEN_PIROLIAPP,
  completarCorreoPersona,
  crearPersonaRemision,
  descargarDocumento,
  ESTADO_REMISION,
  leerPersonas,
  leerRemisionCruda,
  marcarRemisionEntregada,
  nombreCliente,
  TIPO_PERSONA,
  type PersonaRemision,
} from '../remisiones-core';
import {
  correoDeNotas,
  esEstadoRecibible,
  kgRemitidoDeRemision,
  marcaCorreo,
  marcaRecibida,
  NOMBRE_PRODUCTO,
  recibidaDeNotas,
  tipoRemision,
  type RemisionCruda,
} from '../remision-pirolisis.constants';
import { checkRateLimit, ipDeSolicitud } from '@/middleware/rate-limit';
import type { StepResult } from '@/types/step-result';
import { autorizacionesConfiguradas, registrarAutorizacionDatos } from './autorizaciones';
import { correoRecepcion, datosCorreoDesdeRemision, destinatariosRecepcion } from './correo-recepcion';
import {
  enmascararCorreo,
  enmascararNombre,
  esCorreoValido,
  normalizarCedula,
  normalizarCelularCO,
  normalizarCorreo,
  normalizarNombre,
  nombreValido,
} from './datos-personales';
import { verificarEnlaceRecepcion } from './enlace.server';
import { crearDepsFixtures, fixturesHabilitados } from './fixtures';
import {
  candidatosReceptor,
  fusionarCandidatos,
  invalidarCandidatos,
  type CandidatoReceptor,
} from './identidad';
import { TEXTO_AUTORIZACION_DATOS, type ErrorRecepcion } from './textos';
import { huellaToken, type ResultadoToken } from './token';

// ─────────────────────────────────────────────────────────────────────────────
// Dependencias
// ─────────────────────────────────────────────────────────────────────────────

export interface DepsRecepcion {
  ahora(): Date;
  verificarToken(t: string, a: Date): ResultadoToken | { ok: false; motivo: 'no_configurado' };
  leerRemision(recId: string): Promise<RemisionCruda | null>;
  leerPersonas(ids: string[]): Promise<PersonaRemision[]>;
  candidatos(r: RemisionCruda): Promise<CandidatoReceptor[]>;
  /** El alcance cambió (hay un receptor nuevo): la caché de candidatos ya no vale. */
  invalidarCandidatos(recId: string): void;
  nombreCliente(id: string): Promise<string>;
  nombreArea(id: string): Promise<string | null>;
  /** Sin la tabla de autorizaciones, el camino de datos nuevos responde 503. */
  autorizacionesConfiguradas(): boolean;
  registrarAutorizacion: typeof registrarAutorizacionDatos;
  crearPersona: typeof crearPersonaRemision;
  completarCorreo: typeof completarCorreoPersona;
  marcarEntregada: typeof marcarRemisionEntregada;
  resolverRemision(recId: string): Promise<RemisionBlend | null>;
  generarPdf(r: RemisionBlend): Promise<Uint8Array>;
  adjuntar(recId: string, b: Uint8Array, n: string): Promise<void>;
  /** El `-recibida.pdf` archivado, para reenviarlo tal cual. */
  descargarDocumento(recId: string, sufijo: string): Promise<Uint8Array | null>;
  /** La copia pública en S3 y `URL Remision Generada`. Devuelve la URL. */
  publicarDocumento(recId: string, pdf: Uint8Array): Promise<string>;
  enviarCorreo(c: CorreoSaliente): Promise<ResultadoEnvio>;
  marcarCorreo(recId: string, marca: string): Promise<void>;
  /** La copia para finanzas en Flujo de caja. Paso best-effort: nunca lanza. */
  registrarFlujoCaja(r: RemisionBlend, o?: { urlDocumento?: string }): Promise<StepResult>;
}

function depsReales(): DepsRecepcion {
  return {
    ahora: () => new Date(),
    verificarToken: verificarEnlaceRecepcion,
    leerRemision: leerRemisionCruda,
    leerPersonas,
    candidatos: (r) => candidatosReceptor(r),
    invalidarCandidatos,
    nombreCliente,
    nombreArea: async (id) => (await obtenerAreaCliente(id))?.nombre || null,
    autorizacionesConfiguradas,
    registrarAutorizacion: registrarAutorizacionDatos,
    crearPersona: crearPersonaRemision,
    completarCorreo: completarCorreoPersona,
    marcarEntregada: marcarRemisionEntregada,
    resolverRemision,
    generarPdf: (r) => generarPdfRemision(r),
    adjuntar: adjuntarDocumento,
    descargarDocumento,
    publicarDocumento: (id, pdf) => publicarDocumentoRemision(id, pdf),
    enviarCorreo,
    marcarCorreo: agregarMarcaRemision,
    registrarFlujoCaja: registrarRemisionFlujoCaja,
  };
}

/**
 * Las dependencias reales, o las de fixtures si `RECEPCION_FIXTURES=1` FUERA de
 * producción: la página pública se prueba en el celular sin Airtable y sin
 * correo. En producción la variable se ignora.
 */
export function depsRecepcion(): DepsRecepcion {
  return fixturesHabilitados() ? crearDepsFixtures(enviarCorreo) : depsReales();
}

// ─────────────────────────────────────────────────────────────────────────────
// Respuestas
// ─────────────────────────────────────────────────────────────────────────────

export interface RespuestaPublica {
  status: number;
  body: Record<string, unknown>;
}

function fallo(status: number, error: ErrorRecepcion, extra: Record<string, unknown> = {}): RespuestaPublica {
  return { status, body: { ok: false, error, ...extra } };
}

const NO_ENCONTRADA = () => fallo(404, 'enlace_invalido');

function venceElDe(expSeg: number): string {
  return fechaBogota(new Date(expSeg * 1000));
}

/** Token → record ID, o la respuesta de error. Sin tocar Airtable. */
function verificar(
  token: unknown,
  deps: DepsRecepcion,
  ahora: Date
): { ok: true; recordId: string; venceEl: string } | { ok: false; respuesta: RespuestaPublica } {
  if (typeof token !== 'string' || !token) return { ok: false, respuesta: NO_ENCONTRADA() };
  const r = deps.verificarToken(token, ahora);
  if (r.ok) return { ok: true, recordId: r.recordId, venceEl: venceElDe(r.expSeg) };
  if (r.motivo === 'no_configurado') return { ok: false, respuesta: fallo(503, 'no_disponible') };
  if (r.motivo === 'vencido' && r.expSeg) {
    return { ok: false, respuesta: fallo(410, 'enlace_vencido', { venceEl: venceElDe(r.expSeg) }) };
  }
  return { ok: false, respuesta: NO_ENCONTRADA() };
}

/** La remisión, si existe y es de PiroliApp. Una ajena (DataLab) es el mismo 404. */
async function remisionPropia(recId: string, deps: DepsRecepcion): Promise<RemisionCruda | null> {
  const r = await deps.leerRemision(recId);
  return r && tipoRemision(r) ? r : null;
}

function fechaRecibidoDe(r: RemisionCruda): string {
  const instante = recibidaDeNotas(r.notas);
  return r.fechaRecibido || (instante ? fechaBogota(new Date(instante)) : '');
}

/** Respuesta para una remisión que NO está por recibir, o null si sí lo está. */
function porEstado(r: RemisionCruda): RespuestaPublica | null {
  if (esEstadoRecibible(r.estado)) return null;
  if (r.estado === ESTADO_REMISION.cancelada) return fallo(410, 'anulada');
  if (r.estado === ESTADO_REMISION.entregada) {
    const fecha = fechaRecibidoDe(r);
    return fallo(409, 'ya_recibida', fecha ? { fechaRecibido: fecha } : {});
  }
  // Borrador (despacho a medias) o un estado que no conocemos.
  return fallo(409, 'no_despachada');
}

function errorInterno(err: unknown, donde: string): RespuestaPublica {
  if (err instanceof CandadoOcupado) return fallo(503, 'no_disponible');
  console.error(`[recepcion] ${donde}:`, sanearError(err));
  return fallo(500, 'error_interno');
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resumen de la remisión, sin datos personales: código, producto, kg, cliente,
 * área y fecha de despacho. Responde 200 en cualquier estado (`estado` dice cuál)
 * para que la página explique; los errores son del enlace.
 */
export async function consultarRecepcion(token: string, deps: DepsRecepcion = depsRecepcion()): Promise<RespuestaPublica> {
  const ahora = deps.ahora();
  const t = verificar(token, deps, ahora);
  if (!t.ok) return t.respuesta;
  try {
    const r = await remisionPropia(t.recordId, deps);
    if (!r) return NO_ENCONTRADA();
    const tipo = tipoRemision(r)!;
    const [cliente, area] = await Promise.all([
      r.idCliente ? deps.nombreCliente(r.idCliente) : Promise.resolve(''),
      r.idAreaCliente ? deps.nombreArea(r.idAreaCliente).catch(() => null) : Promise.resolve(null),
    ]);

    const estado = esEstadoRecibible(r.estado)
      ? 'pendiente'
      : r.estado === ESTADO_REMISION.entregada
        ? 'recibida'
        : r.estado === ESTADO_REMISION.cancelada
          ? 'anulada'
          : 'no_despachada';
    const fechaRecibido = estado === 'recibida' ? fechaRecibidoDe(r) : '';

    return {
      status: 200,
      body: {
        estado,
        remision: {
          codigo: r.codigo,
          producto: NOMBRE_PRODUCTO[tipo],
          kg: kgRemitidoDeRemision(r)?.kg ?? 0,
          cliente: cliente || r.idCliente,
          area: area || null,
          fechaDespacho: r.fechaDespacho,
        },
        venceEl: t.venceEl,
        textoVersion: TEXTO_AUTORIZACION_DATOS.version,
        ...(fechaRecibido ? { fechaRecibido } : {}),
      },
    };
  } catch (err) {
    return errorInterno(err, 'consultar');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Identificar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿La cédula es de alguien del cliente? `{conocida:true, nombre, correo}`
 * enmascarados, o `{conocida:false}`. Nunca repite la cédula.
 */
export async function identificarReceptor(
  token: string,
  cedula: string,
  deps: DepsRecepcion = depsRecepcion()
): Promise<RespuestaPublica> {
  const ahora = deps.ahora();
  const t = verificar(token, deps, ahora);
  if (!t.ok) return t.respuesta;
  const cedulaNorm = normalizarCedula(cedula);
  if (!cedulaNorm) return fallo(400, 'cedula_invalida');
  try {
    const r = await remisionPropia(t.recordId, deps);
    if (!r) return NO_ENCONTRADA();
    const estado = porEstado(r);
    if (estado) return estado;

    const elegido = fusionarCandidatos(await deps.candidatos(r), cedulaNorm);
    if (!elegido) return { status: 200, body: { conocida: false } };
    return {
      status: 200,
      body: {
        conocida: true,
        nombre: enmascararNombre(elegido.nombre),
        correo: elegido.correo ? enmascararCorreo(elegido.correo) : null,
      },
    };
  } catch (err) {
    return errorInterno(err, 'identificar');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmar
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfirmarInput {
  token: string;
  cedula: string;
  modo: 'conocida' | 'nueva';
  nuevo?: { nombre: string; celular: string; correo: string };
  correo?: string;
  autorizaDatos?: boolean;
  textoVersion?: string;
  meta: { ip: string; userAgent: string };
}

type ResultadoConfirmar = RespuestaPublica & { steps: StepResult[] };

const sinPasos = (r: RespuestaPublica): ResultadoConfirmar => ({ ...r, steps: [] });

type DatosValidados =
  | { modo: 'nueva'; nombre: string; celular: string; correo: string }
  | { modo: 'conocida'; correo: string | null };

/** Valida el cuerpo, sin Airtable. Devuelve el error público o los datos limpios. */
function validarConfirmacion(i: ConfirmarInput): { ok: true; datos: DatosValidados } | { ok: false; respuesta: RespuestaPublica } {
  const vigente = TEXTO_AUTORIZACION_DATOS.version;
  const conAutorizacion = (): RespuestaPublica | null => {
    if (i.autorizaDatos !== true) return fallo(400, 'falta_autorizacion');
    if (i.textoVersion !== vigente) return fallo(409, 'texto_desactualizado');
    return null;
  };

  if (i.modo === 'nueva') {
    const n = i.nuevo && typeof i.nuevo === 'object' ? i.nuevo : null;
    const celular = normalizarCelularCO(n?.celular);
    const campos: string[] = [];
    if (!nombreValido(n?.nombre)) campos.push('nombre');
    if (!celular) campos.push('celular');
    if (!esCorreoValido(n?.correo)) campos.push('correo');
    if (campos.length || !n || !celular) return { ok: false, respuesta: fallo(400, 'datos_invalidos', { campos }) };
    const sinAutorizacion = conAutorizacion();
    if (sinAutorizacion) return { ok: false, respuesta: sinAutorizacion };
    return {
      ok: true,
      datos: { modo: 'nueva', nombre: normalizarNombre(n.nombre), celular, correo: normalizarCorreo(n.correo) },
    };
  }

  if (i.modo === 'conocida') {
    const crudo = typeof i.correo === 'string' ? i.correo.trim() : '';
    if (!crudo) return { ok: true, datos: { modo: 'conocida', correo: null } };
    if (!esCorreoValido(crudo)) return { ok: false, respuesta: fallo(400, 'datos_invalidos', { campos: ['correo'] }) };
    const sinAutorizacion = conAutorizacion();
    if (sinAutorizacion) return { ok: false, respuesta: sinAutorizacion };
    return { ok: true, datos: { modo: 'conocida', correo: normalizarCorreo(crudo) } };
  }

  return { ok: false, respuesta: fallo(400, 'datos_invalidos', { campos: [] }) };
}

/**
 * Una remisión ya Entregada: si la recibió ESTA cédula es un reintento (mala
 * señal, doble toque) y responde 200 `yaRecibida` sin volver a mandar el correo;
 * si fue otra persona, 409.
 */
async function respuestaYaEntregada(r: RemisionCruda, cedula: string, deps: DepsRecepcion): Promise<ResultadoConfirmar> {
  const personas = await deps.leerPersonas(r.personasIds);
  const misma = personas.some((p) => p.tipo === TIPO_PERSONA.receptor && normalizarCedula(p.cedula) === cedula);
  if (!misma) return sinPasos(porEstado(r) ?? fallo(409, 'ya_recibida'));
  return sinPasos({
    status: 200,
    body: {
      ok: true,
      codigo: r.codigo,
      fechaRecibido: fechaRecibidoDe(r),
      recibidaEn: recibidaDeNotas(r.notas) ?? '',
      yaRecibida: true,
      correo: { estado: correoDeNotas(r.notas) ? 'enviado' : 'no_enviado', a: null },
    },
  });
}

/** El receptor a vincular y lo que hay que escribir para tenerlo. */
interface PlanReceptor {
  nombre: string;
  /** El correo al que va el comprobante, o null. */
  correo: string | null;
  /** Datos personales nuevos que exigen la prueba de la autorización. */
  datosNuevos: string[];
  /** Persona existente que se reutiliza (Receptor del alcance). */
  personaId?: string;
  /** Correo a completarle a la persona reutilizada (solo si no tenía). */
  completarCorreo?: string;
  /** Persona a crear (copia Receptor o persona nueva). */
  crear?: Parameters<typeof crearPersonaRemision>[0];
  noSoyYo?: boolean;
}

function planReceptor(
  r: RemisionCruda,
  cedula: string,
  datos: DatosValidados,
  candidatos: CandidatoReceptor[]
): PlanReceptor | null {
  const elegido = fusionarCandidatos(candidatos, cedula);

  if (datos.modo === 'nueva') {
    // Con coincidencia, es «No soy yo»: la persona dice no ser la registrada con
    // esa cédula. Se registra nueva y queda anotado, sin tocar la existente.
    const noSoyYo = Boolean(elegido);
    return {
      nombre: datos.nombre,
      correo: datos.correo,
      datosNuevos: ['nombre', 'cédula', 'celular', 'correo'],
      noSoyYo,
      crear: {
        nombre: datos.nombre,
        cedula,
        tipo: TIPO_PERSONA.receptor,
        correo: datos.correo,
        telefono: datos.celular,
        baseOrigen: BASE_ORIGEN_PIROLIAPP,
        idOrigen: `RECEPCION-ENLACE:${r.codigo}${noSoyYo ? ':NO-SOY-YO' : ''}`,
      },
    };
  }

  if (!elegido) return null;
  // A una persona conocida el comprobante le llega a su dirección REGISTRADA. El
  // correo que escribe solo se usa si no tiene ninguno: dejarle cambiarlo sería
  // dejar que una cédula ajena desvíe los comprobantes de otra persona.
  const registrado = elegido.correo;
  const escrito = registrado ? null : datos.correo;
  const correo = registrado ?? escrito;
  const datosNuevos = escrito ? ['correo'] : [];

  if (elegido.fuente === 'receptor' && elegido.personaId) {
    const propio = candidatos.find((c) => c.personaId === elegido.personaId)?.correo ?? null;
    return {
      nombre: elegido.nombre,
      correo,
      datosNuevos,
      personaId: elegido.personaId,
      ...(escrito && !propio ? { completarCorreo: escrito } : {}),
    };
  }

  // Transportista o Personal Cliente: se crea una COPIA Receptor. Clients Core es
  // solo lectura, y el transportista se queda como transportista.
  const deCliente = elegido.fuente === 'personal-cliente';
  return {
    nombre: elegido.nombre,
    correo,
    datosNuevos,
    crear: {
      nombre: elegido.nombre,
      cedula,
      tipo: TIPO_PERSONA.receptor,
      ...(correo ? { correo } : {}),
      ...(elegido.telefono ? { telefono: elegido.telefono } : {}),
      baseOrigen: deCliente ? 'Sirius Clients Core' : BASE_ORIGEN_PIROLIAPP,
      idOrigen: elegido.codigoOrigen,
    },
  };
}

function hayFalla(steps: StepResult[]): boolean {
  return steps.some((s) => !s.ok && !s.skipped);
}

/**
 * Manda el comprobante y, solo si salió de verdad, deja la marca `[correo:ISO]`.
 * Pasos `correo` y `marca_correo`, best-effort. Nunca lanza.
 */
async function enviarComprobante(
  deps: DepsRecepcion,
  e: {
    remision: RemisionBlend;
    receptor: { nombre: string; cedula: string; correo: string | null };
    recibidaEn: string;
    pdf: Uint8Array | null;
    reenvio?: boolean;
  }
): Promise<{
  steps: StepResult[];
  estado: 'enviado' | 'simulado' | 'no_enviado';
  para: string[];
  sinCorreoReceptor: boolean;
  error?: unknown;
}> {
  const steps: StepResult[] = [];
  const dest = destinatariosRecepcion(e.receptor.correo, config.recepcion.correoCc);
  if (!dest.para.length) {
    steps.push({ step: 'correo', ok: false, skipped: true, error: 'Sin destinatarios' });
    steps.push({ step: 'marca_correo', ok: true, skipped: true });
    return { steps, estado: 'no_enviado', para: [], sinCorreoReceptor: dest.sinCorreoReceptor };
  }

  const datos = {
    ...datosCorreoDesdeRemision(e.remision, e.receptor, e.recibidaEn),
    reenvio: e.reenvio,
    sinCorreoReceptor: dest.sinCorreoReceptor,
  };
  const { asunto, html } = correoRecepcion(datos);
  let resultado: ResultadoEnvio;
  try {
    resultado = await deps.enviarCorreo({
      para: dest.para,
      cc: dest.cc,
      responderA: config.recepcion.correoResponderA,
      asunto,
      html,
      adjuntos: e.pdf
        ? [{ nombre: `${e.remision.codigo}-recibida.pdf`, contentType: 'application/pdf', bytes: e.pdf }]
        : [],
      etiqueta: `${e.reenvio ? 'reenvio' : 'recepcion'}:${e.remision.codigo}`,
    });
  } catch (err) {
    steps.push({ step: 'correo', ok: false, error: sanearError(err) });
    steps.push({ step: 'marca_correo', ok: true, skipped: true });
    return { steps, estado: 'no_enviado', para: dest.para, sinCorreoReceptor: dest.sinCorreoReceptor, error: err };
  }

  if (!resultado.enviado) {
    // Simulado: no salió, así que tampoco hay marca (el panel ofrecerá reenviar).
    steps.push({ step: 'correo', ok: true, skipped: true, detail: { modo: resultado.modo } });
    steps.push({ step: 'marca_correo', ok: true, skipped: true });
    return { steps, estado: 'simulado', para: dest.para, sinCorreoReceptor: dest.sinCorreoReceptor };
  }

  steps.push({ step: 'correo', ok: true, detail: { modo: resultado.modo, destinatarios: resultado.destinatarios } });
  try {
    await deps.marcarCorreo(e.remision.recordId, marcaCorreo(deps.ahora()));
    steps.push({ step: 'marca_correo', ok: true });
  } catch (err) {
    steps.push({ step: 'marca_correo', ok: false, error: sanearError(err) });
  }
  return { steps, estado: 'enviado', para: dest.para, sinCorreoReceptor: dest.sinCorreoReceptor };
}

/**
 * Confirma la recepción. Ver el encabezado del archivo para el orden de los
 * pasos; `steps` va al log, nunca al cuerpo público.
 */
export async function confirmarRecepcion(
  i: ConfirmarInput,
  deps: DepsRecepcion = depsRecepcion()
): Promise<ResultadoConfirmar> {
  const ahora = deps.ahora();
  const t = verificar(i?.token, deps, ahora);
  if (!t.ok) return sinPasos(t.respuesta);

  const cedula = normalizarCedula(i.cedula);
  if (!cedula) return sinPasos(fallo(400, 'cedula_invalida'));
  const v = validarConfirmacion(i);
  if (!v.ok) return sinPasos(v.respuesta);
  const recId = t.recordId;

  try {
    return await conCandado(`recepcion:${recId}`, async () => {
      const steps: StepResult[] = [];
      const r = await remisionPropia(recId, deps);
      if (!r) return sinPasos(NO_ENCONTRADA());
      if (r.estado === ESTADO_REMISION.entregada) return respuestaYaEntregada(r, cedula, deps);
      const estado = porEstado(r);
      if (estado) return sinPasos(estado);

      const plan = planReceptor(r, cedula, v.datos, await deps.candidatos(r));
      if (!plan) return sinPasos(fallo(400, 'requiere_registro'));

      // ── Prueba de la autorización (C, previa a cualquier dato) ──
      if (plan.datosNuevos.length) {
        if (!deps.autorizacionesConfiguradas()) return sinPasos(fallo(503, 'no_disponible'));
        const paso = await deps.registrarAutorizacion({
          remision: r.codigo,
          nombre: plan.nombre,
          cedula,
          datos: plan.datosNuevos,
          ip: i.meta?.ip ?? '',
          userAgent: i.meta?.userAgent ?? '',
          instante: ahora,
        });
        steps.push(paso);
        if (!paso.ok) return { ...fallo(503, 'no_disponible'), steps };
      }

      // ── Receptor (C) ──
      let receptorId: string;
      try {
        if (plan.crear) {
          receptorId = await deps.crearPersona(plan.crear);
          steps.push({ step: 'receptor', ok: true, detail: { creado: true } });
        } else {
          receptorId = plan.personaId!;
          steps.push({ step: 'receptor', ok: true, skipped: true, detail: { reutilizado: true } });
        }
      } catch (err) {
        steps.push({ step: 'receptor', ok: false, error: sanearError(err) });
        return { ...fallo(500, 'error_interno'), steps };
      }
      if (plan.noSoyYo) console.info('[recepcion]', JSON.stringify({ codigo: r.codigo, evento: 'no_soy_yo' }));

      if (plan.completarCorreo) {
        try {
          const escrito = await deps.completarCorreo(receptorId, plan.completarCorreo);
          steps.push({ step: 'correo_persona', ok: true, ...(escrito ? {} : { skipped: true }) });
        } catch (err) {
          steps.push({ step: 'correo_persona', ok: false, error: sanearError(err) });
        }
      }

      // ── Remisión → Entregada (C) ──
      const marca = marcaRecibida(ahora);
      const recibidaEn = recibidaDeNotas(marca)!;
      const fecha = fechaBogota(ahora);
      let entrega: Awaited<ReturnType<typeof marcarRemisionEntregada>>;
      try {
        entrega = await deps.marcarEntregada({ recordId: recId, receptorId, fecha, marca });
      } catch (err) {
        steps.push({ step: 'remision', ok: false, error: sanearError(err) });
        return { ...fallo(500, 'error_interno'), steps };
      }
      if (entrega.resultado === 'carrera') {
        steps.push({ step: 'remision', ok: false, error: 'Otra confirmación ganó la carrera' });
        return { ...fallo(409, 'recibida_por_otra_persona'), steps };
      }
      if (entrega.resultado === 'ya-entregada') {
        const ya = await respuestaYaEntregada(entrega.remision, cedula, deps);
        return { ...ya, steps: [...steps, { step: 'remision', ok: true, skipped: true }] };
      }
      if (entrega.resultado === 'no-recibible') {
        steps.push({ step: 'remision', ok: false, skipped: true, detail: { estado: entrega.remision.estado } });
        return { ...(porEstado(entrega.remision) ?? fallo(409, 'no_despachada')), steps };
      }
      steps.push({ step: 'remision', ok: true });
      deps.invalidarCandidatos(recId);

      // ── Documento (B): el PDF con quien recibió, que REEMPLAZA al del despacho ──
      let remision: RemisionBlend | null = null;
      let pdf: Uint8Array | null = null;
      try {
        remision = await deps.resolverRemision(recId);
        if (!remision) throw new Error('No se pudo releer la remisión');
        pdf = await deps.generarPdf(remision);
        const nombre = `${remision.codigo}-recibida.pdf`;
        await deps.adjuntar(recId, pdf, nombre);
        steps.push({ step: 'documento', ok: true, detail: { archivo: nombre } });
      } catch (err) {
        steps.push({ step: 'documento', ok: false, error: sanearError(err) });
      }

      // ── Enlace público (B): el mismo PDF en S3, para finanzas (Core y Flujo de caja) ──
      let urlDocumento: string | undefined;
      if (pdf) {
        try {
          urlDocumento = await deps.publicarDocumento(recId, pdf);
          steps.push({ step: 'documento_publico', ok: true });
        } catch (err) {
          steps.push({ step: 'documento_publico', ok: false, error: sanearError(err) });
        }
      } else {
        steps.push({ step: 'documento_publico', ok: false, error: 'Sin PDF no hay qué publicar' });
      }

      // ── Correo (B) ──
      let estadoCorreo: 'enviado' | 'simulado' | 'no_enviado' | 'sin_correo' = 'no_enviado';
      if (remision) {
        const envio = await enviarComprobante(deps, {
          remision,
          receptor: { nombre: plan.nombre, cedula, correo: plan.correo },
          recibidaEn,
          pdf,
        });
        steps.push(...envio.steps);
        estadoCorreo = envio.estado;
      } else {
        steps.push({ step: 'correo', ok: false, error: 'Sin la remisión no se puede armar el correo' });
      }
      if (!plan.correo) estadoCorreo = 'sin_correo';

      // ── Flujo de caja (B): el último paso. Con la remisión ya Entregada, finanzas
      // la ve con quien la recibió. Si falla, el script la completa después.
      if (remision) steps.push(await deps.registrarFlujoCaja(remision, { urlDocumento }));
      else steps.push({ step: 'flujo_caja', ok: false, error: 'Sin la remisión no se puede registrar en Flujo de caja' });

      return {
        status: hayFalla(steps) ? 207 : 200,
        body: {
          ok: true,
          codigo: r.codigo,
          fechaRecibido: fecha,
          recibidaEn,
          correo: { estado: estadoCorreo, a: plan.correo ? enmascararCorreo(plan.correo) : null },
        },
        steps,
      };
    });
  } catch (err) {
    return sinPasos(errorInterno(err, 'confirmar'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reenviar (interno, con sesión)
// ─────────────────────────────────────────────────────────────────────────────

/** El Receptor vigente: el de código `PER-REM-` mayor (una reapertura agrega otro). */
function receptorVigente(personas: PersonaRemision[]): PersonaRemision | undefined {
  return personas
    .filter((p) => p.tipo === TIPO_PERSONA.receptor)
    .sort((a, b) => b.codigo.localeCompare(a.codigo, 'es', { numeric: true }))[0];
}

export interface RespuestaInterna {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Reenvía el comprobante de una remisión recibida por enlace. Los destinatarios
 * son los de siempre (el Receptor vinculado y la copia fija): NUNCA vienen del
 * body. Pasos `documento` (el `-recibida.pdf` archivado, o regenerado y
 * adjuntado si falta), `correo` («Reenvío:») y `marca_correo`.
 */
export async function reenviarComprobante(codigo: string, deps: DepsRecepcion = depsRecepcion()): Promise<RespuestaInterna> {
  const r = await deps.leerRemision(codigo);
  if (!r || !tipoRemision(r)) return { status: 404, body: { error: `No existe la remisión ${codigo}` } };
  const recibidaEn = recibidaDeNotas(r.notas);
  if (r.estado !== ESTADO_REMISION.entregada || !recibidaEn) {
    return { status: 409, body: { error: 'La remisión no fue recibida por enlace: no hay comprobante que reenviar', estado: r.estado } };
  }
  const receptor = receptorVigente(await deps.leerPersonas(r.personasIds));
  if (!receptor) return { status: 409, body: { error: 'La remisión no tiene una persona Receptor vinculada' } };
  const remision = await deps.resolverRemision(r.recordId);
  if (!remision) return { status: 404, body: { error: `No existe la remisión ${codigo}` } };

  const steps: StepResult[] = [];
  let pdf: Uint8Array | null = null;
  try {
    pdf = await deps.descargarDocumento(r.recordId, '-recibida.pdf');
  } catch {
    pdf = null;
  }
  if (pdf) {
    steps.push({ step: 'documento', ok: true, skipped: true, detail: { origen: 'archivado' } });
  } else {
    try {
      pdf = await deps.generarPdf(remision);
      await deps.adjuntar(r.recordId, pdf, `${remision.codigo}-recibida.pdf`);
      steps.push({ step: 'documento', ok: true, detail: { origen: 'regenerado' } });
    } catch (err) {
      steps.push({ step: 'documento', ok: false, error: sanearError(err) });
    }
  }

  const correo = esCorreoValido(receptor.email) ? normalizarCorreo(receptor.email) : null;
  const envio = await enviarComprobante(deps, {
    remision,
    receptor: { nombre: receptor.nombre, cedula: receptor.cedula, correo },
    recibidaEn,
    pdf,
    reenvio: true,
  });
  steps.push(...envio.steps);

  if (envio.estado === 'no_enviado') {
    const status = envio.error instanceof ErrorCorreo && envio.error.tipo === 'configuracion' ? 503 : 502;
    const error = envio.error ? sanearError(envio.error) : 'No hay a quién enviar el comprobante';
    return { status, body: { ok: false, error, steps } };
  }
  return {
    status: hayFalla(steps) ? 207 : 200,
    body: {
      ok: true,
      correo: {
        estado: envio.estado,
        para: envio.para.map(enmascararCorreo),
        soloCopia: envio.sinCorreoReceptor,
      },
      steps,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP público
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mismo que pone `next.config.ts`, repetido aquí por si la ruta se sirve sin él. */
export const CABECERAS_PUBLICAS: Record<string, string> = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

/** 4 KB: un cuerpo legítimo mide unos 400 bytes. Lo de más no se parsea. */
export const CUERPO_MAXIMO_BYTES = 4096;

interface Limite {
  windowMs: number;
  maxRequests: number;
}

export interface OpcionesRutaPublica {
  ruta: 'consultar' | 'identificar' | 'confirmar';
  porIp: Limite;
  porToken?: Limite;
}

function json(r: RespuestaPublica, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(r.body, { status: r.status, headers: { ...CABECERAS_PUBLICAS, ...extra } });
}

function demasiados(resetTime: number): NextResponse {
  const segundos = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
  return json(fallo(429, 'demasiados_intentos'), { 'Retry-After': String(segundos) });
}

/**
 * El esqueleto común de `/api/recibir/*`: límite por IP, cuerpo ≤ 4 KB, límite
 * por enlace (la huella del token, nunca el token) y log de pasos sin datos
 * personales. `atender` recibe el cuerpo ya parseado.
 */
export async function atenderPublica(
  request: NextRequest,
  o: OpcionesRutaPublica,
  atender: (cuerpo: Record<string, unknown>, meta: { ip: string; userAgent: string }) => Promise<RespuestaPublica & { steps?: StepResult[] }>
): Promise<NextResponse> {
  const ip = ipDeSolicitud(request);
  const porIp = checkRateLimit(request, o.porIp, `ip:${ip}`);
  if (!porIp.allowed) return demasiados(porIp.resetTime);

  const largo = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(largo) && largo > CUERPO_MAXIMO_BYTES) return json(fallo(413, 'datos_invalidos'));
  let cuerpo: Record<string, unknown>;
  try {
    const texto = await request.text();
    if (Buffer.byteLength(texto, 'utf8') > CUERPO_MAXIMO_BYTES) return json(fallo(413, 'datos_invalidos'));
    const parseado: unknown = JSON.parse(texto);
    if (!parseado || typeof parseado !== 'object' || Array.isArray(parseado)) throw new Error('no es un objeto');
    cuerpo = parseado as Record<string, unknown>;
  } catch {
    return json(fallo(400, 'datos_invalidos', { campos: [] }));
  }

  if (o.porToken) {
    // Con la huella: el límite por enlace sobrevive a rotar de IP, y el token no
    // queda como llave en memoria.
    const porToken = checkRateLimit(request, o.porToken, `token:${huellaToken(String(cuerpo.token ?? ''))}`);
    if (!porToken.allowed) return demasiados(porToken.resetTime);
  }

  let r: RespuestaPublica & { steps?: StepResult[] };
  try {
    r = await atender(cuerpo, { ip, userAgent: request.headers.get('user-agent') ?? '' });
  } catch (err) {
    r = errorInterno(err, o.ruta);
  }
  if (r.steps?.length || r.status >= 500) {
    const codigo = typeof r.body.codigo === 'string' ? r.body.codigo : undefined;
    console.info(
      '[recepcion]',
      JSON.stringify({
        ruta: o.ruta,
        status: r.status,
        ...(codigo ? { codigo } : {}),
        steps: (r.steps ?? []).map((s) => ({ step: s.step, ok: s.ok, ...(s.skipped ? { skipped: true } : {}) })),
      })
    );
  }
  return json({ status: r.status, body: r.body });
}

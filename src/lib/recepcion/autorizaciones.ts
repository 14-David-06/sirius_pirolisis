// src/lib/recepcion/autorizaciones.ts
//
// La prueba de que alguien autorizó el tratamiento de sus datos (Ley 1581 de
// 2012; Decreto 1377 de 2013, art. 8: el responsable debe CONSERVAR la prueba).
//
// Vive en PiroliApp, tabla `Autorizaciones Datos Personales`, de solo inserción, y
// no en un Core: es evidencia de esta app, y los Core se comparten con apps que no
// tienen por qué leerla. Se accede por NOMBRE de campo (la crea
// `scripts/esquema-remisiones-pirolisis.mjs`).
//
// Es un paso CRÍTICO y PREVIO: primero la prueba, después los datos. Al revés,
// un fallo entre los dos dejaría guardados datos personales sin autorización que
// lo respalde. Sin tabla configurada no se escribe nada (503 en la ruta).
//
// No guarda celular ni correo: viven en `Personas`. Duplicarlos aquí sería otra
// copia de datos personales que mantener (y suprimir) sin necesidad.

import { createHash } from 'node:crypto';
import { config } from '../config';
import { sanearError } from '../log-seguro';
import type { StepResult } from '@/types/step-result';
import { normalizarCedula } from './datos-personales';
import { TEXTO_AUTORIZACION_DATOS } from './textos';

export const CAMPOS_AUTORIZACION = {
  referencia: 'Referencia',
  fechaHora: 'Fecha Hora',
  remision: 'Remision',
  nombre: 'Nombre Completo',
  cedula: 'Cedula',
  datos: 'Datos Autorizados',
  version: 'Texto Version',
  sha256: 'Texto SHA256',
  canal: 'Canal',
  ip: 'IP',
  userAgent: 'User Agent',
  revocada: 'Revocada',
  fechaRevocacion: 'Fecha Revocacion',
} as const;

/** Cómo se dio la autorización: la página pública de recepción. */
export const CANAL_RECEPCION = 'Enlace de recepción (PiroliApp)';

const LARGO_USER_AGENT = 200;

export function autorizacionesConfiguradas(): boolean {
  const { baseId, token, autorizacionesDatosTableId } = config.airtable;
  return Boolean(baseId && token && autorizacionesDatosTableId);
}

/**
 * SHA-256 del texto que la persona aceptó. Con la versión sola no basta para
 * probar QUÉ leyó: si alguien corrige el texto sin cambiar la versión, la huella
 * lo delata.
 */
export function huellaTextoAutorizacion(texto: string = TEXTO_AUTORIZACION_DATOS.texto): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/** Los campos de la fila, sin enviarlos. Puro. */
export function camposAutorizacion(e: {
  remision: string;
  nombre: string;
  cedula: string;
  datos: string[];
  ip: string;
  userAgent: string;
  instante: Date;
}): Record<string, unknown> {
  const C = CAMPOS_AUTORIZACION;
  const cedula = normalizarCedula(e.cedula) ?? String(e.cedula ?? '').trim();
  return {
    [C.referencia]: `AUT-${e.remision}-${e.instante.getTime()}`,
    [C.fechaHora]: e.instante.toISOString(),
    [C.remision]: e.remision,
    [C.nombre]: String(e.nombre ?? '').trim(),
    [C.cedula]: cedula,
    [C.datos]: e.datos.join(', '),
    [C.version]: TEXTO_AUTORIZACION_DATOS.version,
    [C.sha256]: huellaTextoAutorizacion(),
    [C.canal]: CANAL_RECEPCION,
    [C.ip]: String(e.ip ?? '').slice(0, 64),
    [C.userAgent]: String(e.userAgent ?? '').slice(0, LARGO_USER_AGENT),
  };
}

/**
 * Inserta la prueba. Paso `autorizacion_datos`. Nunca lanza: devuelve el
 * `StepResult`, y quien llama se detiene si no quedó (`ok: false`).
 */
export async function registrarAutorizacionDatos(e: {
  remision: string;
  nombre: string;
  cedula: string;
  datos: string[];
  ip: string;
  userAgent: string;
  instante: Date;
}): Promise<StepResult> {
  const paso = 'autorizacion_datos';
  if (!autorizacionesConfiguradas()) {
    return { step: paso, ok: false, error: 'Tabla de autorizaciones no configurada: falta AIRTABLE_AUTORIZACIONES_DATOS_TABLE_ID' };
  }
  const { baseId, token, autorizacionesDatosTableId } = config.airtable;
  try {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${autorizacionesDatosTableId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields: camposAutorizacion(e) }] }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // El cuerpo del 422 repite el valor rechazado (nombre, cédula): no viaja.
      return { step: paso, ok: false, error: `Airtable POST ${res.status}` };
    }
    const id = data?.records?.[0]?.id;
    if (!id) return { step: paso, ok: false, error: 'Airtable no devolvió la autorización creada' };
    return { step: paso, ok: true, detail: { version: TEXTO_AUTORIZACION_DATOS.version } };
  } catch (err) {
    return { step: paso, ok: false, error: sanearError(err) };
  }
}

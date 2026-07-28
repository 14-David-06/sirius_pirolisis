import 'server-only';

import { ACTIVOS_FIELD_IDS } from './activos.fields';
import { CONDICIONES_ACTIVO, ESTADOS_OPERATIVO, MENSAJES } from './activos.constants';
import type { CondicionActivo, EstadoOperativo } from '@/types/activos';

/**
 * Traducción y validación del cuerpo de las rutas de escritura.
 *
 * El cliente manda nombres de campo legibles ("Nombre del Activo") y aquí se
 * convierten a field IDs. Validar en un solo sitio evita que `create` y `update`
 * se vayan separando, y evita mandarle a Airtable un PATCH con claves vacías.
 */

/** Campos escribibles de un activo, en el orden en que aparecen en el formulario. */
const CAMPOS_TEXTO = [
  ['Nombre del Activo', ACTIVOS_FIELD_IDS.nombreActivo],
  ['Descripción', ACTIVOS_FIELD_IDS.descripcion],
  ['Número de Serie', ACTIVOS_FIELD_IDS.numeroSerie],
  ['Área Responsable', ACTIVOS_FIELD_IDS.areaResponsable],
  ['Responsable Asignado', ACTIVOS_FIELD_IDS.responsableAsignado],
  ['Proveedor', ACTIVOS_FIELD_IDS.proveedor],
  ['Marca', ACTIVOS_FIELD_IDS.marca],
  ['Modelo', ACTIVOS_FIELD_IDS.modelo],
  ['Notas', ACTIVOS_FIELD_IDS.notas],
] as const;

const CAMPOS_FECHA = [
  ['Fecha de Adquisición', ACTIVOS_FIELD_IDS.fechaAdquisicion],
  ['Fecha de Vencimiento', ACTIVOS_FIELD_IDS.fechaVencimiento],
  ['Próximo Mantenimiento', ACTIVOS_FIELD_IDS.proximoMantenimiento],
] as const;

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface ResultadoPayload {
  fields: Record<string, unknown>;
  errores: string[];
}

function esArrayDeIds(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.every((v) => typeof v === 'string' && v.startsWith('rec'));
}

/**
 * Construye los campos de Airtable a partir del cuerpo recibido.
 *
 * - `modo: 'crear'` exige nombre, tipo, ubicación y estado.
 * - `modo: 'editar'` solo toca las claves presentes en el cuerpo, para que un
 *   formulario parcial no borre lo que no envía.
 */
export function construirCamposActivo(
  body: Record<string, unknown>,
  modo: 'crear' | 'editar'
): ResultadoPayload {
  const fields: Record<string, unknown> = {};
  const errores: string[] = [];

  // — Texto —
  for (const [nombre, fieldId] of CAMPOS_TEXTO) {
    if (body[nombre] === undefined) continue;
    const valor = body[nombre];
    fields[fieldId] = typeof valor === 'string' ? valor.trim() : valor === null ? '' : String(valor);
  }

  const nombreActivo = fields[ACTIVOS_FIELD_IDS.nombreActivo];
  if (modo === 'crear' && !nombreActivo) {
    errores.push(MENSAJES.ERROR.NOMBRE_REQUERIDO);
  }
  if (modo === 'editar' && body['Nombre del Activo'] !== undefined && !nombreActivo) {
    errores.push(MENSAJES.ERROR.NOMBRE_REQUERIDO);
  }

  // — Links (arrays de record IDs) —
  if (body['Tipo de Activo'] !== undefined) {
    const tipos = body['Tipo de Activo'];
    if (!esArrayDeIds(tipos)) {
      errores.push(MENSAJES.ERROR.SELECCIONAR_TIPO);
    } else if (modo === 'crear' && tipos.length === 0) {
      errores.push(MENSAJES.ERROR.SELECCIONAR_TIPO);
    } else {
      fields[ACTIVOS_FIELD_IDS.tipoActivo] = tipos;
    }
  } else if (modo === 'crear') {
    errores.push(MENSAJES.ERROR.SELECCIONAR_TIPO);
  }

  if (body['Ubicación Actual'] !== undefined) {
    const ubicaciones = body['Ubicación Actual'];
    if (!esArrayDeIds(ubicaciones)) {
      errores.push(MENSAJES.ERROR.SELECCIONAR_UBICACION);
    } else if (modo === 'crear' && ubicaciones.length === 0) {
      errores.push(MENSAJES.ERROR.SELECCIONAR_UBICACION);
    } else {
      fields[ACTIVOS_FIELD_IDS.ubicacionActual] = ubicaciones;
    }
  } else if (modo === 'crear') {
    errores.push(MENSAJES.ERROR.SELECCIONAR_UBICACION);
  }

  // — Estado operativo —
  if (body['Estado Operativo'] !== undefined) {
    const estado = String(body['Estado Operativo']);
    if (!(ESTADOS_OPERATIVO as readonly string[]).includes(estado)) {
      errores.push(`Estado operativo no válido: ${estado}`);
    } else {
      fields[ACTIVOS_FIELD_IDS.estadoOperativo] = estado as EstadoOperativo;
    }
  } else if (modo === 'crear') {
    fields[ACTIVOS_FIELD_IDS.estadoOperativo] = 'Operativo' satisfies EstadoOperativo;
  }

  // — Valor de adquisición —
  if (body['Valor de Adquisición'] !== undefined) {
    const valor = body['Valor de Adquisición'];
    if (valor === null || valor === '') {
      fields[ACTIVOS_FIELD_IDS.valorAdquisicion] = null;
    } else {
      const numero = Number(valor);
      if (!Number.isFinite(numero)) {
        errores.push('El valor de adquisición debe ser numérico');
      } else if (numero < 0) {
        errores.push(MENSAJES.ERROR.VALOR_NEGATIVO);
      } else {
        fields[ACTIVOS_FIELD_IDS.valorAdquisicion] = numero;
      }
    }
  }

  // — Fechas —
  for (const [nombre, fieldId] of CAMPOS_FECHA) {
    if (body[nombre] === undefined) continue;
    const valor = body[nombre];
    if (valor === null || valor === '') {
      fields[fieldId] = null;
      continue;
    }
    const fecha = String(valor);
    if (!FORMATO_FECHA.test(fecha) || Number.isNaN(new Date(fecha).getTime())) {
      errores.push(`Fecha no válida en "${nombre}"`);
      continue;
    }
    fields[fieldId] = fecha;
  }

  const adquisicion = fields[ACTIVOS_FIELD_IDS.fechaAdquisicion];
  if (typeof adquisicion === 'string' && adquisicion > new Date().toISOString().split('T')[0]) {
    errores.push(MENSAJES.ERROR.FECHA_ADQUISICION_FUTURA);
  }

  return { fields, errores };
}

/** Valida una condición física contra las opciones reales del `singleSelect`. */
export function validarCondicion(valor: unknown): CondicionActivo | null {
  const condicion = String(valor || '');
  return (CONDICIONES_ACTIVO as readonly string[]).includes(condicion)
    ? (condicion as CondicionActivo)
    : null;
}

"use client";

import type {
  ActivoFijoRecord,
  ActivoFormPayload,
  AsignarActivoPayload,
  BajaActivoPayload,
  DevolverActivoPayload,
  EstadoOperativo,
  TipoActivoOpcion,
  UbicacionOpcion,
} from '@/types/activos';

/**
 * Cliente de las operaciones CRUD de activos.
 *
 * Los formularios llaman a estas funciones en vez de a `fetch` directamente: el
 * mensaje de error se normaliza en un solo lugar (Airtable a veces responde con
 * `error` y a veces con `details`) y las rutas quedan escritas una sola vez.
 */

interface RespuestaApi<T> {
  success?: boolean;
  data?: T;
  error?: string;
  details?: unknown;
  message?: string;
  aviso?: string;
}

/** Convierte una respuesta no-OK en un `Error` con el mensaje más útil disponible. */
async function pedir<T>(url: string, init?: RequestInit): Promise<RespuestaApi<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });

  const resultado = (await response.json().catch(() => null)) as RespuestaApi<T> | null;

  if (!response.ok) {
    const detalle =
      typeof resultado?.details === 'string' ? ` ${resultado.details}` : '';
    throw new Error(`${resultado?.error || `Error ${response.status}`}${detalle}`);
  }

  return resultado || {};
}

// ============================================================================
// CATÁLOGOS
// ============================================================================

export async function listarTiposActivo(): Promise<TipoActivoOpcion[]> {
  const { data } = await pedir<TipoActivoOpcion[]>('/api/activos/tipos-activo/list');
  return data || [];
}

export async function listarUbicaciones(): Promise<UbicacionOpcion[]> {
  const { data } = await pedir<UbicacionOpcion[]>('/api/activos/ubicaciones/list');
  return data || [];
}

// ============================================================================
// CRUD DE ACTIVOS
// ============================================================================

export async function crearActivo(payload: ActivoFormPayload): Promise<ActivoFijoRecord | undefined> {
  const { data } = await pedir<ActivoFijoRecord>('/api/activos/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data;
}

export async function actualizarActivo(
  id: string,
  payload: ActivoFormPayload
): Promise<ActivoFijoRecord | undefined> {
  const { data } = await pedir<ActivoFijoRecord>(`/api/activos/update/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data;
}

/** Cambio rápido de estado (usado desde el detalle). */
export function cambiarEstadoActivo(id: string, estado: EstadoOperativo) {
  return actualizarActivo(id, { 'Estado Operativo': estado });
}

/** Baja lógica: el activo pasa a "Dado de Baja" y conserva su historial. */
export async function darDeBajaActivo(id: string, payload: BajaActivoPayload = {}) {
  const { data } = await pedir<ActivoFijoRecord>(`/api/activos/delete/${id}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  });
  return data;
}

/** Revierte una baja devolviendo el activo a un estado usable. */
export function reactivarActivo(id: string, estado: EstadoOperativo = 'Disponible en Almacén') {
  return actualizarActivo(id, { 'Estado Operativo': estado });
}

// ============================================================================
// CICLO DE VIDA (asignación / devolución)
// ============================================================================

export async function asignarActivo(payload: AsignarActivoPayload) {
  const { data } = await pedir<unknown>('/api/activos/asignar', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data;
}

export async function devolverActivo(payload: DevolverActivoPayload) {
  const respuesta = await pedir<{ activoId: string; asignacionId: string | null }>(
    '/api/activos/devolver',
    { method: 'POST', body: JSON.stringify(payload) }
  );
  return respuesta;
}

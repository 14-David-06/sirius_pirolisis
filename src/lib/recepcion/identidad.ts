// src/lib/recepcion/identidad.ts
//
// ¿Quién es la cédula que escribió quien recibe? Se busca SOLO dentro del alcance
// del cliente de la remisión:
//
//   1. las Personas vinculadas a esta remisión;
//   2. las Personas de otras remisiones del mismo `ID Cliente` (también las de
//      DataLab: es el mismo cliente, y su gente es la misma);
//   3. el Personal Cliente ACTIVO de ese cliente (Clients Core, SOLO lectura).
//
// ═══ POR QUÉ NO EN TODA LA TABLA ════════════════════════════════════════════
// La página es pública. Buscar la cédula en todo `Personas` o en todo Personal
// Cliente convertiría el enlace en un oráculo cédula→nombre de todo el
// ecosistema, que es el defecto de la firma pública del laboratorio. Con el
// alcance del cliente, lo peor que aprende quien tiene un enlace filtrado es si
// una cédula es de alguien de ESE cliente, y solo enmascarado.
//
// Las tres lecturas se hacen siempre (con caché), y la comparación es en JS: el
// tiempo de respuesta no delata si la cédula existe.

import { listarRemisionesCrudas, leerPersonas, TIPO_PERSONA, type PersonaRemision } from '../remisiones-core';
import { listarPersonalCliente, type PersonaCliente } from '../personal-cliente-core';
import type { RemisionCruda } from '../remision-pirolisis.constants';
import { esCorreoValido, normalizarCedula, normalizarCorreo } from './datos-personales';

export type FuenteCandidato = 'receptor' | 'transportista' | 'personal-cliente';

export interface CandidatoReceptor {
  /** Normalizada (`normalizarCedula`): así se compara. */
  cedula: string;
  nombre: string;
  /** Normalizado, o null si no tiene uno válido. */
  correo: string | null;
  telefono: string | null;
  fuente: FuenteCandidato;
  /** Record ID en `Personas` (Remisiones Core). Solo para receptor y transportista. */
  personaId?: string;
  /** `PER-REM-XXXX`, o `CL-XXXX-PER-XXXX` para el Personal Cliente. */
  codigoOrigen: string;
}

/**
 * De dónde se leen las tres fuentes. Inyectable: los fixtures de la recepción y
 * los tests las sirven desde memoria, sin Airtable.
 */
export interface FuentesIdentidad {
  leerPersonas(ids: string[]): Promise<PersonaRemision[]>;
  remisionesDelCliente(idCliente: string): Promise<RemisionCruda[]>;
  /** null = Clients Core sin configurar (se trata como "sin personal"). */
  personalCliente(idCliente: string): Promise<PersonaCliente[] | null>;
}

export const FUENTES_CORE: FuentesIdentidad = {
  leerPersonas,
  remisionesDelCliente: (idCliente) => listarRemisionesCrudas({ cliente: idCliente }),
  personalCliente: listarPersonalCliente,
};

/**
 * Cinco minutos: una persona hace consultar → identificar → confirmar en uno o
 * dos minutos, y cada paso no debe repetir tres lecturas a dos bases (5 req/s por
 * base). Se invalida al confirmar, que es cuando el alcance cambia.
 */
const VIGENCIA_CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { expira: number; candidatos: CandidatoReceptor[] }>();

function correoDe(valor: string | null | undefined): string | null {
  return esCorreoValido(valor) ? normalizarCorreo(valor) : null;
}

function textoONull(valor: string | null | undefined): string | null {
  const t = String(valor ?? '').trim();
  return t || null;
}

function desdePersona(p: PersonaRemision): CandidatoReceptor | null {
  const cedula = normalizarCedula(p.cedula);
  const nombre = String(p.nombre ?? '').trim();
  if (!cedula || !nombre) return null;
  const fuente: FuenteCandidato | null =
    p.tipo === TIPO_PERSONA.receptor ? 'receptor' : p.tipo === TIPO_PERSONA.transportista ? 'transportista' : null;
  if (!fuente) return null;
  return {
    cedula,
    nombre,
    correo: correoDe(p.email),
    telefono: textoONull(p.telefono),
    fuente,
    personaId: p.recordId,
    codigoOrigen: p.codigo,
  };
}

/**
 * El código con que se anota de dónde salió una copia Receptor. Sigue el patrón
 * que ya tiene `Personas.ID Origen` en los datos (`CL-0001-PER-0002`): si el
 * código del Core ya trae el cliente, se usa tal cual.
 */
function codigoPersonalCliente(idCliente: string, codigo: string): string {
  const c = String(codigo ?? '').trim();
  if (!c) return idCliente;
  return c.startsWith('CL-') ? c : `${idCliente}-${c}`;
}

function desdePersonalCliente(idCliente: string, p: PersonaCliente): CandidatoReceptor | null {
  const cedula = normalizarCedula(p.cedula);
  const nombre = String(p.nombre ?? '').trim();
  if (!cedula || !nombre) return null;
  return {
    cedula,
    nombre,
    // `Email Notificacion` primero: es el que el cliente dejó para los avisos.
    correo: correoDe(p.emailNotificacion) ?? correoDe(p.email),
    telefono: textoONull(p.telefono),
    fuente: 'personal-cliente',
    codigoOrigen: codigoPersonalCliente(idCliente, p.codigo),
  };
}

async function leerCandidatos(r: RemisionCruda, f: FuentesIdentidad): Promise<CandidatoReceptor[]> {
  const idCliente = r.idCliente;
  // En paralelo solo entre bases distintas (el límite es 5 req/s POR BASE): las
  // dos lecturas de Remisiones Core van en serie, Clients Core corre a la par.
  const [otras, personal] = await Promise.all([
    idCliente ? f.remisionesDelCliente(idCliente) : Promise.resolve([] as RemisionCruda[]),
    idCliente ? f.personalCliente(idCliente) : Promise.resolve(null),
  ]);
  const ids = new Set<string>(r.personasIds);
  for (const otra of otras) {
    // Por si la lectura trae de más: el alcance es el cliente, no la fórmula.
    if (otra.idCliente !== idCliente) continue;
    for (const id of otra.personasIds) ids.add(id);
  }
  const personas = ids.size ? await f.leerPersonas([...ids]) : [];

  const out: CandidatoReceptor[] = [];
  for (const p of personas) {
    const c = desdePersona(p);
    if (c) out.push(c);
  }
  for (const p of personal ?? []) {
    const c = desdePersonalCliente(idCliente, p);
    if (c) out.push(c);
  }
  return out;
}

/**
 * Las personas del alcance del cliente con su cédula normalizada. Caché de 5
 * minutos por record ID de la remisión. LANZA si una lectura falla: tomar
 * "Airtable no respondió" por "no la conocemos" haría registrar de nuevo a
 * alguien que ya existe.
 */
export async function candidatosReceptor(
  r: RemisionCruda,
  fuentes: FuentesIdentidad = FUENTES_CORE,
  ahoraMs: number = Date.now()
): Promise<CandidatoReceptor[]> {
  const previo = cache.get(r.recordId);
  if (previo && previo.expira > ahoraMs) return previo.candidatos;
  const candidatos = await leerCandidatos(r, fuentes);
  cache.set(r.recordId, { expira: ahoraMs + VIGENCIA_CACHE_MS, candidatos });
  // Sin que el mapa crezca con cada remisión consultada en la vida de la instancia.
  for (const [k, v] of cache) if (v.expira <= ahoraMs) cache.delete(k);
  return candidatos;
}

export function invalidarCandidatos(recordId: string): void {
  cache.delete(recordId);
}

const PRIORIDAD: Record<FuenteCandidato, number> = { receptor: 0, transportista: 1, 'personal-cliente': 2 };

/** Orden de preferencia del CORREO: el que la persona dejó al recibir, luego el del cliente. */
const PRIORIDAD_CORREO: Record<FuenteCandidato, number> = { receptor: 0, 'personal-cliente': 1, transportista: 2 };

function porCodigoDesc(a: CandidatoReceptor, b: CandidatoReceptor): number {
  return b.codigoOrigen.localeCompare(a.codigoOrigen, 'es', { numeric: true });
}

/**
 * La persona que corresponde a `cedulaNorm`, o null. Puro.
 *
 * Si la cédula está en varias fuentes gana Receptor, luego Transportista, luego
 * Personal Cliente: un Receptor se reutiliza tal cual, lo demás obliga a crear una
 * copia. Dentro de cada fuente, el código mayor (el registro más reciente).
 *
 * El correo es el mejor que haya entre TODAS las coincidencias (receptor, Email
 * Notificacion / Email del cliente, transportista): la misma persona puede tener
 * el correo registrado en otra fuente que la elegida.
 */
export function fusionarCandidatos(cs: CandidatoReceptor[], cedulaNorm: string): CandidatoReceptor | null {
  const iguales = cs.filter((c) => c.cedula === cedulaNorm);
  if (!iguales.length) return null;
  const elegido = [...iguales].sort((a, b) => PRIORIDAD[a.fuente] - PRIORIDAD[b.fuente] || porCodigoDesc(a, b))[0];
  const conCorreo = iguales
    .filter((c) => c.correo)
    .sort((a, b) => PRIORIDAD_CORREO[a.fuente] - PRIORIDAD_CORREO[b.fuente] || porCodigoDesc(a, b));
  return {
    ...elegido,
    correo: elegido.correo ?? conCorreo[0]?.correo ?? null,
    telefono: elegido.telefono ?? iguales.find((c) => c.telefono)?.telefono ?? null,
  };
}

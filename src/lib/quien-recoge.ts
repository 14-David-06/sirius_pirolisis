// src/lib/quien-recoge.ts
//
// A quién se le puede ofrecer, en el despacho, como «quién se lleva el pedido».
//
// ═══ POR QUÉ NO BASTA CON CLIENTS CORE ══════════════════════════════════════
// La lista nació solo con el Personal Cliente del Core, y quien recoge no siempre
// está ahí: Claudia Fula se llevó tres remisiones de Guaicaramo (PER-REM-0025) y
// no figura en su personal, así que en cada despacho había que elegir «Otra
// persona» y digitarla de nuevo (2026-11-06). Por eso también se ofrece quien ya
// LLEVÓ o RECIBIÓ una remisión de ESE cliente, leído de `Personas` en Remisiones
// Core.
//
// Es el mismo alcance que ya usa la recepción para identificar
// (`recepcion/identidad.ts`): las remisiones del mismo `ID Cliente`, también las
// de DataLab, porque es la misma gente. Nunca toda la tabla `Personas`: sería un
// directorio de cédulas de todo el ecosistema.
//
// Elegir a alguien de aquí no crea a nadie: `buscarOCrearPersona()` lo encuentra
// por cédula y reutiliza su registro, igual que si se digitara a mano.

import { listarRemisionesCrudas, leerPersonas, TIPO_PERSONA, type PersonaRemision } from './remisiones-core';
import { normalizarCedula } from './recepcion/datos-personales';

/** Una persona que ya pasó por una remisión del cliente, lista para el selector. */
export interface PersonaAnterior {
  /** Record ID en `Personas` (Remisiones Core). */
  recordId: string;
  /** `PER-REM-XXXX`. */
  codigo: string;
  nombre: string;
  cedula: string;
  /** `Transportista` o `Receptor`: en qué papel apareció. */
  tipo: string;
  email: string;
  telefono: string;
}

/**
 * Las personas de remisiones anteriores, una por cédula y sin las que ya están en
 * el Personal Cliente.
 *
 * Una misma persona suele tener DOS filas —una `Transportista` y una copia
 * `Receptor`, que crea la recepción—; se ofrece una sola, y se prefiere la de
 * transportista, que es el papel que se está llenando. Sin cédula válida no se
 * ofrece: el despacho la exige, y elegir a alguien para después tener que
 * digitarle la cédula es lo mismo que digitarlo.
 *
 * Si ya está en Clients Core, gana el Core: es la ficha que el cliente mantiene.
 */
export function personasAnterioresUnicas(
  personas: PersonaRemision[],
  cedulasPersonalCliente: Iterable<string>
): PersonaAnterior[] {
  const yaEnCore = new Set<string>();
  for (const c of cedulasPersonalCliente) {
    const n = normalizarCedula(c);
    if (n) yaEnCore.add(n);
  }

  const porCedula = new Map<string, PersonaAnterior>();
  for (const p of personas) {
    if (p.tipo !== TIPO_PERSONA.transportista && p.tipo !== TIPO_PERSONA.receptor) continue;
    const cedula = normalizarCedula(p.cedula);
    const nombre = String(p.nombre ?? '').trim();
    if (!cedula || !nombre || yaEnCore.has(cedula)) continue;

    const previa = porCedula.get(cedula);
    const candidata: PersonaAnterior = {
      recordId: p.recordId,
      codigo: p.codigo,
      nombre,
      cedula,
      tipo: p.tipo,
      // Una copia puede traer el contacto que a la otra le falta.
      email: String(p.email ?? '').trim() || previa?.email || '',
      telefono: String(p.telefono ?? '').trim() || previa?.telefono || '',
    };
    if (!previa) {
      porCedula.set(cedula, candidata);
    } else if (previa.tipo !== TIPO_PERSONA.transportista && p.tipo === TIPO_PERSONA.transportista) {
      porCedula.set(cedula, candidata);
    } else {
      previa.email ||= candidata.email;
      previa.telefono ||= candidata.telefono;
    }
  }

  return [...porCedula.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Quienes ya llevaron o recibieron una remisión del cliente `CL-XXXX`.
 *
 * Dos lecturas en serie a Remisiones Core (5 req/s por base): las remisiones del
 * cliente y, de una vez, las personas vinculadas a todas.
 */
export async function listarPersonasAnteriores(
  idCliente: string,
  cedulasPersonalCliente: Iterable<string>
): Promise<PersonaAnterior[]> {
  const remisiones = await listarRemisionesCrudas({ cliente: idCliente });
  const ids = new Set<string>();
  for (const r of remisiones) {
    // El alcance es el cliente, no la fórmula: por si la lectura trae de más.
    if (r.idCliente !== idCliente) continue;
    for (const id of r.personasIds) ids.add(id);
  }
  if (!ids.size) return [];
  return personasAnterioresUnicas(await leerPersonas([...ids]), cedulasPersonalCliente);
}

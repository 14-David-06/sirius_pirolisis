// src/lib/log-seguro.ts
//
// Texto de un error apto para los logs y para el cuerpo de una respuesta.
//
// Los errores de Airtable traen la respuesta completa: `at()` de
// blend-remisiones-core.ts mete el JSON en el mensaje, y un 422 repite el valor
// que rechazó (la cédula, el correo). Con la recepción pública esos valores son
// de terceros y los logs de Vercel no son un lugar para datos personales, así que
// todo error que se registra o se devuelve pasa por aquí.

const LARGO_POR_DEFECTO = 300;

/** Cualquier token que contenga `@`: también atrapa correos a medio escribir. */
const CORREO = /[^\s"'<>(),;:[\]{}]+@[^\s"'<>(),;:[\]{}]+/g;

/**
 * Seis dígitos seguidos o más (cédulas y celulares tal como se guardan), o una
 * cifra con dos grupos de miles o más (`1.234.567`, la cédula como se digita).
 *
 * No más que eso, a propósito: los kg con decimales (`1446.98`), los baches
 * (`S-00140 75.00`), las fechas (`2026-10-21`) y los lotes son lo que hace legible
 * un error para el operador, y no son datos personales.
 */
const NUMERO_LARGO = /\d{6,}|\d{1,3}(?:\.\d{3}){2,}(?!\d)/g;

/** Credenciales que nunca deben quedar escritas. */
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const TOKEN_AIRTABLE = /\bpat[A-Za-z0-9]{14}\.[A-Za-z0-9]{20,}/g;
/** El enlace de recepción es una credencial: quien lo tiene puede confirmar. */
const TOKEN_RECEPCION = /v1\.rec[A-Za-z0-9]{14}\.[0-9a-z]{1,8}\.[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/g;

function mensajeDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

/**
 * El mensaje de `e` sin correos, sin números de seis dígitos o más y sin
 * credenciales, en una sola línea y recortado a `max` caracteres.
 *
 * El orden importa: primero los tokens, que contienen dígitos y se partirían a
 * medias con la regla de los números.
 */
export function sanearError(e: unknown, max: number = LARGO_POR_DEFECTO): string {
  const limpio = mensajeDe(e)
    .replace(BEARER, 'Bearer [token]')
    .replace(TOKEN_AIRTABLE, '[token]')
    .replace(TOKEN_RECEPCION, '[token]')
    .replace(CORREO, '[correo]')
    .replace(NUMERO_LARGO, '[número]')
    .replace(/\s+/g, ' ')
    .trim();
  const tope = Math.max(1, Math.floor(max));
  return limpio.length > tope ? `${limpio.slice(0, tope - 1)}…` : limpio;
}

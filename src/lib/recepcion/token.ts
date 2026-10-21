// src/lib/recepcion/token.ts
//
// El token del enlace de recepción: `v1.<recId>.<exp36>.<mac22>`.
//
// Puro: el secreto y la hora llegan como parámetros, así se prueba sin entorno.
// Quién firma y con qué secreto lo decide `enlace.server.ts`. Usa `node:crypto`:
// no se importa desde componentes de cliente (tampoco lo necesitan: la página
// pública solo reenvía el texto del fragmento).
//
// ═══ POR QUÉ ASÍ ═══════════════════════════════════════════════════════════
// - Sin estado. El uso único ya existe y es la fuente de verdad: el `Estado` de
//   la remisión. Al pasar a `Entregada` mueren todos sus enlaces, sin agregarle
//   campos a una base compartida. La revocación de emergencia es rotar el secreto.
// - Atado al record ID y no al código `SIRIUS-REM-…`: los record ID no se
//   reciclan; si la tabla se reimporta, un token viejo da 404, que es fallar seguro.
// - Lo mínimo dentro: ni cliente, ni kg, ni personas. El record ID no es una
//   credencial, leer Airtable exige la API key.
// - MAC de 16 bytes (128 bits) en base64url: 22 caracteres. La URL queda en unos
//   90 y el QR impreso sale pequeño y legible.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { secretoValido } from '../sesion-firma';

export const VERSION_TOKEN = 'v1';

/**
 * Tope de vigencia que se acepta al verificar: 30 días de TTL máximo más el
 * margen hasta el fin del día. Un token que dure más no lo emitió esta app.
 */
export const VIGENCIA_MAXIMA_SEG = 31 * 24 * 60 * 60;

/** Un token válido mide 52 caracteres como mucho: lo de más ni se mira. */
const LARGO_MAXIMO = 64;

const FORMATO = /^v1\.(rec[A-Za-z0-9]{14})\.([1-9a-z][0-9a-z]{0,7})\.([A-Za-z0-9_-]{22})$/;

export type ResultadoToken =
  | { ok: true; recordId: string; expSeg: number }
  | {
      ok: false;
      motivo: 'formato' | 'firma' | 'vencido' | 'vigencia_excesiva';
      /**
       * Solo con `vencido`, para decir «venció el …». Se entrega porque la firma ya
       * se verificó: quien no tiene el token no aprende nada de él.
       */
      expSeg?: number;
    };

/**
 * El prefijo separa este MAC de cualquier otro calculado con el mismo secreto: si
 * el valor se reutilizara para otra firma de la app, lo que esa firmara nunca
 * serviría como enlace de recepción.
 */
function mac(recordId: string, exp36: string, secreto: string): string {
  return createHmac('sha256', secreto)
    .update(`piroliapp|recepcion-remision|${VERSION_TOKEN}|${recordId}|${exp36}`, 'utf8')
    .digest()
    .subarray(0, 16)
    .toString('base64url');
}

/**
 * Firma el enlace de `recordId` hasta `expSeg` (segundos epoch). Lanza con datos
 * inválidos en vez de emitir un token que después no verificaría.
 */
export function firmarTokenRecepcion(recordId: string, expSeg: number, secreto: string): string {
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
    throw new Error('Record ID inválido para el enlace de recepción');
  }
  if (!Number.isSafeInteger(expSeg) || expSeg <= 0) {
    throw new Error('Vencimiento inválido para el enlace de recepción');
  }
  if (!secretoValido(secreto)) {
    throw new Error('El secreto del enlace de recepción necesita al menos 32 caracteres');
  }
  const exp36 = expSeg.toString(36);
  if (exp36.length > 8) throw new Error('Vencimiento inválido para el enlace de recepción');
  return `${VERSION_TOKEN}.${recordId}.${exp36}.${mac(recordId, exp36, secreto)}`;
}

/**
 * Verifica, en este orden y sin tocar Airtable: el formato, la firma contra cada
 * secreto vigente (el actual y, durante una rotación, el anterior) y por último
 * el vencimiento. El orden importa: `vencido` solo se dice de un token auténtico.
 */
export function verificarTokenRecepcion(
  token: string,
  secretos: readonly string[],
  ahoraSeg: number,
  vigenciaMaxSeg: number = VIGENCIA_MAXIMA_SEG
): ResultadoToken {
  const partes = typeof token === 'string' && token.length <= LARGO_MAXIMO ? FORMATO.exec(token) : null;
  if (!partes) return { ok: false, motivo: 'formato' };
  const [, recordId, exp36, macRecibido] = partes;

  // Se compara el TEXTO del MAC y no sus bytes: el último de los 22 caracteres
  // lleva 4 bits de relleno que el decodificador ignora, y comparar bytes
  // aceptaría 16 escrituras distintas del mismo token (y 16 veces los intentos
  // que el límite por token deja pasar).
  const recibido = Buffer.from(macRecibido, 'utf8');
  let valido = false;
  for (const secreto of secretos) {
    // Un secreto corto no verifica nada: dejaría pasar un token firmado con una
    // llave adivinable. Se recorren todos, sin cortar al primer acierto.
    if (!secretoValido(secreto)) continue;
    const esperado = Buffer.from(mac(recordId, exp36, secreto), 'utf8');
    valido = (esperado.length === recibido.length && timingSafeEqual(esperado, recibido)) || valido;
  }
  if (!valido) return { ok: false, motivo: 'firma' };

  const expSeg = parseInt(exp36, 36);
  if (ahoraSeg > expSeg) return { ok: false, motivo: 'vencido', expSeg };
  if (expSeg - ahoraSeg > vigenciaMaxSeg) return { ok: false, motivo: 'vigencia_excesiva' };
  return { ok: true, recordId, expSeg };
}

/**
 * Huella del token para los logs (SHA-256, 8 caracteres hex). Permite seguir un
 * enlace entre emisión y uso sin escribir la credencial: el token completo en un
 * log es un enlace que cualquiera con acceso al log podría usar.
 */
export function huellaToken(token: string): string {
  return createHash('sha256').update(String(token ?? ''), 'utf8').digest('hex').slice(0, 8);
}

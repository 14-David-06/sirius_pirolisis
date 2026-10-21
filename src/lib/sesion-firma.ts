// src/lib/sesion-firma.ts
// Firma HMAC de la cookie de sesión. Puro: solo `node:crypto`, sin leer el
// entorno ni tocar Next, para poder probarlo sin servidor. Con qué secretos se
// firma lo decide `sesion-config.server.ts`.
//
// Hasta 2026-10 la cookie era base64(JSON) sin firma: cualquiera podía escribir
// `{"user":{…}}` con los datos de otro, y «con sesión» valía lo mismo que
// «público» (el PDF de un permiso ajeno, remisiones con cédulas de terceros, los
// enlaces de recepción). Con la firma, el servidor solo cree lo que él escribió.
//
// Formato: `s1.<base64url(json)>.<base64url(HMAC-SHA256(secreto, contexto + b64))>`.
// El MAC cubre el TEXTO base64url y no el JSON decodificado: no hay dos
// escrituras del mismo contenido que pasen con la misma firma.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Versión del formato. Subirla invalida todas las cookies emitidas, que es la
 * forma limpia de forzar un nuevo login si el contenido de la sesión cambia.
 */
export const VERSION_SESION = 's1';

/**
 * Lo que dura una sesión desde el login. Es también el `maxAge` de la cookie,
 * para que el navegador y el servidor la den por vencida a la vez.
 */
export const VIGENCIA_SESION_HORAS = 24;

/**
 * Un HMAC con una llave corta se puede adivinar desde afuera: firmar con ella
 * aparentaría una seguridad que no existe, así que se trata como ausente.
 */
const LARGO_MINIMO_SECRETO = 32;

/**
 * Prefijo del texto firmado. Separa este MAC de cualquier otro calculado con el
 * mismo secreto: si alguien reutilizara el valor en otra firma de la app, lo que
 * firme esa otra nunca serviría como sesión.
 */
const CONTEXTO_MAC = `piroliapp|sesion|${VERSION_SESION}|`;

/** HMAC-SHA256 son 32 bytes: 43 caracteres en base64url sin relleno. */
const LARGO_MAC = 43;

const FORMATO_COOKIE = new RegExp(
  `^${VERSION_SESION}\\.([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]{${LARGO_MAC}})$`
);

/** Un navegador no manda cookies de más de ~4 KB: esto solo evita procesar basura enorme. */
const LARGO_MAXIMO_COOKIE = 8192;

/**
 * Margen para relojes desfasados entre instancias. Sin tope, un `loginTime` en
 * el futuro daría una sesión que no vence nunca.
 */
const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000;

/** Lo que produce `Date#toISOString()`, que es como se escribe `loginTime`. */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function secretoValido(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length >= LARGO_MINIMO_SECRETO;
}

function macDe(b64: string, secreto: string): string {
  return createHmac('sha256', secreto).update(CONTEXTO_MAC + b64, 'utf8').digest('base64url');
}

/** `s1.<b64url>.<mac>`. Con un secreto inválido lanza en vez de firmar con él. */
export function firmarSesion(payloadJson: string, secreto: string): string {
  if (!secretoValido(secreto)) {
    throw new Error(`El secreto de sesión necesita al menos ${LARGO_MINIMO_SECRETO} caracteres`);
  }
  const b64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
  return `${VERSION_SESION}.${b64}.${macDe(b64, secreto)}`;
}

/**
 * El JSON firmado, si lo firmó alguno de los `secretos` (el actual o, durante
 * una rotación, el anterior). Null en cualquier otro caso, incluida la cookie
 * base64(JSON) de antes de la firma.
 */
export function verificarSesion(cookie: string, secretos: readonly string[]): string | null {
  if (typeof cookie !== 'string' || cookie.length > LARGO_MAXIMO_COOKIE) return null;
  const partes = FORMATO_COOKIE.exec(cookie);
  if (!partes) return null;
  const [, b64, mac] = partes;

  // Se compara el texto de la firma y no sus bytes: el último de los 43
  // caracteres lleva 2 bits de relleno que el decodificador ignora, y comparar
  // bytes aceptaría cuatro escrituras distintas de la misma firma.
  const recibida = Buffer.from(mac, 'utf8');
  let valida = false;
  for (const secreto of secretos) {
    // Un secreto corto no verifica nada: si entrara, pasaría una cookie firmada
    // con una llave adivinable.
    if (!secretoValido(secreto)) continue;
    const esperada = Buffer.from(macDe(b64, secreto), 'utf8');
    valida = timingSafeEqual(esperada, recibida) || valida;
  }
  return valida ? Buffer.from(b64, 'base64url').toString('utf8') : null;
}

/**
 * Si la sesión iniciada en `loginTimeIso` sigue viva en `ahora`. Se mira en el
 * servidor porque el `maxAge` de la cookie solo lo respeta el navegador: una
 * cookie copiada seguiría llegando, y sirviendo, después de vencida.
 */
export function sesionVigente(
  loginTimeIso: string,
  ahora: Date,
  maxHoras: number = VIGENCIA_SESION_HORAS
): boolean {
  if (typeof loginTimeIso !== 'string' || !ISO_UTC.test(loginTimeIso)) return false;
  const login = Date.parse(loginTimeIso);
  if (!Number.isFinite(login)) return false;
  const edadMs = ahora.getTime() - login;
  return edadMs >= -TOLERANCIA_RELOJ_MS && edadMs <= maxHoras * 60 * 60 * 1000;
}

// src/lib/sesion-config.server.ts
// ⚠️ SERVER-SIDE ONLY. Con qué secretos se firma y se verifica la cookie de
// sesión (`sesion-firma.ts`). Se leen del entorno en cada llamada, no al
// importar: así un test fija la variable antes de usarla, y el valor nunca pasa
// por `config`, que también se importa desde componentes de cliente.
//
// Sin `SESSION_SECRET` la sesión NO se firma y la cookie sigue siendo la de
// siempre, base64(JSON). Es a propósito (2026-10-21): un despliegue sin la
// variable no puede dejar a la planta sin login. El costo es que «con sesión»
// no autentica, y por eso lo sensible —emitir enlaces de recepción en
// producción— pregunta antes `sesionFirmada()`.
//
// Rotación: el valor viejo pasa a `SESSION_SECRET_ANTERIOR` y el nuevo a
// `SESSION_SECRET`. Se firma con el nuevo y se aceptan los dos; pasadas 24 h
// (lo que dura una sesión) el anterior ya no verifica nada vivo y se quita.

import 'server-only';
import { secretoValido } from './sesion-firma';

/**
 * Avisos ya emitidos, en `globalThis` y no en el módulo: Next puede cargar este
 * archivo más de una vez en el mismo proceso (una por capa o por bundle de
 * ruta), y el aviso debe salir una sola vez por proceso, no en cada petición.
 */
const AVISOS = Symbol.for('piroliapp.sesion.avisos');

function avisarUnaVez(clave: string, mensaje: string): void {
  const registro = globalThis as unknown as Record<symbol, Set<string> | undefined>;
  const emitidos = (registro[AVISOS] ??= new Set<string>());
  if (emitidos.has(clave)) return;
  emitidos.add(clave);
  // Nombra la variable, nunca su valor ni su largo.
  console.error(mensaje);
}

/**
 * Los secretos válidos, el de firmar primero. Vacío: la sesión no se firma.
 *
 * Se recortan los espacios porque pegar el valor en Vercel suele arrastrar un
 * salto de línea, y dos instancias con «el mismo» secreto tienen que firmar
 * igual.
 */
export function secretosSesion(): string[] {
  const actual = process.env.SESSION_SECRET?.trim();
  if (!secretoValido(actual)) {
    avisarUnaVez(
      'sin-secreto',
      actual
        ? 'SESSION_SECRET tiene menos de 32 caracteres: se trata como no configurado y la cookie de sesión no está firmada'
        : 'SESSION_SECRET no configurado: la cookie de sesión no está firmada'
    );
    return [];
  }

  const anterior = process.env.SESSION_SECRET_ANTERIOR?.trim();
  if (!anterior || anterior === actual) return [actual];
  if (!secretoValido(anterior)) {
    // Ignorarlo cierra las sesiones firmadas con él; aceptarlo dejaría pasar
    // cookies firmadas con una llave adivinable.
    avisarUnaVez('anterior-corto', 'SESSION_SECRET_ANTERIOR tiene menos de 32 caracteres: se ignora');
    return [actual];
  }
  return [actual, anterior];
}

/** Si la cookie de sesión va firmada; es decir, si «con sesión» autentica de verdad. */
export function sesionFirmada(): boolean {
  return secretosSesion().length > 0;
}

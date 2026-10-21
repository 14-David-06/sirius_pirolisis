// middleware/rate-limit.ts
// Rate limiting middleware para proteger APIs S3
//
// También limita los endpoints públicos de la recepción de remisiones
// (`/api/recibir/*`), por IP y por enlace (`clave`).
//
// ⚠️ El contador vive en memoria y es POR INSTANCIA: dos funciones de Vercel no lo
// comparten, así que el límite es blando. Alcanza para frenar una ráfaga o un
// script; no es una garantía contra alguien con muchas IP.

import { NextRequest, NextResponse } from 'next/server';

// Store simple en memoria (para producción usar Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 100, // máximo 100 requests por ventana
  s3Specific: {
    windowMs: 5 * 60 * 1000, // 5 minutos para S3
    maxRequests: 20, // máximo 20 requests S3 por ventana
  }
};

/**
 * IP del cliente: la PRIMERA de `x-forwarded-for`.
 *
 * El encabezado acumula una IP por cada proxy (`cliente, proxy1, proxy2`): usarlo
 * entero como llave contaba al mismo cliente por separado según el camino de red.
 * En Vercel la primera es la del cliente y el propio Vercel reescribe el
 * encabezado, así que no se puede falsificar; detrás de otro proxy sí se puede, y
 * el límite por IP sería todavía más blando.
 */
export function ipDeSolicitud(request: NextRequest): string {
  const primera = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return primera || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * @param clave Qué se cuenta. Por defecto, la IP en la ruta. Con `clave`, la
 *   llave es `<ruta>|<clave>`: p. ej. `ip:<ip>` o `token:<huella>` para que un
 *   mismo enlace no se pruebe sin límite rotando IP. Va unida a la ruta para que
 *   dos endpoints con la misma clave no se gasten el cupo el uno al otro.
 */
export function checkRateLimit(
  request: NextRequest,
  options: { windowMs: number; maxRequests: number } = RATE_LIMIT,
  clave?: string
): { allowed: boolean; remaining: number; resetTime: number } {

  const key = clave
    ? `${request.nextUrl.pathname}|${clave}`
    : `${ipDeSolicitud(request)}:${request.nextUrl.pathname}`;
  const now = Date.now();

  const current = rateLimitStore.get(key);

  if (!current || now > current.resetTime) {
    // Primera request o ventana expirada
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + options.windowMs
    });
    return { allowed: true, remaining: options.maxRequests - 1, resetTime: now + options.windowMs };
  }

  if (current.count >= options.maxRequests) {
    return { allowed: false, remaining: 0, resetTime: current.resetTime };
  }

  // Incrementar contador
  current.count++;
  rateLimitStore.set(key, current);

  return {
    allowed: true,
    remaining: options.maxRequests - current.count,
    resetTime: current.resetTime
  };
}

export function createRateLimitResponse(resetTime: number): NextResponse {
  const resetDate = new Date(resetTime).toISOString();

  return new NextResponse(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: 'Demasiadas solicitudes. Intente nuevamente más tarde.',
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Reset': resetDate,
        'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
      },
    }
  );
}

// Cleanup periódica del store (cada 5 minutos)
const limpieza = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
// Sin `unref` el temporizador mantiene vivo el proceso: Jest y los scripts que
// importan una ruta no terminan nunca. En Edge no existe, de ahí el `?.`.
(limpieza as { unref?: () => void }).unref?.();

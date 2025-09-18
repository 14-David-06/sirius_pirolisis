// middleware/rate-limit.ts
// Rate limiting middleware para proteger APIs S3

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

export function checkRateLimit(
  request: NextRequest,
  options: { windowMs: number; maxRequests: number } = RATE_LIMIT
): { allowed: boolean; remaining: number; resetTime: number } {

  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const key = `${ip}:${request.nextUrl.pathname}`;
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
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);
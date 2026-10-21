/**
 * @jest-environment node
 */

/**
 * El limitador en memoria. Lo que se protege: que los llamadores de siempre
 * (sin `clave`) cuenten igual que antes por IP y ruta; que la IP sea la del
 * cliente y no la cadena de proxies; y que con `clave` un mismo enlace no se
 * pueda probar sin límite rotando de IP. IPs de documentación (RFC 5737).
 */

import { NextRequest } from 'next/server';
import { checkRateLimit, createRateLimitResponse, ipDeSolicitud } from '@/middleware/rate-limit';

function peticion(ruta: string, cabeceras: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${ruta}`, { headers: cabeceras });
}

const DOS_POR_MINUTO = { windowMs: 60_000, maxRequests: 2 };

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ipDeSolicitud', () => {
  it('toma la primera IP de x-forwarded-for, que es la del cliente', () => {
    expect(ipDeSolicitud(peticion('/x', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }))).toBe(
      '203.0.113.7'
    );
    expect(ipDeSolicitud(peticion('/x', { 'x-forwarded-for': ' 203.0.113.8 ' }))).toBe('203.0.113.8');
  });

  it('cae a x-real-ip y, sin ninguna, a unknown', () => {
    expect(ipDeSolicitud(peticion('/x', { 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(ipDeSolicitud(peticion('/x'))).toBe('unknown');
  });
});

describe('checkRateLimit', () => {
  it('sin clave cuenta por IP y ruta, como siempre', () => {
    const a = () => peticion('/api/prueba-rl/a', { 'x-forwarded-for': '203.0.113.10' });
    expect(checkRateLimit(a(), DOS_POR_MINUTO)).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkRateLimit(a(), DOS_POR_MINUTO)).toMatchObject({ allowed: true, remaining: 0 });
    expect(checkRateLimit(a(), DOS_POR_MINUTO)).toMatchObject({ allowed: false, remaining: 0 });

    // La misma IP en otra ruta, u otra IP en la misma ruta, tienen su propio cupo.
    expect(
      checkRateLimit(peticion('/api/prueba-rl/b', { 'x-forwarded-for': '203.0.113.10' }), DOS_POR_MINUTO).allowed
    ).toBe(true);
    expect(
      checkRateLimit(peticion('/api/prueba-rl/a', { 'x-forwarded-for': '203.0.113.11' }), DOS_POR_MINUTO).allowed
    ).toBe(true);
  });

  it('las opciones por defecto siguen funcionando para los llamadores actuales', () => {
    const r = checkRateLimit(peticion('/api/prueba-rl/defecto', { 'x-forwarded-for': '203.0.113.12' }));
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(99);
  });

  it('el mismo cliente por proxies distintos gasta un solo cupo', () => {
    const ruta = '/api/prueba-rl/proxies';
    checkRateLimit(peticion(ruta, { 'x-forwarded-for': '203.0.113.20, 10.0.0.1' }), DOS_POR_MINUTO);
    checkRateLimit(peticion(ruta, { 'x-forwarded-for': '203.0.113.20, 10.0.0.2' }), DOS_POR_MINUTO);
    expect(
      checkRateLimit(peticion(ruta, { 'x-forwarded-for': '203.0.113.20, 10.0.0.3' }), DOS_POR_MINUTO).allowed
    ).toBe(false);
  });

  it('con clave cuenta por la clave aunque cambie la IP', () => {
    const ruta = '/api/prueba-rl/identificar';
    const clave = 'token:0a1b2c3d';
    expect(checkRateLimit(peticion(ruta, { 'x-forwarded-for': '203.0.113.30' }), DOS_POR_MINUTO, clave).allowed).toBe(true);
    expect(checkRateLimit(peticion(ruta, { 'x-forwarded-for': '203.0.113.31' }), DOS_POR_MINUTO, clave).allowed).toBe(true);
    expect(checkRateLimit(peticion(ruta, { 'x-forwarded-for': '203.0.113.32' }), DOS_POR_MINUTO, clave).allowed).toBe(false);

    // Otra clave en la misma ruta no comparte el cupo.
    expect(checkRateLimit(peticion(ruta), DOS_POR_MINUTO, 'token:ffffffff').allowed).toBe(true);
  });

  it('la clave va unida a la ruta: dos endpoints no se gastan el cupo el uno al otro', () => {
    const clave = 'ip:203.0.113.40';
    checkRateLimit(peticion('/api/prueba-rl/consultar'), DOS_POR_MINUTO, clave);
    checkRateLimit(peticion('/api/prueba-rl/consultar'), DOS_POR_MINUTO, clave);
    expect(checkRateLimit(peticion('/api/prueba-rl/consultar'), DOS_POR_MINUTO, clave).allowed).toBe(false);
    expect(checkRateLimit(peticion('/api/prueba-rl/confirmar'), DOS_POR_MINUTO, clave).allowed).toBe(true);
  });

  it('la ventana se reinicia al vencer', () => {
    const ahora = jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const ruta = '/api/prueba-rl/ventana';
    checkRateLimit(peticion(ruta), DOS_POR_MINUTO, 'k');
    const segunda = checkRateLimit(peticion(ruta), DOS_POR_MINUTO, 'k');
    expect(segunda.resetTime).toBe(1_800_000_060_000);
    expect(checkRateLimit(peticion(ruta), DOS_POR_MINUTO, 'k').allowed).toBe(false);

    ahora.mockReturnValue(1_800_000_060_001);
    expect(checkRateLimit(peticion(ruta), DOS_POR_MINUTO, 'k')).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('el 429 dice cuándo reintentar', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const respuesta = createRateLimitResponse(1_800_000_090_000);
    expect(respuesta.status).toBe(429);
    expect(respuesta.headers.get('Retry-After')).toBe('90');
    expect(await respuesta.json()).toMatchObject({ retryAfter: 90 });
  });
});

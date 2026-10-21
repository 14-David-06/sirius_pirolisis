/**
 * @jest-environment node
 */

/**
 * La cookie de sesión firmada. Lo que se protege: que con SESSION_SECRET «con
 * sesión» autentique de verdad (nada sin firma, nada alterado, nada de más de
 * 24 h), y que sin él todo siga exactamente como antes, porque un despliegue sin
 * la variable no puede dejar a la planta sin login.
 *
 * Datos inventados: ningún nombre, cédula ni record ID real. Los secretos son de
 * prueba y cada caso fija los suyos (Next no carga `.env.local` con
 * NODE_ENV=test).
 */

import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import {
  VERSION_SESION,
  firmarSesion,
  secretoValido,
  sesionVigente,
  verificarSesion,
} from '@/lib/sesion-firma';
import { secretosSesion } from '@/lib/sesion-config.server';
import { ServerSessionManager, sesionFirmada, type UserSession } from '@/lib/serverSession';
import { GET as getMe } from '@/app/api/me/route';

jest.mock('server-only', () => ({}));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const SECRETO = 'secreto-de-prueba-actual-0123456789abcdef';
const SECRETO_ANTERIOR = 'secreto-de-prueba-anterior-0123456789abcd';
const SECRETO_AJENO = 'secreto-de-otra-app-0123456789abcdefghij';
const SECRETO_CORTO = 's'.repeat(31);

const HORA = 60 * 60 * 1000;
const AVISOS = Symbol.for('piroliapp.sesion.avisos');
const MENSAJE_SIN_SECRETO = 'SESSION_SECRET no configurado: la cookie de sesión no está firmada';

const USUARIO: UserSession['user'] = {
  id: 'recSINTETICO00001',
  Cedula: '1000000001',
  Nombre: 'Persona De Prueba Núñez',
  Apellido: '',
  Email: 'persona.prueba@example.com',
  Telefono: '3000000000',
  Cargo: 'Operario de prueba',
  idPersonalCore: 'SIRIUS-PER-9001',
  idPirolisis: 'recSINTETICO00002',
};

function sesionJson(loginTime: Date = new Date(), user: UserSession['user'] = USUARIO): string {
  return JSON.stringify({ user, loginTime: loginTime.toISOString() });
}

/** La cookie tal como la escribe hoy la app: base64(JSON), sin firma. */
function legada(loginTime: Date = new Date()): string {
  return Buffer.from(sesionJson(loginTime)).toString('base64');
}

/** El MAC calculado a mano con el contrato del formato, para fabricar cookies. */
function macManual(b64: string, secreto: string): string {
  return createHmac('sha256', secreto).update(`piroliapp|sesion|s1|${b64}`, 'utf8').digest('base64url');
}

function peticionCon(valor: string): NextRequest {
  return {
    cookies: {
      get: (nombre: string) => (nombre === 'sirius_session' ? { name: nombre, value: valor } : undefined),
    },
  } as unknown as NextRequest;
}

const cookiesMock = cookies as unknown as jest.Mock;
let almacen: { get: jest.Mock; set: jest.Mock };
let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

const ENV_ORIGINAL = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  SESSION_SECRET_ANTERIOR: process.env.SESSION_SECRET_ANTERIOR,
};

beforeEach(() => {
  delete process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET_ANTERIOR;
  // El aviso es uno por proceso: sin esto, el primer caso se lo gastaría.
  delete (globalThis as unknown as Record<symbol, unknown>)[AVISOS];
  almacen = { get: jest.fn(() => undefined), set: jest.fn() };
  cookiesMock.mockResolvedValue(almacen);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

afterAll(() => {
  for (const [clave, valor] of Object.entries(ENV_ORIGINAL)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
});

/** Inicia sesión con el manager y devuelve lo que escribió en la cookie. */
async function iniciarSesion(): Promise<{ valor: string; opciones: Record<string, unknown> }> {
  await ServerSessionManager.createSecureSession(USUARIO);
  expect(almacen.set).toHaveBeenCalledTimes(1);
  const [nombre, valor, opciones] = almacen.set.mock.calls[0];
  expect(nombre).toBe('sirius_session');
  return { valor, opciones };
}

function textoDeLogs(): string {
  return [...errorSpy.mock.calls, ...warnSpy.mock.calls].flat().map(String).join('\n');
}

describe('secretoValido', () => {
  it('exige al menos 32 caracteres, sin contar los espacios', () => {
    expect(secretoValido('s'.repeat(32))).toBe(true);
    expect(secretoValido(SECRETO_CORTO)).toBe(false);
    expect(secretoValido(`   ${SECRETO_CORTO}   `)).toBe(false);
    expect(secretoValido(' '.repeat(40))).toBe(false);
    expect(secretoValido('')).toBe(false);
    expect(secretoValido(undefined)).toBe(false);
  });
});

describe('firmarSesion / verificarSesion', () => {
  it('ida y vuelta: verifica lo que firmó y devuelve el mismo JSON, tildes incluidas', () => {
    const json = sesionJson();
    const cookie = firmarSesion(json, SECRETO);

    expect(cookie.startsWith(`${VERSION_SESION}.`)).toBe(true);
    expect(cookie).toMatch(/^s1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(verificarSesion(cookie, [SECRETO])).toBe(json);
  });

  it('payload alterado: cambiar la cédula conservando la firma no pasa', () => {
    const [version, , mac] = firmarSesion(sesionJson(), SECRETO).split('.');
    const otro = Buffer.from(sesionJson(new Date(), { ...USUARIO, Cedula: '1000000002' })).toString('base64url');

    expect(verificarSesion(`${version}.${otro}.${mac}`, [SECRETO])).toBeNull();
  });

  it('firma alterada: ningún carácter de la firma se puede cambiar', () => {
    const [version, b64, mac] = firmarSesion(sesionJson(), SECRETO).split('.');

    for (let i = 0; i < mac.length; i++) {
      const alterada = mac.slice(0, i) + (mac[i] === 'A' ? 'B' : 'A') + mac.slice(i + 1);
      expect(verificarSesion(`${version}.${b64}.${alterada}`, [SECRETO])).toBeNull();
    }
  });

  it('la firma no es maleable: los bits de relleno del último carácter también cuentan', () => {
    const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const [version, b64, mac] = firmarSesion(sesionJson(), SECRETO).split('.');
    const ultimo = ALFABETO.indexOf(mac[mac.length - 1]);
    const variante = mac.slice(0, -1) + ALFABETO[ultimo ^ 1];

    // Decodificadas son la misma firma: compararlas por bytes las aceptaría.
    expect(Buffer.from(variante, 'base64url').equals(Buffer.from(mac, 'base64url'))).toBe(true);
    expect(verificarSesion(`${version}.${b64}.${variante}`, [SECRETO])).toBeNull();
  });

  it('secreto ajeno: lo firmado con otra llave no pasa', () => {
    expect(verificarSesion(firmarSesion(sesionJson(), SECRETO_AJENO), [SECRETO])).toBeNull();
  });

  it('rotación: lo firmado con el secreto anterior pasa mientras esté en la lista', () => {
    const json = sesionJson();
    const vieja = firmarSesion(json, SECRETO_ANTERIOR);

    expect(verificarSesion(vieja, [SECRETO, SECRETO_ANTERIOR])).toBe(json);
    expect(verificarSesion(vieja, [SECRETO])).toBeNull();
  });

  it('la cookie legada base64(JSON) no tiene firma y no pasa', () => {
    expect(verificarSesion(legada(), [SECRETO])).toBeNull();
  });

  it('sin secretos no verifica nada', () => {
    expect(verificarSesion(firmarSesion(sesionJson(), SECRETO), [])).toBeNull();
  });

  it('un secreto de menos de 32 caracteres no firma ni verifica', () => {
    expect(() => firmarSesion(sesionJson(), SECRETO_CORTO)).toThrow(/32 caracteres/);

    // La cookie está bien calculada con la llave corta, y aun así no pasa...
    const b64 = Buffer.from(sesionJson()).toString('base64url');
    expect(verificarSesion(`s1.${b64}.${macManual(b64, SECRETO_CORTO)}`, [SECRETO_CORTO])).toBeNull();
    // ...mientras que el mismo cálculo con una llave válida sí: el formato a mano es el correcto.
    expect(verificarSesion(`s1.${b64}.${macManual(b64, SECRETO)}`, [SECRETO])).not.toBeNull();
  });

  it('descarta la basura sin lanzar', () => {
    const mac = 'A'.repeat(43);
    for (const cookie of [
      '',
      's1',
      's1..',
      's1.abc',
      `s1.abc.${mac}.extra`,
      `v1.abc.${mac}`,
      `s1.a b.${mac}`,
      `s1.abc.${mac.slice(1)}`,
      `s1.${'A'.repeat(9000)}.${mac}`,
    ]) {
      expect(verificarSesion(cookie, [SECRETO])).toBeNull();
    }
  });
});

describe('sesionVigente', () => {
  const LOGIN = new Date('2026-10-21T12:00:00.000Z');
  const iso = LOGIN.toISOString();
  const mas = (ms: number) => new Date(LOGIN.getTime() + ms);

  it('vale hasta 24 h después del login, y ni un milisegundo más', () => {
    expect(sesionVigente(iso, mas(23 * HORA))).toBe(true);
    expect(sesionVigente(iso, mas(24 * HORA))).toBe(true);
    expect(sesionVigente(iso, mas(24 * HORA + 1))).toBe(false);
  });

  it('admite otra vigencia', () => {
    expect(sesionVigente(iso, mas(2 * HORA), 1)).toBe(false);
    expect(sesionVigente(iso, mas(30 * 60 * 1000), 1)).toBe(true);
  });

  it('un login en el futuro solo se tolera como desfase de reloj', () => {
    expect(sesionVigente(iso, mas(-60 * 1000))).toBe(true);
    expect(sesionVigente(iso, mas(-2 * HORA))).toBe(false);
  });

  it('una fecha que no es ISO no vale', () => {
    for (const v of ['', 'ayer', '2026-10-21', '2026-13-45T99:99:99.000Z', 12345, null, undefined]) {
      expect(sesionVigente(v as unknown as string, LOGIN)).toBe(false);
    }
  });
});

describe('secretosSesion', () => {
  it('el de firmar va primero; recorta espacios y no repite el anterior si es el mismo', () => {
    process.env.SESSION_SECRET = `  ${SECRETO}\n`;
    process.env.SESSION_SECRET_ANTERIOR = SECRETO;
    expect(secretosSesion()).toEqual([SECRETO]);

    process.env.SESSION_SECRET_ANTERIOR = SECRETO_ANTERIOR;
    expect(secretosSesion()).toEqual([SECRETO, SECRETO_ANTERIOR]);
  });

  it('el anterior solo no activa la firma: sin SESSION_SECRET no hay secretos', () => {
    process.env.SESSION_SECRET_ANTERIOR = SECRETO_ANTERIOR;
    expect(secretosSesion()).toEqual([]);
    expect(sesionFirmada()).toBe(false);
  });
});

describe('ServerSessionManager con SESSION_SECRET', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRETO;
  });

  it('firma la cookie al iniciar sesión, con las mismas opciones, y la lee de vuelta', async () => {
    const { valor, opciones } = await iniciarSesion();

    expect(valor).toMatch(/^s1\./);
    expect(opciones).toMatchObject({ httpOnly: true, sameSite: 'strict', maxAge: 24 * 60 * 60, path: '/' });
    expect((await ServerSessionManager.getSession(peticionCon(valor)))?.user).toEqual(USUARIO);
    expect(sesionFirmada()).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sin request (Server Components) verifica igual lo que trae cookies()', async () => {
    const { valor } = await iniciarSesion();
    const con = (v: string) => (n: string) => (n === 'sirius_session' ? { name: n, value: v } : undefined);

    almacen.get.mockImplementation(con(valor));
    expect((await ServerSessionManager.getSession())?.user.idPersonalCore).toBe('SIRIUS-PER-9001');

    almacen.get.mockImplementation(con(legada()));
    expect(await ServerSessionManager.getSession()).toBeNull();
  });

  it('rechaza la cookie legada sin firma', async () => {
    expect(await ServerSessionManager.getSession(peticionCon(legada()))).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[sesion] cookie rechazada: sin firma');
  });

  it('rechaza un payload alterado aunque conserve la firma original', async () => {
    const { valor } = await iniciarSesion();
    const [version, , mac] = valor.split('.');
    const otro = Buffer.from(sesionJson(new Date(), { ...USUARIO, idPersonalCore: 'SIRIUS-PER-9002' })).toString(
      'base64url'
    );

    expect(await ServerSessionManager.getSession(peticionCon(`${version}.${otro}.${mac}`))).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[sesion] cookie rechazada: firma inválida');
  });

  it('rechaza una cookie firmada con otro secreto', async () => {
    const ajena = firmarSesion(sesionJson(), SECRETO_AJENO);
    expect(await ServerSessionManager.getSession(peticionCon(ajena))).toBeNull();
  });

  it('rechaza una sesión de más de 24 h aunque la firma sea buena', async () => {
    const vieja = firmarSesion(sesionJson(new Date(Date.now() - 25 * HORA)), SECRETO);
    const reciente = firmarSesion(sesionJson(new Date(Date.now() - 23 * HORA)), SECRETO);

    expect(await ServerSessionManager.getSession(peticionCon(vieja))).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[sesion] cookie rechazada: vencida');
    expect(await ServerSessionManager.getSession(peticionCon(reciente))).not.toBeNull();
  });

  it('rechaza un contenido firmado que no tiene forma de sesión', async () => {
    const sinUsuario = firmarSesion(JSON.stringify({ loginTime: new Date().toISOString() }), SECRETO);
    expect(await ServerSessionManager.getSession(peticionCon(sinUsuario))).toBeNull();
  });

  it('rotación: acepta lo firmado con SESSION_SECRET_ANTERIOR y firma lo nuevo con el actual', async () => {
    const vieja = firmarSesion(sesionJson(), SECRETO_ANTERIOR);
    expect(await ServerSessionManager.getSession(peticionCon(vieja))).toBeNull();

    process.env.SESSION_SECRET_ANTERIOR = SECRETO_ANTERIOR;
    expect((await ServerSessionManager.getSession(peticionCon(vieja)))?.user).toEqual(USUARIO);

    const { valor } = await iniciarSesion();
    expect(verificarSesion(valor, [SECRETO])).not.toBeNull();
    expect(verificarSesion(valor, [SECRETO_ANTERIOR])).toBeNull();
  });

  it('un SESSION_SECRET_ANTERIOR corto se ignora: no abre la puerta a cookies firmadas con él', async () => {
    process.env.SESSION_SECRET_ANTERIOR = SECRETO_CORTO;
    const b64 = Buffer.from(sesionJson()).toString('base64url');
    const conLlaveCorta = `s1.${b64}.${macManual(b64, SECRETO_CORTO)}`;

    expect(await ServerSessionManager.getSession(peticionCon(conLlaveCorta))).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('SESSION_SECRET_ANTERIOR tiene menos de 32 caracteres: se ignora');
  });

  it('los logs no llevan el secreto ni el contenido de la cookie', async () => {
    process.env.SESSION_SECRET_ANTERIOR = SECRETO_CORTO;
    const { valor } = await iniciarSesion();
    const [, b64, mac] = valor.split('.');
    const vieja = legada();
    await ServerSessionManager.getSession(peticionCon(`s1.${b64}.${'A'.repeat(43)}`));
    await ServerSessionManager.getSession(peticionCon(vieja));
    await ServerSessionManager.getSession(
      peticionCon(firmarSesion(sesionJson(new Date(Date.now() - 30 * HORA)), SECRETO))
    );

    const logs = textoDeLogs();
    expect(logs).not.toBe('');
    for (const sensible of [SECRETO, SECRETO_CORTO, b64, mac, vieja, USUARIO.Cedula, USUARIO.Email]) {
      expect(logs).not.toContain(sensible);
    }
  });

  it('/api/me: 200 con la cookie que firmó el login; 401 con una alterada o con la de antes', async () => {
    const { valor } = await iniciarSesion();
    const [version, b64, mac] = valor.split('.');
    const alterada = `${version}.${b64}.${mac.slice(0, 10)}${mac[10] === 'A' ? 'B' : 'A'}${mac.slice(11)}`;

    const ok = await getMe(peticionCon(valor));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ cedula: USUARIO.Cedula, idCore: USUARIO.idPersonalCore });

    expect((await getMe(peticionCon(alterada))).status).toBe(401);
    expect((await getMe(peticionCon(legada()))).status).toBe(401);
  });
});

describe('ServerSessionManager sin SESSION_SECRET (compatibilidad)', () => {
  it('crea y lee base64(JSON) exactamente como antes', async () => {
    const { valor, opciones } = await iniciarSesion();

    expect(valor).not.toContain('.');
    expect(JSON.parse(Buffer.from(valor, 'base64').toString())).toMatchObject({ user: USUARIO });
    expect(opciones).toMatchObject({ httpOnly: true, sameSite: 'strict', maxAge: 24 * 60 * 60, path: '/' });
    expect((await ServerSessionManager.getSession(peticionCon(valor)))?.user).toEqual(USUARIO);
  });

  it('acepta la cookie legada que ya tienen los navegadores, sin vigencia en el servidor', async () => {
    expect((await ServerSessionManager.getSession(peticionCon(legada())))?.user).toEqual(USUARIO);
    const deAyer = legada(new Date(Date.now() - 30 * HORA));
    expect((await ServerSessionManager.getSession(peticionCon(deAyer)))?.user).toEqual(USUARIO);
  });

  it('avisa UNA vez por proceso, con el mensaje acordado y sin secretos', async () => {
    await iniciarSesion();
    await ServerSessionManager.getSession(peticionCon(legada()));
    await ServerSessionManager.getSession(peticionCon(legada()));
    expect(sesionFirmada()).toBe(false);
    expect(sesionFirmada()).toBe(false);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(MENSAJE_SIN_SECRETO);
  });

  it('/api/me sigue respondiendo 200 con la cookie de siempre', async () => {
    expect((await getMe(peticionCon(legada()))).status).toBe(200);
  });
});

describe('SESSION_SECRET de menos de 32 caracteres', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRETO_CORTO;
  });

  it('se trata como ausente: no firma, acepta la cookie legada y lo avisa sin el valor', async () => {
    expect(sesionFirmada()).toBe(false);

    const { valor } = await iniciarSesion();
    expect(valor.startsWith(`${VERSION_SESION}.`)).toBe(false);
    expect((await ServerSessionManager.getSession(peticionCon(legada())))?.user).toEqual(USUARIO);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toMatch(/^SESSION_SECRET tiene menos de 32 caracteres/);
    expect(textoDeLogs()).not.toContain(SECRETO_CORTO);
  });
});

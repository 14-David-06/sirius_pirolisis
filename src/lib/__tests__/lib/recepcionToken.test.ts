/**
 * @jest-environment node
 */

/**
 * El token del enlace de recepción. Lo que se protege: que solo verifique lo que
 * firmó esta app con un secreto vigente (nada alterado, nada firmado con otra
 * llave, nada con una llave corta), que un token auténtico venza a su hora, que
 * se pueda rotar el secreto, y que no haya dos escrituras del mismo token.
 * Secretos y record IDs inventados.
 */

import {
  VIGENCIA_MAXIMA_SEG,
  firmarTokenRecepcion,
  huellaToken,
  verificarTokenRecepcion,
} from '@/lib/recepcion/token';

const SECRETO = 'secreto-de-prueba-recepcion-actual-0123456789';
const SECRETO_ANTERIOR = 'secreto-de-prueba-recepcion-anterior-012345';
const SECRETO_AJENO = 'secreto-de-otra-app-0123456789abcdefghijklmn';
const REC = 'recPRUEBA00000001';
const OTRO_REC = 'recPRUEBA00000002';

/** 2026-10-21 12:00 en Bogotá, y el vencimiento siete días después al final del día. */
const AHORA = Date.UTC(2026, 9, 21, 17, 0, 0) / 1000;
const EXP = Date.UTC(2026, 9, 29, 4, 59, 59) / 1000;

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

describe('firmarTokenRecepcion', () => {
  it('tiene el formato v1.<recId>.<exp36>.<mac22> y cabe en un QR pequeño', () => {
    const token = firmarTokenRecepcion(REC, EXP, SECRETO);
    expect(token).toMatch(/^v1\.recPRUEBA00000001\.[1-9a-z][0-9a-z]{0,7}\.[A-Za-z0-9_-]{22}$/);
    expect(token.split('.')[2]).toBe(EXP.toString(36));
    expect(token.length).toBeLessThanOrEqual(52);
  });

  it('es determinista: el mismo recId y vencimiento dan el mismo token', () => {
    expect(firmarTokenRecepcion(REC, EXP, SECRETO)).toBe(firmarTokenRecepcion(REC, EXP, SECRETO));
    expect(firmarTokenRecepcion(REC, EXP, SECRETO)).not.toBe(firmarTokenRecepcion(REC, EXP + 1, SECRETO));
  });

  it('rechaza datos con los que el token no verificaría', () => {
    expect(() => firmarTokenRecepcion('SIRIUS-REM-0001', EXP, SECRETO)).toThrow('Record ID');
    expect(() => firmarTokenRecepcion('recCORTO', EXP, SECRETO)).toThrow('Record ID');
    expect(() => firmarTokenRecepcion(REC, 0, SECRETO)).toThrow('Vencimiento');
    expect(() => firmarTokenRecepcion(REC, 1.5, SECRETO)).toThrow('Vencimiento');
    expect(() => firmarTokenRecepcion(REC, -5, SECRETO)).toThrow('Vencimiento');
  });

  it('no firma con un secreto de menos de 32 caracteres', () => {
    expect(() => firmarTokenRecepcion(REC, EXP, 's'.repeat(31))).toThrow('32 caracteres');
    expect(() => firmarTokenRecepcion(REC, EXP, '')).toThrow('32 caracteres');
  });
});

describe('verificarTokenRecepcion', () => {
  const token = firmarTokenRecepcion(REC, EXP, SECRETO);

  it('ida y vuelta', () => {
    expect(verificarTokenRecepcion(token, [SECRETO], AHORA)).toEqual({ ok: true, recordId: REC, expSeg: EXP });
  });

  it('alterar el recId, el vencimiento o el MAC da «firma»', () => {
    const [v, , exp36, mac] = token.split('.');
    expect(verificarTokenRecepcion([v, OTRO_REC, exp36, mac].join('.'), [SECRETO], AHORA)).toEqual({
      ok: false,
      motivo: 'firma',
    });
    const masTarde = (EXP + 86_400).toString(36);
    expect(verificarTokenRecepcion([v, REC, masTarde, mac].join('.'), [SECRETO], AHORA)).toEqual({
      ok: false,
      motivo: 'firma',
    });
    const otraLetra = mac[0] === 'A' ? 'B' : 'A';
    expect(verificarTokenRecepcion([v, REC, exp36, otraLetra + mac.slice(1)].join('.'), [SECRETO], AHORA)).toEqual({
      ok: false,
      motivo: 'firma',
    });
  });

  it('una escritura distinta del mismo MAC (bits de relleno) no pasa', () => {
    const [v, rec, exp36, mac] = token.split('.');
    const ultimo = ALFABETO.indexOf(mac[21]);
    const gemela = mac.slice(0, 21) + ALFABETO[ultimo ^ 1];
    // Decodifican a los mismos 16 bytes: comparar bytes la aceptaría.
    expect(Buffer.from(gemela, 'base64url').equals(Buffer.from(mac, 'base64url'))).toBe(true);
    expect(verificarTokenRecepcion([v, rec, exp36, gemela].join('.'), [SECRETO], AHORA)).toEqual({
      ok: false,
      motivo: 'firma',
    });
  });

  it('un token firmado con otra llave da «firma»', () => {
    expect(verificarTokenRecepcion(firmarTokenRecepcion(REC, EXP, SECRETO_AJENO), [SECRETO], AHORA)).toEqual({
      ok: false,
      motivo: 'firma',
    });
  });

  it('rotación: lo firmado con el anterior verifica mientras el anterior esté en la lista', () => {
    const viejo = firmarTokenRecepcion(REC, EXP, SECRETO_ANTERIOR);
    expect(verificarTokenRecepcion(viejo, [SECRETO, SECRETO_ANTERIOR], AHORA).ok).toBe(true);
    expect(verificarTokenRecepcion(token, [SECRETO, SECRETO_ANTERIOR], AHORA).ok).toBe(true);
    expect(verificarTokenRecepcion(viejo, [SECRETO], AHORA)).toEqual({ ok: false, motivo: 'firma' });
  });

  it('un secreto corto en la lista no verifica nada, y sin secretos nada verifica', () => {
    expect(verificarTokenRecepcion(token, ['corto', ''], AHORA)).toEqual({ ok: false, motivo: 'firma' });
    expect(verificarTokenRecepcion(token, [], AHORA)).toEqual({ ok: false, motivo: 'firma' });
  });

  it('vence al pasar el último segundo, y entonces dice cuándo venció', () => {
    expect(verificarTokenRecepcion(token, [SECRETO], EXP).ok).toBe(true);
    expect(verificarTokenRecepcion(token, [SECRETO], EXP + 1)).toEqual({ ok: false, motivo: 'vencido', expSeg: EXP });
  });

  it('un vencimiento de más de 31 días no lo emitió esta app', () => {
    const lejano = firmarTokenRecepcion(REC, AHORA + VIGENCIA_MAXIMA_SEG + 1, SECRETO);
    expect(verificarTokenRecepcion(lejano, [SECRETO], AHORA)).toEqual({ ok: false, motivo: 'vigencia_excesiva' });
    const justo = firmarTokenRecepcion(REC, AHORA + VIGENCIA_MAXIMA_SEG, SECRETO);
    expect(verificarTokenRecepcion(justo, [SECRETO], AHORA).ok).toBe(true);
    expect(verificarTokenRecepcion(justo, [SECRETO], AHORA, 60)).toEqual({ ok: false, motivo: 'vigencia_excesiva' });
  });

  it('la firma se mira antes que el vencimiento: de un token falso no se dice que «venció»', () => {
    const falso = firmarTokenRecepcion(REC, EXP, SECRETO_AJENO);
    expect(verificarTokenRecepcion(falso, [SECRETO], EXP + 10)).toEqual({ ok: false, motivo: 'firma' });
  });

  it('todo lo que no tiene el formato da «formato», sin lanzar', () => {
    const [, , exp36, mac] = token.split('.');
    const malos: unknown[] = [
      '',
      'basura',
      token + '.',
      token + 'A',
      ` ${token}`,
      token.replace('v1.', 'v2.'),
      token.replace('v1.', 'V1.'),
      `v1.SIRIUS-REM-0001.${exp36}.${mac}`,
      `v1.${REC}.0${exp36}.${mac}`,
      `v1.${REC}.${exp36.toUpperCase()}.${mac}`,
      `v1.${REC}.${exp36}.${mac.slice(1)}`,
      `v1.${REC}.${exp36}.${mac}=`,
      'v1.' + 'x'.repeat(200),
      null,
      undefined,
      12345,
    ];
    for (const malo of malos) {
      expect(verificarTokenRecepcion(malo as string, [SECRETO], AHORA)).toEqual({ ok: false, motivo: 'formato' });
    }
  });
});

describe('huellaToken', () => {
  it('ocho caracteres hex, estable, distinta por token y sin rastro del token', () => {
    const a = firmarTokenRecepcion(REC, EXP, SECRETO);
    const b = firmarTokenRecepcion(OTRO_REC, EXP, SECRETO);
    expect(huellaToken(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(huellaToken(a)).toBe(huellaToken(a));
    expect(huellaToken(a)).not.toBe(huellaToken(b));
    expect(a).not.toContain(huellaToken(a));
  });
});

/**
 * @jest-environment node
 */

/**
 * `sanearError`: lo que va a los logs y al cuerpo de una respuesta no lleva
 * correos, cédulas ni credenciales, pero sí lo que hace legible un error para el
 * operador (kg, baches, lotes, fechas, códigos). Datos inventados.
 */

import { sanearError } from '@/lib/log-seguro';

describe('sanearError', () => {
  it('quita el correo que un 422 de Airtable repite en su mensaje', () => {
    const e = new Error(
      'Airtable PATCH 422: {"error":{"type":"INVALID_VALUE_FOR_COLUMN","message":"Field \\"Correo Electrónico\\" cannot accept the provided value \\"persona.prueba@example.com\\""}}'
    );
    const limpio = sanearError(e);
    expect(limpio).not.toContain('@');
    expect(limpio).not.toContain('persona.prueba');
    expect(limpio).toContain('[correo]');
    expect(limpio).toContain('INVALID_VALUE_FOR_COLUMN');
  });

  it('quita cédulas y celulares, seguidos o con puntos de miles', () => {
    const limpio = sanearError('Cedula 1000000001, también 1.000.000.002 y celular 3000000000');
    expect(limpio).not.toMatch(/\d{6,}/);
    expect(limpio).not.toContain('1.000.000.002');
    expect(limpio).toBe('Cedula [número], también [número] y celular [número]');
  });

  it('conserva kg, baches, lotes, fechas y códigos de remisión', () => {
    const texto =
      'El reparto suma 1446.98 kg y S-00140 tiene 75.00 kg; lote BLEND-2026-10-21-SIRIUS-PED-0130, ' +
      'remisión SIRIUS-REM-0204, 15.528,45 kg';
    expect(sanearError(texto)).toBe(texto);
  });

  it('quita credenciales: Bearer, token de Airtable y enlace de recepción', () => {
    const limpio = sanearError(
      'Authorization: Bearer abc.DEF-123_xyz== token patPRUEBA00000000.' +
        'f'.repeat(64) +
        ' enlace https://ejemplo.test/recibir#v1.recPRUEBA00000001.mhd2k3l.AAAAAAAAAAAAAAAAAAAA_-'
    );
    expect(limpio).toContain('Bearer [token]');
    expect(limpio).not.toContain('abc.DEF');
    expect(limpio).not.toContain('patPRUEBA');
    expect(limpio).not.toContain('v1.rec');
    expect(limpio).toContain('#[token]');
  });

  it('deja una sola línea y recorta a 300 caracteres por defecto', () => {
    expect(sanearError('uno\n  dos\tTRES')).toBe('uno dos TRES');
    const largo = sanearError('x'.repeat(1000));
    expect(largo).toHaveLength(300);
    expect(largo.endsWith('…')).toBe(true);
    expect(sanearError('y'.repeat(50), 20)).toHaveLength(20);
  });

  it('acepta cualquier cosa que se lance', () => {
    expect(sanearError('texto plano')).toBe('texto plano');
    expect(sanearError({ message: 'objeto con mensaje' })).toBe('objeto con mensaje');
    expect(sanearError({ codigo: 42 })).toBe('{"codigo":42}');
    expect(sanearError(null)).toBe('null');
    expect(sanearError(undefined)).toBe('undefined');
    const circular: Record<string, unknown> = {};
    circular.yo = circular;
    expect(sanearError(circular)).toBe('[object Object]');
  });
});

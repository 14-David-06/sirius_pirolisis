/**
 * Tests de formato y clasificación del módulo de activos.
 * Módulo: src/lib/activos.format.ts
 */

import {
  clasificarVencimiento,
  ESTADO_OPERATIVO_UI,
  estiloEstado,
  formatCantidad,
  formatDias,
  formatFecha,
  formatMoneda,
  formatMonedaCompacta,
  normalizeEstadoOperativo,
} from '@/lib/activos.format';
import { ESTADOS_OPERATIVO } from '@/lib/activos.constants';

describe('formato de cifras', () => {
  it('usa separador de miles local', () => {
    expect(formatCantidad(33614)).toBe('33.614');
    expect(formatCantidad(0)).toBe('0');
  });

  it('tolera valores no finitos', () => {
    expect(formatCantidad(Number.NaN)).toBe('0');
    expect(formatCantidad(Number.POSITIVE_INFINITY)).toBe('0');
  });

  it('formatea pesos sin decimales', () => {
    // El espacio que inserta Intl no es un espacio normal, se normaliza.
    expect(formatMoneda(1_250_000).replace(/ /g, ' ')).toBe('$ 1.250.000');
  });

  it('abrevia montos grandes para los indicadores', () => {
    expect(formatMonedaCompacta(1_250_000)).toBe('$ 1,3 M');
    expect(formatMonedaCompacta(45_000_000_000)).toBe('$ 45 mil M');
    expect(formatMonedaCompacta(0)).toBe('$ 0');
  });
});

describe('formato de fechas y días', () => {
  it('devuelve un guion cuando no hay fecha', () => {
    expect(formatFecha(null)).toBe('—');
    expect(formatFecha('no es fecha')).toBe('—');
  });

  it('formatea una fecha ISO', () => {
    expect(formatFecha('2026-07-27')).toMatch(/2026/);
  });

  it('distingue singular, plural y pasado', () => {
    expect(formatDias(1)).toBe('1 día');
    expect(formatDias(12)).toBe('12 días');
    expect(formatDias(-3)).toBe('hace 3 días');
    expect(formatDias(null)).toBe('—');
  });
});

describe('clasificarVencimiento', () => {
  it('distingue vencido, crítico, próximo y vigente', () => {
    expect(clasificarVencimiento(-1, 30)).toBe('vencido');
    expect(clasificarVencimiento(3, 30)).toBe('critico');
    expect(clasificarVencimiento(20, 30)).toBe('proximo');
    expect(clasificarVencimiento(200, 30)).toBe('vigente');
  });

  it('trata la ausencia de fecha como caso propio, no como vencido', () => {
    expect(clasificarVencimiento(null, 30)).toBe('sin_fecha');
    expect(clasificarVencimiento(undefined, 30)).toBe('sin_fecha');
  });

  it('el día 0 cuenta como crítico, no como vencido', () => {
    expect(clasificarVencimiento(0, 30)).toBe('critico');
  });
});

describe('estados operativos', () => {
  it('cubre todos los estados del singleSelect de Airtable', () => {
    for (const estado of ESTADOS_OPERATIVO) {
      expect(ESTADO_OPERATIVO_UI[estado]).toBeDefined();
    }
  });

  it('normaliza valores desconocidos a Operativo', () => {
    expect(normalizeEstadoOperativo('En Reparación')).toBe('En Reparación');
    expect(normalizeEstadoOperativo('Inventado')).toBe('Operativo');
    expect(normalizeEstadoOperativo(undefined)).toBe('Operativo');
  });

  it('no rompe si Airtable añade un estado nuevo', () => {
    const ui = estiloEstado('Prestado a Guaicaramo');
    expect(ui.label).toBe('Prestado a Guaicaramo');
    expect(ui.badge).toContain('ring');
  });

  it('nunca construye clases de Tailwind dinámicas', () => {
    for (const estado of ESTADOS_OPERATIVO) {
      expect(ESTADO_OPERATIVO_UI[estado].badge).not.toContain('${');
    }
  });
});

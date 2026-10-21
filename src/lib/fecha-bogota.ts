// src/lib/fecha-bogota.ts
//
// Fechas de negocio en Bogotá.
//
// `fechaBogota` y `horaBogota` vienen de `@sirius/solicitudes/fecha`: las exportan
// igual el tgz 1.2.0 que fija package.json y la 1.2.2 instalada. Es la regla que
// ya usa Gestión del Ser, y tener dos implementaciones de «qué día es hoy en
// Colombia» es como se llega a un PDF y un correo que dicen días distintos.
// `new Date().toISOString()` da UTC: después de las 19:00 en Bogotá ya es mañana.
//
// Lo que se agrega aquí es aritmética de calendario sobre `YYYY-MM-DD`, que el
// paquete no trae: sumar días y el fin del día en Bogotá, que fija hasta cuándo
// vale un enlace de recepción.
//
// Sin imports de servidor: lo usan también los formularios del navegador.

import { fechaBogota, horaBogota } from '@sirius/solicitudes/fecha';

export { fechaBogota, horaBogota };

/**
 * Colombia no tiene horario de verano desde 1993: UTC−5 todo el año. Por eso el
 * fin del día se calcula con aritmética y no con `Intl`, que no sabe construir
 * un instante a partir de una hora local.
 */
const DESFASE_BOGOTA_HORAS = 5;

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function partesFecha(fecha: string): [number, number, number] {
  const m = FECHA.exec(typeof fecha === 'string' ? fecha : '');
  if (m) {
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    const t = new Date(Date.UTC(anio, mes - 1, dia));
    // `Date.UTC` convierte el 30 de febrero en 2 de marzo sin avisar: se rechaza
    // en vez de correr la fecha, que movería en silencio el vencimiento.
    if (t.getUTCFullYear() === anio && t.getUTCMonth() === mes - 1 && t.getUTCDate() === dia) {
      return [anio, mes, dia];
    }
  }
  throw new RangeError(`Fecha inválida: "${fecha}" (se espera YYYY-MM-DD)`);
}

/** `fecha` + `dias` días de calendario. Acepta días negativos. */
export function sumarDiasFecha(fecha: string, dias: number): string {
  if (!Number.isInteger(dias)) throw new RangeError(`Días inválidos: ${dias}`);
  const [anio, mes, dia] = partesFecha(fecha);
  // En UTC y sin hora: es aritmética de calendario, no de instantes.
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Último segundo del día `fecha` en Bogotá (23:59:59 −05:00), en segundos epoch. */
export function finDelDiaBogotaSeg(fecha: string): number {
  const [anio, mes, dia] = partesFecha(fecha);
  return Date.UTC(anio, mes - 1, dia, 23 + DESFASE_BOGOTA_HORAS, 59, 59) / 1000;
}

/**
 * `2026-10-28` → «28 de octubre de 2026».
 *
 * Parte el texto en vez de usar `new Date()`: `YYYY-MM-DD` se leería como
 * medianoche UTC, que en Bogotá todavía es el día anterior. Lo que no es una
 * fecha se devuelve tal cual: mejor un dato crudo que uno inventado.
 */
export function fechaLegible(fecha: string): string {
  try {
    const [anio, mes, dia] = partesFecha(fecha);
    return `${dia} de ${MESES[mes - 1]} de ${anio}`;
  } catch {
    return fecha;
  }
}

/**
 * Un instante ISO → «21 de octubre de 2026, 15:04», en hora de Bogotá.
 *
 * Es para instantes (`[recibida:…]`, `Fecha Hora`). Una fecha sola se formatea
 * sin hora: leída como instante caería a las 19:00 del día anterior.
 */
export function fechaHoraBogotaLegible(iso: string): string {
  if (typeof iso !== 'string' || !iso) return '';
  if (FECHA.test(iso)) return fechaLegible(iso);
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return iso;
  return `${fechaLegible(fechaBogota(instante))}, ${horaBogota(instante)}`;
}

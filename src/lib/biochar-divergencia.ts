/**
 * El aviso de divergencia del biochar: UN umbral y UN texto para todas las
 * pantallas.
 *
 * El biochar se lleva en dos vistas a propósito (Sirius Insumos Core es el libro
 * mayor de bodega; la fórmula del bache responde "cuánto queda de ESTE bache").
 * Cuando se separan es porque un consumo se escribió en una y no en la otra, y eso
 * hay que decirlo. Lo que no puede pasar es que cada pantalla use su propio umbral:
 * con los mismos dos números, la bodega diría que el inventario está sano y la
 * agenda que no.
 *
 * Vive aparte de `bodega.constants.ts` porque lo usan tanto el servidor (las
 * advertencias de /api/bodega/materias-primas) como componentes de cliente, y
 * `bodega.constants.ts` importa `config`, que lee env vars ausentes en el cliente.
 */

import { formatCantidad } from './inventario.format';
import type { FuenteBiochar } from '@/types/agenda-blend';

/**
 * Por debajo de 1 kg la diferencia es el redondeo a 2 decimales acumulado en
 * cientos de movimientos; por encima, un consumo escrito en una sola vista.
 */
export const TOLERANCIA_DIVERGENCIA_BIOCHAR_KG = 1;

export function hayDivergenciaBiochar(divergencia: number | null | undefined): boolean {
  return (
    divergencia !== null &&
    divergencia !== undefined &&
    Math.abs(divergencia) > TOLERANCIA_DIVERGENCIA_BIOCHAR_KG
  );
}

/**
 * Aviso de que las dos vistas del biochar no coinciden, o `null` si concuerdan
 * (o si falta una de las dos y no hay nada que contrastar).
 */
export function mensajeDivergenciaBiochar(fuente: FuenteBiochar | null | undefined): string | null {
  if (!fuente || !hayDivergenciaBiochar(fuente.divergencia)) return null;

  return (
    `El stock de biochar de Sirius Insumos Core y el de los baches difieren en ` +
    `${formatCantidad(Math.abs(fuente.divergencia!))} kg (Core ${formatCantidad(fuente.kgCore!)} kg ` +
    `vs baches ${formatCantidad(fuente.kgBaches!)} kg). Algún consumo se registró en una de las dos ` +
    `vistas y no en la otra: revisa que cada Salida de biochar del Core tenga su fila de detalle ` +
    `por bache en PiroliApp.`
  );
}

/**
 * Aviso de que el número mostrado NO viene del Core.
 *
 * Importa decirlo porque el Core es el libro mayor de bodega —lo que dice es lo
 * que se puede despachar— y porque la ficha del biochar afirma "Stock en Sirius
 * Insumos Core": sin este aviso, la pantalla mentiría sobre su propia fuente.
 */
export function mensajeFuenteBiocharDegradada(
  fuente: FuenteBiochar | null | undefined
): string | null {
  if (!fuente || fuente.origen !== 'baches') return null;

  if (fuente.kgBaches === null) {
    return (
      'No se pudo leer el biochar ni en Sirius Insumos Core ni en la tabla de baches: ' +
      'se muestra en 0 y no refleja lo que hay en bodega.'
    );
  }

  return (
    'El biochar se está mostrando desde la tabla de baches porque no se pudo leer Sirius ' +
    'Insumos Core, que es el libro mayor de bodega.'
  );
}

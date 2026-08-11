/**
 * Etiquetas de las materias primas para el texto de la UI.
 *
 * Están aquí y no en `bodega.constants.ts` (que ya tiene el `nombre` de cada una)
 * porque ese módulo importa `config`, y las env vars de la fórmula no existen en el
 * cliente. Aquí solo hay texto, así que lo pueden usar la bodega y la agenda.
 *
 * Llevan el artículo incluido para que la frase "limita el bioabono / limita los
 * biológicos" salga igual en las dos pantallas: son la misma conclusión y no debe
 * parecer otra por estar redactada distinto.
 */

import type { MateriaPrimaKey } from './bodega.constants';

export const ETIQUETA_LIMITANTE: Record<MateriaPrimaKey, string> = {
  biochar: 'el biochar',
  bioabono: 'el bioabono',
  biologicos: 'los biológicos',
};

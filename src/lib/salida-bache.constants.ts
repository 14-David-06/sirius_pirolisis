// src/lib/salida-bache.constants.ts
//
// Contrato compartido de la salida de baches entre el servicio y la UI.
//
// Vive aparte de `salida-bache.ts` A PROPÓSITO: ese módulo arrastra `config`,
// `stock-insumos` y `serverSession`, que no pueden entrar en un bundle de cliente.
// Aquí no hay imports, así que el formulario puede leer los motivos sin llevarse
// medio servidor consigo.

/**
 * Motivos de salida de un bache que NO son producción de Blend.
 *
 * El prefijo entra en la referencia (`SAL-LAB-2026-08-05-S-00171`) para que el
 * motivo se lea en el propio código del movimiento, sin abrir el registro. No hay
 * campo `Motivo` en ninguna de las dos tablas —verificado contra el esquema—, así
 * que el motivo vive en la referencia, en las Observaciones de la remisión y en las
 * notas del Core.
 */
export const MOTIVOS_SALIDA = {
  laboratorio: {
    prefijo: 'LAB',
    etiqueta: 'Laboratorio',
    descripcion: 'El bache se envió a un laboratorio para análisis.',
  },
  muestra: {
    prefijo: 'MUE',
    etiqueta: 'Muestra',
    descripcion: 'Muestra entregada a un cliente o para uso interno.',
  },
  merma: {
    prefijo: 'MER',
    etiqueta: 'Merma',
    descripcion: 'Pérdida, derrame o material descartado.',
  },
  traslado: {
    prefijo: 'TRA',
    etiqueta: 'Traslado',
    descripcion: 'Salida hacia otra área o sede de Sirius.',
  },
  entrega: {
    prefijo: 'ENT',
    etiqueta: 'Entrega con acta',
    descripcion:
      'Entrega sin contraprestación comercial documentada con Acta de Entrega de Biochar.',
  },
} as const;

export type MotivoSalida = keyof typeof MOTIVOS_SALIDA;

export function esMotivoSalida(valor: unknown): valor is MotivoSalida {
  return typeof valor === 'string' && valor in MOTIVOS_SALIDA;
}

/**
 * Referencia de la salida: su identidad y su llave de deduplicación.
 *
 * Determinista a propósito (mismo motivo + misma fecha + mismo bache → misma
 * referencia): reintentar no duplica, agrupa. El costo es que dos salidas del mismo
 * bache al laboratorio el mismo día se leen como una; se acepta porque el escenario
 * real es un bigbag que sale una vez, y el riesgo contrario —descontar dos veces
 * 487 kg— es mucho peor.
 */
export function referenciaSalida(
  motivo: MotivoSalida,
  fecha: string,
  codigoBache: string,
  /**
   * Prefijo alterno cuando la salida pertenece a un documento que ya tiene
   * identidad propia (un acta de entrega, p. ej.). Se le concatena el bache para
   * que cada bache siga teniendo su propia llave: si N baches compartieran una
   * referencia, el chequeo de idempotencia encontraría la primera salida y se
   * saltaría las demás.
   */
  referenciaBase?: string
): string {
  if (referenciaBase?.trim()) return `${referenciaBase.trim()}-${codigoBache}`;
  return `SAL-${MOTIVOS_SALIDA[motivo].prefijo}-${fecha}-${codigoBache}`;
}

/**
 * Marca de la salida en las Observaciones de la remisión.
 *
 * Va entre corchetes por la misma razón que `marcaBache`: `FIND('[SALIDA:…-S-00171]')`
 * no puede confundirse con `S-001710`, que sí pasaría buscando el texto a secas.
 */
export function marcaSalida(referencia: string): string {
  return `[SALIDA:${referencia}]`;
}

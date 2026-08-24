// src/lib/produccion-blend.constants.ts
//
// Contrato compartido de la producción de Blend entre el servicio y la UI.
//
// Vive aparte de `produccion-blend.ts` por la misma razón que
// `salida-bache.constants.ts`: ese módulo arrastra `config` y los clientes de los
// Core, que no pueden entrar en un bundle de cliente. Aquí no hay imports, así que
// el formulario puede armar el lote y leer las llaves sin llevarse medio servidor.

/**
 * Código del lote de producción: la FK simbólica que UNE los movimientos.
 *
 * Es el corazón del modelo del §5 de CLAUDE.md: la producción de Blend no es una
 * fila en una tabla, es este código repetido en las Salidas de biochar, en la
 * Salida de abono, en la Entrada de Blend y en los detalles de PiroliApp. La
 * composición, el CO₂ y los baches se DERIVAN de él; por eso el formato importa y
 * no se improvisa en cada llamada.
 *
 * El sufijo es el pedido (`SIRIUS-PED-0059`) cuando la producción se hace contra
 * uno. Sin él, dos producciones del mismo día colapsarían en el mismo lote — que es
 * exactamente lo que se quiere cuando son la misma corrida en dos tandas, y lo que
 * hay que evitar cuando no lo son.
 */
export function loteDeProduccion(fecha: string, sufijo?: string): string {
  const extra = sufijo?.trim();
  return extra ? `BLEND-${fecha}-${extra}` : `BLEND-${fecha}`;
}

/** ¿Tiene forma de lote de producción? */
export function esLoteBlend(valor: unknown): valor is string {
  return typeof valor === 'string' && /^BLEND-\d{4}-\d{2}-\d{2}(-[\w.-]+)?$/.test(valor.trim());
}

/**
 * Llave de idempotencia del consumo de UN bache dentro del lote.
 *
 * Lleva el bache y no solo el lote: si los N baches de una producción compartieran
 * referencia, el chequeo de duplicados encontraría el primer movimiento y se
 * saltaría los demás — la producción quedaría descontando un solo bache.
 *
 * ⚠️ No confundir con `produccion_destino_id`, que en esos mismos movimientos lleva
 * el lote PELADO: es la FK por la que `getBachesDeLote()` reconstruye qué baches
 * compusieron el despacho. Una es la llave de deduplicación, la otra es la traza.
 */
export function referenciaBacheDeLote(lote: string, codigoBache: string): string {
  return `${lote}-${codigoBache}`;
}

/**
 * Marca del consumo en las Observaciones de la remisión de PiroliApp.
 *
 * Va entre corchetes por la misma razón que `marcaSalida`: `FIND('[PRODUCCION:…-S-00171]')`
 * no puede confundirse con `S-001710`, que sí pasaría buscando el texto a secas.
 */
export function marcaProduccion(referencia: string): string {
  return `[PRODUCCION:${referencia}]`;
}

/** Por debajo de esto un número de kg se considera cero: son restos de redondeo. */
export const TOLERANCIA_KG = 0.01;

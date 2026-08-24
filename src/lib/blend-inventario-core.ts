// src/lib/blend-inventario-core.ts
//
// El libro mayor del BIOCHAR BLEND: Sirius Inventario Production Core.
//
// Es el producto TERMINADO, el otro extremo del mismo libro donde ya viven sus dos
// materias primas (`biochar-inventario-core.ts` y `abono-inventario-core.ts`).
// Producir Blend es, en ese libro, una Salida de biochar puro más una de abono y
// una Entrada de Blend; leerlo desde acá es lo que permite contrastar lo que entró
// como materia prima contra lo que salió como producto.
//
// ═══ SOLO SE ESCRIBE DESDE LA PRODUCCIÓN ══════════════════════════════════════
// La única escritura de este módulo es `registrarEntradaBlend()`, y la llama
// `produccion-blend.ts` como último paso de un lote `BLEND-…` que ya descontó su
// biochar y su abono (ver §5 de CLAUDE.md). Las Salidas las escriben las remisiones.
// Lo que NO puede existir es una entrada suelta: un botón de "ingresar Blend" sería
// producto sin receta, kilos que no descontaron materia prima de nada. Por eso la
// función pide el lote y no una cantidad a secas.
//
// ⚠️ LA FILA DE `Stock_Actual` DEL BLEND ESTÁ ROTA (deuda conocida). Marca 0 kg
// teniendo ~15.528 kg de entradas y ~13.050 de salidas: los movimientos históricos
// que cargó `scripts/blend-core-produccion.mjs` el 2026-07-30 nunca se vincularon
// al campo link `Stock_Actual`, y el saldo es una fórmula sobre los VINCULADOS.
// Por eso `resumenProducto()` expone la `divergencia`: la pantalla muestra los dos
// números y dice cuál no cuadra, en vez de presentar un 0 que se ve creíble.

import { config } from './config';
import {
  crearMovimientoProducto,
  credencialesProducto,
  existeMovimientoConReferencia,
  resumenProducto,
  type CredencialesProducto,
  type MovimientoCreado,
  type ResumenProducto,
} from './inventario-prod-core';

/** Unidad en la que se lleva el Blend. */
export const UNIDAD_BLEND = 'kg';

/**
 * Credenciales del libro mayor para el Biochar Blend, o `null` si falta
 * configuración. `null` es un estado normal para un lector, no un error.
 */
export function credencialesBlend(): CredencialesProducto | null {
  return credencialesProducto(config.airtable.inventarioProdCoreBiocharBlendProductId);
}

/** ¿Está el Blend configurado como producto del Core? */
export function blendConfigurado(): boolean {
  return credencialesBlend() !== null;
}

export type ResumenBlend = ResumenProducto;

/**
 * El resumen que necesita la pantalla de bodega.
 *
 * Agrupa por `Entrada`, al contrario del abono: el Blend se PRODUCE por lote, así
 * que "por lote" responde cuánto Blend salió de cada producción. Agruparlo por las
 * Salidas daría el despacho por remisión, que es otra pregunta y vive en la vista
 * de remisiones.
 */
export async function resumenBlend(): Promise<ResumenBlend | null> {
  return resumenProducto(credencialesBlend(), { agruparPor: 'Entrada' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura: solo la Entrada que cierra una producción
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `documento_referencia` de la Entrada de Blend de un lote. Es su llave de
 * idempotencia, y es el lote pelado: hay UNA entrada de Blend por producción,
 * a diferencia de las salidas de biochar, que son una por bache.
 */
export function referenciaEntradaBlend(lote: string): string {
  return lote;
}

export interface EntradaBlendInput {
  kg: number;
  /** Lote `BLEND-…`. Es la referencia, la traza y la razón de ser de la entrada. */
  lote: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  responsable?: string;
  observaciones?: string;
}

/**
 * Registra la Entrada de Blend producido, salvo que el lote ya la tenga.
 *
 * Devuelve `null` si el Blend no está configurado como producto del Core: es un
 * estado que el llamador debe reportar como paso fallido, no una excepción — la
 * producción ya descontó materia prima y no puede morir aquí.
 */
export async function registrarEntradaBlend(
  input: EntradaBlendInput
): Promise<(MovimientoCreado & { yaExistia?: boolean }) | null> {
  const cred = credencialesBlend();
  if (!cred) return null;

  const referencia = referenciaEntradaBlend(input.lote);
  if (await existeMovimientoConReferencia(cred, referencia)) {
    return { movimientoId: '', cantidad: input.kg, vinculadoAlStock: true, yaExistia: true };
  }

  return crearMovimientoProducto(cred, {
    tipo: 'Entrada',
    cantidad: input.kg,
    unidad: UNIDAD_BLEND,
    documentoReferencia: referencia,
    // `produccion_destino_id` lleva el lote también en la Entrada: es lo que hace que
    // el mismo código junte, en una sola consulta, el biochar que salió, el abono que
    // salió y el Blend que entró.
    produccionDestino: input.lote,
    motivo: `Producción de Biochar Blend — lote ${input.lote}`,
    fecha: input.fecha,
    responsable: input.responsable,
    observaciones: input.observaciones,
  });
}

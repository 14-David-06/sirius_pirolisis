// src/lib/abono-inventario-core.ts
//
// El libro mayor del ABONO 4G: Sirius Inventario Production Core.
//
// ═══ POR QUÉ ESTÁ ACÁ Y NO EN INSUMOS CORE (2026-08-21) ═══════════════════════
// Del 2026-07-27 al 2026-08-21 el abono 4G fue `SIRIUS-INS-0064` en Sirius Insumos
// Core, con un único movimiento: la Entrada de 33.614 kg del conteo físico.
//
// El argumento que sacó al biochar de Insumos Core —un insumo es lo que el área
// COMPRA, y el biochar es lo que la planta PRODUCE— no aplica igual al abono: el
// abono 4G pirólisis lo RECIBE, no lo produce. Lo que lo trae acá es otra cosa: es
// la materia prima del Biochar Blend, y desde que el biochar puro vive en el Core,
// producir Blend es una Salida de biochar y una Entrada de Blend en un mismo libro
// mayor. Dejar el abono en la otra base significaba que esa misma producción tenía
// que descontarse en dos bases distintas, y ningún libro solo alcanzaba a explicar
// de qué está hecho un kg de Blend. Con el abono acá, la receta completa se lee en
// un solo lado.
//
// El insumo viejo quedó en `Inactivo` con un asiento de cierre y su histórico
// intacto; `blendAbono4gRecordId` sigue en `config.ts` SOLO para el script de
// migración y un eventual rollback.
//
// ═══ NO SE TRAZA POR BACHE ════════════════════════════════════════════════════
// A diferencia del biochar, el abono no tiene baches: `bache_origen_id` va vacío.
// Su trazabilidad es el lote de destino (`produccion_destino_id` = `BLEND-…`), que
// es lo que responde "cuánto abono se fue a esta producción".

import { config } from './config';
import {
  credencialesProducto,
  crearMovimientoProducto,
  existeMovimientoConReferencia,
  fetchMovimientosDeProducto,
  getStockDeProducto,
  r2,
  resumenProducto,
  type CredencialesProducto,
  type ResumenProducto,
  type MovimientoProducto,
  type MovimientoCreado,
} from './inventario-prod-core';

/** Unidad en la que se lleva el abono. La misma del insumo que reemplaza. */
export const UNIDAD_ABONO = 'kg';

/**
 * Credenciales del libro mayor para el abono 4G, o `null` si aún no está
 * configurado como producto del Core.
 *
 * `null` es un estado normal, no un error: hasta que corra la migración
 * (`scripts/migrar-abono-inventario-core.mjs`) el producto no existe, y las
 * pantallas deben decir "no configurado" en vez de romperse.
 */
export function credencialesAbono(): CredencialesProducto | null {
  return credencialesProducto(config.airtable.inventarioProdCoreAbono4gProductId);
}

/** ¿Está el abono 4G configurado como producto del Core? */
export function abonoConfigurado(): boolean {
  return credencialesAbono() !== null;
}

/** Saldo de abono 4G en kg según `Stock_Actual`, o `null` si no se puede leer. */
export async function getStockAbono(): Promise<number | null> {
  return getStockDeProducto(credencialesAbono());
}

/** Todos los movimientos de abono 4G, o `null` si no está configurado. */
export async function fetchMovimientosAbono(): Promise<MovimientoProducto[] | null> {
  return fetchMovimientosDeProducto(credencialesAbono());
}

/**
 * El resumen del abono es el genérico del Core: el saldo de `Stock_Actual` y el
 * desglose de sus movimientos. El alias se queda porque es el nombre con el que lo
 * pide la pantalla de bodega.
 */
export type ResumenAbono = ResumenProducto;

/**
 * El resumen que necesita la pantalla de bodega.
 *
 * Agrupa por `Salida`: el abono se CONSUME por lote de Blend, así que "por lote"
 * responde cuánto abono se fue a cada producción.
 */
export async function resumenAbono(): Promise<ResumenAbono | null> {
  return resumenProducto(credencialesAbono(), { agruparPor: 'Salida' });
}

/** `documento_referencia` de una Entrada de abono. Es su llave de idempotencia. */
export function referenciaEntradaAbono(fecha: string, remision?: string): string {
  return remision?.trim() ? `ABONO-${remision.trim()}` : `ABONO-ENTRADA-${fecha}`;
}

/** `documento_referencia` del consumo de abono de una producción de Blend. */
export function referenciaConsumoAbono(lote: string): string {
  return `ABONO-${lote}`;
}

export interface MovimientoAbonoInput {
  tipo: 'Entrada' | 'Salida';
  kg: number;
  documentoReferencia: string;
  motivo: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** Lote `BLEND-…` que lo consumió. Vacío en una Entrada. */
  produccionDestino?: string;
  responsable?: string;
  observaciones?: string;
}

/**
 * Registra un movimiento de abono 4G, salvo que su referencia ya exista.
 *
 * La verificación previa es lo que permite reintentar sin miedo: el abono entra en
 * cargas de miles de kg, así que un doble clic no es un error de redondeo — es un
 * inventario inflado que después nadie sabe de dónde salió.
 */
export async function registrarMovimientoAbono(
  input: MovimientoAbonoInput
): Promise<(MovimientoCreado & { yaExistia?: boolean }) | null> {
  const cred = credencialesAbono();
  if (!cred) return null;

  if (await existeMovimientoConReferencia(cred, input.documentoReferencia)) {
    return { movimientoId: '', cantidad: r2(input.kg), vinculadoAlStock: true, yaExistia: true };
  }

  return crearMovimientoProducto(cred, {
    tipo: input.tipo,
    cantidad: input.kg,
    unidad: UNIDAD_ABONO,
    documentoReferencia: input.documentoReferencia,
    motivo: input.motivo,
    fecha: input.fecha,
    produccionDestino: input.produccionDestino,
    responsable: input.responsable,
    observaciones: input.observaciones,
  });
}

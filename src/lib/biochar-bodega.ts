// src/lib/biochar-bodega.ts
//
// Ingreso del biochar de un bache al inventario (Sirius Inventario Production Core).
//
// REGLA DE NEGOCIO (decisión de David, 2026-07-29): el biochar que está en
// PLANTA no es inventario; solo cuenta el que está en bodega. El sistema de
// baches ya modela ese momento con el estado `Bache Completo Bodega`, así que ese
// cambio de estado es el que registra la Entrada del biochar.
//
// ⚠️ CAMBIO 2026-08-21: la Entrada ya NO va a Sirius Insumos Core. El biochar es un
// PRODUCTO de pirólisis (`SIRIUS-PRODUCT-0015`), no un insumo que el área compra,
// así que su libro mayor es Sirius Inventario Production Core — la misma base donde
// ya vivía el Blend que alimenta. Los detalles y el por qué están en
// `src/lib/biochar-inventario-core.ts`.
//
// El bache NO deja de existir ni pierde su biochar: sigue siendo la unidad de
// trazabilidad (es lo que sostiene la contabilidad de carbono). El movimiento del
// Core es la vista de bodega del mismo material.

import {
  crearMovimientoBiocharPuro,
  credencialesBiocharPuro,
  existeEntradaDeBache,
  referenciaEntradaBodega,
} from './biochar-inventario-core';

/** Estado del bache que significa "el biochar ya está en bodega". */
export const ESTADO_BACHE_BODEGA = 'Bache Completo Bodega';

export interface EntradaBiocharResult {
  ok: boolean;
  /** true si el movimiento ya existía y no se creó otro. */
  yaExistia?: boolean;
  /** true si la operación se omitió por configuración o por no haber kg. */
  omitido?: boolean;
  movimientoId?: string;
  cantidad?: number;
  /** `documento_referencia` del movimiento: la llave de idempotencia. */
  referencia?: string;
  motivo?: string;
  error?: string;
}

export interface RegistrarEntradaBiocharInput {
  /** Código legible del bache (`Codigo Bache`); es la llave de idempotencia. */
  codigoBache: string;
  /** KG de biochar seco que entran a bodega (`Total Cantidad Actual Biochar Seco`). */
  kg: number;
  /** Quién realiza el registro (nombre legible, para los logs y el movimiento). */
  realizaRegistro?: string;
  /** `YYYY-MM-DD` del ingreso. Por defecto hoy. */
  fecha?: string;
}

/**
 * Registra la Entrada del biochar de un bache en el libro mayor.
 *
 * Es idempotente por `codigoBache`: la llave es
 * `documento_referencia = BODEGA-<codigo>`, así que un doble clic o un bache que se
 * re-guarda ya estando en bodega no infla el stock.
 *
 * Se omite (sin error) cuando:
 *   - falta la configuración del producto en Inventario Production Core;
 *   - el bache no tiene KG de biochar seco (nada que ingresar).
 *
 * Esa tolerancia es deliberada: el cambio de estado del bache NO debe fallar por
 * un problema de inventario. El caller reporta el resultado sin abortar el PATCH.
 */
export async function registrarEntradaBiocharBodega(
  input: RegistrarEntradaBiocharInput
): Promise<EntradaBiocharResult> {
  if (!credencialesBiocharPuro()) {
    return {
      ok: true,
      omitido: true,
      motivo:
        'AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID no configurado: el biochar puro aún no ' +
        'existe como producto en Sirius Inventario Production Core',
    };
  }

  const kg = Number(input.kg);
  if (!Number.isFinite(kg) || kg <= 0) {
    return {
      ok: true,
      omitido: true,
      motivo: `El bache ${input.codigoBache} no tiene biochar seco cuantificado (${input.kg})`,
    };
  }

  const referencia = referenciaEntradaBodega(input.codigoBache);

  try {
    if (await existeEntradaDeBache(input.codigoBache)) {
      console.log(`↩️ El bache ${input.codigoBache} ya tenía su entrada de biochar en bodega`);
      return { ok: true, yaExistia: true, cantidad: kg, referencia };
    }

    const { movimientoId, kg: cantidad, vinculadoAlStock } = await crearMovimientoBiocharPuro({
      tipo: 'Entrada',
      kg,
      bacheOrigen: input.codigoBache,
      documentoReferencia: referencia,
      motivo: 'Ingreso de biochar a bodega',
      fecha: input.fecha?.trim() || new Date().toISOString().split('T')[0],
      responsable: input.realizaRegistro,
      observaciones: `Biochar seco del bache ${input.codigoBache} ingresado a bodega.`,
    });

    if (!vinculadoAlStock) {
      return {
        ok: false,
        movimientoId,
        cantidad,
        referencia,
        error:
          'Movimiento creado pero el biochar puro no tiene fila en Stock_Actual, así que el ' +
          'saldo no lo refleja. Crea el registro de stock del producto en el Core.',
      };
    }

    console.log(
      `✅ Biochar a bodega: ${cantidad.toFixed(2)} kg del bache ${input.codigoBache} (mov ${movimientoId})`
    );

    return { ok: true, movimientoId, cantidad, referencia };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error registrando biochar del bache ${input.codigoBache}:`, message);
    return { ok: false, error: message, referencia };
  }
}

// src/lib/biochar-bodega.ts
//
// Ingreso del biochar de un bache al inventario de bodega (Sirius Insumos Core).
//
// REGLA DE NEGOCIO (decisión de David, 2026-07-29): el biochar que está en
// PLANTA no es inventario; solo cuenta el que está en bodega. El sistema de
// baches ya modela ese momento con el estado `Bache Completo Bodega`, así que ese
// cambio de estado es el que registra la Entrada del biochar en el Core.
//
// Con esto las tres materias primas del Blend viven en el mismo sitio (Insumos
// Core → Stock Insumos) y la bodega deja de leer una fórmula de la base local.
//
// El bache NO deja de existir ni pierde su biochar: sigue siendo la unidad de
// trazabilidad (es lo que sostiene la contabilidad de carbono). El insumo es la
// vista de bodega del mismo material.

import { config } from './config';
import { appendMovimientoToStock, findStockByInsumo } from './stock-insumos';
import { buildCamposIdCore, resolveIdResponsableCore } from './movimientos-insumos';

const AT = 'https://api.airtable.com/v0';

/** Estado del bache que significa "el biochar ya está en bodega". */
export const ESTADO_BACHE_BODEGA = 'Bache Completo Bodega';

/**
 * Marca que se escribe en las notas del movimiento para poder reconocerlo.
 *
 * Va entre corchetes a propósito: `FIND('[BACHE:B-1]', ...)` no puede confundir
 * el bache `B-1` con el `B-10`, que sí pasaría buscando `BACHE:B-1` a secas.
 */
export function marcaBache(codigoBache: string): string {
  return `[BACHE:${codigoBache}]`;
}

export interface EntradaBiocharResult {
  ok: boolean;
  /** true si el movimiento ya existía y no se creó otro. */
  yaExistia?: boolean;
  /** true si la operación se omitió por configuración o por no haber kg. */
  omitido?: boolean;
  movimientoId?: string;
  cantidad?: number;
  motivo?: string;
  error?: string;
}

function coreCredentials() {
  const token = config.airtable.insumosCoreToken;
  const baseId = config.airtable.insumosCoreBaseId;
  const movimientosTableId = config.airtable.movimientosInsumosTableId;
  const insumoId = config.airtable.blendBiocharInsumoRecordId;

  return { token, baseId, movimientosTableId, insumoId };
}

/**
 * ¿Ya se registró la entrada de este bache?
 *
 * La idempotencia importa mucho aquí: `PATCH /api/baches/update` puede llegar dos
 * veces (doble clic, reintento de red, o un bache que se re-guarda ya estando en
 * bodega) y cada entrada duplicada infla el stock de bodega en cientos de kg.
 */
async function yaRegistrado(codigoBache: string): Promise<boolean> {
  const { token, baseId, movimientosTableId } = coreCredentials();
  if (!token || !baseId || !movimientosTableId) return false;

  const marca = marcaBache(codigoBache).replace(/'/g, "\\'");
  const url = new URL(`${AT}/${baseId}/${movimientosTableId}`);
  // `Name` es el campo de notas de Movimientos Insumos (nombre real en Airtable).
  url.searchParams.set('filterByFormula', `FIND('${marca}', {Name}) > 0`);
  url.searchParams.set('maxRecords', '1');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    // Ante la duda NO se asume que ya existe: es peor perder una entrada real que
    // arriesgar un duplicado detectable. El error se propaga al caller.
    const detalle = await response.text();
    throw new Error(`No se pudo verificar si el bache ${codigoBache} ya tiene entrada: ${detalle}`);
  }

  const data = await response.json();
  return (data.records ?? []).length > 0;
}

export interface RegistrarEntradaBiocharInput {
  /** Código legible del bache (`Codigo Bache`); es la marca de idempotencia. */
  codigoBache: string;
  /** KG de biochar seco que entran a bodega (`Total Cantidad Actual Biochar Seco`). */
  kg: number;
  /** Quién realiza el registro (nombre legible, para los logs y notas). */
  realizaRegistro?: string;
  /** SIRIUS-PER del responsable; si no viene se resuelve de la sesión. */
  idResponsableCore?: string;
}

/**
 * Registra la Entrada del biochar de un bache en Sirius Insumos Core.
 *
 * Es idempotente por `codigoBache`: si ya hay un movimiento con la marca de ese
 * bache, no crea otro.
 *
 * Se omite (sin error) cuando:
 *   - `AIRTABLE_BLEND_BIOCHAR_RECORD_ID` no está configurado — el insumo biochar
 *     todavía no existe en el Core;
 *   - el bache no tiene KG de biochar seco (nada que ingresar).
 *
 * Esa tolerancia es deliberada: el cambio de estado del bache NO debe fallar por
 * un problema de inventario. El caller reporta el resultado sin abortar el PATCH.
 */
export async function registrarEntradaBiocharBodega(
  input: RegistrarEntradaBiocharInput
): Promise<EntradaBiocharResult> {
  const { token, baseId, movimientosTableId, insumoId } = coreCredentials();

  if (!insumoId) {
    return {
      ok: true,
      omitido: true,
      motivo:
        'AIRTABLE_BLEND_BIOCHAR_RECORD_ID no configurado: el insumo Biochar aún no existe en Sirius Insumos Core',
    };
  }

  if (!token || !baseId || !movimientosTableId) {
    return {
      ok: false,
      error:
        'Configuración de Sirius Insumos Core incompleta: faltan AIRTABLE_GLOBAL_TOKEN, ' +
        'AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID',
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

  try {
    if (await yaRegistrado(input.codigoBache)) {
      console.log(`↩️ El bache ${input.codigoBache} ya tenía su entrada de biochar en bodega`);
      return { ok: true, yaExistia: true, cantidad: kg };
    }

    const movFields = config.airtable.movimientoFields;
    const fields: Record<string, unknown> = {
      [movFields.insumo!]: [insumoId],
      [movFields.cantidad!]: Number(kg.toFixed(2)),
      [movFields.tipoMovimiento!]: 'Entrada',
      ...buildCamposIdCore(
        await resolveIdResponsableCore(input.idResponsableCore),
        `ingreso de biochar a bodega (${input.codigoBache})`
      ),
    };

    if (movFields.notas) {
      fields[movFields.notas] =
        `Ingreso de biochar a bodega ${marcaBache(input.codigoBache)}` +
        (input.realizaRegistro ? ` — ${input.realizaRegistro}` : '');
    }

    const response = await fetch(`${AT}/${baseId}/${movimientosTableId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields }] }),
    });
    const data = await response.json();

    if (!response.ok) {
      return { ok: false, error: `Error creando el movimiento: ${JSON.stringify(data)}` };
    }

    const movimientoId = data.records?.[0]?.id as string;

    // Vincular al Stock Insumos: es lo que hace que `stock_actual` lo cuente.
    const { record: stockRecord } = await findStockByInsumo(insumoId);
    if (!stockRecord) {
      return {
        ok: false,
        movimientoId,
        cantidad: kg,
        error:
          'Movimiento creado pero el insumo Biochar no tiene registro en Stock Insumos, ' +
          'así que el stock no lo refleja. Crea el Stock del insumo en el Core.',
      };
    }

    // Preserva los movimientos ya vinculados: el PATCH de un campo link
    // reemplaza el array completo (ver src/lib/stock-insumos.ts).
    await appendMovimientoToStock(stockRecord.id, movimientoId);

    console.log(
      `✅ Biochar a bodega: ${kg.toFixed(2)} kg del bache ${input.codigoBache} (mov ${movimientoId})`
    );

    return { ok: true, movimientoId, cantidad: Number(kg.toFixed(2)) };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Error registrando biochar del bache ${input.codigoBache}:`, message);
    return { ok: false, error: message };
  }
}

// src/lib/stock-insumos.ts
//
// Acceso centralizado a la tabla `Stock Insumos` de Sirius Insumos Core.
//
// ⚠️ POR QUÉ EXISTE ESTE MÓDULO (bug 2026-07-27):
// La API de Airtable devuelve `fields` indexado por NOMBRE de campo, salvo que
// se pida explícitamente `returnFieldsByFieldId=true`. Varios endpoints leían
// `record.fields[config.airtable.stockFields.insumoId]` —un field ID `fld…`—
// contra una respuesta indexada por nombre, obteniendo siempre `undefined`.
// Consecuencias observadas:
//   1. `add-quantity` nunca encontraba el Stock existente y creaba un duplicado
//      vacío en CADA entrada.
//   2. Al leer los movimientos existentes se obtenía `[]`, y el PATCH del link
//      `Movimiento Insumo ID` BORRABA el histórico de movimientos del stock
//      (destruyendo el `stock_actual`, que es SUM(Ingresa) - SUM(Sale)).
//
// Además, `SEARCH("recXXX", {Insumo ID})` NO es un filtro confiable: en una
// fórmula, un campo link se evalúa como el texto del campo primario del
// registro vinculado (aquí `Código SIRIUS-INS`), no como el record ID. El match
// se hace en JS sobre los record IDs reales.

import { config } from './config';

const AT = 'https://api.airtable.com/v0';

/** Nombres canónicos de los campos de `Stock Insumos`. */
export const STOCK_FIELD_NAMES = {
  insumoId: 'Insumo ID',
  movimientoId: 'Movimiento Insumo ID',
  stockActual: 'stock_actual',
} as const;

export interface StockInsumoRecord {
  id: string;
  fields: Record<string, unknown>;
}

function coreCredentials() {
  const token = config.airtable.insumosCoreToken;
  const baseId = config.airtable.insumosCoreBaseId;
  const tableId = config.airtable.stockInsumosTableId;

  if (!token || !baseId || !tableId) {
    throw new Error(
      'Configuración de Stock Insumos incompleta: faltan AIRTABLE_GLOBAL_TOKEN, ' +
      'AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_STOCK_INSUMOS_TABLE_ID'
    );
  }

  return { token, baseId, tableId };
}

function headers(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Lee un campo tolerando ambas formas de indexado (nombre y field ID).
 * Airtable devuelve por nombre por defecto; el field ID solo aparece si la
 * petición usó `returnFieldsByFieldId=true`.
 */
function readField(
  fields: Record<string, unknown> | undefined,
  name: string,
  fieldId?: string
): unknown {
  if (!fields) return undefined;
  if (fields[name] !== undefined) return fields[name];
  if (fieldId && fields[fieldId] !== undefined) return fields[fieldId];
  return undefined;
}

/**
 * Normaliza un campo link a un array de record IDs.
 * Airtable puede devolver `["recXXX"]` o, con algunas opciones de la API,
 * `[{ id: "recXXX", name: "..." }]`.
 */
function toRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'id' in entry) {
        const id = (entry as { id?: unknown }).id;
        return typeof id === 'string' ? id : null;
      }
      return null;
    })
    .filter((id): id is string => Boolean(id));
}

/** Record IDs de insumos vinculados a un registro de stock. */
export function getInsumoIds(record: StockInsumoRecord): string[] {
  return toRecordIds(
    readField(record.fields, STOCK_FIELD_NAMES.insumoId, config.airtable.stockFields.insumoId)
  );
}

/** Record IDs de movimientos vinculados a un registro de stock. */
export function getMovimientoIds(record: StockInsumoRecord): string[] {
  return toRecordIds(
    readField(record.fields, STOCK_FIELD_NAMES.movimientoId, config.airtable.stockFields.movimientoId)
  );
}

/** `stock_actual` (campo fórmula) como número; 0 si no está calculado. */
export function getStockActual(record: StockInsumoRecord): number {
  const raw = readField(
    record.fields,
    STOCK_FIELD_NAMES.stockActual,
    config.airtable.stockFields.stockActual
  );
  // Las fórmulas de Airtable pueden devolver { specialValue: 'NaN' }.
  const value = typeof raw === 'object' && raw !== null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Lee TODOS los registros de Stock Insumos siguiendo la paginación de Airtable. */
export async function fetchAllStockInsumos(): Promise<StockInsumoRecord[]> {
  const { token, baseId, tableId } = coreCredentials();
  const baseUrl = `${AT}/${baseId}/${tableId}?pageSize=100`;

  const all: StockInsumoRecord[] = [];
  let offset: string | undefined;

  do {
    const url = offset ? `${baseUrl}&offset=${encodeURIComponent(offset)}` : baseUrl;
    const response = await fetch(url, { method: 'GET', headers: headers(token) });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Error al leer Stock Insumos: ${JSON.stringify(data)}`);
    }

    all.push(...((data.records ?? []) as StockInsumoRecord[]));
    offset = data.offset;
  } while (offset);

  return all;
}

export interface StockLookup {
  /** Registro de stock elegido (el que tiene más movimientos si hay duplicados). */
  record: StockInsumoRecord | null;
  /** Duplicados detectados para el mismo insumo (excluye a `record`). */
  duplicates: StockInsumoRecord[];
}

/**
 * Busca el registro de Stock Insumos de un insumo haciendo el match en JS
 * sobre los record IDs vinculados.
 *
 * Si hay duplicados (creados por el bug del fallback), devuelve el que tiene
 * más movimientos vinculados: ese es el que sostiene el histórico real.
 */
export function findStockInRecords(
  itemId: string,
  records: StockInsumoRecord[]
): StockLookup {
  const matches = records.filter((record) => getInsumoIds(record).includes(itemId));

  if (matches.length === 0) {
    return { record: null, duplicates: [] };
  }

  const sorted = [...matches].sort(
    (a, b) => getMovimientoIds(b).length - getMovimientoIds(a).length
  );

  const [record, ...duplicates] = sorted;

  if (duplicates.length > 0) {
    console.warn(
      `⚠️ ${matches.length} registros de Stock Insumos apuntan al insumo ${itemId}. ` +
      `Usando ${record.id} (${getMovimientoIds(record).length} movimientos). ` +
      `Duplicados: ${duplicates.map((d) => d.id).join(', ')}. ` +
      `Ejecuta: npx tsx scripts/dedupe-stock-insumos.ts`
    );
  }

  return { record, duplicates };
}

/** Busca el registro de Stock Insumos de un insumo leyendo la tabla completa. */
export async function findStockByInsumo(itemId: string): Promise<StockLookup> {
  const records = await fetchAllStockInsumos();
  return findStockInRecords(itemId, records);
}

/** Crea un registro de Stock Insumos vacío vinculado al insumo. */
export async function createStockForInsumo(itemId: string): Promise<string> {
  const { token, baseId, tableId } = coreCredentials();
  const insumoKey = config.airtable.stockFields.insumoId || STOCK_FIELD_NAMES.insumoId;

  const response = await fetch(`${AT}/${baseId}/${tableId}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      records: [{ fields: { [insumoKey]: [itemId] } }],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Error al crear Stock Insumos para ${itemId}: ${JSON.stringify(data)}`);
  }

  return data.records[0].id as string;
}

/**
 * Devuelve el record ID del Stock Insumos del insumo, creándolo si no existe.
 * Idempotente: si ya existe (aun con duplicados) NO crea uno nuevo.
 */
export async function getOrCreateStockForInsumo(
  itemId: string
): Promise<{ stockId: string; created: boolean }> {
  const { record } = await findStockByInsumo(itemId);

  if (record) {
    return { stockId: record.id, created: false };
  }

  const stockId = await createStockForInsumo(itemId);
  return { stockId, created: true };
}

/**
 * Vincula un movimiento al registro de stock PRESERVANDO los ya vinculados.
 *
 * Airtable no tiene "append" en campos link: el PATCH reemplaza el array. Por
 * eso se relee el registro justo antes de escribir; leer mal los movimientos
 * existentes equivale a borrar el histórico de stock.
 */
export async function appendMovimientoToStock(
  stockId: string,
  movimientoId: string
): Promise<void> {
  const { token, baseId, tableId } = coreCredentials();
  const recordUrl = `${AT}/${baseId}/${tableId}/${stockId}`;

  const currentResponse = await fetch(recordUrl, { method: 'GET', headers: headers(token) });
  const currentData = await currentResponse.json();

  if (!currentResponse.ok) {
    throw new Error(`Error al leer Stock Insumos ${stockId}: ${JSON.stringify(currentData)}`);
  }

  const existentes = getMovimientoIds(currentData as StockInsumoRecord);

  if (existentes.includes(movimientoId)) {
    return;
  }

  const movimientoKey =
    config.airtable.stockFields.movimientoId || STOCK_FIELD_NAMES.movimientoId;

  const updateResponse = await fetch(recordUrl, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({
      fields: { [movimientoKey]: [...existentes, movimientoId] },
    }),
  });

  if (!updateResponse.ok) {
    const updateError = await updateResponse.json();
    throw new Error(
      `Error al vincular movimiento ${movimientoId} al stock ${stockId}: ${JSON.stringify(updateError)}`
    );
  }
}

// src/lib/biochar-inventario-core.ts
//
// El libro mayor del BIOCHAR PURO: Sirius Inventario Production Core.
//
// ═══ POR QUÉ SE MOVIÓ (2026-08-21) ════════════════════════════════════════════
// Del 2026-07-29 al 2026-08-21 el biochar puro vivió en Sirius Insumos Core como
// `Biochar Puro`, al lado del abono 4G y de los biológicos. Estaba en el sitio
// equivocado: un insumo es algo que el área COMPRA para consumir, y el biochar es
// justamente lo que la planta PRODUCE. Contarlo como insumo hacía que el inventario
// de producto terminado de Sirius no supiera nada del biochar puro —solo veía el
// Blend— mientras el inventario de insumos cargaba con un renglón que ninguna otra
// app del ecosistema podía interpretar.
//
// Hoy el biochar puro es `SIRIUS-PRODUCT-0015` en Sirius Inventario Production Core,
// la MISMA base donde ya vivía el Blend que alimenta. Eso deja la producción de
// Blend como lo que es: una Salida de un producto y una Entrada de otro, en un solo
// libro mayor y con el lote como llave.
//
// ═══ LOS DOS CAMPOS QUE HACEN POSIBLE ESTO ════════════════════════════════════
// `Movimientos_Inventario` no traía trazabilidad por bache, así que la migración
// agregó a esa tabla los dos campos que la sostienen:
//
//   bache_origen_id       → `Codigo Bache` (S-00XXX) del que salió el biochar
//   produccion_destino_id → lote `BLEND-…` que lo consumió, o la referencia
//                           `SAL-…` de una salida que no es producción
//
// Sin ellos se perdería "de qué bache salió cada kg" y "a qué lote fue", que es lo
// que sostiene la contabilidad de carbono. No se reciclaron los campos existentes:
// `ubicacion_origen_id` significa ubicación y `documento_referencia` ya es la llave
// de idempotencia.
//
// ═══ SE ACCEDE POR NOMBRE DE CAMPO, NO POR FIELD ID ═══════════════════════════
// A diferencia de Insumos Core —donde `config.ts` guarda field IDs—, esta base se
// lee y escribe por NOMBRE en todo el repositorio (`blend-produccion-core.ts`,
// `blend-deduction.ts`, `actas-biochar.ts`). Se mantiene esa convención a
// propósito: mezclarlas en la misma base es como se llega a leer
// `fields[fieldId]` contra una respuesta indexada por nombre y obtener siempre
// `undefined`. Aquí los nombres son el contrato.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';

const AT = 'https://api.airtable.com/v0';

/**
 * Nombres reales de los campos de `Movimientos_Inventario`.
 *
 * Centralizados aquí para que un cambio de nombre en el Core se arregle en un
 * solo sitio: son la interfaz con una base compartida con el laboratorio.
 */
export const MOVIMIENTO_PROD_FIELDS = {
  productoId: 'product_id',
  tipoMovimiento: 'tipo_movimiento',
  cantidad: 'cantidad',
  unidadMedida: 'unidad_medida',
  motivo: 'motivo',
  documentoReferencia: 'documento_referencia',
  responsable: 'responsable',
  fechaMovimiento: 'fecha_movimiento',
  fechaRegistro: 'fecha_registro',
  observaciones: 'observaciones',
  ubicacionOrigen: 'ubicacion_origen_id',
  ubicacionDestino: 'ubicacion_destino_id',
  /** Añadido por la migración del 2026-08-21. */
  bacheOrigen: 'bache_origen_id',
  /** Añadido por la migración del 2026-08-21. */
  produccionDestino: 'produccion_destino_id',
  /** Link al registro de `Stock_Actual`: sin él el saldo no cuenta el movimiento. */
  stockActual: 'Stock_Actual',
} as const;

/** Campos de la tabla `Stock_Actual`. */
export const STOCK_PROD_FIELDS = {
  productoId: 'producto_id',
  stockActual: 'stock_actual',
} as const;

/**
 * `documento_referencia` de la Entrada de un bache a bodega.
 *
 * Es la llave de idempotencia de ese ingreso: `PATCH /api/baches/update` puede
 * llegar dos veces (doble clic, reintento de red, o un bache que se re-guarda ya
 * estando en bodega) y cada entrada duplicada infla el stock en cientos de kg.
 *
 * Antes la marca iba dentro del texto de las notas y se buscaba con `FIND`; aquí
 * hay un campo dedicado, así que la comparación es exacta y no puede confundir el
 * bache `S-1` con el `S-10`.
 */
export function referenciaEntradaBodega(codigoBache: string): string {
  return `BODEGA-${codigoBache}`;
}

export interface CredencialesBiocharPuro {
  base: string;
  token: string;
  movimientos: string;
  stock?: string;
  producto: string;
}

/**
 * Credenciales del libro mayor, o `null` si falta configuración.
 *
 * Devuelve `null` en vez de lanzar para que los lectores puedan degradarse a la
 * tabla de baches (ver `resolverBiocharDisponible`) en vez de romper la pantalla.
 */
export function credencialesBiocharPuro(): CredencialesBiocharPuro | null {
  const {
    inventarioProdCoreBaseId: base,
    inventarioProdCoreToken: token,
    inventarioProdCoreMovimientosTable: movimientos,
    inventarioProdCoreStockTable: stock,
    inventarioProdCoreBiocharPuroProductId: producto,
  } = config.airtable;

  if (!base || !token || !movimientos || !producto) return null;

  return { base, token, movimientos, stock, producto };
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
export function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

async function atFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data: (data ?? {}) as Record<string, any> };
}

async function fetchAll(
  base: string,
  table: string,
  token: string,
  params: Record<string, string> = {}
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${AT}/${base}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (offset) url.searchParams.set('offset', offset);

    const { ok, data } = await atFetch(url.toString(), { headers: headers(token) });
    if (!ok) throw new Error(`Error al leer ${table}: ${JSON.stringify(data)}`);

    records.push(...((data.records ?? []) as AirtableRecord[]));
    offset = data.offset;
  } while (offset);

  return records;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saldo de biochar puro en kg según `Stock_Actual`, o `null` si no se puede leer.
 *
 * NO devuelve 0 cuando falta configuración o el registro de stock: 0 sería
 * indistinguible de "no hay biochar" y bloquearía toda producción de Blend.
 */
export async function getStockBiocharPuro(): Promise<number | null> {
  const cred = credencialesBiocharPuro();
  if (!cred || !cred.stock) return null;

  const url = new URL(`${AT}/${cred.base}/${cred.stock}`);
  url.searchParams.set(
    'filterByFormula',
    `{${STOCK_PROD_FIELDS.productoId}} = '${escapeAirtableValue(cred.producto)}'`
  );
  url.searchParams.set('maxRecords', '1');

  const { ok, data } = await atFetch(url.toString(), { headers: headers(cred.token) });
  if (!ok) throw new Error(`Error al leer el stock de biochar puro: ${JSON.stringify(data)}`);

  const record = data.records?.[0];
  return record ? toNumber(record.fields?.[STOCK_PROD_FIELDS.stockActual]) : null;
}

/** Record ID de la fila de `Stock_Actual` del biochar puro, o null. */
export async function findStockRecordIdBiocharPuro(): Promise<string | null> {
  const cred = credencialesBiocharPuro();
  if (!cred || !cred.stock) return null;

  const url = new URL(`${AT}/${cred.base}/${cred.stock}`);
  url.searchParams.set(
    'filterByFormula',
    `{${STOCK_PROD_FIELDS.productoId}} = '${escapeAirtableValue(cred.producto)}'`
  );
  url.searchParams.set('maxRecords', '1');

  const { ok, data } = await atFetch(url.toString(), { headers: headers(cred.token) });
  return ok ? (data.records?.[0]?.id ?? null) : null;
}

export interface MovimientoBiocharPuro {
  id: string;
  /** `id_movimiento` (INV-MOV-XXXX). */
  codigo: string;
  tipo: string;
  kg: number;
  /** `Codigo Bache` del que salió (o al que entró) el biochar. */
  bache: string;
  /** Lote `BLEND-…` o referencia `SAL-…` que lo consumió. */
  destino: string;
  documento: string;
  /** ISO completo, sin recortar: sirve para ordenar contra otras fuentes. */
  fecha: string;
  motivo: string;
  observaciones: string;
}

/**
 * Todos los movimientos de biochar puro.
 *
 * Aquí sí se puede filtrar en la fórmula —y esa es media razón para haber movido
 * el biochar—: `product_id` es TEXTO. En Insumos Core el insumo era un campo link,
 * y en una fórmula un link se evalúa como el texto de su campo primario, así que
 * había que leer la tabla completa y hacer el match en JS sobre los record IDs.
 */
export async function fetchMovimientosBiocharPuro(): Promise<MovimientoBiocharPuro[] | null> {
  const cred = credencialesBiocharPuro();
  if (!cred) return null;

  const f = MOVIMIENTO_PROD_FIELDS;
  const registros = await fetchAll(cred.base, cred.movimientos, cred.token, {
    filterByFormula: `{${f.productoId}} = '${escapeAirtableValue(cred.producto)}'`,
  });

  return registros.map((m) => ({
    id: m.id,
    codigo: String(m.fields['id_movimiento'] ?? m.id),
    tipo: String(m.fields[f.tipoMovimiento] ?? ''),
    kg: toNumber(m.fields[f.cantidad]),
    bache: String(m.fields[f.bacheOrigen] ?? ''),
    destino: String(m.fields[f.produccionDestino] ?? ''),
    documento: String(m.fields[f.documentoReferencia] ?? ''),
    fecha: String(m.fields[f.fechaMovimiento] ?? m.fields[f.fechaRegistro] ?? ''),
    motivo: String(m.fields[f.motivo] ?? ''),
    observaciones: String(m.fields[f.observaciones] ?? ''),
  }));
}

/** Saldo de biochar de un bache, reconstruido desde el libro mayor. */
export interface BacheBiocharCore {
  /** `Codigo Bache` (S-00XXX). El Core no guarda el record ID del bache. */
  codigo: string;
  /** Saldo actual: entradas − salidas de ese bache. */
  kg: number;
  /** Lo que entró a bodega originalmente. */
  kgIngresado: number;
  /** Lo consumido en producciones y salidas. */
  kgConsumido: number;
  /** Lotes de Blend (o referencias de salida) a los que fue el biochar. */
  lotes: string[];
}

/**
 * Biochar por bache según el libro mayor, no según la tabla de baches.
 *
 * Por qué el Core y no los baches, aunque hoy den el mismo número: la tabla de
 * baches es el historial de PRODUCCIÓN de pirólisis y su `Total Cantidad Actual`
 * depende de `Estado Bache` y del monitoreo de masa seca — un bache sin monitoreo
 * aparece en 0 aunque tenga biochar físico. El Core es el libro mayor de BODEGA:
 * lo que dice es lo que se puede despachar, y trae de paso a qué lote fue cada kg.
 *
 * Devuelve `null` si falta configuración, para que el llamador pueda caer a la
 * tabla de baches sin quedarse sin datos.
 */
export async function fetchBachesBiocharCore(): Promise<BacheBiocharCore[] | null> {
  const movimientos = await fetchMovimientosBiocharPuro();
  if (!movimientos) return null;

  const porBache = new Map<string, BacheBiocharCore>();

  for (const mov of movimientos) {
    if (!mov.bache) continue;

    const actual =
      porBache.get(mov.bache) ??
      { codigo: mov.bache, kg: 0, kgIngresado: 0, kgConsumido: 0, lotes: [] };

    if (mov.tipo === 'Entrada') {
      actual.kgIngresado += mov.kg;
      actual.kg += mov.kg;
    } else if (mov.tipo === 'Salida') {
      actual.kgConsumido += mov.kg;
      actual.kg -= mov.kg;
      if (mov.destino && !actual.lotes.includes(mov.destino)) actual.lotes.push(mov.destino);
    }

    porBache.set(mov.bache, actual);
  }

  return [...porBache.values()]
    .map((b) => ({
      ...b,
      kg: r2(b.kg),
      kgIngresado: r2(b.kgIngresado),
      kgConsumido: r2(b.kgConsumido),
    }))
    .sort((a, b) => b.kg - a.kg);
}

/**
 * Los baches que aportaron biochar a un destino, con los KG de cada uno.
 *
 * El destino es un lote `BLEND-…` (una producción) o una referencia `SAL-…` (una
 * salida que no es producción). Es lo que necesita una remisión para derivar la
 * composición real del despacho sin guardarla.
 */
export async function getBachesPorDestino(
  destino: string
): Promise<Array<{ codigo: string; kg: number }>> {
  const cred = credencialesBiocharPuro();
  if (!cred || !destino) return [];

  const f = MOVIMIENTO_PROD_FIELDS;
  const salidas = await fetchAll(cred.base, cred.movimientos, cred.token, {
    filterByFormula:
      `AND({${f.productoId}} = '${escapeAirtableValue(cred.producto)}',` +
      `{${f.tipoMovimiento}} = 'Salida',` +
      `{${f.produccionDestino}} = '${escapeAirtableValue(destino)}')`,
  });

  const porCodigo = new Map<string, number>();
  for (const mov of salidas) {
    const codigo = String(mov.fields[f.bacheOrigen] ?? '');
    if (!codigo) continue;
    porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + toNumber(mov.fields[f.cantidad]));
  }

  return [...porCodigo.entries()]
    .map(([codigo, kg]) => ({ codigo, kg: r2(kg) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * Cuántos movimientos de biochar puro llevan esta referencia en
 * `produccion_destino_id`.
 *
 * Es la consulta de idempotencia de una salida: se cuenta en vez de devolver un
 * booleano porque `runSalidaBache` verifica lado por lado para poder COMPLETAR una
 * salida a la que le faltó un paso en vez de duplicarla.
 */
export async function contarMovimientosPorDestino(destino: string): Promise<number> {
  const cred = credencialesBiocharPuro();
  if (!cred || !destino) return 0;

  const f = MOVIMIENTO_PROD_FIELDS;
  const url = new URL(`${AT}/${cred.base}/${cred.movimientos}`);
  url.searchParams.set(
    'filterByFormula',
    `AND({${f.productoId}} = '${escapeAirtableValue(cred.producto)}',` +
      `{${f.produccionDestino}} = '${escapeAirtableValue(destino)}')`
  );

  const { ok, data } = await atFetch(url.toString(), { headers: headers(cred.token) });
  // Ante la duda NO se asume que ya existe: perder una salida real es peor que un
  // duplicado, que al menos es detectable por la referencia repetida.
  if (!ok) throw new Error(`No se pudo verificar la salida de biochar: ${JSON.stringify(data)}`);

  return (data.records ?? []).length;
}

/** ¿Ya está registrada la Entrada a bodega de este bache? */
export async function existeEntradaDeBache(codigoBache: string): Promise<boolean> {
  const cred = credencialesBiocharPuro();
  if (!cred) return false;

  const f = MOVIMIENTO_PROD_FIELDS;
  const url = new URL(`${AT}/${cred.base}/${cred.movimientos}`);
  url.searchParams.set(
    'filterByFormula',
    `AND({${f.productoId}} = '${escapeAirtableValue(cred.producto)}',` +
      `{${f.documentoReferencia}} = '${escapeAirtableValue(referenciaEntradaBodega(codigoBache))}')`
  );
  url.searchParams.set('maxRecords', '1');

  const { ok, data } = await atFetch(url.toString(), { headers: headers(cred.token) });
  if (!ok) {
    throw new Error(
      `No se pudo verificar si el bache ${codigoBache} ya tiene entrada: ${JSON.stringify(data)}`
    );
  }

  return (data.records ?? []).length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export interface MovimientoBiocharPuroInput {
  tipo: 'Entrada' | 'Salida';
  kg: number;
  /** `Codigo Bache` (S-00XXX): siempre, en entradas y en salidas. */
  bacheOrigen: string;
  /** Lote `BLEND-…` o referencia `SAL-…`. Vacío en una Entrada a bodega. */
  produccionDestino?: string;
  /** Llave de idempotencia del movimiento. */
  documentoReferencia: string;
  motivo: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** Nombre legible de quien registra. */
  responsable?: string;
  observaciones?: string;
  /** A dónde fue (receptor, laboratorio, área). */
  ubicacionDestino?: string;
}

export interface MovimientoCreado {
  movimientoId: string;
  kg: number;
  /** false si el movimiento quedó sin vincular al stock (el saldo no lo cuenta). */
  vinculadoAlStock: boolean;
}

/**
 * Crea un movimiento de biochar puro y lo vincula al registro de `Stock_Actual`.
 *
 * El link al stock es lo que hace que `stock_actual` (= SUM(entradas) −
 * SUM(salidas) sobre los movimientos vinculados) cuente el movimiento. Un
 * movimiento sin vincular es invisible para el saldo: así fue como la fila de
 * stock del Blend se quedó en 0 kg teniendo 15.528 kg de entradas.
 *
 * Se vincula EN EL POST, no con un PATCH posterior: el PATCH de un campo link
 * reemplaza el array completo y habría que releer y concatenar.
 *
 * @throws Si falta configuración o si Airtable rechaza el movimiento.
 */
export async function crearMovimientoBiocharPuro(
  input: MovimientoBiocharPuroInput
): Promise<MovimientoCreado> {
  const cred = credencialesBiocharPuro();
  if (!cred) {
    throw new Error(
      'Biochar Puro no está configurado como producto de Sirius Inventario Production Core ' +
        '(falta AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID, AIRTABLE_BASE_SIRIUS_INVENTARIO ' +
        'o AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS).'
    );
  }

  const f = MOVIMIENTO_PROD_FIELDS;
  const kg = r2(input.kg);

  const fields: Record<string, unknown> = {
    [f.productoId]: cred.producto,
    [f.tipoMovimiento]: input.tipo,
    [f.cantidad]: kg,
    [f.unidadMedida]: 'kg',
    [f.motivo]: input.motivo,
    [f.documentoReferencia]: input.documentoReferencia,
    [f.bacheOrigen]: input.bacheOrigen,
    // Mediodía UTC y no la hora de la digitación: la fecha que importa es el día en
    // que el biochar se movió físicamente, y un `T00:00` se corre de día al
    // renderizarse en la zona de Colombia.
    [f.fechaMovimiento]: `${input.fecha}T12:00:00.000Z`,
  };

  if (input.produccionDestino) fields[f.produccionDestino] = input.produccionDestino;
  if (input.responsable) fields[f.responsable] = input.responsable;
  if (input.observaciones) fields[f.observaciones] = input.observaciones;
  if (input.ubicacionDestino) fields[f.ubicacionDestino] = input.ubicacionDestino;

  const stockRecordId = await findStockRecordIdBiocharPuro();
  if (stockRecordId) fields[f.stockActual] = [stockRecordId];

  const { ok, data } = await atFetch(`${AT}/${cred.base}/${cred.movimientos}`, {
    method: 'POST',
    headers: headers(cred.token),
    body: JSON.stringify({ records: [{ fields }] }),
  });

  if (!ok) throw new Error(`Error creando el movimiento de biochar: ${JSON.stringify(data)}`);

  return {
    movimientoId: data.records?.[0]?.id as string,
    kg,
    vinculadoAlStock: Boolean(stockRecordId),
  };
}

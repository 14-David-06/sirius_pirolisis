// src/lib/inventario-prod-core.ts
//
// Acceso GENÉRICO a Sirius Inventario Production Core, el libro mayor de productos
// del ecosistema. Aquí no hay ningún producto en particular: solo la base, sus
// campos y las operaciones que sirven para cualquier `product_id`.
//
// Existe porque el Core dejó de tener un solo inquilino de pirólisis. Empezó con el
// Biochar Blend, en agosto llegó el Biochar Puro (`SIRIUS-PRODUCT-0015`) y después
// el Abono 4G: los tres necesitan lo mismo —leer el saldo, listar los movimientos,
// escribir uno vinculado al stock— y la única diferencia es el código del producto.
// Sin esta capa, cada producto nuevo copiaba la plomería del anterior, y con ella
// se copiaban las trampas: la que se olvida de vincular al stock deja el saldo en 0.
//
// ⚠️ ESTA BASE SE ACCEDE POR NOMBRE DE CAMPO, NO POR FIELD ID, a diferencia de
// Sirius Insumos Core —donde `config.ts` guarda field IDs—. Mezclar las dos
// convenciones es como se llega a leer `fields[fieldId]` contra una respuesta
// indexada por nombre y obtener siempre `undefined`.

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

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
export function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface CredencialesProducto {
  base: string;
  token: string;
  movimientos: string;
  stock?: string;
  /** El `product_id` del producto sobre el que se opera. */
  producto: string;
}

/**
 * Credenciales del libro mayor para un producto, o `null` si falta configuración.
 *
 * Devuelve `null` en vez de lanzar para que los lectores puedan degradarse —a la
 * tabla de baches, a "no disponible"— en vez de romper la pantalla. Un producto
 * que todavía no existe en el Core es un estado normal durante una migración, no
 * un error del código.
 */
export function credencialesProducto(productoId?: string): CredencialesProducto | null {
  const {
    inventarioProdCoreBaseId: base,
    inventarioProdCoreToken: token,
    inventarioProdCoreMovimientosTable: movimientos,
    inventarioProdCoreStockTable: stock,
  } = config.airtable;

  if (!base || !token || !movimientos || !productoId) return null;

  return { base, token, movimientos, stock, producto: productoId };
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function atFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data: (data ?? {}) as Record<string, any> };
}

export async function fetchAll(
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
 * Saldo del producto en `Stock_Actual`, o `null` si no se puede leer.
 *
 * NO devuelve 0 cuando falta configuración o el registro de stock: 0 sería
 * indistinguible de "no hay nada" y bloquearía las operaciones que dependen de
 * tener existencias.
 */
export async function getStockDeProducto(cred: CredencialesProducto | null): Promise<number | null> {
  if (!cred || !cred.stock) return null;

  const url = new URL(`${AT}/${cred.base}/${cred.stock}`);
  url.searchParams.set(
    'filterByFormula',
    `{${STOCK_PROD_FIELDS.productoId}} = '${escapeAirtableValue(cred.producto)}'`
  );
  url.searchParams.set('maxRecords', '1');

  const { ok, data } = await atFetch(url.toString(), { headers: headers(cred.token) });
  if (!ok) throw new Error(`Error al leer el stock de ${cred.producto}: ${JSON.stringify(data)}`);

  const record = data.records?.[0];
  return record ? toNumber(record.fields?.[STOCK_PROD_FIELDS.stockActual]) : null;
}

/** Record ID de la fila de `Stock_Actual` del producto, o null. */
export async function findStockRecordId(cred: CredencialesProducto | null): Promise<string | null> {
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

export interface MovimientoProducto {
  id: string;
  /** `id_movimiento` (INV-MOV-XXXX). */
  codigo: string;
  tipo: string;
  cantidad: number;
  unidad: string;
  /** `Codigo Bache` del que salió (o al que entró). Vacío si el producto no lo usa. */
  bache: string;
  /** Lote `BLEND-…` o referencia de la salida. */
  destino: string;
  documento: string;
  /** ISO completo, sin recortar: sirve para ordenar contra otras fuentes. */
  fecha: string;
  motivo: string;
  observaciones: string;
}

/**
 * Todos los movimientos de un producto.
 *
 * Se puede filtrar en la fórmula porque `product_id` es TEXTO —y esa es media
 * razón para haber traído los inventarios de pirólisis aquí—: en Insumos Core el
 * insumo era un campo link, y en una fórmula un link se evalúa como el texto de su
 * campo primario, así que había que leer la tabla completa y cruzar en JS.
 */
export async function fetchMovimientosDeProducto(
  cred: CredencialesProducto | null
): Promise<MovimientoProducto[] | null> {
  if (!cred) return null;

  const f = MOVIMIENTO_PROD_FIELDS;
  const registros = await fetchAll(cred.base, cred.movimientos, cred.token, {
    filterByFormula: `{${f.productoId}} = '${escapeAirtableValue(cred.producto)}'`,
  });

  return registros.map((m) => ({
    id: m.id,
    codigo: String(m.fields['id_movimiento'] ?? m.id),
    tipo: String(m.fields[f.tipoMovimiento] ?? ''),
    cantidad: toNumber(m.fields[f.cantidad]),
    unidad: String(m.fields[f.unidadMedida] ?? ''),
    bache: String(m.fields[f.bacheOrigen] ?? ''),
    destino: String(m.fields[f.produccionDestino] ?? ''),
    documento: String(m.fields[f.documentoReferencia] ?? ''),
    fecha: String(m.fields[f.fechaMovimiento] ?? m.fields[f.fechaRegistro] ?? ''),
    motivo: String(m.fields[f.motivo] ?? ''),
    observaciones: String(m.fields[f.observaciones] ?? ''),
  }));
}

/** ¿Existe ya un movimiento con esta llave de idempotencia? */
export async function existeMovimientoConReferencia(
  cred: CredencialesProducto | null,
  referencia: string
): Promise<boolean> {
  if (!cred || !referencia) return false;

  const f = MOVIMIENTO_PROD_FIELDS;
  const url = new URL(`${AT}/${cred.base}/${cred.movimientos}`);
  url.searchParams.set(
    'filterByFormula',
    `AND({${f.productoId}} = '${escapeAirtableValue(cred.producto)}',` +
      `{${f.documentoReferencia}} = '${escapeAirtableValue(referencia)}')`
  );
  url.searchParams.set('maxRecords', '1');

  const { ok, data } = await atFetch(url.toString(), { headers: headers(cred.token) });
  if (!ok) {
    // Ante la duda NO se asume que ya existe: perder un movimiento real es peor que
    // un duplicado, que al menos es detectable por la referencia repetida.
    throw new Error(
      `No se pudo verificar el movimiento ${referencia} de ${cred.producto}: ${JSON.stringify(data)}`
    );
  }

  return (data.records ?? []).length > 0;
}

/**
 * Lo ingresado, lo consumido, el saldo y a qué lotes se fue: el resumen que
 * necesita cualquier pantalla de inventario, para cualquier producto del Core.
 *
 * Es genérico porque los tres productos de pirólisis —biochar puro, abono 4G y
 * Biochar Blend— se resumen igual: el saldo sale de `Stock_Actual` y el desglose
 * de los movimientos. Lo único que cambia es qué lado del movimiento lleva el
 * lote, y eso es el parámetro `agruparPor`.
 */
export interface ResumenProducto {
  /** Saldo de `Stock_Actual`, la fuente de verdad del saldo. */
  kg: number | null;
  /** Suma de las Entradas. */
  kgIngresado: number;
  /** Suma de las Salidas. */
  kgConsumido: number;
  /**
   * `kgIngresado − kgConsumido`. Debería igualar a `kg`; si no, hay movimientos
   * sin vincular a `Stock_Actual` y el saldo no los está contando.
   */
  kgSegunMovimientos: number;
  /** `kg − kgSegunMovimientos`, o `null` si no se pudo leer el saldo. */
  divergencia: number | null;
  /** Agrupado por lote, de mayor a menor. */
  porLote: Array<{ lote: string; kg: number }>;
  movimientos: MovimientoProducto[];
}

/**
 * Resume un producto del Core, o `null` si no está configurado.
 *
 * La `divergencia` se calcula y se expone a propósito: es la única señal de que un
 * movimiento entró sin vincularse a `Stock_Actual`, que es el modo silencioso en
 * que un saldo se queda corto (le pasó a la fila del Blend: 0 kg con 15.528 de
 * entradas). Sin este contraste, el número se ve bien y está mal.
 *
 * @param agruparPor Qué lado del movimiento agrupa `porLote`. Para un producto que
 *   se CONSUME por lote (el abono, el biochar puro) son las `Salida`s: "cuánto se
 *   fue a esta producción". Para uno que se PRODUCE por lote (el Blend) son las
 *   `Entrada`s: "cuánto salió de esta producción". Agrupar por el lado equivocado
 *   deja la tabla vacía, no un error.
 */
export async function resumenProducto(
  cred: CredencialesProducto | null,
  { agruparPor = 'Salida' }: { agruparPor?: 'Entrada' | 'Salida' } = {}
): Promise<ResumenProducto | null> {
  if (!cred) return null;

  const [kg, movimientos] = await Promise.all([
    getStockDeProducto(cred).catch((err) => {
      console.error(`⚠️ No se pudo leer el saldo de ${cred.producto}:`, err);
      return null;
    }),
    fetchMovimientosDeProducto(cred),
  ]);

  const lista = movimientos ?? [];
  const kgIngresado = r2(
    lista.filter((m) => m.tipo === 'Entrada').reduce((s, m) => s + m.cantidad, 0)
  );
  const kgConsumido = r2(
    lista.filter((m) => m.tipo === 'Salida').reduce((s, m) => s + m.cantidad, 0)
  );
  const kgSegunMovimientos = r2(kgIngresado - kgConsumido);

  const porLote = new Map<string, number>();
  for (const m of lista) {
    if (m.tipo !== agruparPor) continue;
    const lote = m.destino || m.documento || '(sin lote)';
    porLote.set(lote, (porLote.get(lote) ?? 0) + m.cantidad);
  }

  return {
    kg,
    kgIngresado,
    kgConsumido,
    kgSegunMovimientos,
    divergencia: kg === null ? null : r2(kg - kgSegunMovimientos),
    porLote: [...porLote.entries()]
      .map(([lote, k]) => ({ lote, kg: r2(k) }))
      .sort((a, b) => b.kg - a.kg),
    movimientos: [...lista].sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export interface MovimientoProductoInput {
  tipo: 'Entrada' | 'Salida';
  cantidad: number;
  unidad?: string;
  /** Llave de idempotencia del movimiento. */
  documentoReferencia: string;
  motivo: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  /** `Codigo Bache` de origen, para los productos que se trazan por bache. */
  bacheOrigen?: string;
  /** Lote `BLEND-…` o referencia de la salida. */
  produccionDestino?: string;
  /** Nombre legible de quien registra. */
  responsable?: string;
  observaciones?: string;
  /** A dónde fue (receptor, laboratorio, área). */
  ubicacionDestino?: string;
}

export interface MovimientoCreado {
  movimientoId: string;
  cantidad: number;
  /** false si el movimiento quedó sin vincular al stock (el saldo no lo cuenta). */
  vinculadoAlStock: boolean;
}

/**
 * Crea un movimiento y lo vincula al registro de `Stock_Actual` del producto.
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
export async function crearMovimientoProducto(
  cred: CredencialesProducto | null,
  input: MovimientoProductoInput
): Promise<MovimientoCreado> {
  if (!cred) {
    throw new Error(
      'El producto no está configurado en Sirius Inventario Production Core: falta su ' +
        'product_id, AIRTABLE_BASE_SIRIUS_INVENTARIO o ' +
        'AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS.'
    );
  }

  const f = MOVIMIENTO_PROD_FIELDS;
  const cantidad = r2(input.cantidad);

  const fields: Record<string, unknown> = {
    [f.productoId]: cred.producto,
    [f.tipoMovimiento]: input.tipo,
    [f.cantidad]: cantidad,
    [f.unidadMedida]: input.unidad ?? 'kg',
    [f.motivo]: input.motivo,
    [f.documentoReferencia]: input.documentoReferencia,
    // Mediodía UTC y no la hora de la digitación: la fecha que importa es el día en
    // que el material se movió físicamente, y un `T00:00` se corre de día al
    // renderizarse en la zona de Colombia.
    [f.fechaMovimiento]: `${input.fecha}T12:00:00.000Z`,
  };

  if (input.bacheOrigen) fields[f.bacheOrigen] = input.bacheOrigen;
  if (input.produccionDestino) fields[f.produccionDestino] = input.produccionDestino;
  if (input.responsable) fields[f.responsable] = input.responsable;
  if (input.observaciones) fields[f.observaciones] = input.observaciones;
  if (input.ubicacionDestino) fields[f.ubicacionDestino] = input.ubicacionDestino;

  const stockRecordId = await findStockRecordId(cred);
  if (stockRecordId) fields[f.stockActual] = [stockRecordId];

  const { ok, data } = await atFetch(`${AT}/${cred.base}/${cred.movimientos}`, {
    method: 'POST',
    headers: headers(cred.token),
    body: JSON.stringify({ records: [{ fields }] }),
  });

  if (!ok) throw new Error(`Error creando el movimiento de ${cred.producto}: ${JSON.stringify(data)}`);

  return {
    movimientoId: data.records?.[0]?.id as string,
    cantidad,
    vinculadoAlStock: Boolean(stockRecordId),
  };
}

export { AT as AIRTABLE_API };

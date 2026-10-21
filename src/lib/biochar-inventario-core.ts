// src/lib/biochar-inventario-core.ts
//
// El libro mayor del BIOCHAR PURO: Sirius Inventario Production Core.
//
// La plomería de la base (campos, credenciales, crear un movimiento vinculado al
// stock) vive en `inventario-prod-core.ts`, que es genérica por `product_id`: el
// Core ya no tiene un solo inquilino de pirólisis —Blend, biochar puro y abono 4G—
// y copiar esa plomería por producto copiaba también sus trampas. Acá queda solo lo
// que es propio del biochar: la trazabilidad POR BACHE.
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
//   produccion_destino_id → lote `BLEND-…` que lo consumió, la referencia
//                           `SAL-…` de una salida que no es producción, o la
//                           remisión `SIRIUS-REM-XXXX` de una venta (desde el
//                           2026-10-21, el despacho comercial de biochar puro)
//
// En una venta la Salida es una POR BACHE, con `documento_referencia` =
// `DESP-<REM>-<S-XXXXX>` (la llave de idempotencia, única por bache) y
// `ubicacion_origen_id` = la remisión, que es la junta con el pedido, igual que en
// la Salida de Blend. El destino es la remisión y no el pedido porque un pedido se
// despacha en tandas y cada tanda es un documento distinto.
//
// Sin ellos se perdería "de qué bache salió cada kg" y "a qué lote fue", que es lo
// que sostiene la contabilidad de carbono. No se reciclaron los campos existentes:
// `ubicacion_origen_id` significa ubicación y `documento_referencia` ya es la llave
// de idempotencia.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';
import {
  AIRTABLE_API as AT,
  atFetch,
  credencialesProducto,
  crearMovimientoProducto,
  crearMovimientosProducto,
  documentosPorDestino,
  fetchAll,
  fetchMovimientosDeProducto,
  findStockRecordId,
  getStockDeProducto,
  MOVIMIENTO_PROD_FIELDS,
  movimientoProductoDeRegistro,
  r2,
  STOCK_PROD_FIELDS,
  toNumber,
  type CredencialesProducto,
  type MovimientoCreado,
  type MovimientoProducto,
  type ResultadoMovimientoLote,
} from './inventario-prod-core';

// Los nombres de campo y el normalizador de fórmulas son de la BASE, no del
// biochar: se re-exportan porque este módulo fue su primer dueño y varios
// consumidores ya los importaban desde acá.
export { MOVIMIENTO_PROD_FIELDS, STOCK_PROD_FIELDS, toNumber };
export type CredencialesBiocharPuro = CredencialesProducto;
export type { ResultadoMovimientoLote };

const SIN_CONFIGURACION =
  'Biochar Puro no está configurado como producto de Sirius Inventario Production Core ' +
  '(falta AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID, AIRTABLE_BASE_SIRIUS_INVENTARIO ' +
  'o AIRTABLE_TABLE_SIRIUS_INVENTARIO_MOVIMIENTOS).';

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

/**
 * Credenciales del libro mayor, o `null` si falta configuración.
 *
 * Devuelve `null` en vez de lanzar para que los lectores puedan degradarse a la
 * tabla de baches (ver `resolverBiocharDisponible`) en vez de romper la pantalla.
 */
export function credencialesBiocharPuro(): CredencialesProducto | null {
  return credencialesProducto(config.airtable.inventarioProdCoreBiocharPuroProductId);
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
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
  return getStockDeProducto(credencialesBiocharPuro());
}

/** Record ID de la fila de `Stock_Actual` del biochar puro, o null. */
export async function findStockRecordIdBiocharPuro(): Promise<string | null> {
  return findStockRecordId(credencialesBiocharPuro());
}

export interface MovimientoBiocharPuro {
  id: string;
  /** `id_movimiento` (INV-MOV-XXXX). */
  codigo: string;
  tipo: string;
  kg: number;
  /** `Codigo Bache` del que salió (o al que entró) el biochar. */
  bache: string;
  /** Lote `BLEND-…`, referencia `SAL-…` o remisión `SIRIUS-REM-…` que lo consumió. */
  destino: string;
  /** Texto libre: a quién o adónde fue. */
  ubicacionDestino: string;
  documento: string;
  /** ISO completo, sin recortar: sirve para ordenar contra otras fuentes. */
  fecha: string;
  motivo: string;
  observaciones: string;
}

/**
 * Todos los movimientos de biochar puro.
 *
 * Se expone con `kg` en vez de `cantidad` porque el biochar se lleva siempre en
 * masa seca y sus consumidores ya leían ese nombre.
 */
export async function fetchMovimientosBiocharPuro(): Promise<MovimientoBiocharPuro[] | null> {
  const movimientos = await fetchMovimientosDeProducto(credencialesBiocharPuro());
  if (!movimientos) return null;

  return movimientos.map(movimientoBiochar);
}

function movimientoBiochar({ cantidad, unidad: _unidad, ...resto }: MovimientoProducto): MovimientoBiocharPuro {
  return { ...resto, kg: cantidad };
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
  /** Lotes de Blend, referencias de salida o remisiones a los que fue el biochar. */
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
  return saldosPorBache(movimientos);
}

/**
 * El saldo por bache a partir de los movimientos ya leídos, de mayor a menor saldo.
 *
 * PURO a propósito: el despacho de biochar necesita los movimientos para dos cosas
 * —el saldo por bache y las referencias que ya existen— y así los lee UNA vez. Los
 * movimientos sin bache (no debería haberlos) no cuentan para ningún bache.
 */
export function saldosPorBache(movimientos: MovimientoBiocharPuro[]): BacheBiocharCore[] {
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

/** Cuántos baches caben en un `OR(...)` sin que la URL se vuelva un riesgo. */
const BACHES_POR_LECTURA = 40;

/**
 * Saldo en el Core de unos baches concretos, leyendo SOLO sus movimientos.
 *
 * Es la verificación después de escribir un despacho: releer el libro completo
 * para mirar tres baches es mucho más caro que una consulta acotada, y lo que se
 * quiere saber es si alguno de ESTOS quedó negativo porque otro flujo (una salida
 * o una producción) consumió el mismo bache a la vez.
 *
 * Todo bache pedido aparece en el mapa; sin movimientos, con 0.
 *
 * @throws si falta configuración o la lectura falla: "no pude verificar" no es
 *   "quedó bien".
 */
export async function saldoDeBaches(codigos: string[]): Promise<Map<string, number>> {
  const cred = credencialesBiocharPuro();
  if (!cred) throw new Error(SIN_CONFIGURACION);

  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  const saldos = new Map<string, number>(unicos.map((c) => [c, 0]));
  if (!unicos.length) return saldos;

  const f = MOVIMIENTO_PROD_FIELDS;
  const movimientos: MovimientoBiocharPuro[] = [];
  for (let i = 0; i < unicos.length; i += BACHES_POR_LECTURA) {
    const lote = unicos.slice(i, i + BACHES_POR_LECTURA);
    const condiciones = lote.map((c) => `{${f.bacheOrigen}} = '${escapeAirtableValue(c)}'`);
    const registros = await fetchAll(cred.base, cred.movimientos, cred.token, {
      filterByFormula:
        `AND({${f.productoId}} = '${escapeAirtableValue(cred.producto)}', ` +
        (condiciones.length === 1 ? condiciones[0] : `OR(${condiciones.join(', ')})`) +
        ')',
    });
    movimientos.push(...registros.map((r) => movimientoBiochar(movimientoProductoDeRegistro(r))));
  }

  for (const b of saldosPorBache(movimientos)) {
    if (saldos.has(b.codigo)) saldos.set(b.codigo, b.kg);
  }
  return saldos;
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
  /** A dónde fue (receptor, laboratorio, área; el `CL-XXXX` en una venta). */
  ubicacionDestino?: string;
  /** De qué documento sale: la remisión `SIRIUS-REM-XXXX` en una venta. */
  ubicacionOrigen?: string;
}

/**
 * Crea un movimiento de biochar puro, vinculado a `Stock_Actual`.
 *
 * @throws Si falta configuración o si Airtable rechaza el movimiento.
 */
export async function crearMovimientoBiocharPuro(
  input: MovimientoBiocharPuroInput
): Promise<{ movimientoId: string; kg: number; vinculadoAlStock: boolean }> {
  const cred = credencialesBiocharPuro();
  if (!cred) throw new Error(SIN_CONFIGURACION);

  const creado: MovimientoCreado = await crearMovimientoProducto(cred, entradaProducto(input));

  return {
    movimientoId: creado.movimientoId,
    kg: creado.cantidad,
    vinculadoAlStock: creado.vinculadoAlStock,
  };
}

function entradaProducto(input: MovimientoBiocharPuroInput) {
  return {
    tipo: input.tipo,
    cantidad: input.kg,
    unidad: 'kg',
    bacheOrigen: input.bacheOrigen,
    produccionDestino: input.produccionDestino,
    documentoReferencia: input.documentoReferencia,
    motivo: input.motivo,
    fecha: input.fecha,
    responsable: input.responsable,
    observaciones: input.observaciones,
    ubicacionDestino: input.ubicacionDestino,
    ubicacionOrigen: input.ubicacionOrigen,
  };
}

/**
 * Crea las Salidas de biochar puro de un despacho, una por bache, en POST de 10 y
 * vinculadas a `Stock_Actual` en el mismo POST (`crearMovimientosProducto`).
 *
 * Lanza antes de escribir si falta configuración o la fila de stock, y se detiene
 * en el primer lote que falla: el resultado dice, por `documentoReferencia`, qué
 * quedó escrito y qué no, para que el reintento complete solo lo que falta.
 */
export async function crearSalidasBiocharPuro(
  inputs: Array<Omit<MovimientoBiocharPuroInput, 'tipo'>>
): Promise<ResultadoMovimientoLote[]> {
  const cred = credencialesBiocharPuro();
  if (!cred) throw new Error(SIN_CONFIGURACION);
  return crearMovimientosProducto(
    cred,
    inputs.map((i) => entradaProducto({ ...i, tipo: 'Salida' }))
  );
}

/**
 * Las `documento_referencia` del biochar puro que ya van a un destino (un lote, una
 * salida o una remisión `SIRIUS-REM-…`). Es la idempotencia del despacho: una
 * lectura para saber qué Salidas `DESP-<REM>-<S>` ya existen.
 *
 * @throws si falta configuración o la lectura falla.
 */
export async function documentosSalidaBiochar(produccionDestino: string): Promise<Set<string>> {
  return documentosPorDestino(credencialesBiocharPuro(), produccionDestino);
}

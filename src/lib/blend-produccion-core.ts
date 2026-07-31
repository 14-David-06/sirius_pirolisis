// src/lib/blend-produccion-core.ts
//
// Lectura de la producción de Biochar Blend, que desde el 2026-07-30 vive en las
// bases Core. El stock de biochar se resuelve en `baches-biochar.ts`.
//
// El registro de producción ya no es una fila en una tabla de PiroliApp: es un
// movimiento `Entrada` de SIRIUS-PRODUCT-0016 en Sirius Inventario Production
// Core cuyo `documento_referencia` es el CÓDIGO DE LOTE (BLEND-AAAA-MM-DD). Ese
// mismo código aparece en `ID Produccion Destino` de cada Salida de insumo en
// Sirius Insumos Core, y en `ID Produccion Blend` de cada fila de detalle por
// bache en PiroliApp. Airtable no permite links entre bases: el lote es la llave.

import { config } from './config';

const AT = 'https://api.airtable.com/v0';

/** Un lote de Blend producido. */
export interface LoteProducido {
  /** Código de lote (BLEND-AAAA-MM-DD): la llave que une las tres bases. */
  lote: string;
  kg: number;
  /** Fecha real de producción (no la de digitación). */
  fecha: string;
  motivo: string;
}

export interface ProduccionBlendResumen {
  /** Saldo de producto terminado en Inventario Production Core. */
  kgEnInventario: number;
  /** Total producido (suma de Entradas), independiente de lo ya despachado. */
  kgProducidos: number;
  lotes: LoteProducido[];
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchAll(
  baseId: string,
  table: string,
  token: string,
  params: Record<string, string> = {}
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${AT}/${baseId}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Airtable ${response.status}: ${JSON.stringify(data)}`);

    records.push(...((data.records ?? []) as AirtableRecord[]));
    offset = data.offset;
  } while (offset);

  return records;
}

/**
 * Producciones de Blend registradas en Sirius Inventario Production Core.
 *
 * `kgEnInventario` es el saldo (entradas − salidas) y `kgProducidos` la suma de
 * las entradas: divergen en cuanto se despacha, y esa diferencia es justamente
 * lo que ya salió a clientes.
 */
export async function getProduccionBlend(): Promise<ProduccionBlendResumen | null> {
  const {
    inventarioProdCoreBaseId,
    inventarioProdCoreToken,
    inventarioProdCoreMovimientosTable,
    inventarioProdCoreStockTable,
    inventarioProdCoreBiocharBlendProductId,
  } = config.airtable;

  if (
    !inventarioProdCoreBaseId ||
    !inventarioProdCoreToken ||
    !inventarioProdCoreMovimientosTable ||
    !inventarioProdCoreBiocharBlendProductId
  ) {
    return null;
  }

  const producto = inventarioProdCoreBiocharBlendProductId;

  const movimientos = await fetchAll(
    inventarioProdCoreBaseId,
    inventarioProdCoreMovimientosTable,
    inventarioProdCoreToken,
    { filterByFormula: `{product_id}='${producto.replace(/'/g, "\\'")}'` }
  );

  const entradas = movimientos.filter((m) => String(m.fields['tipo_movimiento'] ?? '') === 'Entrada');

  const lotes: LoteProducido[] = entradas
    .map((m) => ({
      lote: String(m.fields['documento_referencia'] ?? ''),
      kg: toNumber(m.fields['cantidad']),
      fecha: String(m.fields['fecha_movimiento'] ?? m.fields['fecha_registro'] ?? '').slice(0, 10),
      motivo: String(m.fields['motivo'] ?? ''),
    }))
    .filter((lote) => lote.kg > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  const kgProducidos = lotes.reduce((total, lote) => total + lote.kg, 0);

  // El saldo se lee del stock, no se recalcula: es una fórmula del Core y
  // recalcularla aquí la haría divergir en cuanto cambien los tipos de movimiento.
  let kgEnInventario = kgProducidos;
  if (inventarioProdCoreStockTable) {
    const stocks = await fetchAll(
      inventarioProdCoreBaseId,
      inventarioProdCoreStockTable,
      inventarioProdCoreToken,
      { filterByFormula: `{producto_id}='${producto.replace(/'/g, "\\'")}'`, maxRecords: '1' }
    );
    if (stocks.length) kgEnInventario = toNumber(stocks[0].fields['stock_actual']);
  }

  return { kgEnInventario, kgProducidos, lotes };
}

/** Un bache que aportó biochar a un lote, con los KG que aportó. */
export interface BacheDeLote {
  /** `Codigo Bache` (S-00XXX). */
  codigo: string;
  kg: number;
  /** Record ID del bache en PiroliApp. Vacío si no se pudo resolver. */
  bacheId: string;
}

export interface ProduccionDePedido {
  lote: string;
  kgTotal: number;
  fecha: string;
  estado: string;
  baches: BacheDeLote[];
}

/**
 * Los baches que aportaron biochar a un lote, con los KG de cada uno.
 *
 * Se reconstruye desde las Salidas de `Biochar Puro` en Sirius Insumos Core que
 * llevan el lote en `ID Produccion Destino`. Los record IDs se resuelven contra la
 * tabla de baches de PiroliApp porque el Core solo guarda el código: no hay links
 * entre bases.
 */
export async function getBachesDeLote(lote: string): Promise<BacheDeLote[]> {
  const {
    insumosCoreBaseId,
    insumosCoreToken,
    movimientosInsumosTableId,
    blendBiocharInsumoRecordId,
    movimientoFields,
    token,
    baseId,
    bachesTableId,
  } = config.airtable;

  if (
    !lote ||
    !insumosCoreBaseId ||
    !insumosCoreToken ||
    !movimientosInsumosTableId ||
    !blendBiocharInsumoRecordId ||
    !movimientoFields.idProduccionDestino ||
    !movimientoFields.idBacheOrigen
  ) {
    return [];
  }

  const movimientos = await fetchAll(
    insumosCoreBaseId,
    movimientosInsumosTableId,
    insumosCoreToken,
    { returnFieldsByFieldId: 'true' }
  );

  const porCodigo = new Map<string, number>();
  for (const mov of movimientos) {
    const insumos = mov.fields[movimientoFields.insumo!];
    const esBiochar =
      Array.isArray(insumos) &&
      insumos.some((link) =>
        typeof link === 'string'
          ? link === blendBiocharInsumoRecordId
          : (link as { id?: string })?.id === blendBiocharInsumoRecordId
      );
    if (!esBiochar) continue;
    if (String(mov.fields[movimientoFields.tipoMovimiento!] ?? '') !== 'Salida') continue;
    if (String(mov.fields[movimientoFields.idProduccionDestino!] ?? '') !== lote) continue;

    const codigo = String(mov.fields[movimientoFields.idBacheOrigen!] ?? '');
    if (!codigo) continue;
    porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + toNumber(mov.fields[movimientoFields.cantidad!]));
  }

  if (!porCodigo.size) return [];

  const idPorCodigo = new Map<string, string>();
  if (token && baseId && bachesTableId) {
    for (const bache of await fetchAll(baseId, bachesTableId, token)) {
      const codigo = String(bache.fields['Codigo Bache'] ?? '');
      if (codigo) idPorCodigo.set(codigo, bache.id);
    }
  }

  return [...porCodigo.entries()]
    .map(([codigo, kg]) => ({
      codigo,
      kg: Math.round(kg * 100) / 100,
      bacheId: idPorCodigo.get(codigo) ?? '',
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/**
 * Un lote producido, con sus KG y los baches que lo alimentaron.
 *
 * Es lo que necesita una remisión para derivar la composición real del despacho
 * sin guardarla: la proporción de biochar sale de `baches` sobre `kgTotal`.
 */
export async function getProduccionPorLote(lote: string): Promise<ProduccionDePedido | null> {
  const {
    inventarioProdCoreBaseId,
    inventarioProdCoreToken,
    inventarioProdCoreMovimientosTable,
    inventarioProdCoreBiocharBlendProductId,
  } = config.airtable;

  if (
    !lote ||
    !inventarioProdCoreBaseId ||
    !inventarioProdCoreToken ||
    !inventarioProdCoreMovimientosTable ||
    !inventarioProdCoreBiocharBlendProductId
  ) {
    return null;
  }

  const esc = (v: string) => v.replace(/'/g, "\\'");
  const entradas = await fetchAll(
    inventarioProdCoreBaseId,
    inventarioProdCoreMovimientosTable,
    inventarioProdCoreToken,
    {
      filterByFormula:
        `AND({tipo_movimiento}='Entrada',{product_id}='${esc(inventarioProdCoreBiocharBlendProductId)}',` +
        `{documento_referencia}='${esc(lote)}')`,
    }
  );
  if (!entradas.length) return null;

  const kgTotal = entradas.reduce((t, m) => t + toNumber(m.fields['cantidad']), 0);
  const primera = entradas[0];

  return {
    lote,
    kgTotal,
    fecha: String(primera.fields['fecha_movimiento'] ?? primera.fields['fecha_registro'] ?? '').slice(0, 10),
    estado: 'Completado',
    baches: await getBachesDeLote(lote),
  };
}

/**
 * La producción de Blend de un pedido, reconstruida desde los Core.
 *
 * El pedido se atribuye por `ubicacion_destino_id` del movimiento de Entrada, que
 * es donde `iniciar-produccion` graba el `SIRIUS-PED-XXXX`. Los baches se resuelven
 * desde las Salidas de biochar en Insumos Core que llevan el lote en
 * `ID Produccion Destino`, y sus record IDs desde la tabla de baches de PiroliApp
 * (el Core solo guarda el código, porque no hay links entre bases).
 */
export async function getProduccionPorPedido(
  idPedidoCore: string
): Promise<ProduccionDePedido | null> {
  const {
    inventarioProdCoreBaseId,
    inventarioProdCoreToken,
    inventarioProdCoreMovimientosTable,
    inventarioProdCoreBiocharBlendProductId,
    insumosCoreBaseId,
    insumosCoreToken,
    movimientosInsumosTableId,
    blendBiocharInsumoRecordId,
    movimientoFields,
    token,
    baseId,
    bachesTableId,
  } = config.airtable;

  if (
    !inventarioProdCoreBaseId ||
    !inventarioProdCoreToken ||
    !inventarioProdCoreMovimientosTable ||
    !inventarioProdCoreBiocharBlendProductId
  ) {
    return null;
  }

  const esc = (v: string) => v.replace(/'/g, "\\'");

  // 1. La Entrada de producto terminado: es el registro de la producción.
  const entradas = await fetchAll(
    inventarioProdCoreBaseId,
    inventarioProdCoreMovimientosTable,
    inventarioProdCoreToken,
    {
      filterByFormula:
        `AND({tipo_movimiento}='Entrada',{product_id}='${esc(inventarioProdCoreBiocharBlendProductId)}',` +
        `{ubicacion_destino_id}='${esc(idPedidoCore)}')`,
    }
  );
  if (!entradas.length) return null;

  // Si hay varias entradas para el mismo pedido (producción parcial), se toma la
  // última y se suman los KG: el pedido se cumplió con más de una tanda.
  const ordenadas = [...entradas].sort((a, b) =>
    String(a.fields['fecha_movimiento'] ?? a.fields['fecha_registro'] ?? '').localeCompare(
      String(b.fields['fecha_movimiento'] ?? b.fields['fecha_registro'] ?? '')
    )
  );
  const ultima = ordenadas[ordenadas.length - 1];
  const lote = String(ultima.fields['documento_referencia'] ?? '');
  const kgTotal = ordenadas.reduce((total, m) => total + toNumber(m.fields['cantidad']), 0);

  const produccion: ProduccionDePedido = {
    lote,
    kgTotal,
    fecha: String(ultima.fields['fecha_movimiento'] ?? ultima.fields['fecha_registro'] ?? '').slice(0, 10),
    // Inventario Production Core no maneja estado de producción: si el movimiento
    // de Entrada existe, el Blend ya se produjo.
    estado: 'Completado',
    baches: [],
  };

  // 2. Los baches que aportaron el biochar, desde las Salidas del Insumos Core.
  if (
    !lote ||
    !insumosCoreBaseId ||
    !insumosCoreToken ||
    !movimientosInsumosTableId ||
    !blendBiocharInsumoRecordId ||
    !movimientoFields.idProduccionDestino
  ) {
    return produccion;
  }

  const salidas = await fetchAll(
    insumosCoreBaseId,
    movimientosInsumosTableId,
    insumosCoreToken,
    { returnFieldsByFieldId: 'true' }
  );

  const porCodigo = new Map<string, number>();
  for (const mov of salidas) {
    const insumos = mov.fields[movimientoFields.insumo!];
    const esBiochar =
      Array.isArray(insumos) &&
      insumos.some((link) =>
        typeof link === 'string'
          ? link === blendBiocharInsumoRecordId
          : (link as { id?: string })?.id === blendBiocharInsumoRecordId
      );
    if (!esBiochar) continue;
    if (String(mov.fields[movimientoFields.tipoMovimiento!] ?? '') !== 'Salida') continue;
    if (String(mov.fields[movimientoFields.idProduccionDestino!] ?? '') !== lote) continue;

    const codigo = String(mov.fields[movimientoFields.idBacheOrigen ?? ''] ?? '');
    if (!codigo) continue;
    porCodigo.set(codigo, (porCodigo.get(codigo) ?? 0) + toNumber(mov.fields[movimientoFields.cantidad!]));
  }

  if (!porCodigo.size) return produccion;

  // 3. Resolver los record IDs de los baches: el Core solo guarda el código.
  const idPorCodigo = new Map<string, string>();
  if (token && baseId && bachesTableId) {
    for (const bache of await fetchAll(baseId, bachesTableId, token)) {
      const codigo = String(bache.fields['Codigo Bache'] ?? '');
      if (codigo) idPorCodigo.set(codigo, bache.id);
    }
  }

  produccion.baches = [...porCodigo.entries()]
    .map(([codigo, kg]) => ({
      codigo,
      kg: Math.round(kg * 100) / 100,
      bacheId: idPorCodigo.get(codigo) ?? '',
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));

  return produccion;
}

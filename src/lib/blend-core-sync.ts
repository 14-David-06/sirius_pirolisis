// src/lib/blend-core-sync.ts
//
// Sincronización aditiva del despacho de Biochar Blend hacia las bases Core
// federadas (Fase 2). NO reemplaza el flujo local de `blend_remisiones` (que
// sigue siendo el registro operativo + firma); solo espeja el registro
// logístico y mueve el inventario de producto terminado.
//
//   2a. recordFinishedGoodsExit → movimiento "Salida" en Sirius Inventario
//       Production Core (cierra el loop: Entrada al producir, Salida al despachar).
//   2b. mirrorRemisionToCore   → registro logístico en Sirius Remisiones Core
//       + Productos Remitidos (SIRIUS-PRODUCT-0016) + PDF adjunto.
//
// Ambos son IDEMPOTENTES (se pueden re-invocar sin duplicar) y BEST-EFFORT
// (si faltan credenciales o fallan, NO rompen el flujo Blend: devuelven un paso
// con ok=false/skipped y se registran).

import { config } from './config';

const AT = 'https://api.airtable.com/v0';

export interface RemisionCoreInput {
  /** Record ID de la remisión en blend_remisiones. */
  recordId: string;
  /** Código legible (REM-BLEND-recXXX) — clave de idempotencia. */
  codigo: string;
  cliente: string;
  /** Referencia simbólica del cliente (CL-XXXX), si se conoce. */
  clienteSimbolico?: string;
  /** Referencia simbólica del pedido (SIRIUS-PED-XXXX), si se conoce. */
  pedidoSimbolico?: string;
  /** Record ID de la producción de origen (para resolver CL-XXXX / SIRIUS-PED-XXXX). */
  produccionRecordId?: string;
  kgTotal: number;
  responsableEntrega?: string;
  fechaEvento?: string;
  /** URL del PDF de remisión (S3), si ya fue generado. */
  documentoUrl?: string;
  /** Estado actual de la remisión Blend. */
  estado?: string;
  observaciones?: string;
}

export interface SyncStep {
  step: string;
  ok: boolean;
  skipped?: boolean;
  detail?: unknown;
  error?: string;
}

async function atFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, init);
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/** Mapea el estado de la remisión Blend al singleSelect de Remisiones Core. */
function mapEstadoToCore(estado?: string): string {
  switch (estado) {
    case 'Pendiente Firma':
      return 'Pendiente';
    case 'En Transito':
      return 'En Tránsito';
    case 'Entregada':
      return 'Entregada';
    case 'Cancelada':
      return 'Cancelada';
    default:
      return 'Borrador';
  }
}

/**
 * 2a. Registra la SALIDA de producto terminado en Sirius Inventario Production Core.
 * Idempotente por `documento_referencia` = código de la remisión.
 */
export async function recordFinishedGoodsExit(rem: RemisionCoreInput): Promise<SyncStep> {
  const base = config.airtable.inventarioProdCoreBaseId;
  const token = config.airtable.inventarioProdCoreToken;
  const movimientosTable = config.airtable.inventarioProdCoreMovimientosTable;
  const stockTable = config.airtable.inventarioProdCoreStockTable;
  const productId = config.airtable.inventarioProdCoreBiocharBlendProductId;

  if (!base || !token || !movimientosTable || !productId) {
    return { step: 'inventario_core_salida', ok: false, skipped: true, error: 'Inventario Production Core no configurado (Salida omitida)' };
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Idempotencia: ¿ya existe una Salida para esta remisión?
  const dupQ = new URLSearchParams({
    filterByFormula: `AND({documento_referencia}='${rem.codigo}',{tipo_movimiento}='Salida')`,
    maxRecords: '1',
  });
  const dup = await atFetch(`${AT}/${base}/${movimientosTable}?${dupQ.toString()}`, { headers });
  if (dup.ok && (dup.data.records?.length ?? 0) > 0) {
    return { step: 'inventario_core_salida', ok: true, skipped: true, detail: { movimientoId: dup.data.records[0].id } };
  }

  // Vincular al Stock_Actual del producto.
  let stockRecordId: string | null = null;
  if (stockTable) {
    const q = new URLSearchParams({ filterByFormula: `{producto_id}='${productId}'`, maxRecords: '1' });
    const stockRes = await atFetch(`${AT}/${base}/${stockTable}?${q.toString()}`, { headers });
    if (stockRes.ok) stockRecordId = stockRes.data.records?.[0]?.id ?? null;
  }

  const fields: Record<string, unknown> = {
    product_id: productId,
    tipo_movimiento: 'Salida',
    cantidad: rem.kgTotal,
    unidad_medida: 'kg',
    motivo: `Despacho Biochar Blend ${rem.codigo}`,
    documento_referencia: rem.codigo,
    responsable: rem.responsableEntrega || 'Sistema',
  };
  if (stockRecordId) fields['Stock_Actual'] = [stockRecordId];

  const res = await atFetch(`${AT}/${base}/${movimientosTable}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!res.ok) return { step: 'inventario_core_salida', ok: false, error: JSON.stringify(res.data) };
  return { step: 'inventario_core_salida', ok: true, detail: { movimientoId: res.data.records?.[0]?.id, stockRecordId } };
}

/**
 * 2b. Espeja la remisión en Sirius Remisiones Core (registro logístico) +
 * Productos Remitidos. Idempotente por el código embebido en Notas de Remisión.
 */
export async function mirrorRemisionToCore(rem: RemisionCoreInput): Promise<SyncStep> {
  const base = config.airtable.remisionesCoreBaseId;
  const token = config.airtable.remisionesCoreToken;
  const remisionesTable = config.airtable.remisionesCoreRemisionesTable;
  const productosTable = config.airtable.remisionesCoreProductosTable;
  const productId = config.airtable.inventarioProdCoreBiocharBlendProductId;

  if (!base || !token || !remisionesTable) {
    return { step: 'remisiones_core', ok: false, skipped: true, error: 'Remisiones Core no configurado (espejo omitido)' };
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Idempotencia: buscar remisión Core que referencie este código Blend.
  const dupQ = new URLSearchParams({
    filterByFormula: `FIND('${rem.codigo}', {Notas de Remisión})`,
    maxRecords: '1',
  });
  const dup = await atFetch(`${AT}/${base}/${remisionesTable}?${dupQ.toString()}`, { headers });
  if (dup.ok && (dup.data.records?.length ?? 0) > 0) {
    // Ya existe → actualizar estado/PDF para mantener el espejo al día (idempotente).
    const existingId = dup.data.records[0].id as string;
    const updFields: Record<string, unknown> = { Estado: mapEstadoToCore(rem.estado) };
    if (rem.documentoUrl) {
      updFields['URL Remision Generada'] = rem.documentoUrl;
      updFields['Documento Remision'] = [{ url: rem.documentoUrl, filename: `${rem.codigo}.pdf` }];
    }
    const upd = await atFetch(`${AT}/${base}/${remisionesTable}/${existingId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ fields: updFields }),
    });
    return { step: 'remisiones_core', ok: upd.ok, skipped: true, detail: { remisionCoreId: existingId, actualizado: upd.ok } };
  }

  // Resolver referencias simbólicas (CL-XXXX / SIRIUS-PED-XXXX) desde la producción,
  // que vive en la base local de PiroliApp. Remisiones Core NO tiene campo de nombre
  // de cliente: guarda 'ID Cliente' (CL-XXXX) e 'ID Pedido' (SIRIUS-PED-XXXX).
  let idCliente = rem.clienteSimbolico;
  let idPedido = rem.pedidoSimbolico;
  if ((!idCliente || !idPedido) && rem.produccionRecordId && config.airtable.baseId && config.airtable.blendProduccionTableId) {
    const prod = await atFetch(
      `${AT}/${config.airtable.baseId}/${config.airtable.blendProduccionTableId}/${rem.produccionRecordId}`,
      { headers: { Authorization: `Bearer ${config.airtable.token}` } }
    );
    if (prod.ok) {
      idCliente = idCliente || (prod.data.fields?.['Cliente'] ? String(prod.data.fields['Cliente']) : undefined);
      idPedido = idPedido || (prod.data.fields?.['Pedido Origen'] ? String(prod.data.fields['Pedido Origen']) : undefined);
    }
  }

  // Crear remisión Core (registro logístico). Área Origen = "Producción".
  // El nombre del cliente va en las notas (Core lo resuelve por ID Cliente).
  const notas = `[blend:${rem.codigo}]${rem.cliente ? ` Cliente: ${rem.cliente}` : ''}${rem.observaciones ? ` — ${rem.observaciones}` : ''}`;
  const remisionFields: Record<string, unknown> = {
    'Area Origen': 'Producción',
    Estado: mapEstadoToCore(rem.estado),
    'Notas de Remisión': notas,
  };
  if (idCliente) remisionFields['ID Cliente'] = idCliente;
  if (idPedido) remisionFields['ID Pedido'] = idPedido;
  if (rem.responsableEntrega) remisionFields['Responsable Entrega'] = rem.responsableEntrega;
  if (rem.documentoUrl) {
    remisionFields['URL Remision Generada'] = rem.documentoUrl;
    remisionFields['Documento Remision'] = [{ url: rem.documentoUrl, filename: `${rem.codigo}.pdf` }];
  }

  const remRes = await atFetch(`${AT}/${base}/${remisionesTable}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ records: [{ fields: remisionFields }] }),
  });
  if (!remRes.ok) return { step: 'remisiones_core', ok: false, error: JSON.stringify(remRes.data) };
  const remisionCoreId = remRes.data.records?.[0]?.id as string;

  // Crear el Producto Remitido (Biochar Blend).
  let productoOk = true;
  let productoError: string | undefined;
  if (productosTable && productId) {
    const prodRes = await atFetch(`${AT}/${base}/${productosTable}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        records: [
          {
            fields: {
              'ID Producto': productId,
              Cantidad: rem.kgTotal,
              Unidad: 'Kg',
              'Remisión vinculada': [remisionCoreId],
            },
          },
        ],
      }),
    });
    productoOk = prodRes.ok;
    if (!prodRes.ok) productoError = JSON.stringify(prodRes.data);
  }

  return {
    step: 'remisiones_core',
    ok: productoOk,
    detail: { remisionCoreId, productoOk },
    error: productoError,
  };
}

/**
 * Orquesta la sincronización de despacho a Core. Nunca lanza: cada sub-paso
 * captura su propio error. Se puede invocar múltiples veces de forma segura.
 */
export async function syncRemisionDispatch(rem: RemisionCoreInput): Promise<SyncStep[]> {
  const steps: SyncStep[] = [];
  try {
    steps.push(await recordFinishedGoodsExit(rem));
  } catch (err) {
    steps.push({ step: 'inventario_core_salida', ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  try {
    steps.push(await mirrorRemisionToCore(rem));
  } catch (err) {
    steps.push({ step: 'remisiones_core', ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  return steps;
}

/** Construye el input de sync a partir de un registro de blend_remisiones. */
export function remisionInputFromRecord(recordId: string, fields: Record<string, any>): RemisionCoreInput {
  return {
    recordId,
    codigo: String(fields['ID'] ?? recordId),
    cliente: String(fields['Cliente'] ?? ''),
    produccionRecordId: Array.isArray(fields['Produccion Origen']) ? fields['Produccion Origen'][0] : undefined,
    kgTotal: Number(fields['KG Total Despachados'] ?? 0),
    responsableEntrega: fields['Responsable Entrega'] ? String(fields['Responsable Entrega']) : undefined,
    fechaEvento: fields['Fecha Evento'] ? String(fields['Fecha Evento']) : undefined,
    documentoUrl: Array.isArray(fields['Documento Remision']) ? fields['Documento Remision'][0]?.url : undefined,
    estado: fields['Estado'] ? String(fields['Estado']) : undefined,
    observaciones: fields['Observaciones'] ? String(fields['Observaciones']) : undefined,
  };
}

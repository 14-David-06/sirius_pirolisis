// src/lib/blend-deduction.ts
//
// Servicio de auto-deducción de inventario para la producción de Biochar Blend.
// (Fase 1 — Paso 5 del flujo). Se dispara al CONFIRMAR una producción.
//
// Descuenta, para una producción de `kgTotal` KG de Blend:
//   - Biochar Puro (pctBiochar): de los baches seleccionados, vía
//     `Detalle Cantidades Remision Pirolisis` (único mecanismo que alimenta la
//     fórmula `Total Cantidad Actual Biochar Seco` del bache).
//   - Abono 4G (pctAbono) y Biológicos (pctBiologicos): vía `Salida Insumos
//     Pirolisis`, enlazando el insumo a `salidasFields.inventarioInsumos` y NO al
//     link de turno. Esto es lo que alimenta `Total Cantidad Stock`.
//   - Registra la ENTRADA de producto terminado en Sirius Inventario Production Core
//     (best-effort: se omite si faltan credenciales).
//   - Crea el detalle en `blend_detalle_insumos` y puebla los links de la producción.
//
// El agua (pctAgua) NO se inventaría (se registra en el Turno).
//
// Diseño: cada paso captura su propio error y devuelve un StepResult. La deducción
// de baches e insumos es crítica; el detalle, el movimiento a Core y el poblado de
// links son best-effort (no revierten la deducción ya aplicada, pero se reportan).

import { config } from './config';
import { appendMovimientoToStock, findStockByInsumo, getStockActual } from './stock-insumos';
import { buildCamposIdCore, resolveIdResponsableCore } from './movimientos-insumos';

const AT = 'https://api.airtable.com/v0';

export interface BacheAllocation {
  bacheId: string;
  codigo: string;
  kg: number;
  stockDisponible: number;
}

export interface StepResult {
  step: string;
  ok: boolean;
  detail?: unknown;
  error?: string;
}

export interface DeductionInput {
  /** Record ID de la producción en `Produccion Biochar Blend Pirolisis`. */
  produccionRecordId: string;
  /** Código legible de la producción (BLEND-XXXX) para trazabilidad/documento. */
  produccionCodigo: string;
  /** KG totales de Blend a producir. */
  kgTotal: number;
  /** Record IDs de los baches seleccionados por el operador para cubrir el biochar. */
  bacheIds: string[];
  /** Reparto explícito de KG por bache (si el operador lo definió manualmente).
   *  Si viene, tiene prioridad sobre el reparto automático por orden. */
  bacheAllocations?: { bacheId: string; kg: number }[];
  /** Referencia simbólica del cliente (CL-XXXX) para la remisión de baches. */
  cliente: string;
  /** Referencia simbólica del pedido origen (SIRIUS-PED-XXXX). */
  pedidoSimbolico?: string;
  /** Quién realiza el registro (nombre legible). */
  realizaRegistro: string;
  /** SIRIUS-PER del responsable. Si no viene, se resuelve desde la sesión. */
  idResponsableCore?: string;
}

export interface DeductionResult {
  ok: boolean;
  produccionCodigo: string;
  proporciones: { kgBiochar: number; kgAbono: number; kgBiologicos: number; kgAgua: number };
  allocations: BacheAllocation[];
  steps: StepResult[];
}

function localHeaders() {
  return {
    Authorization: `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
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

/**
 * Calcula cuántos KG tomar de cada bache seleccionado para cubrir `kgBiochar`,
 * llenando en orden hasta el stock disponible de cada uno. Lanza si el stock
 * combinado de los baches seleccionados no alcanza.
 */
export async function planBacheAllocations(bacheIds: string[], kgBiochar: number): Promise<BacheAllocation[]> {
  const base = config.airtable.baseId;
  const bachesTable = config.airtable.bachesTableId;
  if (!base || !bachesTable) throw new Error('Config de baches incompleta');
  if (!bacheIds.length) throw new Error('No se seleccionaron baches para el biochar');

  // Leer stock actual de cada bache seleccionado (en el orden recibido).
  const baches = await Promise.all(
    bacheIds.map(async (id) => {
      const { ok, data } = await atFetch(`${AT}/${base}/${bachesTable}/${id}`, { headers: localHeaders() });
      if (!ok) throw new Error(`No se pudo leer el bache ${id}`);
      const stock = Number(data.fields?.['Total Cantidad Actual Biochar Seco'] ?? 0);
      const codigo = String(data.fields?.['Codigo Bache'] ?? id.slice(-6));
      return { bacheId: id, codigo, stock };
    })
  );

  const totalDisponible = baches.reduce((s, b) => s + b.stock, 0);
  if (totalDisponible + 1e-6 < kgBiochar) {
    throw new Error(
      `Stock de biochar insuficiente en los baches seleccionados: disponible ${totalDisponible.toFixed(2)} kg, requerido ${kgBiochar.toFixed(2)} kg`
    );
  }

  const allocations: BacheAllocation[] = [];
  let restante = kgBiochar;
  for (const b of baches) {
    if (restante <= 1e-6) break;
    const tomar = Math.min(b.stock, restante);
    if (tomar > 0) {
      allocations.push({ bacheId: b.bacheId, codigo: b.codigo, kg: Number(tomar.toFixed(2)), stockDisponible: b.stock });
      restante -= tomar;
    }
  }
  return allocations;
}

/**
 * Valida un reparto explícito de KG por bache: que sumen el biochar requerido y
 * que ninguno exceda su stock. Devuelve las allocations enriquecidas con código/stock.
 */
export async function validateBacheAllocations(
  allocations: { bacheId: string; kg: number }[],
  kgBiochar: number
): Promise<BacheAllocation[]> {
  const base = config.airtable.baseId;
  const bachesTable = config.airtable.bachesTableId;
  if (!base || !bachesTable) throw new Error('Config de baches incompleta');

  const validas = allocations.filter((a) => a.kg > 0);
  if (!validas.length) throw new Error('No se especificaron KG por bache');

  const total = validas.reduce((s, a) => s + a.kg, 0);
  if (Math.abs(total - kgBiochar) > 0.5) {
    throw new Error(
      `El reparto por bache suma ${total.toFixed(2)} kg pero el biochar requerido es ${kgBiochar.toFixed(2)} kg`
    );
  }

  const out: BacheAllocation[] = [];
  for (const a of validas) {
    const { ok, data } = await atFetch(`${AT}/${base}/${bachesTable}/${a.bacheId}`, { headers: localHeaders() });
    if (!ok) throw new Error(`No se pudo leer el bache ${a.bacheId}`);
    const stock = Number(data.fields?.['Total Cantidad Actual Biochar Seco'] ?? 0);
    const codigo = String(data.fields?.['Codigo Bache'] ?? a.bacheId.slice(-6));
    if (a.kg > stock + 1e-6) {
      throw new Error(`El bache ${codigo} solo tiene ${stock.toFixed(2)} kg de biochar (se pidieron ${a.kg.toFixed(2)})`);
    }
    out.push({ bacheId: a.bacheId, codigo, kg: Number(a.kg.toFixed(2)), stockDisponible: stock });
  }
  return out;
}

/**
 * Descuenta biochar de los baches creando una `Remisiones Baches Pirolisis` +
 * un `Detalle Cantidades Remision Pirolisis` por bache (mismo mecanismo que el
 * flujo tradicional de remisiones de baches). Con rollback del padre si fallan
 * los detalles.
 */
async function deductBaches(input: DeductionInput, allocations: BacheAllocation[]): Promise<StepResult> {
  const base = config.airtable.baseId!;
  const remBachesTable = config.airtable.remisionesBachesTableId;
  const detalleTable = config.airtable.detalleCantidadesRemisionTableId;
  const rf = config.airtable.remisionesBachesFields;
  const df = config.airtable.detalleCantidadesFields;

  if (!remBachesTable || !detalleTable || !df.cantidadEspecificada || !df.remisionBachePirolisis || !df.bachePirolisis || !rf.bachePirolisisAlterado) {
    return { step: 'baches', ok: false, error: 'Config de remisiones/detalle de baches incompleta' };
  }

  const fecha = new Date().toISOString().split('T')[0];
  const observaciones = `Consumo interno para producción de Biochar Blend ${input.produccionCodigo}`;

  // 1. Remisión de baches (padre)
  const remisionFields: Record<string, unknown> = {
    [rf.bachePirolisisAlterado]: allocations.map((a) => a.bacheId),
  };
  if (rf.fechaEvento) remisionFields[rf.fechaEvento] = fecha;
  if (rf.realizaRegistro) remisionFields[rf.realizaRegistro] = input.realizaRegistro;
  if (rf.observaciones) remisionFields[rf.observaciones] = observaciones;
  if (rf.cliente) remisionFields[rf.cliente] = input.cliente;

  const remRes = await atFetch(`${AT}/${base}/${remBachesTable}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ fields: remisionFields }),
  });
  if (!remRes.ok) {
    return { step: 'baches', ok: false, error: `Error creando remisión de baches: ${JSON.stringify(remRes.data)}` };
  }
  const remisionId = remRes.data.id as string;

  // 2. Detalle por bache
  const detalleRecords = allocations.map((a) => ({
    fields: {
      [df.cantidadEspecificada!]: a.kg,
      [df.remisionBachePirolisis!]: [remisionId],
      [df.bachePirolisis!]: [a.bacheId],
    },
  }));

  const detRes = await atFetch(`${AT}/${base}/${detalleTable}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ records: detalleRecords }),
  });

  if (!detRes.ok) {
    // Rollback del padre para no dejar remisión huérfana sin deducción.
    await fetch(`${AT}/${base}/${remBachesTable}/${remisionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.airtable.token}` },
    }).catch(() => {});
    return { step: 'baches', ok: false, error: `Error creando detalle de baches (rollback aplicado): ${JSON.stringify(detRes.data)}` };
  }

  return {
    step: 'baches',
    ok: true,
    detail: { remisionId, detalleIds: (detRes.data.records ?? []).map((r: any) => r.id), allocations },
  };
}

/**
 * Crea un movimiento de salida en Sirius Insumos Core para un insumo Blend.
 * Valida stock y actualiza Stock Insumos.
 *
 * MIGRADO (2026-07-27): Antes creaba en Salida Insumos Pirolisis (local).
 * Ahora crea Movimiento Insumos (tipo="Salida") en el Core.
 */
async function deductInsumo(
  insumoRecordId: string,
  cantidad: number,
  nombre: string,
  input: DeductionInput
): Promise<StepResult & { insumoRecordId: string; presentacion?: string }> {
  const coreBaseId = config.airtable.insumosCoreBaseId!;
  const token = config.airtable.insumosCoreToken!;
  const movimientosTableId = config.airtable.movimientosInsumosTableId;
  const stockInsumosTableId = config.airtable.stockInsumosTableId;
  const movFields = config.airtable.movimientoFields;

  if (!movimientosTableId || !stockInsumosTableId) {
    return { step: `insumo:${nombre}`, ok: false, error: 'Config de Core incompleta', insumoRecordId };
  }

  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  // Leer stock disponible desde Stock Insumos
  // NOTA: No filtramos por área porque el campo "Area" no existe
  // NOTA 2: Insumo ID es multipleRecordLinks; el match se hace en JS sobre los
  //         record IDs. Ver src/lib/stock-insumos.ts
  const { record: stockRecord } = await findStockByInsumo(insumoRecordId);
  if (!stockRecord) {
    return { step: `insumo:${nombre}`, ok: false, error: `No se pudo leer stock de ${nombre}`, insumoRecordId };
  }
  const stockDisponible = getStockActual(stockRecord);
  if (cantidad > stockDisponible + 1e-6) {
    return {
      step: `insumo:${nombre}`,
      ok: false,
      error: `Stock insuficiente de ${nombre}: requerido ${cantidad.toFixed(2)}, disponible ${stockDisponible.toFixed(2)}`,
      insumoRecordId,
    };
  }

  // Crear movimiento de salida en Core
  const fields: Record<string, unknown> = {};
  fields[movFields.insumo!] = [insumoRecordId];
  fields[movFields.cantidad!] = cantidad;
  fields[movFields.tipoMovimiento!] = 'Salida';
  // IDs core: área origen, área destino y responsable (SIRIUS-PER)
  Object.assign(
    fields,
    buildCamposIdCore(
      await resolveIdResponsableCore(input.idResponsableCore),
      `consumo Blend ${input.produccionCodigo}`
    )
  );
  fields[movFields.notas!] = `Consumo producción Biochar Blend ${input.produccionCodigo}\nTipo uso: balance_de_masa (productivo)`;

  const movRes = await atFetch(`${AT}/${coreBaseId}/${movimientosTableId}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!movRes.ok) {
    return { step: `insumo:${nombre}`, ok: false, error: `Error creando movimiento de ${nombre}: ${JSON.stringify(movRes.data)}`, insumoRecordId };
  }

  const movimientoId = movRes.data.records?.[0]?.id;

  // Actualizar Stock Insumos agregando el movimiento.
  // Preserva los ya vinculados: el PATCH de un campo link reemplaza el array.
  try {
    await appendMovimientoToStock(stockRecord.id, movimientoId);
  } catch (linkErr) {
    console.warn(`⚠️ Movimiento creado pero faltó vincular al stock de ${nombre}:`, linkErr);
  }

  return {
    step: `insumo:${nombre}`,
    ok: true,
    detail: { movimientoId, cantidad },
    insumoRecordId,
    presentacion: 'kg',  // Unidades estándar del Core
  };
}

/** Crea los registros de `blend_detalle_insumos` (best-effort). */
async function createDetalleInsumos(
  input: DeductionInput,
  items: Array<{ insumoRecordId: string; cantidad: number; presentacion?: string }>
): Promise<StepResult> {
  const base = config.airtable.baseId!;
  const table = config.airtable.blendDetalleInsumosTableId;
  if (!table) return { step: 'detalle_insumos', ok: false, error: 'blendDetalleInsumosTableId no configurado' };

  const records = items.map((it) => ({
    fields: {
      'Produccion Blend': [input.produccionRecordId],
      Insumo: [it.insumoRecordId],
      'Cantidad KG': it.cantidad,
      'Presentacion Usada': it.presentacion ?? '',
    },
  }));

  const res = await atFetch(`${AT}/${base}/${table}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ records }),
  });
  if (!res.ok) return { step: 'detalle_insumos', ok: false, error: JSON.stringify(res.data) };
  return { step: 'detalle_insumos', ok: true, detail: { ids: (res.data.records ?? []).map((r: any) => r.id) } };
}

/**
 * Registra la ENTRADA de producto terminado en Sirius Inventario Production Core.
 * Best-effort: si faltan credenciales/tabla, se omite sin fallar la producción.
 */
async function recordFinishedGoodsEntry(input: DeductionInput): Promise<StepResult> {
  const base = config.airtable.inventarioProdCoreBaseId;
  const token = config.airtable.inventarioProdCoreToken;
  const movimientosTable = config.airtable.inventarioProdCoreMovimientosTable;
  const stockTable = config.airtable.inventarioProdCoreStockTable;
  const productId = config.airtable.inventarioProdCoreBiocharBlendProductId;

  if (!base || !token || !movimientosTable || !productId) {
    return { step: 'inventario_core', ok: false, error: 'Inventario Production Core no configurado (movimiento Entrada omitido)' };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Buscar el Stock_Actual del producto para vincular el movimiento.
  let stockRecordId: string | null = null;
  if (stockTable) {
    const q = new URLSearchParams({ filterByFormula: `{producto_id}='${productId}'`, maxRecords: '1' });
    const stockRes = await atFetch(`${AT}/${base}/${stockTable}?${q.toString()}`, { headers });
    if (stockRes.ok) stockRecordId = stockRes.data.records?.[0]?.id ?? null;
  }

  const fields: Record<string, unknown> = {
    product_id: productId,
    tipo_movimiento: 'Entrada',
    cantidad: input.kgTotal,
    unidad_medida: 'kg',
    motivo: `Producción Biochar Blend ${input.produccionCodigo}`,
    documento_referencia: input.produccionCodigo,
    responsable: input.realizaRegistro,
  };
  // Atribuye la producción al pedido (lo lee produccion-status para calcular completitud).
  if (input.pedidoSimbolico) fields['ubicacion_destino_id'] = input.pedidoSimbolico;
  if (stockRecordId) fields['Stock_Actual'] = [stockRecordId];

  const res = await atFetch(`${AT}/${base}/${movimientosTable}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!res.ok) return { step: 'inventario_core', ok: false, error: JSON.stringify(res.data) };
  return { step: 'inventario_core', ok: true, detail: { movimientoId: res.data.records?.[0]?.id, stockRecordId } };
}

/** Puebla los linked-records y referencias simbólicas de la producción (best-effort). */
async function linkProduccion(
  input: DeductionInput,
  kgBiochar: number,
  insumoIds: string[],
  detalleIds: string[],
  bachesUsados: string[]
): Promise<StepResult> {
  const base = config.airtable.baseId!;
  const table = config.airtable.blendProduccionTableId;
  if (!table) return { step: 'link_produccion', ok: false, error: 'blendProduccionTableId no configurado' };

  const fields: Record<string, unknown> = {
    'KG Biochar Puro': Number(kgBiochar.toFixed(2)),
    // Solo los baches realmente usados (con KG deducido), no todos los seleccionados.
    'Baches Utilizados': bachesUsados,
    'Insumos Consumidos': insumoIds,
  };
  if (detalleIds.length) fields['blend_detalle_insumos'] = detalleIds;
  if (input.pedidoSimbolico) fields['Pedido Origen'] = input.pedidoSimbolico;

  const res = await atFetch(`${AT}/${base}/${table}/${input.produccionRecordId}`, {
    method: 'PATCH',
    headers: localHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) return { step: 'link_produccion', ok: false, error: JSON.stringify(res.data) };
  return { step: 'link_produccion', ok: true };
}

/**
 * Orquesta la auto-deducción completa. Los pasos de baches e insumos son críticos
 * (si fallan, `ok=false`); detalle, Inventario Core y links son best-effort.
 */
export async function runBlendDeduction(input: DeductionInput): Promise<DeductionResult> {
  const { pctBiochar, pctAbono, pctBiologicos, pctAgua } = config.blend;
  const kgBiochar = input.kgTotal * pctBiochar;
  const kgAbono = input.kgTotal * pctAbono;
  const kgBiologicos = input.kgTotal * pctBiologicos;
  const kgAgua = input.kgTotal * pctAgua;

  const steps: StepResult[] = [];

  // 1. Plan de baches: reparto explícito del operador si viene, si no automático por orden.
  let allocations: BacheAllocation[] = [];
  try {
    allocations = input.bacheAllocations?.length
      ? await validateBacheAllocations(input.bacheAllocations, kgBiochar)
      : await planBacheAllocations(input.bacheIds, kgBiochar);
  } catch (err) {
    steps.push({ step: 'plan_baches', ok: false, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, produccionCodigo: input.produccionCodigo, proporciones: { kgBiochar, kgAbono, kgBiologicos, kgAgua }, allocations, steps };
  }

  // 2. Deducción de baches (crítico)
  const bacheStep = await deductBaches(input, allocations);
  steps.push(bacheStep);
  if (!bacheStep.ok) {
    return { ok: false, produccionCodigo: input.produccionCodigo, proporciones: { kgBiochar, kgAbono, kgBiologicos, kgAgua }, allocations, steps };
  }

  // 3. Deducción de insumos (crítico)
  const abono = await deductInsumo(config.airtable.blendAbono4gRecordId!, Number(kgAbono.toFixed(2)), 'Abono 4G', input);
  steps.push(abono);
  const biologicos = await deductInsumo(config.airtable.blendBiologicosRecordId!, Number(kgBiologicos.toFixed(2)), 'Biológicos', input);
  steps.push(biologicos);
  const insumosOk = abono.ok && biologicos.ok;

  // 4. Detalle de insumos (best-effort)
  const detalleIds: string[] = [];
  const detalleItems = [abono, biologicos]
    .filter((s) => s.ok)
    .map((s) => ({ insumoRecordId: s.insumoRecordId, cantidad: (s.detail as any).cantidad as number, presentacion: s.presentacion }));
  if (detalleItems.length) {
    const detalleStep = await createDetalleInsumos(input, detalleItems);
    steps.push(detalleStep);
    if (detalleStep.ok) detalleIds.push(...((detalleStep.detail as any).ids ?? []));
  }

  // 5. Movimiento Entrada a Inventario Production Core (best-effort)
  steps.push(await recordFinishedGoodsEntry(input));

  // 6. Poblar links de la producción (best-effort)
  const insumoIds = [abono, biologicos].filter((s) => s.ok).map((s) => s.insumoRecordId);
  const bachesUsados = allocations.map((a) => a.bacheId);
  steps.push(await linkProduccion(input, kgBiochar, insumoIds, detalleIds, bachesUsados));

  return {
    ok: bacheStep.ok && insumosOk,
    produccionCodigo: input.produccionCodigo,
    proporciones: { kgBiochar, kgAbono, kgBiologicos, kgAgua },
    allocations,
    steps,
  };
}

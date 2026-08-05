// src/lib/blend-deduction.ts
//
// Servicio de auto-deducción de inventario para la producción de Biochar Blend.
// Se dispara al CONFIRMAR una producción.
//
// ═══ ARQUITECTURA (migración 2026-07-30) ═══════════════════════════════════════
// La producción NO es una fila en una tabla de PiroliApp: es un conjunto de
// movimientos en las bases Core unidos por un CÓDIGO DE LOTE (`BLEND-…`). Airtable
// no permite links entre bases, así que el lote es la llave. Para una producción de
// `kgTotal` KG este servicio escribe:
//
//   Sirius Insumos Core — un movimiento `Salida` POR BACHE de `Biochar Puro`, con
//     `ID Bache Origen` (S-00XXX) y `ID Produccion Destino` (el lote). Más las
//     Salidas de Abono 4G y Biológicos.
//   Sirius Inventario Production Core — la `Entrada` de producto terminado, cuyo
//     `documento_referencia` es el lote. ESE movimiento es el lote producido.
//   PiroliApp — `Detalle Cantidades Remision Pirolisis`, una fila por bache con
//     `ID Produccion Blend` = el lote. Es el ÚNICO mecanismo que baja la fórmula
//     `Total Cantidad Actual Biochar Seco` del bache, así que no es opcional: sin
//     esta fila la bodega mostraría biochar que ya se consumió.
//   PiroliApp — `Estado Bache` de cada bache consumido pasa a `Bache Incompleto` o
//     `Bache Agotado`. La tabla de baches es el HISTORIAL de pirólisis: los baches
//     no se borran, cambian de estado a medida que se vacían.
//
// El biochar se escribe en DOS vistas (Core y baches) a propósito: no son dos
// inventarios, son dos vistas del mismo. El Core responde "cuánto biochar hay y a
// dónde fue"; el bache responde "cuánto queda de ESTE bache", que es lo que
// necesita la UI de selección al producir. Si se separan, la agenda y la bodega
// avisan (ver `resolverBiocharDisponible`).
//
// El agua (pctAgua) NO se inventaría (se registra en el Turno).
//
// Diseño: cada paso captura su propio error y devuelve un StepResult. Las
// deducciones de baches e insumos son CRÍTICAS; la salida de biochar al Core, la
// entrada de producto terminado y el estado de los baches son best-effort (no
// revierten lo ya aplicado, pero se reportan y la respuesta sale con 207).

import { config } from './config';
import { appendMovimientoToStock, findStockByInsumo, getStockActual } from './stock-insumos';
import { buildCamposIdCore, resolveIdResponsableCore } from './movimientos-insumos';
import { actualizarEstadoBaches, estadoTrasConsumo } from './baches-biochar';

const AT = 'https://api.airtable.com/v0';

export interface BacheAllocation {
  bacheId: string;
  codigo: string;
  kg: number;
  stockDisponible: number;
  /** `Estado Bache` antes del consumo: decide si hay que cambiarlo y a qué. */
  estado: string;
}

export interface StepResult {
  step: string;
  ok: boolean;
  /** El paso no hizo falta (ya estaba escrito, o no había nada que cambiar). */
  skipped?: boolean;
  detail?: unknown;
  error?: string;
}

export interface DeductionInput {
  /**
   * Código de lote (`BLEND-…`): la identidad de la producción y la llave que une
   * las tres bases. Reemplaza al viejo `produccionRecordId` de la tabla local.
   */
  lote: string;
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
  /** Codigo de lote de la produccion. */
  lote: string;
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
      const estado = String(data.fields?.['Estado Bache'] ?? '');
      return { bacheId: id, codigo, stock, estado };
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
      allocations.push({
        bacheId: b.bacheId,
        codigo: b.codigo,
        kg: Number(tomar.toFixed(2)),
        stockDisponible: b.stock,
        estado: b.estado,
      });
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
    const estado = String(data.fields?.['Estado Bache'] ?? '');
    if (a.kg > stock + 1e-6) {
      throw new Error(`El bache ${codigo} solo tiene ${stock.toFixed(2)} kg de biochar (se pidieron ${a.kg.toFixed(2)})`);
    }
    out.push({
      bacheId: a.bacheId,
      codigo,
      kg: Number(a.kg.toFixed(2)),
      stockDisponible: stock,
      estado,
    });
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
  const observaciones = `Consumo interno para producción de Biochar Blend ${input.lote}`;

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
  const detalleRecords = allocations.map((a) => {
    const fields: Record<string, unknown> = {
      [df.cantidadEspecificada!]: a.kg,
      [df.remisionBachePirolisis!]: [remisionId],
      [df.bachePirolisis!]: [a.bacheId],
    };
    // Amarra la fila al lote: es lo único que dice CUÁNTO biochar salió de CADA
    // bache para este Blend. Va como texto (FK simbólica) porque la producción vive
    // en los Core y Airtable no permite links entre bases. Opcional para no romper
    // si la env var falta.
    if (df.idProduccionBlend) fields[df.idProduccionBlend] = input.lote;
    return { fields };
  });

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
      `consumo Blend ${input.lote}`
    )
  );
  fields[movFields.notas!] = `Consumo producción Biochar Blend ${input.lote}\nTipo uso: balance_de_masa (productivo)`;

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
    motivo: `Producción Biochar Blend ${input.lote}`,
    documento_referencia: input.lote,
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

/**
 * Registra la SALIDA de biochar en Sirius Insumos Core: un movimiento POR BACHE,
 * con el bache de origen y el lote de destino.
 *
 * Es lo que cierra el circulo con el libro mayor del biochar. Hasta el 2026-07-30
 * la app solo descontaba por los baches, asi que una produccion hecha desde la app
 * movia la formula del bache pero NO el Core, y las dos vistas se separaban.
 *
 * Un movimiento por bache y no uno agregado: asi cada movimiento tiene un unico
 * origen y un unico destino, y la trazabilidad se puede consultar en los dos
 * sentidos (del lote a los baches y del bache a los lotes).
 */
async function deductBiocharCore(
  input: DeductionInput,
  allocations: BacheAllocation[]
): Promise<StepResult> {
  const coreBaseId = config.airtable.insumosCoreBaseId;
  const token = config.airtable.insumosCoreToken;
  const movimientosTableId = config.airtable.movimientosInsumosTableId;
  const insumoBiochar = config.airtable.blendBiocharInsumoRecordId;
  const mf = config.airtable.movimientoFields;

  if (!coreBaseId || !token || !movimientosTableId || !insumoBiochar) {
    return {
      step: 'biochar_core',
      ok: false,
      error:
        'Biochar Puro no esta configurado como insumo del Core (falta AIRTABLE_BLEND_BIOCHAR_RECORD_ID): ' +
        'la salida de biochar al Core se omitio y el stock del Core quedara por encima del real.',
    };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const fecha = new Date().toISOString().split('T')[0];
  const idResponsable = await resolveIdResponsableCore(input.idResponsableCore);

  const records = allocations.map((a) => {
    const fields: Record<string, unknown> = {
      [mf.insumo!]: [insumoBiochar],
      [mf.cantidad!]: a.kg,
      [mf.tipoMovimiento!]: 'Salida',
    };
    if (mf.fechaMovimiento) fields[mf.fechaMovimiento] = fecha;
    if (mf.idBacheOrigen) fields[mf.idBacheOrigen] = a.codigo;
    if (mf.idProduccionDestino) fields[mf.idProduccionDestino] = input.lote;
    if (mf.notas) {
      fields[mf.notas] = `Consumo para produccion de Biochar Blend ${input.lote} - bache ${a.codigo}`;
    }
    Object.assign(fields, buildCamposIdCore(idResponsable, `consumo Blend ${input.lote}`));
    return { fields };
  });

  const res = await atFetch(`${AT}/${coreBaseId}/${movimientosTableId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    return { step: 'biochar_core', ok: false, error: JSON.stringify(res.data) };
  }

  const movimientoIds: string[] = (res.data.records ?? []).map((r: any) => r.id);

  // Vincular al Stock Insumos del biochar. El PATCH de un campo link REEMPLAZA el
  // array, asi que `appendMovimientoToStock` relee y concatena: sin eso se borraria
  // el historico de movimientos y con el el `stock_actual`.
  const stockErrores: string[] = [];
  try {
    const { record } = await findStockByInsumo(insumoBiochar);
    if (!record) {
      stockErrores.push('No existe registro de Stock Insumos para Biochar Puro');
    } else {
      for (const movimientoId of movimientoIds) {
        await appendMovimientoToStock(record.id, movimientoId);
      }
    }
  } catch (err) {
    stockErrores.push(err instanceof Error ? err.message : String(err));
  }

  if (stockErrores.length) {
    return {
      step: 'biochar_core',
      ok: false,
      error: `Movimientos creados pero no vinculados al stock: ${stockErrores.join(' | ')}`,
      detail: { movimientoIds },
    };
  }

  return { step: 'biochar_core', ok: true, detail: { movimientoIds, baches: allocations.length } };
}

/**
 * Pasa cada bache consumido a `Bache Incompleto` o `Bache Agotado`.
 *
 * La tabla de baches es el HISTORIAL de la produccion de pirolisis: los baches no
 * se borran, cambian de estado a medida que se vacian. Sin esto un bache consumido
 * se queda en "Bache Completo Bodega" con 0 kg.
 */
async function marcarEstadoBaches(allocations: BacheAllocation[]): Promise<StepResult> {
  const cambios = allocations
    .map((a) => ({ bacheId: a.bacheId, estado: estadoTrasConsumo(a.stockDisponible, a.kg, a.estado) }))
    .filter((c): c is { bacheId: string; estado: string } => c.estado !== null);

  if (!cambios.length) return { step: 'estado_baches', ok: true, detail: { sinCambios: true } };

  const { actualizados, errores } = await actualizarEstadoBaches(cambios);
  if (errores.length) {
    return { step: 'estado_baches', ok: false, error: errores.join(' | '), detail: { actualizados } };
  }
  return { step: 'estado_baches', ok: true, detail: { actualizados, cambios } };
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
    return { ok: false, lote: input.lote, proporciones: { kgBiochar, kgAbono, kgBiologicos, kgAgua }, allocations, steps };
  }

  // 2. Deducción de baches (crítico)
  const bacheStep = await deductBaches(input, allocations);
  steps.push(bacheStep);
  if (!bacheStep.ok) {
    return { ok: false, lote: input.lote, proporciones: { kgBiochar, kgAbono, kgBiologicos, kgAgua }, allocations, steps };
  }

  // 3. Deducción de insumos (crítico)
  const abono = await deductInsumo(config.airtable.blendAbono4gRecordId!, Number(kgAbono.toFixed(2)), 'Abono 4G', input);
  steps.push(abono);
  const biologicos = await deductInsumo(config.airtable.blendBiologicosRecordId!, Number(kgBiologicos.toFixed(2)), 'Biológicos', input);
  steps.push(biologicos);
  const insumosOk = abono.ok && biologicos.ok;

  // 4. Salida de biochar en Insumos Core, una por bache (best-effort).
  //    Va DESPUES de la deduccion por baches: si esa falla no se llega aqui, y asi
  //    no queda una salida en el Core sin su espejo en los baches.
  steps.push(await deductBiocharCore(input, allocations));

  // 5. Movimiento Entrada de producto terminado a Inventario Production Core.
  steps.push(await recordFinishedGoodsEntry(input));

  // 6. Estado de los baches consumidos (best-effort: es metadato de presentacion,
  //    el stock real ya lo movio el detalle por bache).
  steps.push(await marcarEstadoBaches(allocations));

  return {
    ok: bacheStep.ok && insumosOk,
    lote: input.lote,
    proporciones: { kgBiochar, kgAbono, kgBiologicos, kgAgua },
    allocations,
    steps,
  };
}

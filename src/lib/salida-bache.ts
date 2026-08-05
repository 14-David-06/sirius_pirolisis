// src/lib/salida-bache.ts
//
// Salida de biochar de un bache por un motivo que NO es producción de Blend:
// laboratorio, muestra, merma o traslado.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
// Vaciar un bache "ordenadamente" significa escribir el consumo en las TRES
// partes que lo representan, no en una:
//
//   PiroliApp — `Detalle Cantidades Remision Pirolisis`, una fila con el bache
//     vinculado. Es lo ÚNICO que baja `Total Cantidad Actual Biochar Seco`
//     (= SUM(masa seca del monitoreo) − SUM(cantidad de los detalles)).
//   Sirius Insumos Core — una `Salida` de `Biochar Puro` con `ID Bache Origen` y
//     `ID Produccion Destino` = la referencia de esta salida. Es el libro mayor:
//     lo que dice es lo que se puede despachar.
//   PiroliApp — `Estado Bache` → `Bache Agotado` / `Bache Incompleto`. La tabla de
//     baches es el HISTORIAL de pirólisis: los baches no se borran, se vacían.
//
// Hasta ahora solo `runBlendDeduction()` escribía las tres, y solo se dispara al
// producir Blend contra un pedido. La UI de remisión de baches escribía ÚNICAMENTE
// el detalle: el `stock_actual` del Core quedaba inflado (y como el Core manda en
// `resolverBiocharDisponible()`, la app seguía ofreciendo biochar que ya no existía)
// y el bache se quedaba en "Bache Completo Bodega" con 0 kg.
//
// ═══ NO HAY TRANSACCIONES ═════════════════════════════════════════════════════
// Cada paso devuelve un `StepResult`. El detalle en PiroliApp es CRÍTICO (sin él
// no hubo salida); la Salida del Core y el estado del bache son best-effort: se
// reportan y elevan la respuesta a 207, porque revertir el detalle por un fallo de
// trazabilidad dejaría al operador sin poder registrar lo que ya pasó en la finca.
//
// ═══ IDEMPOTENCIA ═════════════════════════════════════════════════════════════
// La llave es la `referencia` (`SAL-LAB-2026-08-05-S-00171`): determinista a partir
// de motivo + fecha + bache, así que un doble clic o un reintento de red no
// descuentan dos veces. Y como se verifica lado por lado, re-invocar una salida a
// la que le faltó un paso lo COMPLETA en vez de duplicarla: es también la
// herramienta para reparar una divergencia entre el Core y los baches.

import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import { appendMovimientoToStock, findStockByInsumo } from './stock-insumos';
import { buildCamposIdCore, resolveIdResponsableCore } from './movimientos-insumos';
import { actualizarEstadoBaches, estadoTrasConsumo } from './baches-biochar';
import { MOTIVOS_SALIDA, marcaSalida, referenciaSalida } from './salida-bache.constants';
import type { MotivoSalida } from './salida-bache.constants';
import type { StepResult } from './blend-deduction';

const AT = 'https://api.airtable.com/v0';

// Re-exportados para que el endpoint y los tests tengan un único punto de entrada.
export { MOTIVOS_SALIDA, esMotivoSalida, marcaSalida, referenciaSalida } from './salida-bache.constants';
export type { MotivoSalida } from './salida-bache.constants';

/** Por debajo de esto el bache se considera vacío: son restos de redondeo. */
const TOLERANCIA_KG = 0.01;

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface SalidaBacheInput {
  /** Record ID (`recXXX`) o `Codigo Bache` (`S-00XXX`). Se resuelven los dos. */
  bache: string;
  /** KG a sacar. Omitido (o mayor al disponible) = sale el bache completo. */
  kg?: number;
  motivo: MotivoSalida;
  /** A dónde/a quién fue: laboratorio, área, transportador. */
  destino?: string;
  observaciones?: string;
  /** Nombre legible de quien registra. */
  realizaRegistro: string;
  /** SIRIUS-PER del responsable; si no viene se resuelve de la sesión. */
  idResponsableCore?: string;
  /** `YYYY-MM-DD`. Por defecto hoy. Entra en la referencia. */
  fecha?: string;
  /**
   * Prefijo de la referencia cuando la salida pertenece a un documento con
   * identidad propia (`ACTA-BC-0007`). Ver `referenciaSalida`.
   */
  referenciaBase?: string;
  /**
   * Resuelve y valida todo, pero no escribe nada.
   *
   * Existe por la misma razón que el `--dry-run` de los scripts del repo: esta
   * operación mueve inventario real en dos bases y no se puede deshacer con un
   * botón. Poder ver el plan —qué bache, cuántos kg, a qué estado queda, qué parte
   * ya estaba escrita— antes de confirmar es lo que separa un registro de un susto.
   */
  dryRun?: boolean;
}

export interface SalidaBacheResult {
  /** Solo el paso crítico: el detalle que descuenta el bache. */
  ok: boolean;
  referencia: string;
  /** true si no se escribió nada nuevo: la salida ya estaba completa. */
  yaExistia: boolean;
  /** true si fue un ensayo: nada se escribió. */
  dryRun?: boolean;
  motivo: MotivoSalida;
  destino: string;
  fecha: string;
  bache: {
    id: string;
    codigo: string;
    /** Disponible ANTES de esta salida. */
    disponibleAntes: number;
    kg: number;
    estadoAnterior: string;
    /** Estado al que pasó, o null si no cambió. */
    estadoNuevo: string | null;
  };
  steps: StepResult[];
}

function localHeaders() {
  return {
    Authorization: `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

async function atFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data: data as Record<string, any> };
}

interface BacheResuelto {
  id: string;
  codigo: string;
  disponible: number;
  estado: string;
}

/**
 * Resuelve el bache por record ID o por código.
 *
 * Los identificadores de Airtable no son intercambiables entre bases: la bodega
 * lista los baches por `Codigo Bache` (los reconstruye del Core, que no guarda
 * record IDs) mientras el sistema de baches trabaja con `recXXX`. El endpoint
 * acepta las dos formas para que ambas pantallas puedan usarlo.
 */
async function resolverBache(identificador: string): Promise<BacheResuelto> {
  const { baseId, bachesTableId } = config.airtable;
  if (!baseId || !bachesTableId) throw new Error('Configuración de baches incompleta');

  const leer = (fields: Record<string, unknown>, id: string): BacheResuelto => ({
    id,
    codigo: String(fields['Codigo Bache'] ?? id),
    disponible: toNumber(fields['Total Cantidad Actual Biochar Seco']),
    estado: String(fields['Estado Bache'] ?? ''),
  });

  if (esRecordId(identificador)) {
    const { ok, data } = await atFetch(`${AT}/${baseId}/${bachesTableId}/${identificador}`, {
      headers: localHeaders(),
    });
    if (!ok) throw new Error(`No se encontró el bache ${identificador}`);
    return leer(data.fields ?? {}, data.id);
  }

  const url = new URL(`${AT}/${baseId}/${bachesTableId}`);
  url.searchParams.set('filterByFormula', `{Codigo Bache} = '${escapeAirtableValue(identificador)}'`);
  url.searchParams.set('maxRecords', '1');
  const { ok, data } = await atFetch(url.toString(), { headers: localHeaders() });
  if (!ok) throw new Error(`Error buscando el bache ${identificador}: ${JSON.stringify(data)}`);

  const registro = data.records?.[0];
  if (!registro) throw new Error(`No existe un bache con código ${identificador}`);
  return leer(registro.fields ?? {}, registro.id);
}

/**
 * Qué parte de esta salida ya está escrita.
 *
 * Se consulta lado por lado en vez de con un solo flag: si el detalle quedó
 * escrito y la Salida del Core no (justo la divergencia que este servicio viene a
 * cerrar), reintentar debe escribir la mitad que falta, no las dos ni ninguna.
 */
async function buscarSalidaExistente(
  referencia: string
): Promise<{ remisionId: string | null; kgRegistrados: number; movimientosCore: number }> {
  const { baseId, remisionesBachesTableId, insumosCoreBaseId, insumosCoreToken, movimientosInsumosTableId } =
    config.airtable;

  let remisionId: string | null = null;
  let kgRegistrados = 0;
  if (baseId && remisionesBachesTableId) {
    const url = new URL(`${AT}/${baseId}/${remisionesBachesTableId}`);
    const marca = escapeAirtableValue(marcaSalida(referencia));
    url.searchParams.set('filterByFormula', `FIND('${marca}', {Observaciones}) > 0`);
    url.searchParams.set('maxRecords', '1');
    const { ok, data } = await atFetch(url.toString(), { headers: localHeaders() });
    // Ante la duda NO se asume que ya existe: perder una salida real es peor que un
    // duplicado, que al menos es detectable por la referencia repetida.
    if (!ok) throw new Error(`No se pudo verificar si ${referencia} ya está registrada: ${JSON.stringify(data)}`);

    const remision = data.records?.[0];
    remisionId = remision?.id ?? null;
    if (remisionId) kgRegistrados = await leerKgDeRemision(remision);
  }

  let movimientosCore = 0;
  if (insumosCoreBaseId && insumosCoreToken && movimientosInsumosTableId) {
    const url = new URL(`${AT}/${insumosCoreBaseId}/${movimientosInsumosTableId}`);
    url.searchParams.set(
      'filterByFormula',
      `{ID Produccion Destino} = '${escapeAirtableValue(referencia)}'`
    );
    url.searchParams.set('maxRecords', '1');
    const { ok, data } = await atFetch(url.toString(), {
      headers: { Authorization: `Bearer ${insumosCoreToken}` },
    });
    if (!ok) throw new Error(`No se pudo verificar la salida en el Core: ${JSON.stringify(data)}`);
    movimientosCore = (data.records ?? []).length;
  }

  return { remisionId, kgRegistrados, movimientosCore };
}

/**
 * KG que ya descontó una remisión de salida, leídos de sus detalles.
 *
 * Hace falta para el reintento: una vez escrito el detalle, la fórmula del bache
 * está en 0, así que el disponible ya no dice cuántos kg salieron. Sin este dato un
 * reintento no podría escribir la Salida del Core que faltó — que es exactamente el
 * caso que este servicio existe para cerrar.
 */
async function leerKgDeRemision(remision: { fields?: Record<string, unknown> }): Promise<number> {
  const { baseId, detalleCantidadesRemisionTableId } = config.airtable;
  const campoCantidad = config.airtable.detalleCantidadesFields.cantidadEspecificada;
  const detalles = remision.fields?.['Detalle Cantidades Bache Pirolisis'];

  if (!Array.isArray(detalles) || !detalles.length || !baseId || !detalleCantidadesRemisionTableId) {
    return 0;
  }

  let total = 0;
  for (const detalle of detalles) {
    const id = typeof detalle === 'string' ? detalle : (detalle as { id?: string })?.id;
    if (!id) continue;
    // `returnFieldsByFieldId` porque `config` guarda field IDs: la respuesta normal
    // viene indexada por NOMBRE y leer `fields[fieldId]` daría siempre undefined.
    const { ok, data } = await atFetch(
      `${AT}/${baseId}/${detalleCantidadesRemisionTableId}/${id}?returnFieldsByFieldId=true`,
      { headers: localHeaders() }
    );
    if (ok && campoCantidad) total += toNumber(data.fields?.[campoCantidad]);
  }

  return Math.round(total * 100) / 100;
}

/**
 * Remisión de baches + su detalle: es lo que baja la fórmula del bache.
 *
 * Se reutiliza el par remisión/detalle del flujo tradicional en vez de escribir el
 * detalle solo: la remisión es donde viven la fecha, el responsable, el destino y
 * el motivo. Un detalle huérfano descontaría los kg sin dejar dicho por qué, que es
 * exactamente el "biochar fantasma" de la auditoría del 2026-07-29.
 */
async function escribirRemisionYDetalle(
  input: Required<Pick<SalidaBacheInput, 'motivo' | 'realizaRegistro'>> & {
    destino: string;
    observaciones?: string;
    fecha: string;
  },
  bache: BacheResuelto,
  kg: number,
  referencia: string
): Promise<StepResult> {
  const { baseId, remisionesBachesTableId, detalleCantidadesRemisionTableId } = config.airtable;
  const rf = config.airtable.remisionesBachesFields;
  const df = config.airtable.detalleCantidadesFields;

  if (
    !baseId ||
    !remisionesBachesTableId ||
    !detalleCantidadesRemisionTableId ||
    !df.cantidadEspecificada ||
    !df.remisionBachePirolisis ||
    !df.bachePirolisis ||
    !rf.bachePirolisisAlterado
  ) {
    return { step: 'remision_detalle', ok: false, error: 'Config de remisiones/detalle de baches incompleta' };
  }

  const etiqueta = MOTIVOS_SALIDA[input.motivo].etiqueta;
  const observaciones = [
    `Salida de bache — ${etiqueta}. Destino: ${input.destino}.`,
    input.observaciones?.trim(),
    marcaSalida(referencia),
  ]
    .filter(Boolean)
    .join('\n');

  const remisionFields: Record<string, unknown> = {
    [rf.bachePirolisisAlterado]: [bache.id],
  };
  if (rf.fechaEvento) remisionFields[rf.fechaEvento] = input.fecha;
  if (rf.realizaRegistro) remisionFields[rf.realizaRegistro] = input.realizaRegistro;
  if (rf.observaciones) remisionFields[rf.observaciones] = observaciones;
  // `Cliente` es un singleLineText: no hay tabla de destinos, así que aquí va el
  // laboratorio o el área que recibe. No es una venta, y la observación lo dice.
  if (rf.cliente) remisionFields[rf.cliente] = input.destino;

  const remRes = await atFetch(`${AT}/${baseId}/${remisionesBachesTableId}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ fields: remisionFields }),
  });
  if (!remRes.ok) {
    return { step: 'remision_detalle', ok: false, error: `Error creando la remisión: ${JSON.stringify(remRes.data)}` };
  }
  const remisionId = remRes.data.id as string;

  // `ID Produccion Blend` se deja VACÍO a propósito: es la FK al lote de Blend, y
  // `getBachesDeLote()` reconstruye la composición de un despacho a partir de ella.
  // Escribir aquí una referencia `SAL-…` metería una salida a laboratorio dentro de
  // la trazabilidad de carbono de un lote que no la consumió.
  const detalleFields: Record<string, unknown> = {
    [df.cantidadEspecificada]: Number(kg.toFixed(2)),
    [df.remisionBachePirolisis]: [remisionId],
    [df.bachePirolisis]: [bache.id],
  };

  const detRes = await atFetch(`${AT}/${baseId}/${detalleCantidadesRemisionTableId}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ records: [{ fields: detalleFields }] }),
  });

  if (!detRes.ok) {
    // Rollback del padre: una remisión sin detalle no descuenta nada y dejaría la
    // marca de idempotencia puesta, bloqueando el reintento de una salida que
    // nunca ocurrió.
    await fetch(`${AT}/${baseId}/${remisionesBachesTableId}/${remisionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.airtable.token}` },
    }).catch(() => {});
    return {
      step: 'remision_detalle',
      ok: false,
      error: `Error creando el detalle (rollback de la remisión aplicado): ${JSON.stringify(detRes.data)}`,
    };
  }

  return {
    step: 'remision_detalle',
    ok: true,
    detail: { remisionId, detalleId: detRes.data.records?.[0]?.id, kg: Number(kg.toFixed(2)) },
  };
}

/**
 * Salida de `Biochar Puro` en Sirius Insumos Core: el libro mayor de bodega.
 *
 * Sin este paso el `stock_actual` del insumo queda por encima del real y, como el
 * Core manda en `resolverBiocharDisponible()`, la app seguiría ofreciendo para
 * producir un biochar que ya salió de la planta.
 */
async function escribirSalidaCore(
  bache: BacheResuelto,
  kg: number,
  referencia: string,
  input: { motivo: MotivoSalida; destino: string; fecha: string; idResponsableCore?: string }
): Promise<StepResult> {
  const { insumosCoreBaseId, insumosCoreToken, movimientosInsumosTableId, blendBiocharInsumoRecordId } =
    config.airtable;
  const mf = config.airtable.movimientoFields;

  if (!insumosCoreBaseId || !insumosCoreToken || !movimientosInsumosTableId || !blendBiocharInsumoRecordId) {
    return {
      step: 'biochar_core',
      ok: false,
      error:
        'Biochar Puro no está configurado como insumo del Core (falta AIRTABLE_BLEND_BIOCHAR_RECORD_ID): ' +
        'la salida no se registró en el libro mayor y el stock del Core queda por encima del real.',
    };
  }

  const etiqueta = MOTIVOS_SALIDA[input.motivo].etiqueta;
  const fields: Record<string, unknown> = {
    [mf.insumo!]: [blendBiocharInsumoRecordId],
    [mf.cantidad!]: Number(kg.toFixed(2)),
    [mf.tipoMovimiento!]: 'Salida',
    ...buildCamposIdCore(
      await resolveIdResponsableCore(input.idResponsableCore),
      `salida de bache ${bache.codigo} (${etiqueta})`
    ),
  };
  if (mf.fechaMovimiento) fields[mf.fechaMovimiento] = input.fecha;
  if (mf.idBacheOrigen) fields[mf.idBacheOrigen] = bache.codigo;
  if (mf.idProduccionDestino) fields[mf.idProduccionDestino] = referencia;
  // `Name` (las notas) es un singleLineText: todo en una línea.
  if (mf.notas) {
    fields[mf.notas] = `Salida de biochar — ${etiqueta} · destino ${input.destino} · bache ${bache.codigo} ${marcaSalida(referencia)}`;
  }

  const res = await atFetch(`${AT}/${insumosCoreBaseId}/${movimientosInsumosTableId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${insumosCoreToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!res.ok) return { step: 'biochar_core', ok: false, error: JSON.stringify(res.data) };

  const movimientoId = res.data.records?.[0]?.id as string;

  // Vincular al Stock Insumos: es lo que hace que `stock_actual` lo cuente.
  // `appendMovimientoToStock` relee y concatena porque el PATCH de un campo link
  // REEMPLAZA el array; sin eso se borraría el histórico y con él el stock.
  try {
    const { record } = await findStockByInsumo(blendBiocharInsumoRecordId);
    if (!record) {
      return {
        step: 'biochar_core',
        ok: false,
        error: 'Movimiento creado pero Biochar Puro no tiene registro en Stock Insumos: el stock no lo refleja.',
        detail: { movimientoId },
      };
    }
    await appendMovimientoToStock(record.id, movimientoId);
  } catch (err) {
    return {
      step: 'biochar_core',
      ok: false,
      error: `Movimiento creado pero no vinculado al stock: ${err instanceof Error ? err.message : String(err)}`,
      detail: { movimientoId },
    };
  }

  return { step: 'biochar_core', ok: true, detail: { movimientoId, kg: Number(kg.toFixed(2)) } };
}

/**
 * Registra la salida de un bache por un motivo que no es producción de Blend.
 *
 * @throws Si el bache no existe o si los KG pedidos exceden el disponible. Son
 *   errores de entrada: se rechazan ANTES de escribir nada, para no dejar la
 *   operación a medias.
 */
export async function runSalidaBache(input: SalidaBacheInput): Promise<SalidaBacheResult> {
  const fecha = input.fecha?.trim() || new Date().toISOString().split('T')[0];
  const bache = await resolverBache(input.bache);
  const referencia = referenciaSalida(input.motivo, fecha, bache.codigo, input.referenciaBase);
  // Sin destino explícito queda el motivo: es más honesto que un campo vacío, y la
  // merma no tiene a dónde ir.
  const destino = input.destino?.trim() || MOTIVOS_SALIDA[input.motivo].etiqueta;

  // La idempotencia se consulta ANTES de validar disponibilidad, y no después: en
  // cuanto el detalle está escrito la fórmula del bache marca 0, así que validar
  // primero hacía que reintentar una salida ya registrada muriera con "el bache no
  // tiene biochar disponible" en vez de reconocerla. El reintento es la herramienta
  // para completar la mitad que faltó; no puede estrellarse contra su propio efecto.
  const existente = await buscarSalidaExistente(referencia);

  // KG: omitido o por encima del disponible = sale el bache completo. Un bigbag que
  // sale entero es el caso normal, y pedir el número exacto de una fórmula con dos
  // decimales sería una trampa para el operador.
  const kgPedidos = Number(input.kg);
  const kg = existente.remisionId
    ? existente.kgRegistrados
    : Number.isFinite(kgPedidos) && kgPedidos > 0 && kgPedidos < bache.disponible
      ? kgPedidos
      : bache.disponible;

  // El disponible de ANTES de esta salida: con el detalle ya escrito hay que
  // sumárselo de vuelta para que el estado se calcule contra el mismo número que la
  // primera vez.
  const disponibleAntes = existente.remisionId ? bache.disponible + kg : bache.disponible;

  if (!existente.remisionId) {
    if (bache.disponible <= TOLERANCIA_KG) {
      throw new Error(
        `El bache ${bache.codigo} no tiene biochar disponible (${bache.disponible.toFixed(2)} kg): no hay nada que dar de salida.`
      );
    }
    if (Number.isFinite(kgPedidos) && kgPedidos > bache.disponible + TOLERANCIA_KG) {
      throw new Error(
        `El bache ${bache.codigo} solo tiene ${bache.disponible.toFixed(2)} kg (se pidieron ${kgPedidos.toFixed(2)}).`
      );
    }
  }

  const estadoPrevisto = estadoTrasConsumo(disponibleAntes, kg, bache.estado);

  if (input.dryRun) {
    return {
      ok: true,
      referencia,
      yaExistia: Boolean(existente.remisionId) && existente.movimientosCore > 0,
      dryRun: true,
      motivo: input.motivo,
      destino,
      fecha,
      bache: {
        id: bache.id,
        codigo: bache.codigo,
        disponibleAntes,
        kg: Number(kg.toFixed(2)),
        estadoAnterior: bache.estado,
        estadoNuevo: estadoPrevisto,
      },
      steps: [
        {
          step: 'remision_detalle',
          ok: true,
          skipped: Boolean(existente.remisionId),
          detail: existente.remisionId
            ? { remisionId: existente.remisionId, motivo: 'Ya registrada' }
            : { porEscribir: { kg: Number(kg.toFixed(2)), bache: bache.codigo, destino } },
        },
        {
          step: 'biochar_core',
          ok: true,
          skipped: existente.movimientosCore > 0,
          detail:
            existente.movimientosCore > 0
              ? { motivo: 'El Core ya tiene esta salida' }
              : { porEscribir: { tipo: 'Salida', kg: Number(kg.toFixed(2)), idProduccionDestino: referencia } },
        },
        {
          step: 'estado_bache',
          ok: true,
          skipped: !estadoPrevisto,
          detail: { de: bache.estado, a: estadoPrevisto ?? bache.estado },
        },
      ],
    };
  }

  const steps: StepResult[] = [];

  // Detalle en PiroliApp (CRÍTICO): es lo único que baja la fórmula del bache.
  if (existente.remisionId) {
    steps.push({
      step: 'remision_detalle',
      ok: true,
      skipped: true,
      detail: { remisionId: existente.remisionId, motivo: `La salida ${referencia} ya estaba registrada` },
    });
  } else {
    const paso = await escribirRemisionYDetalle(
      {
        motivo: input.motivo,
        realizaRegistro: input.realizaRegistro,
        destino,
        observaciones: input.observaciones,
        fecha,
      },
      bache,
      kg,
      referencia
    );
    steps.push(paso);
    if (!paso.ok) {
      return {
        ok: false,
        referencia,
        yaExistia: false,
        motivo: input.motivo,
        destino,
        fecha,
        bache: {
          id: bache.id,
          codigo: bache.codigo,
          disponibleAntes,
          kg,
          estadoAnterior: bache.estado,
          estadoNuevo: null,
        },
        steps,
      };
    }
  }

  // Salida en el libro mayor del Core (best-effort).
  if (existente.movimientosCore > 0) {
    steps.push({
      step: 'biochar_core',
      ok: true,
      skipped: true,
      detail: { motivo: `El Core ya tiene la salida ${referencia}` },
    });
  } else {
    steps.push(
      await escribirSalidaCore(bache, kg, referencia, {
        motivo: input.motivo,
        destino,
        fecha,
        idResponsableCore: input.idResponsableCore,
      })
    );
  }

  // Estado del bache (best-effort: es metadato de presentación, el stock ya se movió).
  // `estadoPrevisto` se calculó con el disponible de ANTES menos lo consumido, no
  // releyendo el bache: la fórmula de Airtable tarda en recalcular y una relectura
  // inmediata devuelve el valor viejo.
  const estadoNuevo = estadoPrevisto;
  if (!estadoNuevo) {
    steps.push({ step: 'estado_bache', ok: true, skipped: true, detail: { estado: bache.estado } });
  } else {
    const { errores } = await actualizarEstadoBaches([{ bacheId: bache.id, estado: estadoNuevo }]);
    steps.push(
      errores.length
        ? { step: 'estado_bache', ok: false, error: errores.join(' | ') }
        : { step: 'estado_bache', ok: true, detail: { de: bache.estado, a: estadoNuevo } }
    );
  }

  const yaExistia = steps.every((paso) => paso.skipped);

  return {
    ok: true,
    referencia,
    yaExistia,
    motivo: input.motivo,
    destino,
    fecha,
    bache: {
      id: bache.id,
      codigo: bache.codigo,
      disponibleAntes,
      kg: Number(kg.toFixed(2)),
      estadoAnterior: bache.estado,
      estadoNuevo,
    },
    steps,
  };
}

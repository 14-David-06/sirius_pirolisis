// src/lib/produccion-blend.ts
//
// Producción de Biochar Blend: convertir biochar puro + abono 4G en producto
// terminado.
//
// ═══ QUÉ ES UNA PRODUCCIÓN ════════════════════════════════════════════════════
// No es una fila en una tabla. Es un conjunto de movimientos en dos bases unidos
// por un código de lote `BLEND-…` (§5 de CLAUDE.md). Producir escribe, para un
// mismo lote:
//
//   PiroliApp — un `Detalle Cantidades` por bache, con el bache vinculado y con
//     `ID Produccion Blend` = el lote. Es lo ÚNICO que baja
//     `Total Cantidad Actual Biochar Seco`, y es la FK por la que
//     `getBachesDeLote()` reconstruye qué baches compusieron el despacho.
//   Inventario Production Core — una `Salida` de Biochar Puro POR BACHE
//     (`bache_origen_id` = S-00XXX, `produccion_destino_id` = lote), una `Salida`
//     de Abono 4G por el total, y una `Entrada` de Biochar Blend por lo producido.
//   PiroliApp — el `Estado Bache` de cada bache que quedó vacío o a medias.
//
// La composición, el CO₂ y los baches del lote NO se guardan: se DERIVAN de esos
// movimientos. Guardarlos sería duplicar un dato que puede divergir.
//
// ═══ POR QUÉ EXISTE DE NUEVO ══════════════════════════════════════════════════
// La UI de producción se eliminó en la depuración del 2026-08-21 y con ella el
// único camino para que el biochar de bodega se convirtiera en Blend: el inventario
// solo sabía crecer. Este módulo la devuelve como una operación explícita y
// auditable, no como el efecto colateral de despachar un pedido.
//
// ═══ NO HAY TRANSACCIONES ═════════════════════════════════════════════════════
// Cinco escrituras en dos bases no pueden ser atómicas. Cada paso devuelve un
// `StepResult`. Los detalles de PiroliApp son CRÍTICOS —sin ellos el bache no se
// descontó y no hubo producción—; las salidas del Core, la del abono, la entrada de
// Blend y los estados son best-effort: se reportan y elevan la respuesta a 207.
// Revertir un descuento ya escrito por un fallo de trazabilidad dejaría al operador
// sin poder registrar lo que ya pasó en la planta.
//
// ═══ IDEMPOTENCIA ═════════════════════════════════════════════════════════════
// El lote es determinista (`BLEND-<fecha>` + pedido). Cada parte tiene su llave y
// se verifica lado por lado, así que reintentar una producción a la que le faltó un
// paso lo COMPLETA en vez de duplicarla:
//   · consumo de un bache  → `<lote>-<codigoBache>`
//   · consumo de abono     → `ABONO-<lote>`
//   · entrada de Blend     → `<lote>`
// Ojo con el otro lado del trato: dos producciones distintas el mismo día SIN
// pedido comparten lote y la segunda se lee como un reintento de la primera. Por
// eso el formulario ofrece el sufijo.

import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import {
  crearMovimientoBiocharPuro,
  credencialesBiocharPuro,
} from './biochar-inventario-core';
import {
  credencialesAbono,
  getStockAbono,
  referenciaConsumoAbono,
  registrarMovimientoAbono,
} from './abono-inventario-core';
import {
  blendConfigurado,
  credencialesBlend,
  referenciaEntradaBlend,
  registrarEntradaBlend,
} from './blend-inventario-core';
import { existeMovimientoConReferencia } from './inventario-prod-core';
import { actualizarEstadoBaches, estadoTrasConsumo } from './baches-biochar';
import {
  TOLERANCIA_KG,
  loteDeProduccion,
  marcaProduccion,
  referenciaBacheDeLote,
} from './produccion-blend.constants';
import type { StepResult } from '@/types/step-result';

const AT = 'https://api.airtable.com/v0';

export {
  loteDeProduccion,
  esLoteBlend,
  referenciaBacheDeLote,
  marcaProduccion,
} from './produccion-blend.constants';

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ConsumoBacheInput {
  /** Record ID (`recXXX`) o `Codigo Bache` (`S-00XXX`). Se resuelven los dos. */
  bache: string;
  /** KG de biochar seco que aporta este bache. Omitido = el bache completo. */
  kg?: number;
}

export interface ProduccionBlendInput {
  /** Los baches que aportan el biochar. Al menos uno. */
  baches: ConsumoBacheInput[];
  /** KG de abono 4G que entraron a la mezcla. */
  kgAbono: number;
  /**
   * KG de Blend obtenidos. Omitido = biochar + abono.
   *
   * Es un dato PESADO, no calculado: la fórmula del Blend suma 99,7% y sus
   * componentes no cuadran con el total (decisión abierta con DataLab, §5), así que
   * derivar la producción de los porcentajes inventaría kilos. El agua y los
   * biológicos tampoco están en este inventario.
   */
  kgBlend?: number;
  /** Pedido u otro sufijo que distingue el lote dentro del día. */
  sufijoLote?: string;
  /** `YYYY-MM-DD`. Por defecto hoy. Entra en el lote. */
  fecha?: string;
  /** Nombre legible de quien registra. Queda como `responsable` en el Core. */
  realizaRegistro: string;
  observaciones?: string;
  /**
   * Resuelve y valida todo, pero no escribe nada.
   *
   * Existe por la misma razón que el `--dry-run` de los scripts del repo: esto mueve
   * inventario real en dos bases y no se deshace con un botón. Ver el plan —qué
   * baches, cuántos kg, a qué estado quedan, qué parte ya estaba escrita— antes de
   * confirmar es lo que separa un registro de un susto.
   */
  dryRun?: boolean;
}

export interface BacheProducido {
  id: string;
  codigo: string;
  /** Disponible ANTES de esta producción. */
  disponibleAntes: number;
  kg: number;
  estadoAnterior: string;
  /** Estado al que pasó, o null si no cambió. */
  estadoNuevo: string | null;
  /** true si el consumo de este bache ya estaba escrito. */
  yaExistia: boolean;
}

export interface ProduccionBlendResult {
  /** Solo el paso crítico: los detalles que descuentan los baches. */
  ok: boolean;
  lote: string;
  fecha: string;
  /** true si no se escribió nada nuevo: la producción ya estaba completa. */
  yaExistia: boolean;
  /** true si fue un ensayo: nada se escribió. */
  dryRun?: boolean;
  kgBiochar: number;
  kgAbono: number;
  kgBlend: number;
  baches: BacheProducido[];
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
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

interface BacheResuelto {
  id: string;
  codigo: string;
  disponible: number;
  estado: string;
}

/**
 * Resuelve un bache por record ID o por `Codigo Bache`.
 *
 * Los dos, porque los identificadores de Airtable no son intercambiables entre
 * bases: la UI trae el `recXXX` local, pero el Core solo conoce el código.
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
 * ¿Ya está escrito el detalle que descuenta ESTE bache para ESTE lote?
 *
 * Se busca por la marca en las Observaciones de la remisión y no por
 * `ID Produccion Blend`: ese campo vive en el detalle, y en una `filterByFormula`
 * un campo link se evalúa como el texto del campo primario del registro vinculado
 * —no como su record ID—, así que cruzar detalle-con-bache desde una fórmula es
 * justamente la trampa documentada en §3 de CLAUDE.md.
 */
async function detalleExistente(referencia: string): Promise<{ remisionId: string; kg: number } | null> {
  const { baseId, remisionesBachesTableId } = config.airtable;
  if (!baseId || !remisionesBachesTableId) return null;

  const url = new URL(`${AT}/${baseId}/${remisionesBachesTableId}`);
  url.searchParams.set('filterByFormula', `FIND('${escapeAirtableValue(marcaProduccion(referencia))}', {Observaciones}) > 0`);
  url.searchParams.set('maxRecords', '1');
  const { ok, data } = await atFetch(url.toString(), { headers: localHeaders() });
  // Ante la duda NO se asume que ya existe: perder un consumo real es peor que un
  // duplicado, que al menos es detectable por la referencia repetida.
  if (!ok) throw new Error(`No se pudo verificar si ${referencia} ya está registrado: ${JSON.stringify(data)}`);

  const remision = data.records?.[0];
  if (!remision) return null;
  return { remisionId: remision.id as string, kg: await leerKgDeRemision(remision) };
}

/**
 * KG que ya descontó una remisión, leídos de sus detalles.
 *
 * Hace falta para el reintento: una vez escrito el detalle la fórmula del bache ya
 * bajó, así que el disponible no dice cuántos kg salieron. Sin este dato no se
 * podría escribir la Salida del Core que faltó — el caso que este módulo tiene que
 * poder cerrar.
 */
async function leerKgDeRemision(remision: { fields?: Record<string, unknown> }): Promise<number> {
  const { baseId, detalleCantidadesRemisionTableId } = config.airtable;
  const campoCantidad = config.airtable.detalleCantidadesFields.cantidadEspecificada;
  const detalles = remision.fields?.['Detalle Cantidades Bache Pirolisis'];

  if (!Array.isArray(detalles) || !detalles.length || !baseId || !detalleCantidadesRemisionTableId || !campoCantidad) {
    return 0;
  }

  let total = 0;
  for (const detalleId of detalles as string[]) {
    const { ok, data } = await atFetch(
      `${AT}/${baseId}/${detalleCantidadesRemisionTableId}/${detalleId}?returnFieldsByFieldId=true`,
      { headers: localHeaders() }
    );
    if (ok) total += toNumber(data.fields?.[campoCantidad]);
  }
  return r2(total);
}

/**
 * El detalle en PiroliApp: lo único que baja la fórmula del bache.
 *
 * A diferencia de una salida a laboratorio, aquí `ID Produccion Blend` SÍ se
 * escribe: es la FK simbólica al lote, y sin ella la composición del despacho no se
 * puede reconstruir. Va como texto porque Airtable no permite links entre bases y
 * la producción vive en los Core.
 */
async function escribirDetalleDeBache(
  bache: BacheResuelto,
  kg: number,
  lote: string,
  referencia: string,
  input: { fecha: string; realizaRegistro: string; observaciones?: string }
): Promise<StepResult> {
  const step = `detalle_${bache.codigo}`;
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
    return { step, ok: false, error: 'Config de remisiones/detalle de baches incompleta' };
  }

  const observaciones = [
    `Producción de Biochar Blend — lote ${lote}.`,
    input.observaciones?.trim(),
    marcaProduccion(referencia),
  ]
    .filter(Boolean)
    .join('\n');

  const remisionFields: Record<string, unknown> = {
    [rf.bachePirolisisAlterado]: [bache.id],
  };
  if (rf.fechaEvento) remisionFields[rf.fechaEvento] = input.fecha;
  if (rf.realizaRegistro) remisionFields[rf.realizaRegistro] = input.realizaRegistro;
  if (rf.observaciones) remisionFields[rf.observaciones] = observaciones;
  // `Cliente` es un singleLineText y esto no es una venta: queda el lote, que es a
  // dónde fue el material. La observación lo dice con todas las letras.
  if (rf.cliente) remisionFields[rf.cliente] = `Producción ${lote}`;

  const remRes = await atFetch(`${AT}/${baseId}/${remisionesBachesTableId}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ fields: remisionFields }),
  });
  if (!remRes.ok) {
    return { step, ok: false, error: `Error creando la remisión: ${JSON.stringify(remRes.data)}` };
  }
  const remisionId = remRes.data.id as string;

  const detalleFields: Record<string, unknown> = {
    [df.cantidadEspecificada]: r2(kg),
    [df.remisionBachePirolisis]: [remisionId],
    [df.bachePirolisis]: [bache.id],
  };
  if (df.idProduccionBlend) detalleFields[df.idProduccionBlend] = lote;

  const detRes = await atFetch(`${AT}/${baseId}/${detalleCantidadesRemisionTableId}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ records: [{ fields: detalleFields }] }),
  });

  if (!detRes.ok) {
    // Rollback del padre: una remisión sin detalle no descuenta nada y dejaría la
    // marca de idempotencia puesta, bloqueando el reintento de un consumo que nunca
    // ocurrió.
    await fetch(`${AT}/${baseId}/${remisionesBachesTableId}/${remisionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${config.airtable.token}` },
    }).catch(() => {});
    return {
      step,
      ok: false,
      error: `Error creando el detalle (rollback de la remisión aplicado): ${JSON.stringify(detRes.data)}`,
    };
  }

  return { step, ok: true, detail: { remisionId, detalleId: detRes.data.records?.[0]?.id, kg: r2(kg) } };
}

/**
 * La Salida de Biochar Puro en el libro mayor, una por bache.
 *
 * Una por bache y no una sola por el total porque `bache_origen_id` es lo que
 * sostiene la contabilidad de carbono: sin ella se pierde de qué bache salió cada
 * kg, que es la pregunta que el Core existe para responder.
 */
async function escribirSalidaBiochar(
  bache: BacheResuelto,
  kg: number,
  lote: string,
  referencia: string,
  input: { fecha: string; realizaRegistro: string }
): Promise<StepResult> {
  const step = `biochar_core_${bache.codigo}`;

  if (!credencialesBiocharPuro()) {
    return {
      step,
      ok: false,
      error:
        'Biochar Puro no está configurado como producto del Core (falta ' +
        'AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID): el consumo no se registró en el libro ' +
        'mayor y el stock queda por encima del real.',
    };
  }

  try {
    const { movimientoId, kg: cantidad, vinculadoAlStock } = await crearMovimientoBiocharPuro({
      tipo: 'Salida',
      kg,
      bacheOrigen: bache.codigo,
      // El lote PELADO: es la FK que `getBachesDeLote()` cruza. La llave de
      // deduplicación, que sí lleva el bache, va en `documento_referencia`.
      produccionDestino: lote,
      documentoReferencia: referencia,
      motivo: `Producción de Biochar Blend — lote ${lote}`,
      fecha: input.fecha,
      responsable: input.realizaRegistro,
      ubicacionDestino: `Producción ${lote}`,
      observaciones: `Consumo de biochar para el lote ${lote} · bache ${bache.codigo} ${marcaProduccion(referencia)}`,
    });

    if (!vinculadoAlStock) {
      return {
        step,
        ok: false,
        error: 'Movimiento creado pero el biochar puro no tiene fila en Stock_Actual: el saldo no lo refleja.',
        detail: { movimientoId },
      };
    }

    return { step, ok: true, detail: { movimientoId, kg: cantidad } };
  } catch (err) {
    return { step, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** El consumo de abono 4G del lote: una sola Salida por el total. El abono no se traza por bache. */
async function escribirSalidaAbono(
  kg: number,
  lote: string,
  input: { fecha: string; realizaRegistro: string }
): Promise<StepResult> {
  if (kg <= TOLERANCIA_KG) {
    return { step: 'abono_core', ok: true, skipped: true, detail: { motivo: 'La producción no consumió abono' } };
  }

  try {
    const creado = await registrarMovimientoAbono({
      tipo: 'Salida',
      kg,
      documentoReferencia: referenciaConsumoAbono(lote),
      produccionDestino: lote,
      motivo: `Producción de Biochar Blend — lote ${lote}`,
      fecha: input.fecha,
      responsable: input.realizaRegistro,
      observaciones: `Consumo de abono 4G para el lote ${lote}`,
    });

    if (!creado) {
      return {
        step: 'abono_core',
        ok: false,
        error:
          'El abono 4G no está configurado como producto del Core (falta ' +
          'AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID): su consumo no se descontó.',
      };
    }
    if (creado.yaExistia) {
      return { step: 'abono_core', ok: true, skipped: true, detail: { motivo: `El lote ${lote} ya descontó su abono` } };
    }
    if (!creado.vinculadoAlStock) {
      return {
        step: 'abono_core',
        ok: false,
        error: 'Movimiento creado pero el abono no tiene fila en Stock_Actual: el saldo no lo refleja.',
        detail: { movimientoId: creado.movimientoId },
      };
    }
    return { step: 'abono_core', ok: true, detail: { movimientoId: creado.movimientoId, kg: creado.cantidad } };
  } catch (err) {
    return { step: 'abono_core', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** La Entrada de Blend: el producto terminado que sale de la mezcla. */
async function escribirEntradaBlend(
  kg: number,
  lote: string,
  input: { fecha: string; realizaRegistro: string; observaciones?: string }
): Promise<StepResult> {
  try {
    const creado = await registrarEntradaBlend({
      kg,
      lote,
      fecha: input.fecha,
      responsable: input.realizaRegistro,
      observaciones: [`Blend producido en el lote ${lote}`, input.observaciones?.trim()].filter(Boolean).join(' · '),
    });

    if (!creado) {
      return {
        step: 'blend_core',
        ok: false,
        error:
          'El Biochar Blend no está configurado como producto del Core (falta ' +
          'AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID): la producción no se registró como stock.',
      };
    }
    if (creado.yaExistia) {
      return { step: 'blend_core', ok: true, skipped: true, detail: { motivo: `El lote ${lote} ya tiene su entrada` } };
    }
    if (!creado.vinculadoAlStock) {
      // No es hipotético: la fila de Stock_Actual del Blend arrastra esta deuda desde
      // la carga histórica del 2026-07-30 (§8 de CLAUDE.md).
      return {
        step: 'blend_core',
        ok: false,
        error: 'Movimiento creado pero el Blend no tiene fila en Stock_Actual: el saldo no lo refleja.',
        detail: { movimientoId: creado.movimientoId },
      };
    }
    return { step: 'blend_core', ok: true, detail: { movimientoId: creado.movimientoId, kg: creado.cantidad } };
  } catch (err) {
    return { step: 'blend_core', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Registra una producción de Biochar Blend.
 *
 * @throws Si un bache no existe, si se repite, si no tiene el biochar que se le
 *   pide o si las cantidades no son válidas. Son errores de entrada: se rechazan
 *   ANTES de escribir nada, para no dejar la producción a medias.
 */
export async function runProduccionBlend(input: ProduccionBlendInput): Promise<ProduccionBlendResult> {
  const fecha = input.fecha?.trim() || new Date().toISOString().split('T')[0];
  const lote = loteDeProduccion(fecha, input.sufijoLote);

  if (!Array.isArray(input.baches) || input.baches.length === 0) {
    throw new Error('Una producción necesita al menos un bache de biochar.');
  }

  const kgAbono = Number(input.kgAbono);
  if (!Number.isFinite(kgAbono) || kgAbono < 0) {
    throw new Error('Los KG de abono deben ser un número mayor o igual que cero.');
  }

  // ── Resolución y validación: todo antes de la primera escritura ──────────────
  const resueltos: Array<{ bache: BacheResuelto; kg: number; referencia: string; yaExistia: boolean; disponibleAntes: number }> = [];
  const vistos = new Set<string>();

  for (const entrada of input.baches) {
    const identificador = String(entrada?.bache ?? '').trim();
    if (!identificador) throw new Error('Hay un bache sin identificar en la lista.');

    const bache = await resolverBache(identificador);
    if (vistos.has(bache.id)) {
      // Dos filas del mismo bache compartirían referencia y la segunda se leería como
      // un reintento de la primera: se descontaría una sola vez y los kg del operador
      // se perderían en silencio.
      throw new Error(`El bache ${bache.codigo} está repetido en la producción.`);
    }
    vistos.add(bache.id);

    const referencia = referenciaBacheDeLote(lote, bache.codigo);
    // La idempotencia se consulta ANTES de validar disponibilidad: en cuanto el
    // detalle está escrito la fórmula del bache ya bajó, así que validar primero
    // haría que reintentar muriera con "no tiene biochar disponible" en vez de
    // reconocer lo que ya se escribió.
    const existente = await detalleExistente(referencia);

    const kgPedidos = Number(entrada?.kg);
    const kg = existente
      ? existente.kg
      : Number.isFinite(kgPedidos) && kgPedidos > 0 && kgPedidos < bache.disponible
        ? kgPedidos
        : bache.disponible;

    if (!existente) {
      if (bache.disponible <= TOLERANCIA_KG) {
        throw new Error(
          `El bache ${bache.codigo} no tiene biochar disponible (${bache.disponible.toFixed(2)} kg): no puede entrar a la producción.`
        );
      }
      if (Number.isFinite(kgPedidos) && kgPedidos > bache.disponible + TOLERANCIA_KG) {
        throw new Error(
          `El bache ${bache.codigo} solo tiene ${bache.disponible.toFixed(2)} kg (se pidieron ${kgPedidos.toFixed(2)}).`
        );
      }
    }

    resueltos.push({
      bache,
      kg,
      referencia,
      yaExistia: Boolean(existente),
      // Con el detalle ya escrito hay que sumar de vuelta lo consumido para que el
      // estado se calcule contra el mismo número que la primera vez.
      disponibleAntes: existente ? bache.disponible + kg : bache.disponible,
    });
  }

  // El abono se valida contra su saldo igual que el biochar contra el bache.
  //
  // Hace falta acá y no solo en el formulario porque las fórmulas de Airtable no
  // tienen piso: producir con más abono del que hay NO falla, deja `stock_actual` en
  // negativo y nadie se entera hasta el siguiente conteo físico (ya pasó con el
  // bache S-00177, −0,18 kg). Un saldo ilegible (`null`) no bloquea: no se puede
  // acusar de sobregiro a un número que no se pudo leer.
  const abonoYaDescontado =
    kgAbono > TOLERANCIA_KG &&
    (await existeMovimientoConReferencia(credencialesAbono(), referenciaConsumoAbono(lote)));

  if (kgAbono > TOLERANCIA_KG && !abonoYaDescontado) {
    const stockAbono = await getStockAbono();
    if (stockAbono !== null && kgAbono > stockAbono + TOLERANCIA_KG) {
      throw new Error(
        `En bodega solo hay ${stockAbono.toFixed(2)} kg de abono 4G (se pidieron ${kgAbono.toFixed(2)}).`
      );
    }
  }

  const kgBiochar = r2(resueltos.reduce((total, r) => total + r.kg, 0));
  if (kgBiochar <= TOLERANCIA_KG) {
    throw new Error('La producción no consume biochar: revisa los kg de cada bache.');
  }

  const kgBlendPedido = Number(input.kgBlend);
  const kgBlend = r2(
    Number.isFinite(kgBlendPedido) && kgBlendPedido > 0 ? kgBlendPedido : kgBiochar + kgAbono
  );

  const estados = resueltos.map((r) => estadoTrasConsumo(r.disponibleAntes, r.kg, r.bache.estado));

  // ── Ensayo ──────────────────────────────────────────────────────────────────
  if (input.dryRun) {
    // El ensayo pregunta también por la Entrada: si el lote ya la tiene, el plan debe
    // decirlo. Un "por escribir" sobre algo ya escrito es la clase de sorpresa que el
    // dry-run existe para evitar.
    const blendYaEscrito = await existeMovimientoConReferencia(
      credencialesBlend(),
      referenciaEntradaBlend(lote)
    );

    return {
      ok: true,
      lote,
      fecha,
      yaExistia: resueltos.every((r) => r.yaExistia) && blendYaEscrito,
      dryRun: true,
      kgBiochar,
      kgAbono: r2(kgAbono),
      kgBlend,
      baches: resueltos.map((r, i) => ({
        id: r.bache.id,
        codigo: r.bache.codigo,
        disponibleAntes: r.disponibleAntes,
        kg: r2(r.kg),
        estadoAnterior: r.bache.estado,
        estadoNuevo: estados[i],
        yaExistia: r.yaExistia,
      })),
      steps: [
        ...resueltos.map((r) => ({
          step: `detalle_${r.bache.codigo}`,
          ok: true,
          skipped: r.yaExistia,
          detail: r.yaExistia
            ? { motivo: `El bache ${r.bache.codigo} ya está descontado en ${lote}` }
            : { porEscribir: { kg: r2(r.kg), bache: r.bache.codigo, lote } },
        })),
        {
          step: 'abono_core',
          ok: true,
          skipped: abonoYaDescontado || kgAbono <= TOLERANCIA_KG,
          detail: abonoYaDescontado
            ? { motivo: `El lote ${lote} ya descontó su abono` }
            : { porEscribir: { tipo: 'Salida', kg: r2(kgAbono), produccionDestino: lote } },
        },
        {
          step: 'blend_core',
          ok: true,
          skipped: blendYaEscrito,
          detail: blendYaEscrito
            ? { motivo: `El lote ${lote} ya tiene su entrada de Blend` }
            : { porEscribir: { tipo: 'Entrada', kg: kgBlend, documentoReferencia: lote } },
        },
      ],
    };
  }

  // ── Escritura ───────────────────────────────────────────────────────────────
  const steps: StepResult[] = [];
  const baches: BacheProducido[] = [];
  let algunDetalleEscrito = false;
  let algunDetalleFallo = false;

  for (const [i, r] of resueltos.entries()) {
    if (r.yaExistia) {
      steps.push({
        step: `detalle_${r.bache.codigo}`,
        ok: true,
        skipped: true,
        detail: { motivo: `El bache ${r.bache.codigo} ya estaba descontado en ${lote}` },
      });
    } else {
      const paso = await escribirDetalleDeBache(r.bache, r.kg, lote, r.referencia, {
        fecha,
        realizaRegistro: input.realizaRegistro,
        observaciones: input.observaciones,
      });
      steps.push(paso);
      if (paso.ok) {
        algunDetalleEscrito = true;
      } else {
        // Un bache que no se descontó no se sigue procesando: escribir su Salida en el
        // Core dejaría el libro mayor descontando kilos que el bache todavía tiene.
        algunDetalleFallo = true;
        baches.push({
          id: r.bache.id,
          codigo: r.bache.codigo,
          disponibleAntes: r.disponibleAntes,
          kg: r2(r.kg),
          estadoAnterior: r.bache.estado,
          estadoNuevo: null,
          yaExistia: false,
        });
        continue;
      }
    }

    // Salida en el libro mayor (best-effort). `registrarMovimientoAbono` verifica su
    // propia referencia; aquí hay que hacerlo a mano porque `crearMovimientoBiocharPuro`
    // escribe sin preguntar.
    const yaEnCore = await existeMovimientoConReferencia(credencialesBiocharPuro(), r.referencia);
    steps.push(
      yaEnCore
        ? {
            step: `biochar_core_${r.bache.codigo}`,
            ok: true,
            skipped: true,
            detail: { motivo: `El Core ya tiene el consumo ${r.referencia}` },
          }
        : await escribirSalidaBiochar(r.bache, r.kg, lote, r.referencia, {
            fecha,
            realizaRegistro: input.realizaRegistro,
          })
    );

    // Estado del bache (best-effort: es metadato de presentación, el stock ya se
    // movió). Se calcula con el disponible de ANTES menos lo consumido, no releyendo
    // el bache: la fórmula de Airtable tarda en recalcular y una relectura inmediata
    // devuelve el valor viejo.
    const estadoNuevo = estados[i];
    if (!estadoNuevo) {
      steps.push({
        step: `estado_${r.bache.codigo}`,
        ok: true,
        skipped: true,
        detail: { estado: r.bache.estado },
      });
    } else {
      const { errores } = await actualizarEstadoBaches([{ bacheId: r.bache.id, estado: estadoNuevo }]);
      steps.push(
        errores.length
          ? { step: `estado_${r.bache.codigo}`, ok: false, error: errores.join(' | ') }
          : { step: `estado_${r.bache.codigo}`, ok: true, detail: { de: r.bache.estado, a: estadoNuevo } }
      );
    }

    baches.push({
      id: r.bache.id,
      codigo: r.bache.codigo,
      disponibleAntes: r.disponibleAntes,
      kg: r2(r.kg),
      estadoAnterior: r.bache.estado,
      estadoNuevo,
      yaExistia: r.yaExistia,
    });
  }

  // Si NINGÚN bache se descontó y encima alguno falló, no hubo producción: no se
  // escriben el abono ni la entrada de Blend, que dejarían producto terminado sin
  // materia prima detrás.
  const huboConsumo = baches.some((b) => b.estadoNuevo !== null || b.yaExistia) || algunDetalleEscrito;
  if (!huboConsumo && algunDetalleFallo) {
    return {
      ok: false,
      lote,
      fecha,
      yaExistia: false,
      kgBiochar,
      kgAbono: r2(kgAbono),
      kgBlend,
      baches,
      steps,
    };
  }

  steps.push(await escribirSalidaAbono(kgAbono, lote, { fecha, realizaRegistro: input.realizaRegistro }));
  steps.push(
    await escribirEntradaBlend(kgBlend, lote, {
      fecha,
      realizaRegistro: input.realizaRegistro,
      observaciones: input.observaciones,
    })
  );

  return {
    ok: !algunDetalleFallo,
    lote,
    fecha,
    yaExistia: steps.every((paso) => paso.skipped),
    kgBiochar,
    kgAbono: r2(kgAbono),
    kgBlend,
    baches,
    steps,
  };
}

/** ¿Están los tres productos configurados? La UI lo pregunta antes de ofrecer el botón. */
export function produccionConfigurada(): boolean {
  return Boolean(credencialesBiocharPuro()) && Boolean(credencialesAbono()) && blendConfigurado();
}

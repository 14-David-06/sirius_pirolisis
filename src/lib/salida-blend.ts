// src/lib/salida-blend.ts
//
// Salida de Biochar Blend por un motivo que NO es un despacho: laboratorio,
// muestra, merma o traslado. Es el gemelo de `runSalidaBiochar()` para el producto
// terminado.
//
// ═══ UNA SALIDA, UN MOVIMIENTO ═════════════════════════════════════════════════
// El biochar se lleva en dos vistas (el libro mayor y la fórmula del bache) y su
// salida escribe tres partes por bache. El Blend solo existe en Sirius Inventario
// Production Core, y una salida suya es UN movimiento aunque el producto venga de
// varios lotes (decisión de David, 2026-10-20: 60 kg para una feria son una
// salida, no dos renglones de 32,21 y 27,79).
//
// ═══ PERO EL LOTE NO SE PIERDE ════════════════════════════════════════════════
// El lote es lo que dice de qué está hecho ese Blend y cuánto CO₂ lleva
// (`composicionDeDespacho`), y `lotesDisponiblesBlend()` necesita saber de qué
// lote salió cada kg para calcular lo que queda por despachar. El reparto viaja en
// las observaciones del movimiento con las mismas marcas que una remisión
// multilote: `[lote:…]` por lote y `[kg-lote:<lote>=<kg>]` (ver `lotesDeNotas()`).
//
// ═══ LAS REMISIONES NO PASAN POR AQUÍ ══════════════════════════════════════════
// Un despacho a un cliente es una remisión (`despacho-blend.ts`), con su documento
// y su área. Esto es para lo que sale SIN venta, y por eso su referencia lleva el
// prefijo `SAL-<MOTIVO>-` que `esSalidaNoComercial()` reconoce.

import { crearMovimientoProducto } from './inventario-prod-core';
import { credencialesBlend, resumenBlend, UNIDAD_BLEND } from './blend-inventario-core';
import { lotesDisponiblesBlend } from './despacho-blend';
import {
  MOTIVOS_SALIDA,
  marcaSalida,
  repartirEnOrden,
  type MotivoSalidaBlend,
} from './salida-bache.constants';
import type { StepResult } from '@/types/step-result';

const TOLERANCIA_KG = 0.01;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Referencia de la N-ésima salida de Blend del día por un motivo:
 * `SAL-MUE-2026-10-20`, `SAL-MUE-2026-10-20-2`… Es la llave de idempotencia del
 * movimiento. No lleva lote porque el movimiento puede cubrir varios.
 */
export function referenciaSalidaBlend(motivo: MotivoSalidaBlend, fecha: string, n = 1): string {
  const base = `SAL-${MOTIVOS_SALIDA[motivo].prefijo}-${fecha}`;
  return n <= 1 ? base : `${base}-${n}`;
}

/** Las marcas que dicen de qué lote salió cada kg. Ver `lotesDeNotas()`. */
export function marcasDeLotes(reparto: Array<{ lote: string; kg: number }>): string {
  const lotes = reparto.map((l) => `[lote:${l.lote}]`).join(' ');
  // Con un solo lote sobra el reparto: todo el movimiento es de ese lote.
  return reparto.length > 1
    ? `${lotes} ${reparto.map((l) => `[kg-lote:${l.lote}=${r2(l.kg)}]`).join(' ')}`
    : lotes;
}

export interface SalidaBlendInput {
  /** KG totales a sacar. */
  kg: number;
  motivo: MotivoSalidaBlend;
  destino?: string;
  observaciones?: string;
  realizaRegistro: string;
  /** `YYYY-MM-DD`. Por defecto hoy. Entra en la referencia. */
  fecha?: string;
  /**
   * El reparto por lote que propuso el ensayo. Obligatorio al confirmar: el
   * reparto FIFO depende del saldo de cada lote, que baja con cada salida, así que
   * recalcularlo en un reintento caería en otros lotes.
   */
  lotes?: Array<{ lote: string; kg: number }>;
  /** La que devolvió el ensayo: reenviarla al confirmar. */
  referencia?: string;
  dryRun?: boolean;
}

export interface SalidaBlendResult {
  ok: boolean;
  dryRun?: boolean;
  /** true si el movimiento ya estaba escrito: no se descontó de nuevo. */
  yaExistia: boolean;
  motivo: MotivoSalidaBlend;
  destino: string;
  fecha: string;
  kg: number;
  referencia: string;
  /** El reparto: de qué lote sale cada kg, con lo que tenía antes. */
  lotes: Array<{ lote: string; kg: number; disponibleAntes: number }>;
  steps: StepResult[];
}

/**
 * Saca Biochar Blend de bodega en UN movimiento, repartido FIFO por lote.
 *
 * @throws Si no alcanza, si el reparto no cuadra con el total o si un lote no
 *   tiene lo que se le pide. Son errores de entrada: se rechazan ANTES de escribir.
 */
export async function runSalidaBlend(input: SalidaBlendInput): Promise<SalidaBlendResult> {
  const cred = credencialesBlend();
  if (!cred) {
    throw new Error(
      'El Biochar Blend no está configurado como producto del Core (falta ' +
        'AIRTABLE_INVENTARIO_BIOCHAR_BLEND_PRODUCT_ID).'
    );
  }

  const fecha = input.fecha?.trim() || new Date().toISOString().split('T')[0];
  const kgTotal = r2(Number(input.kg));
  if (!Number.isFinite(kgTotal) || kgTotal <= TOLERANCIA_KG) {
    throw new Error('Los KG a sacar deben ser un número mayor que cero.');
  }
  const etiqueta = MOTIVOS_SALIDA[input.motivo].etiqueta;
  const destino = input.destino?.trim() || etiqueta;

  const [resumen, lotesBodega] = await Promise.all([resumenBlend(), lotesDisponiblesBlend()]);
  if (!resumen) throw new Error('No se pudo leer el inventario de Biochar Blend.');

  // Las salidas ya escritas, por referencia: son la idempotencia y lo que distingue
  // una segunda salida del día de un reintento de la primera.
  const escritas = new Map(
    resumen.movimientos.filter((m) => m.tipo === 'Salida').map((m) => [m.documento, m.cantidad])
  );
  const saldoLote = new Map(lotesBodega.map((l) => [l.lote, l.kgDisponibles]));

  let reparto: Array<{ lote: string; kg: number }>;
  let referencia = input.referencia?.trim() || '';

  if (input.lotes?.length) {
    if (!referencia) throw new Error('Confirmar una salida necesita la referencia del ensayo.');
    reparto = input.lotes.map((l) => ({ lote: String(l.lote ?? '').trim(), kg: r2(Number(l.kg)) }));
    const suma = r2(reparto.reduce((t, l) => t + l.kg, 0));
    if (Math.abs(suma - kgTotal) > TOLERANCIA_KG) {
      throw new Error(`El reparto por lote suma ${suma.toFixed(2)} kg y se pidieron ${kgTotal.toFixed(2)}.`);
    }
    if (new Set(reparto.map((l) => l.lote)).size !== reparto.length) {
      throw new Error('Hay un lote repetido en el reparto.');
    }
  } else {
    if (!input.dryRun) throw new Error('Confirmar una salida necesita el reparto por lote del ensayo.');

    // El saldo del producto manda sobre la suma de los lotes: si un movimiento
    // quedó sin vincular a `Stock_Actual`, los lotes pueden prometer más de lo que
    // hay. Se toma el menor.
    const enBodega = Math.min(
      resumen.kg ?? resumen.kgSegunMovimientos,
      lotesBodega.reduce((t, l) => t + l.kgDisponibles, 0)
    );
    if (kgTotal > enBodega + TOLERANCIA_KG) {
      throw new Error(
        `En bodega solo hay ${Math.max(0, enBodega).toFixed(2)} kg de Biochar Blend (se pidieron ${kgTotal.toFixed(2)}).`
      );
    }
    const fifo = repartirEnOrden(
      lotesBodega.map((l) => ({ codigo: l.lote, kg: l.kgDisponibles })),
      kgTotal
    );
    if (!fifo) throw new Error(`Los lotes de Blend no alcanzan para ${kgTotal.toFixed(2)} kg.`);
    reparto = fifo.map((l) => ({ lote: l.codigo, kg: l.kg }));

    if (!referencia) {
      let n = 1;
      while (escritas.has(referenciaSalidaBlend(input.motivo, fecha, n))) n++;
      referencia = referenciaSalidaBlend(input.motivo, fecha, n);
    }
  }

  const yaExistia = escritas.has(referencia);
  // Ya escrita, la salida ya bajó el saldo de sus lotes: se les devuelve para que
  // el plan muestre el mismo "antes" que la primera vez.
  const lotes = reparto.map((l) => ({
    ...l,
    disponibleAntes: r2((saldoLote.get(l.lote) ?? 0) + (yaExistia ? l.kg : 0)),
  }));

  if (!yaExistia) {
    for (const l of lotes) {
      if (!saldoLote.has(l.lote)) throw new Error(`No existe un lote de Blend ${l.lote}.`);
      if (l.kg > l.disponibleAntes + TOLERANCIA_KG) {
        throw new Error(
          `El lote ${l.lote} solo tiene ${l.disponibleAntes.toFixed(2)} kg de Blend (se pidieron ${l.kg.toFixed(2)}).`
        );
      }
    }
  }

  const resultado = (ok: boolean, step: StepResult): SalidaBlendResult => ({
    ok,
    dryRun: input.dryRun || undefined,
    yaExistia,
    motivo: input.motivo,
    destino,
    fecha,
    // En un reintento manda lo que ya quedó escrito, no lo que se pidió.
    kg: yaExistia ? r2(escritas.get(referencia) ?? kgTotal) : kgTotal,
    referencia,
    lotes,
    steps: [step],
  });

  if (yaExistia) {
    return resultado(true, {
      step: 'blend_core',
      ok: true,
      skipped: true,
      detail: { motivo: `${referencia} ya estaba registrada` },
    });
  }

  if (input.dryRun) {
    return resultado(true, {
      step: 'blend_core',
      ok: true,
      detail: { porEscribir: { tipo: 'Salida', kg: kgTotal, referencia, lotes: reparto } },
    });
  }

  try {
    const { movimientoId, cantidad, vinculadoAlStock } = await crearMovimientoProducto(cred, {
      tipo: 'Salida',
      cantidad: kgTotal,
      unidad: UNIDAD_BLEND,
      documentoReferencia: referencia,
      // Como en las salidas no comerciales de biochar: el destino es la propia
      // referencia. Los lotes van en las marcas, porque pueden ser varios.
      produccionDestino: referencia,
      motivo: `Salida de Biochar Blend — ${etiqueta}`,
      fecha,
      responsable: input.realizaRegistro,
      ubicacionDestino: destino,
      observaciones: [
        `Salida de Biochar Blend — ${etiqueta} · destino ${destino}`,
        input.observaciones?.trim(),
        marcasDeLotes(reparto),
        marcaSalida(referencia),
      ]
        .filter(Boolean)
        .join(' · '),
    });
    if (!vinculadoAlStock) {
      // El movimiento existe y ya descuenta de los lotes, pero el saldo del
      // producto no lo cuenta: es un éxito a medias, no un fallo para reintentar.
      return resultado(true, {
        step: 'blend_core',
        ok: false,
        error: 'Movimiento creado pero el Blend no tiene fila en Stock_Actual: el saldo no lo refleja.',
        detail: { movimientoId },
      });
    }
    return resultado(true, { step: 'blend_core', ok: true, detail: { movimientoId, kg: cantidad } });
  } catch (err) {
    return resultado(false, {
      step: 'blend_core',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

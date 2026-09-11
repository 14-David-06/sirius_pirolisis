// src/lib/despacho-blend.ts
//
// Despachar un pedido de Biochar Blend: la remisión y el descuento del inventario,
// con el inventario COMO CONDICIÓN y no como consecuencia.
//
// ═══ POR QUÉ ESTE MÓDULO ══════════════════════════════════════════════════════
// `crearRemision()` (blend-remisiones-core.ts) ya sabe escribir las cinco partes
// del despacho, pero no pregunta si hay producto: nació para un flujo donde el
// operador ya venía de mirar el inventario. Desde la pantalla de bodega el botón
// queda al lado del saldo, y un despacho que no cabe en lo que hay deja el libro
// mayor en negativo —y la remisión ya emitida, que no se puede "des-firmar"—.
// Todo lo que valida va ANTES de la primera escritura.
//
// ═══ QUÉ SE VALIDA ════════════════════════════════════════════════════════════
//   1. El pedido existe y sigue pendiente (un cerrado no se vuelve a despachar).
//   2. Los KG son positivos y no superan lo que el pedido todavía debe.
//   3. El lote existe y tiene ese Blend SIN despachar.
//   4. El saldo total del producto alcanza.
// La 3 y la 4 se ven redundantes y no lo son: un lote mal atribuido —producción
// vieja cargada por script, sin su código— puede dar saldo por lote sin que el
// producto lo tenga, y al revés.
//
// ═══ EL SALDO SE DERIVA DE LOS MOVIMIENTOS, NO DE `Stock_Actual` ══════════════
// ⚠️ La fila de `Stock_Actual` del Blend está ROTA (deuda conocida, §8 de
// CLAUDE.md): marca 0 kg teniendo miles de kg de entradas, porque los movimientos
// históricos nunca se vincularon a su campo link. Validar contra ella impediría
// TODO despacho con un "no hay producto" falso. La verdad utilizable hoy es
// entradas − salidas sobre los movimientos, que es lo que ya muestra la pantalla.
//
// ═══ EL SALDO POR LOTE: EL MAYOR DE DOS CONTEOS ═══════════════════════════════
// ⚠️ Los despachos de los dos lotes de 2026 se cargaron como Salidas históricas
// del libro mayor y NUNCA tuvieron remisión en el Core. Contar lo despachado solo
// por las remisiones daba esos lotes enteros como disponibles —15.528 y 13.050 kg—
// teniendo la bodega en 0. Y contar solo las Salidas tampoco basta: `crearRemision()`
// escribe la suya como paso best-effort, así que una remisión cuya salida falló
// dejaría producto ya prometido a un cliente figurando como libre. Cada lote se
// descuenta por el MAYOR de los dos, que es la lectura conservadora — ver
// `lotesDisponiblesBlend()`.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';
import { fetchAll, toNumber, r2 } from './inventario-prod-core';
import { credencialesBlend, resumenBlend } from './blend-inventario-core';
import { crearRemision, ESTADO_REMISION, type RemisionBlend } from './blend-remisiones-core';
import { listarPedidosBlend, type PedidoBlend } from './pedidos-blend-core';
import type { StepResult } from '@/types/step-result';

/** Marca del lote en las notas de la remisión. La escribe `crearRemision()`. */
const MARCA_LOTE = /\[lote:([A-Za-z0-9\-_]+)\]/;

/** Restos de redondeo: por debajo de esto, dos cantidades son la misma. */
const TOLERANCIA_KG = 0.01;

export interface LoteBlendDisponible {
  /** `BLEND-…`. */
  lote: string;
  kgProducidos: number;
  kgDespachados: number;
  kgDisponibles: number;
  /** Fecha de la producción, `YYYY-MM-DD`. */
  fecha: string;
}

/**
 * Los lotes de Blend producidos con lo que queda sin despachar en cada uno.
 *
 * ⚠️ LO DESPACHADO SE CUENTA POR LAS SALIDAS DEL LIBRO MAYOR, NO POR LAS
 * REMISIONES. Contarlo solo por las remisiones daba los dos lotes de 2026
 * enteros como disponibles (15.528 y 13.050 kg) cuando la bodega tiene 0: esos
 * despachos se cargaron como Salidas históricas (`DESP-<lote>-<cliente>`) y nunca
 * tuvieron una remisión en el Core. El inventario es el libro mayor; la remisión
 * es el documento, y hay despachos sin documento.
 *
 * Pero tampoco alcanza con las salidas: `crearRemision()` escribe la Salida como
 * paso BEST-EFFORT, así que una remisión emitida cuya salida falló dejaría
 * producto ya comprometido con un cliente figurando como disponible. Por eso cada
 * lote se descuenta por el MAYOR de los dos conteos: el libro mayor y lo remitido.
 * Es la lectura conservadora, que es la única aceptable cuando el error se paga
 * prometiendo dos veces el mismo producto.
 *
 * Lo que no se puede atribuir a ningún lote —una salida vieja sin lote en ningún
 * campo— se imputa FIFO a los lotes más antiguos: es de donde habría salido, y
 * dejarlo fuera haría que la suma de los lotes no cuadre con el saldo del
 * producto, que es el número que manda.
 */
export async function lotesDisponiblesBlend(): Promise<LoteBlendDisponible[]> {
  const cred = credencialesBlend();
  if (!cred) return [];

  const [movimientos, remitidoPorLote] = await Promise.all([
    fetchAll(cred.base, cred.movimientos, cred.token, {
      filterByFormula: `{product_id} = '${escapeAirtableValue(cred.producto)}'`,
    }),
    kgRemitidosPorLote(),
  ]);

  // 1. Lo producido: una Entrada por lote (`documento_referencia` = el lote).
  const producido = new Map<string, { kg: number; fecha: string }>();
  for (const m of movimientos) {
    if (String(m.fields['tipo_movimiento'] ?? '') !== 'Entrada') continue;
    const lote = String(m.fields['produccion_destino_id'] ?? m.fields['documento_referencia'] ?? '');
    if (!lote) continue;
    const fecha = String(m.fields['fecha_movimiento'] ?? m.fields['fecha_registro'] ?? '').slice(0, 10);
    const previo = producido.get(lote);
    producido.set(lote, {
      kg: (previo?.kg ?? 0) + toNumber(m.fields['cantidad']),
      fecha: previo?.fecha && previo.fecha < fecha ? previo.fecha : fecha,
    });
  }
  const codigosDeLote = [...producido.keys()];

  // 2. Lo que salió del libro mayor, atribuido al lote que nombre el movimiento.
  const salidoPorLote = new Map<string, number>();
  let sinAtribuir = 0;
  for (const m of movimientos) {
    if (String(m.fields['tipo_movimiento'] ?? '') !== 'Salida') continue;
    const kgSalida = toNumber(m.fields['cantidad']);
    const lote = loteDeMovimiento(m.fields, codigosDeLote);
    if (lote) salidoPorLote.set(lote, (salidoPorLote.get(lote) ?? 0) + kgSalida);
    else sinAtribuir += kgSalida;
  }

  const lotes = [...producido.entries()]
    .map(([lote, { kg, fecha }]) => {
      const kgDespachados = Math.max(salidoPorLote.get(lote) ?? 0, remitidoPorLote.get(lote) ?? 0);
      return {
        lote,
        fecha,
        kgProducidos: r2(kg),
        kgDespachados: r2(Math.min(kgDespachados, kg)),
        kgDisponibles: r2(Math.max(0, kg - kgDespachados)),
      };
    })
    .sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999'));

  // 3. Lo no atribuido, contra los lotes más viejos primero.
  let resto = sinAtribuir;
  for (const l of lotes) {
    if (resto <= TOLERANCIA_KG) break;
    const aplica = Math.min(resto, l.kgDisponibles);
    l.kgDespachados = r2(l.kgDespachados + aplica);
    l.kgDisponibles = r2(l.kgDisponibles - aplica);
    resto = r2(resto - aplica);
  }

  return lotes;
}

/**
 * A qué lote pertenece un movimiento de Salida.
 *
 * Se busca el código de lote conocido MÁS LARGO que aparezca en los campos de
 * texto del movimiento: `documento_referencia` es `DESP-BLEND-2026-04-30-CL-0003`
 * en los despachos históricos y `DESP-SIRIUS-REM-XXXX` en los que emite la app,
 * y el lote también suele quedar en el motivo y en las observaciones. Buscar por
 * el más largo evita que un lote con sufijo (`BLEND-2026-06-24-PED9`) se confunda
 * con el que lo contiene.
 */
function loteDeMovimiento(
  fields: Record<string, unknown>,
  codigosDeLote: string[]
): string | null {
  const texto = [
    fields['produccion_destino_id'],
    fields['documento_referencia'],
    fields['motivo'],
    fields['observaciones'],
    fields['ubicacion_origen_id'],
  ]
    .map((v) => String(v ?? ''))
    .join(' ');

  let encontrado: string | null = null;
  for (const lote of codigosDeLote) {
    if (!texto.includes(lote)) continue;
    if (!encontrado || lote.length > encontrado.length) encontrado = lote;
  }
  return encontrado;
}

/**
 * KG remitidos de cada lote, según las remisiones de Blend del Core.
 *
 * Las canceladas no cuentan: su producto no salió. Las demás sí, incluso las
 * `Pendiente`, porque el producto ya quedó comprometido con un cliente.
 */
async function kgRemitidosPorLote(): Promise<Map<string, number>> {
  const porLote = new Map<string, number>();

  const base = config.airtable.remisionesCoreBaseId;
  const token = config.airtable.remisionesCoreToken;
  const tabla = config.airtable.remisionesCoreRemisionesTable;
  if (!base || !token || !tabla) return porLote;

  try {
    for (const r of await fetchAll(base, tabla, token)) {
      if (String(r.fields['Estado'] ?? '') === ESTADO_REMISION.cancelada) continue;
      const lote = MARCA_LOTE.exec(String(r.fields['Notas de Remisión'] ?? ''))?.[1];
      if (!lote) continue;
      porLote.set(lote, (porLote.get(lote) ?? 0) + toNumber(r.fields['Total Cantidad Remitida']));
    }
  } catch (err) {
    // Sin este dato NO se puede validar: se propaga para que el despacho se
    // rechace en vez de aprobarse contra un "0 kg remitidos" que es mentira.
    throw new Error(
      `No se pudo leer lo ya remitido por lote: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return porLote;
}

export interface DespachoBlendInput {
  /** `SIRIUS-PED-XXXX`. */
  idPedido: string;
  /** `BLEND-…` del que sale el producto. */
  lote: string;
  kg: number;
  responsableEntrega: string;
  transportista?: { nombre: string; cedula: string; telefono?: string; email?: string };
  observaciones?: string;
  /** `YYYY-MM-DD`. */
  fechaDespacho?: string;
}

/** Lo que se va a escribir, para confirmarlo antes de escribirlo. */
export interface PlanDespacho {
  pedido: {
    codigo: string;
    cliente: string;
    idCliente: string;
    kgSolicitados: number;
    kgDespachados: number;
    kgPendientes: number;
  };
  kg: number;
  lote: string;
  loteDisponibleAntes: number;
  loteDisponibleDespues: number;
  blendDisponibleAntes: number;
  blendDisponibleDespues: number;
  /** El estado en que quedará el pedido: cubre lo que falta, o no. */
  estadoPedidoResultante: 'Enviado' | 'Enviado Parcial';
}

export interface DespachoBlendResult {
  ok: boolean;
  plan: PlanDespacho;
  /** Solo en un despacho real; en `dryRun` no hay remisión. */
  remision?: RemisionBlend | null;
  steps?: StepResult[];
}

/** Falla de validación: el despacho no se intentó y nada se escribió. */
export class DespachoInvalido extends Error {}

/**
 * Valida el despacho contra el pedido y contra el inventario, y —si no es un
 * ensayo— lo escribe con `crearRemision()`.
 *
 * Lanza `DespachoInvalido` cuando algo no cuadra, ANTES de escribir nada. Un
 * despacho a medias no se puede deshacer: la remisión es un documento que el
 * cliente ya puede haber firmado desde el celular.
 */
export async function despacharPedidoBlend(
  input: DespachoBlendInput,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<DespachoBlendResult> {
  const kg = r2(Number(input.kg));
  if (!Number.isFinite(kg) || kg <= 0) {
    throw new DespachoInvalido('Los KG a despachar deben ser mayores que cero.');
  }
  if (!input.lote?.trim()) {
    throw new DespachoInvalido('Falta el lote del que sale el Blend.');
  }
  if (!input.responsableEntrega?.trim()) {
    throw new DespachoInvalido('Falta quién entrega.');
  }

  const [pedidos, lotes, resumen] = await Promise.all([
    listarPedidosBlend(),
    lotesDisponiblesBlend(),
    resumenBlend(),
  ]);

  if (pedidos === null) {
    throw new DespachoInvalido('No se pudo leer Sirius Pedidos Core: no se sabe qué se debe.');
  }

  const pedido: PedidoBlend | undefined = pedidos.find((p) => p.codigo === input.idPedido);
  if (!pedido) {
    throw new DespachoInvalido(`El pedido ${input.idPedido} no existe en Sirius Pedidos Core.`);
  }
  if (!pedido.pendiente) {
    throw new DespachoInvalido(
      `El pedido ${pedido.codigo} está en "${pedido.estado}": ya no está pendiente de despacho.`
    );
  }
  if (pedido.fuenteKg === 'sin-dato') {
    throw new DespachoInvalido(
      `El pedido ${pedido.codigo} no tiene cantidad registrada en el Core, así que no se sabe cuánto se le debe.`
    );
  }
  if (kg > pedido.kgPendientes + TOLERANCIA_KG) {
    throw new DespachoInvalido(
      `Al pedido ${pedido.codigo} solo le faltan ${pedido.kgPendientes} kg y se están despachando ${kg} kg.`
    );
  }

  const lote = lotes.find((l) => l.lote === input.lote);
  if (!lote) {
    throw new DespachoInvalido(
      `El lote ${input.lote} no tiene ninguna producción de Blend registrada en el Core.`
    );
  }
  if (kg > lote.kgDisponibles + TOLERANCIA_KG) {
    throw new DespachoInvalido(
      `El lote ${lote.lote} solo tiene ${lote.kgDisponibles} kg sin despachar y se están sacando ${kg} kg.`
    );
  }

  // El saldo del producto sale de los movimientos, no de `Stock_Actual` (ver el
  // encabezado del archivo). Si ni eso se pudo leer, no hay contra qué validar.
  if (!resumen) {
    throw new DespachoInvalido(
      'El Biochar Blend no está configurado en Sirius Inventario Production Core.'
    );
  }
  const blendDisponible = resumen.kgSegunMovimientos;
  if (kg > blendDisponible + TOLERANCIA_KG) {
    throw new DespachoInvalido(
      `En bodega hay ${blendDisponible} kg de Blend y se están despachando ${kg} kg.`
    );
  }

  const cubre = kg + TOLERANCIA_KG >= pedido.kgPendientes;
  const plan: PlanDespacho = {
    pedido: {
      codigo: pedido.codigo,
      cliente: pedido.clienteNombre,
      idCliente: pedido.idCliente,
      kgSolicitados: pedido.kgSolicitados,
      kgDespachados: pedido.kgDespachados,
      kgPendientes: pedido.kgPendientes,
    },
    kg,
    lote: lote.lote,
    loteDisponibleAntes: lote.kgDisponibles,
    loteDisponibleDespues: r2(lote.kgDisponibles - kg),
    blendDisponibleAntes: blendDisponible,
    blendDisponibleDespues: r2(blendDisponible - kg),
    estadoPedidoResultante: cubre ? 'Enviado' : 'Enviado Parcial',
  };

  if (dryRun) return { ok: true, plan };

  const resultado = await crearRemision({
    idPedido: pedido.codigo,
    idCliente: pedido.idCliente,
    lote: lote.lote,
    kg,
    responsableEntrega: input.responsableEntrega.trim(),
    transportista: input.transportista,
    observaciones: input.observaciones,
    fechaDespacho: input.fechaDespacho,
  });

  return { ok: resultado.ok, plan, remision: resultado.remision, steps: resultado.steps };
}

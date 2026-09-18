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
//   3. Hay de dónde sacar el producto: un lote con saldo, o biochar y abono con
//      que producirlo.
// Si un lote se elige a mano, ese lote tiene que alcanzar por sí solo: pedir un
// lote concreto es decir de dónde sale, y fabricar por debajo sería desobedecer.
//
// ═══ DESPACHAR PRODUCE ════════════════════════════════════════════════════════
// El Blend no se almacena esperando pedidos: se produce contra el pedido. Si lo
// que hay no alcanza, el despacho produce el faltante con el biochar y el abono de
// bodega (ver `produccion-para-despacho.ts`) ANTES de emitir la remisión, y si ni
// eso alcanza despacha lo que se pueda y deja el pedido en `Enviado Parcial`.
// Producir primero y documentar después es el único orden que no deja un documento
// entregando producto que no existe.
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

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config';
import { getS3Client, awsServerConfig } from './aws-config.server';
import { escapeAirtableValue } from './airtable-escape';
import { fetchAll, toNumber, r2 } from './inventario-prod-core';
import { credencialesBlend, resumenBlend } from './blend-inventario-core';
import { crearRemision, ESTADO_REMISION, type RemisionBlend } from './blend-remisiones-core';
import { listarPedidosBlend, type PedidoBlend } from './pedidos-blend-core';
import { runProduccionBlend, loteDeProduccion } from './produccion-blend';
import {
  planearProduccionParaDespacho,
  SeleccionBachesInvalida,
  type ConsumoBacheElegido,
  type PlanProduccion,
} from './produccion-para-despacho';
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
  /**
   * KG a despachar. Omitido = todo lo que el pedido debe.
   *
   * Es un tope, no una promesa: si hay que producir y el inventario no alcanza,
   * sale menos y el pedido queda `Enviado Parcial`.
   */
  kg?: number;
  /**
   * Lote `BLEND-…` del que sale el producto. Omitido = lo decide el despacho:
   * usa un lote con saldo o produce uno nuevo.
   */
  lote?: string;
  /**
   * Baches de los que sale el biochar, con los KG pesados de cada uno.
   *
   * Requerido cuando el despacho tiene que producir: el bache es la unidad de la
   * contabilidad de carbono y la app no puede adivinar de qué lona se sacó. Se
   * ignora cuando el despacho sale de un lote que ya existe, porque ahí no se
   * consume biochar.
   */
  baches?: ConsumoBacheElegido[];
  responsableEntrega: string;
  /**
   * ⚠️ La UI de bodega todavía no lo pide, así que hoy llega siempre vacío y la
   * remisión sale `Pendiente`. El campo se mantiene porque `crearRemision()` lo
   * usa para pasarla a `En Tránsito`, y quitarlo obligaría a reconstruirlo cuando
   * el transporte entre al flujo.
   */
  /**
   * Quien se lleva el producto. Su firma es del MOMENTO DEL DESPACHO: está en la
   * planta cargando, así que firma en el mismo dispositivo. La del receptor se da
   * después, en la finca, por la página pública.
   */
  transportista?: {
    nombre: string;
    cedula: string;
    telefono?: string;
    email?: string;
    /** PNG en data-URL del trazo. */
    firmaBase64?: string;
  };
  observaciones?: string;
  /** `YYYY-MM-DD`. */
  fechaDespacho?: string;
}

/** Lo que se produciría para poder despachar, si hace falta producir. */
export interface PlanProduccionDespacho extends PlanProduccion {
  /** Lote `BLEND-…` que se va a crear. */
  lote: string;
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
  /** De dónde sale el producto: de lo que ya hay, o de producir ahora. */
  origen: 'lote-existente' | 'produccion';
  /** Null cuando se despacha de un lote que ya tenía producto. */
  produccion: PlanProduccionDespacho | null;
  loteDisponibleAntes: number;
  loteDisponibleDespues: number;
  blendDisponibleAntes: number;
  blendDisponibleDespues: number;
  /** El estado en que quedará el pedido: cubre lo que falta, o no. */
  estadoPedidoResultante: 'Enviado' | 'Enviado Parcial';
  /** Por qué sale menos de lo pedido, cuando sale menos. */
  motivoParcial?: string;
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
 * Elige el lote del que sale el despacho, o decide que hay que producir.
 *
 * Primero lo que YA existe: despachar producto almacenado antes que fabricar más
 * es lo que evita que un remanente se quede añejando mientras se produce al lado.
 * Se toma el lote más VIEJO que alcance a cubrir el despacho completo.
 *
 * ⚠️ Un despacho sale de UN solo lote, no de la suma de varios. No es una
 * limitación técnica: la composición del Blend y el CO₂ secuestrado de la remisión
 * se DERIVAN del lote (§5 de CLAUDE.md), y un documento que mezcla dos lotes no
 * puede declarar ni una composición ni un CO₂ ciertos. Si hay que partir el
 * despacho, son dos remisiones.
 */
function elegirLoteExistente(lotes: LoteBlendDisponible[], kg: number): LoteBlendDisponible | null {
  return lotes.find((l) => l.kgDisponibles + TOLERANCIA_KG >= kg) ?? null;
}

/**
 * El lote que va a producir este despacho: `BLEND-<fecha>-<pedido>`.
 *
 * ⚠️ El lote es la llave de idempotencia de la producción, así que dos despachos
 * del mismo pedido el mismo día compartirían lote y el segundo se leería como un
 * REINTENTO del primero: no produciría nada (§5 de CLAUDE.md). Por eso, si ese
 * lote ya existe y no le queda producto, se pasa al siguiente sufijo. Si le queda,
 * se reutiliza a propósito: es el reintento de un despacho que quedó a medias.
 */
function loteParaProducir(fecha: string, idPedido: string, lotes: LoteBlendDisponible[]): string {
  const base = loteDeProduccion(fecha, idPedido);
  const existente = lotes.find((l) => l.lote === base);
  if (!existente || existente.kgDisponibles > TOLERANCIA_KG) return base;

  for (let n = 2; n < 100; n += 1) {
    const candidato = loteDeProduccion(fecha, `${idPedido}-${n}`);
    const yaEsta = lotes.find((l) => l.lote === candidato);
    if (!yaEsta || yaEsta.kgDisponibles > TOLERANCIA_KG) return candidato;
  }
  // Cien despachos del mismo pedido en un día no es un caso real; si pasa, es
  // mejor fallar que escribir sobre un lote ajeno.
  throw new DespachoInvalido(`No se pudo asignar un lote libre para ${idPedido} el ${fecha}.`);
}

/**
 * Valida el despacho contra el pedido y contra el inventario, produce el Blend si
 * hace falta, y emite la remisión.
 *
 * ═══ EL ORDEN IMPORTA ═══════════════════════════════════════════════════════
 * Todo lo que se puede validar se valida ANTES de la primera escritura, y la
 * producción va antes que la remisión: si producir falla, no se emite un documento
 * por un producto que no existe. Al revés no tiene arreglo —una remisión es un
 * documento que el cliente puede firmar desde el celular apenas se emite—.
 *
 * ═══ PARCIAL ANTES QUE NADA ═════════════════════════════════════════════════
 * Si el inventario no da para el pedido completo se despacha lo que alcance y el
 * pedido queda `Enviado Parcial`, con el motivo en el plan. Un camión que sale con
 * la mitad sirve; uno que no sale porque faltaban 40 kg de abono, no.
 *
 * Lanza `DespachoInvalido` cuando nada de lo anterior es posible, sin escribir.
 */
export async function despacharPedidoBlend(
  input: DespachoBlendInput,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<DespachoBlendResult> {
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
  if (!resumen) {
    throw new DespachoInvalido(
      'El Biochar Blend no está configurado en Sirius Inventario Production Core.'
    );
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

  // Sin KG explícitos se despacha todo lo que el pedido debe: es lo que se quiere
  // el 99% de las veces, y escribirlo a mano solo agrega una forma de equivocarse.
  const kgPedido = input.kg === undefined ? pedido.kgPendientes : r2(Number(input.kg));
  if (!Number.isFinite(kgPedido) || kgPedido <= 0) {
    throw new DespachoInvalido('Los KG a despachar deben ser mayores que cero.');
  }
  if (kgPedido > pedido.kgPendientes + TOLERANCIA_KG) {
    throw new DespachoInvalido(
      `Al pedido ${pedido.codigo} solo le faltan ${pedido.kgPendientes} kg y se están despachando ${kgPedido} kg.`
    );
  }

  const fecha = input.fechaDespacho?.trim() || new Date().toISOString().split('T')[0];

  // ── De dónde sale el producto ───────────────────────────────────────────────
  let lote: LoteBlendDisponible | null = null;
  let produccion: PlanProduccionDespacho | null = null;
  let kg = kgPedido;
  let motivoParcial: string | undefined;

  if (input.lote) {
    // Lote elegido a mano: no se produce nada y el tope es lo que ese lote tenga.
    lote = lotes.find((l) => l.lote === input.lote) ?? null;
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
  } else {
    lote = elegirLoteExistente(lotes, kg);

    if (!lote) {
      // Una selección que no cuadra es un error del despacho, no un "no se pudo
      // producir": se re-lanza para que el operador reciba el número que falta en
      // vez de un parcial silencioso por baches mal digitados.
      const plan = await planearProduccionParaDespacho(kg, input.baches ?? []).catch((err) => {
        if (err instanceof SeleccionBachesInvalida) throw new DespachoInvalido(err.message);
        throw err;
      });

      if (plan.kgBlend > TOLERANCIA_KG) {
        produccion = { ...plan, lote: loteParaProducir(fecha, pedido.codigo, lotes) };
        kg = r2(Math.min(kg, plan.kgBlend));
        if (kg + TOLERANCIA_KG < kgPedido) {
          motivoParcial =
            `Solo se pueden producir ${plan.kgBlend} kg: el ${plan.limitante} es lo que limita ` +
            `(hay ${plan.biocharDisponible} kg de biochar y ${plan.abonoDisponible} kg de abono).`;
        }
      } else {
        // No hay con qué producir. Antes de rendirse, el remanente de un lote viejo
        // sigue siendo producto despachable: media carga vale más que ninguna.
        const conSaldo = lotes.find((l) => l.kgDisponibles > TOLERANCIA_KG);
        if (!conSaldo) {
          throw new DespachoInvalido(
            `No hay Blend en bodega y no se puede producir: hay ${plan.biocharDisponible} kg de ` +
              `biochar y ${plan.abonoDisponible} kg de abono, y el ${plan.limitante} no alcanza ` +
              'ni para el mínimo.'
          );
        }
        lote = conSaldo;
        kg = r2(Math.min(kg, conSaldo.kgDisponibles));
        motivoParcial =
          `No hay con qué producir más, así que sale el remanente del lote ${conSaldo.lote} ` +
          `(${conSaldo.kgDisponibles} kg).`;
      }
    }
  }

  const loteCodigo = produccion?.lote ?? lote?.lote ?? '';
  const disponibleAntes = produccion ? 0 : (lote?.kgDisponibles ?? 0);
  const blendDisponibleAntes = resumen.kgSegunMovimientos;
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
    lote: loteCodigo,
    origen: produccion ? 'produccion' : 'lote-existente',
    produccion,
    loteDisponibleAntes: disponibleAntes,
    // Lo que produce este despacho y no se despacha queda en el lote.
    loteDisponibleDespues: r2((produccion ? produccion.kgBlend : disponibleAntes) - kg),
    blendDisponibleAntes,
    blendDisponibleDespues: r2(blendDisponibleAntes + (produccion?.kgBlend ?? 0) - kg),
    estadoPedidoResultante: cubre ? 'Enviado' : 'Enviado Parcial',
    motivoParcial,
  };

  if (dryRun) return { ok: true, plan };

  const steps: StepResult[] = [];

  // ── 0. La firma de quien entrega ────────────────────────────────────────────
  // Va antes que todo lo demás y es CRÍTICA cuando se dio: si el trazo no se puede
  // guardar, es mejor no consumir baches ni emitir un documento que después dirá
  // "entregado" sin nada que lo respalde. Quien no exige firma —un traslado
  // interno— simplemente no manda `firmaBase64` y esto no corre.
  let firmaEntregaKey: string | undefined;
  if (input.transportista?.firmaBase64) {
    try {
      firmaEntregaKey = await subirFirmaEntrega(
        input.transportista.firmaBase64,
        pedido.codigo,
        fecha
      );
      steps.push({ step: 'firma_entrega', ok: true, detail: { key: firmaEntregaKey } });
    } catch (err) {
      steps.push({
        step: 'firma_entrega',
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, plan, remision: null, steps };
    }
  }

  // ── 1. Producir, si hace falta ──────────────────────────────────────────────
  if (produccion) {
    const resultado = await runProduccionBlend({
      baches: produccion.baches.map((b) => ({ bache: b.codigo, kg: b.kg })),
      kgAbono: produccion.kgAbono,
      kgBlend: produccion.kgBlend,
      sufijoLote: produccion.lote.replace(/^BLEND-\d{4}-\d{2}-\d{2}-?/, '') || undefined,
      fecha,
      realizaRegistro: input.responsableEntrega.trim(),
      observaciones: `Producción para despachar el pedido ${pedido.codigo}.`,
    });

    // Los pasos de la producción se distinguen de los del despacho: los dos van en
    // la misma respuesta y "inventario" significa cosas distintas en cada uno.
    steps.push(
      ...resultado.steps.map((s) => ({ ...s, step: `produccion:${s.step}` })),
    );

    if (!resultado.ok) {
      // El paso crítico de la producción falló: no hay producto, así que no se
      // emite el documento que lo entrega.
      return { ok: false, plan, remision: null, steps };
    }

    // Lo producido de verdad manda sobre lo estimado: la fórmula no cuadra al 100%
    // y los baches pueden haber aportado menos de lo previsto.
    if (resultado.kgBlend + TOLERANCIA_KG < kg) {
      plan.kg = r2(resultado.kgBlend);
      plan.motivoParcial =
        `Se produjeron ${resultado.kgBlend} kg, menos de los ${kg} kg previstos.`;
      plan.estadoPedidoResultante =
        plan.kg + TOLERANCIA_KG >= pedido.kgPendientes ? 'Enviado' : 'Enviado Parcial';
    }
  }

  // ── 2. La remisión y la salida del inventario ───────────────────────────────
  const resultado = await crearRemision({
    idPedido: pedido.codigo,
    idCliente: pedido.idCliente,
    lote: loteCodigo,
    kg: plan.kg,
    responsableEntrega: input.responsableEntrega.trim(),
    transportista: input.transportista,
    observaciones: input.observaciones,
    fechaDespacho: fecha,
    firmaEntregaKey,
  });
  steps.push(...resultado.steps);

  return { ok: resultado.ok, plan, remision: resultado.remision, steps };
}

/**
 * Sube el trazo de quien entrega y devuelve su key de S3.
 *
 * Se guarda la KEY y no una URL firmada porque el PDF con las dos firmas se
 * genera cuando el receptor firma —días después, a veces—, y una URL firmada de
 * S3 caduca a los 7 días. La key no caduca; la URL se pide cuando se necesita.
 */
async function subirFirmaEntrega(
  firmaBase64: string,
  idPedido: string,
  fecha: string
): Promise<string> {
  const base64 = firmaBase64.replace(/^data:image\/\w+;base64,/, '');
  if (base64.length < 100) {
    throw new Error('La firma de quien entrega llegó vacía.');
  }

  const key = `firmas-blend/entrega-${idPedido}-${fecha}-${Date.now()}.png`;
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: awsServerConfig.bucketName,
      Key: key,
      Body: Buffer.from(base64, 'base64'),
      ContentType: 'image/png',
    })
  );
  return key;
}

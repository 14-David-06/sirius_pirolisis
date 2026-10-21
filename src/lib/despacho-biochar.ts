// src/lib/despacho-biochar.ts
// ⚠️ SERVER-SIDE ONLY (emite enlaces de recepción).
//
// Despacho COMERCIAL de biochar puro: un pedido de Sirius Pedidos Core con línea
// `SIRIUS-PRODUCT-0015` sale en una remisión de Sirius Remisiones Core, y el
// biochar se descuenta en sus DOS vistas (§5 de CLAUDE.md).
//
// ═══ EL OPERADOR DIGITA EL TOTAL ══════════════════════════════════════════════
// Decisión del dueño del producto: se piden «200 kg», no «75 de S-00140 y 125 de
// S-00141». El ensayo reparte FIFO por bache (`repartirSalidaFIFO`) sobre lo
// DESPACHABLE —el saldo del Core menos lo ya prometido en otras remisiones— y la
// confirmación reenvía ese reparto tal cual: recalcularlo caería en otros baches
// si el saldo se movió. El bache sigue siendo la unidad de la contabilidad de
// carbono: cada kg sale de uno, con su Salida y su detalle.
//
// ═══ EL ANCLA EN BORRADOR ═════════════════════════════════════════════════════
// No hay transacciones entre cuatro bases. El orden elegido garantiza una
// invariante: TODA remisión de biochar activa (Pendiente, En Tránsito, Entregada)
// tiene su inventario escrito en las dos vistas. Por eso:
//
//   1 remision + producto_remitido   C  el documento nace en `Borrador`
//   2 lectura                         C  su código SIRIUS-REM y el chequeo de líder
//   3 transportista                   B
//   4 local                           C  PiroliApp: la fórmula de cada bache
//   5 core:S-XXXXX                    C  el libro mayor: una Salida por bache
//   6 activar                         C  Borrador → Pendiente | En Tránsito
//   7 estado_baches, verificacion_saldo, estado_pedido, enlace, documento   B
//
// Si algo crítico falla después de 1, queda un Borrador VISIBLE: bloquea el
// pedido, el PDF y el enlace lo rechazan, y [Completar] lo termina (o [Anular],
// si todavía no se escribió inventario). Con el plan persistido en las marcas del
// propio documento, completar no depende del navegador ni de la memoria de nadie.
//
// ═══ IDEMPOTENCIA ═════════════════════════════════════════════════════════════
// La llave `[desp:<uuid>]` la genera el SERVIDOR en el ensayo. Confirmar dos
// veces con la misma llave encuentra la remisión y no emite otra (`yaExistia`):
// si ya está activa, verifica que no le falte nada; si sigue en Borrador, 409 con
// `despachoIncompleto` (puede ser otra instancia escribiendo, y la termina el
// operador con [Completar]); si está anulada, 409. Cada escritura posterior tiene
// su propia llave: la marca `[DESPACHO:<REM>]` en PiroliApp y `DESP-<REM>-<S>`
// en el Core.

import 'server-only';
import { randomUUID } from 'crypto';
import { config } from './config';
import { fechaBogota } from './fecha-bogota';
import { conCandado } from './candado';
import { sanearError } from './log-seguro';
import {
  NOMBRE_PRODUCTO,
  SEPARADOR_OBSERVACIONES,
  bachesDeNotas,
  esEstadoRecibible,
  kgRemitidoDeRemision,
  marcaDespachoLocal,
  notasRemisionBiochar,
  referenciaDespachoBache,
  estadoPedidoTrasRemitir,
  tipoRemision,
  type BacheDeRemision,
  type RemisionCruda,
} from './remision-pirolisis.constants';
import {
  ESTADO_REMISION,
  ErrorAirtable,
  TIPO_PERSONA,
  activarRemision,
  buscarOCrearPersona,
  cambiarEstado,
  datosCliente,
  descartarRemision,
  emitirDocumentoRemision,
  leerRemisionCruda,
  listarRemisionesCrudas,
  vincularPersonas,
} from './remisiones-core';
import { co2Secuestrado, resolverRemision, type RemisionBlend } from './blend-remisiones-core';
import { adjuntarPdfRemision } from './blend-remision-pdf';
import { actualizarEstadoPedidoPirolisis, leerPedidoConLineas, type PedidoConLineas } from './pedidos-pirolisis-estado';
import { ESTADOS_PEDIDO_PENDIENTE } from './pedidos-blend-core';
import {
  documentosSalidaBiochar,
  fetchMovimientosBiocharPuro,
  saldoDeBaches,
  saldosPorBache,
  crearSalidasBiocharPuro,
  type MovimientoBiocharPuro,
} from './biochar-inventario-core';
import { actualizarEstadoBaches, estadoTrasConsumo, resolverBiocharDisponible, type BiocharDisponible } from './baches-biochar';
import { repartirSalidaFIFO } from './salida-bache.constants';
import { resolverAreaDespacho, DespachoInvalido } from './despacho-blend';
import {
  escribirConsumoLocal,
  leerConsumoLocal,
  resolverBachesPorCodigo,
  type BacheLocal,
} from './consumo-local-bache';
import {
  TOLERANCIA_KG,
  estadoActivacion,
  formatoKg,
  kgDespachadosBiochar,
  notasProductoRemitido,
  saldosDespachables,
  validarRepartoConfirmado,
  type SaldoDespachable,
} from './despacho-biochar.calculos';
import { pasoEnlaceRecepcion } from './recepcion/enlace.server';
import type { StepResult } from '@/types/step-result';

/** El despacho no se intentó: el pedido, el reparto o el inventario no cuadran (→ 409). */
export class DespachoBiocharInvalido extends Error {
  constructor(
    mensaje: string,
    /** El Borrador que bloquea el pedido, si ese es el motivo: la UI ofrece completarlo. */
    readonly despachoIncompleto: { codigo: string; estado: string } | null = null
  ) {
    super(mensaje);
    this.name = 'DespachoBiocharInvalido';
  }
}

/** No se pudo leer un Core o falta configuración: no se sabe si se puede despachar (→ 503). */
export class LecturaCoreFallida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'LecturaCoreFallida';
  }
}

/**
 * Otra instancia emitió primero con la misma llave y está escribiendo el
 * inventario de SU remisión (→ 503). La propia ya se descartó y no se escribió
 * inventario: completar la ajena desde aquí sería escribirlo dos veces a la vez.
 */
export class DespachoEnCurso extends Error {
  constructor(
    mensaje: string,
    /** El código de la remisión que ganó, para que el operador la busque. */
    readonly codigoRemision: string
  ) {
    super(mensaje);
    this.name = 'DespachoEnCurso';
  }
}

/** La remisión no existe o no es un despacho de biochar de PiroliApp (→ 404). */
export class RemisionBiocharNoEncontrada extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'RemisionBiocharNoEncontrada';
  }
}

export interface DespachoBiocharInput {
  /** `SIRIUS-PED-XXXX`. */
  idPedido: string;
  /** Kg TOTALES. Omitido = lo pendiente, recortado a lo despachable. */
  kg?: number;
  /** El reparto del ensayo. Obligatorio al confirmar. */
  reparto?: BacheDeRemision[];
  /** La llave del ensayo (`plan.idDespacho`). Obligatoria al confirmar. */
  idDespacho?: string;
  /** Quién entrega en planta: va en la remisión y como responsable de las Salidas. */
  responsableEntrega: string;
  /** El usuario de la sesión (`Nombre Apellido`): va en la remisión local. */
  realizaRegistro: string;
  transportista?: { nombre: string; cedula: string; telefono?: string; email?: string };
  /** `AC-XXXX`. Omitido = el del pedido, si tiene. */
  idAreaCliente?: string;
  /** `YYYY-MM-DD`. Por defecto, hoy en Bogotá. */
  fechaDespacho?: string;
  observaciones?: string;
}

export interface RepartoPlanBiochar extends BacheDeRemision {
  saldoCore: number;
  comprometido: number;
  disponible: number;
  disponibleDespues: number;
  estadoActual: string;
  /** Estado al que pasa el bache, o null si no cambia. */
  estadoNuevo: string | null;
}

export interface PlanDespachoBiochar {
  idDespacho: string;
  pedido: {
    codigo: string;
    cliente: string;
    idCliente: string;
    kgSolicitados: number;
    kgDespachados: number;
    kgPendientes: number;
  };
  areaCliente: { codigo: string; nombre: string } | null;
  kg: number;
  /** Derivado: kg × `config.carbon.factorSecuestroCo2`. No se guarda. */
  co2SecuestradoKg: number;
  reparto: RepartoPlanBiochar[];
  biochar: {
    kgCore: number | null;
    kgBaches: number | null;
    divergencia: number | null;
    /** Σ de lo despachable de los baches con registro en PiroliApp. */
    disponibleDespachable: number;
  };
  estadoPedidoResultante: 'Enviado' | 'Enviado Parcial';
  motivoParcial?: string;
  /**
   * Un despacho de biochar del pedido que quedó en Borrador. En un plan que se
   * devuelve es siempre null: si existe, el despacho se rechaza con 409 y el
   * error lo trae (`DespachoBiocharInvalido.despachoIncompleto`).
   */
  despachoIncompleto: { codigo: string; estado: string } | null;
  advertencias: string[];
}

export interface EnlaceDespacho {
  url: string;
  venceEl: string;
}

export interface DespachoBiocharResult {
  ok: boolean;
  plan: PlanDespachoBiochar;
  /** La llave ya tenía remisión: no se emitió otra, se completó la existente. */
  yaExistia?: boolean;
  remision?: RemisionBlend | null;
  /**
   * El código SIRIUS-REM de la remisión emitida, aunque `remision` venga null:
   * si un paso crítico falla después de emitir, el Borrador existe y el operador
   * necesita su código para completarlo.
   */
  codigoRemision?: string | null;
  enlace?: EnlaceDespacho | null;
  steps: StepResult[];
}

export interface CompletarDespachoResult {
  ok: boolean;
  /** No hubo nada que escribir: el despacho ya estaba completo. */
  yaCompleto: boolean;
  remision: RemisionBlend | null;
  enlace?: EnlaceDespacho | null;
  steps: StepResult[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

const CODIGO_BACHE = /^S-\d{5}$/;

const PASOS_CRITICOS = new Set(['remision', 'producto_remitido', 'lectura', 'completar', 'local', 'activar']);

/** ¿Un paso crítico falló? Los `core:S-…` son críticos todos. */
function criticoFallido(s: StepResult): boolean {
  return !s.ok && !s.skipped && (PASOS_CRITICOS.has(s.step) || s.step.startsWith('core:'));
}

function idsProducto() {
  const biochar = config.airtable.inventarioProdCoreBiocharPuroProductId;
  if (!biochar) {
    throw new LecturaCoreFallida('Falta AIRTABLE_INVENTARIO_BIOCHAR_PURO_PRODUCT_ID: el biochar puro no está configurado.');
  }
  return { biochar, blend: config.airtable.inventarioProdCoreBiocharBlendProductId ?? '' };
}

/** Una lectura caída es 503, no "no existe": decidir sobre un vacío falso vende dos veces. */
async function leer<T>(que: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DespachoBiocharInvalido || err instanceof LecturaCoreFallida) throw err;
    throw new LecturaCoreFallida(`No se pudo leer ${que}: ${sanearError(err)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto: una lectura por tabla
// ─────────────────────────────────────────────────────────────────────────────

interface Contexto {
  pedido: PedidoConLineas;
  /** Remisiones de PiroliApp (Blend y biochar) de TODOS los pedidos, por numeración. */
  remisiones: RemisionCruda[];
  movimientos: MovimientoBiocharPuro[];
  cliente: { nombre: string; distanciaKm: number | null };
  biochar: BiocharDisponible;
}

/**
 * Todo lo que el despacho necesita saber, leído UNA vez por tabla y en paralelo
 * entre bases (5 req/s por base, §3 de CLAUDE.md). El cruce va en JS.
 */
async function leerContexto(idPedido: string): Promise<Contexto> {
  const [pedido, remisiones, movimientos, biochar] = await Promise.all([
    leer('el pedido en Sirius Pedidos Core', () => leerPedidoConLineas(idPedido)),
    leer('las remisiones de Sirius Remisiones Core', () => listarRemisionesCrudas({ soloPirolisis: true })),
    leer('el libro mayor del biochar', async () => {
      const movs = await fetchMovimientosBiocharPuro();
      if (!movs) throw new LecturaCoreFallida('Biochar puro no configurado en Sirius Inventario Production Core.');
      return movs;
    }),
    // Solo informativo (la divergencia entre vistas): nunca tumba el despacho.
    resolverBiocharDisponible(),
  ]);
  if (!pedido) throw new DespachoBiocharInvalido(`El pedido ${idPedido} no existe en Sirius Pedidos Core.`);
  const cliente = await leerCliente(pedido.idCliente);
  return { pedido, remisiones, movimientos, cliente, biochar };
}

/**
 * El nombre EXACTO del cliente. Va en la remisión local y eUse cruza por él: un
 * cliente que no existe es un pedido mal hecho (409); una lectura caída, un 503.
 */
async function leerCliente(idCliente: string): Promise<{ nombre: string; distanciaKm: number | null }> {
  const { clientesBaseId, clientesTableId, clientesToken } = config.airtable;
  if (!clientesBaseId || !clientesTableId || !clientesToken) {
    throw new LecturaCoreFallida('Sirius Clients Core no configurado: AIRTABLE_CLIENTES_BASE_ID / AIRTABLE_CLIENTES_TABLE_ID.');
  }
  try {
    return await datosCliente(idCliente);
  } catch (err) {
    if (err instanceof ErrorAirtable) throw new LecturaCoreFallida(`No se pudo leer el cliente: ${sanearError(err)}`);
    throw new DespachoBiocharInvalido(err instanceof Error ? err.message : String(err));
  }
}

async function resolverArea(codigo: string | undefined, idCliente: string) {
  try {
    return await resolverAreaDespacho(codigo, idCliente);
  } catch (err) {
    if (err instanceof DespachoInvalido) throw new DespachoBiocharInvalido(err.message);
    throw new LecturaCoreFallida(`No se pudo verificar el área del cliente: ${sanearError(err)}`);
  }
}

function saldosCore(movimientos: MovimientoBiocharPuro[]) {
  return saldosPorBache(movimientos).map((b) => ({ codigo: b.codigo, kg: b.kg }));
}

function documentosDe(movimientos: MovimientoBiocharPuro[]): Set<string> {
  return new Set(movimientos.map((m) => m.documento).filter(Boolean));
}

function remisionesBiocharDelPedido(remisiones: RemisionCruda[], idPedido: string): RemisionCruda[] {
  return remisiones.filter((r) => r.idPedido === idPedido && tipoRemision(r) === 'biochar');
}

/** El estado del pedido tras remitirle `kgAhora` más de biochar, por lo remitido y por producto. */
function estadoPedidoPrevisto(ctx: Contexto, kgAhora: number, ids: { blend: string; biochar: string }) {
  const remitido = new Map<string, number>();
  for (const r of ctx.remisiones) {
    if (r.idPedido !== ctx.pedido.codigo || r.estado === ESTADO_REMISION.cancelada) continue;
    const kr = kgRemitidoDeRemision(r);
    const producto = kr ? (kr.tipo === 'blend' ? ids.blend : ids.biochar) : '';
    if (kr && producto) remitido.set(producto, r2((remitido.get(producto) ?? 0) + kr.kg));
  }
  remitido.set(ids.biochar, r2((remitido.get(ids.biochar) ?? 0) + kgAhora));
  return estadoPedidoTrasRemitir(ctx.pedido.lineas, remitido, ids);
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan
// ─────────────────────────────────────────────────────────────────────────────

interface OpcionesPlan {
  idDespacho: string;
  kg?: number;
  /** Reparto dado (confirmación o despacho ya emitido). Sin él, FIFO. */
  reparto?: BacheDeRemision[];
  idAreaCliente?: string;
  /** false para describir un despacho que ya existe (no se revalida contra lo pendiente). */
  validar: boolean;
  /** La remisión propia, para no cobrarse sus propios kg como comprometidos. */
  excluirRemision?: string;
}

interface PlanCalculado {
  plan: PlanDespachoBiochar;
  baches: Map<string, BacheLocal>;
  disponibles: SaldoDespachable[];
}

async function calcularPlan(ctx: Contexto, o: OpcionesPlan): Promise<PlanCalculado> {
  const ids = idsProducto();
  const { pedido } = ctx;

  const kgSolicitados = r2(
    pedido.lineas.filter((l) => l.productoId === ids.biochar).reduce((t, l) => t + l.kg, 0)
  );
  const delPedido = remisionesBiocharDelPedido(ctx.remisiones, pedido.codigo);
  const kgDespachados = kgDespachadosBiochar(delPedido);
  const kgPendientes = r2(Math.max(0, kgSolicitados - kgDespachados));

  if (o.validar) {
    if (!(ESTADOS_PEDIDO_PENDIENTE as readonly string[]).includes(pedido.estado)) {
      throw new DespachoBiocharInvalido(
        `El pedido ${pedido.codigo} está en "${pedido.estado}": ya no está pendiente de despacho.`
      );
    }
    if (!pedido.lineas.some((l) => l.productoId === ids.biochar)) {
      throw new DespachoBiocharInvalido(`El pedido ${pedido.codigo} no tiene una línea de biochar puro.`);
    }
    if (!(kgSolicitados > 0)) {
      throw new DespachoBiocharInvalido(`La línea de biochar del pedido ${pedido.codigo} no tiene cantidad.`);
    }
    const borrador = delPedido.find(
      (r) => r.estado === ESTADO_REMISION.borrador && r.codigo !== o.excluirRemision
    );
    if (borrador) {
      throw new DespachoBiocharInvalido(
        `El pedido ${pedido.codigo} tiene el despacho ${borrador.codigo} incompleto (Borrador): ` +
          'complételo o anúlelo antes de despachar otra vez.',
        { codigo: borrador.codigo, estado: borrador.estado }
      );
    }
  }

  // Lo despachable por bache, y los baches de PiroliApp que lo respaldan.
  const disponiblesCore = saldosDespachables(
    saldosCore(ctx.movimientos),
    ctx.remisiones,
    documentosDe(ctx.movimientos),
    { excluirRemision: o.excluirRemision }
  );
  const conSaldo = disponiblesCore.filter((d) => d.disponible > TOLERANCIA_KG).map((d) => d.bache);
  // Un `bache_origen_id` mal escrito en el Core no puede tumbar el despacho entero:
  // no se consulta (no parece un código) y cae en la advertencia de abajo.
  const aLeer = [...new Set([...conSaldo, ...(o.reparto ?? []).map((b) => b.bache)])].filter((c) =>
    CODIGO_BACHE.test(c)
  );
  const baches = await leer('los baches en PiroliApp', () => resolverBachesPorCodigo(aLeer));

  const advertencias: string[] = [];
  const sinRegistro = conSaldo.filter((c) => !baches.has(c));
  if (sinRegistro.length) {
    advertencias.push(
      `Se excluyeron ${sinRegistro.length} bache(s) con saldo en el Core pero sin registro en PiroliApp ` +
        `(${sinRegistro.slice(0, 5).join(', ')}${sinRegistro.length > 5 ? '…' : ''}): sin el bache no se ` +
        'puede descontar su fórmula.'
    );
  }
  const disponibles = disponiblesCore.filter((d) => baches.has(d.bache));
  const disponibleDespachable = r2(disponibles.reduce((t, d) => t + d.disponible, 0));

  // Los kg y el reparto.
  let kg: number;
  let reparto: BacheDeRemision[];
  if (o.reparto?.length) {
    reparto = o.reparto.map((b) => ({ bache: b.bache, kg: r2(b.kg) }));
    kg = r2(reparto.reduce((t, b) => t + b.kg, 0));
    if (o.validar) {
      if (o.kg !== undefined && Math.abs(r2(o.kg) - kg) > TOLERANCIA_KG) {
        throw new DespachoBiocharInvalido(
          `El reparto suma ${formatoKg(kg)} kg y el despacho es de ${formatoKg(o.kg)} kg.`
        );
      }
      const faltan = reparto.filter((b) => !baches.has(b.bache)).map((b) => b.bache);
      if (faltan.length) {
        throw new DespachoBiocharInvalido(`Sin registro en PiroliApp: ${faltan.join(', ')}. Ensaye de nuevo.`);
      }
      const motivo = validarRepartoConfirmado(reparto, disponibles, kg);
      if (motivo) throw new DespachoBiocharInvalido(motivo);
    }
  } else {
    // Sin kg se despacha lo pendiente, hasta donde alcance lo despachable.
    kg = o.kg === undefined ? r2(Math.min(kgPendientes, disponibleDespachable)) : r2(o.kg);
    if (!(kg > 0)) {
      throw new DespachoBiocharInvalido(
        kgPendientes <= TOLERANCIA_KG
          ? `Al pedido ${pedido.codigo} no le falta biochar por despachar.`
          : 'No hay biochar despachable en bodega.'
      );
    }
    const fifo = repartirSalidaFIFO(
      disponibles.map((d) => ({ codigo: d.bache, kg: d.disponible })),
      kg
    );
    if (!fifo) {
      throw new DespachoBiocharInvalido(
        `En bodega hay ${formatoKg(disponibleDespachable)} kg de biochar despachable y se piden ${formatoKg(kg)} kg.`
      );
    }
    reparto = fifo.map((b) => ({ bache: b.codigo, kg: b.kg }));
  }

  if (o.validar) {
    if (kg > kgPendientes + TOLERANCIA_KG) {
      throw new DespachoBiocharInvalido(
        `Al pedido ${pedido.codigo} solo le faltan ${formatoKg(kgPendientes)} kg de biochar y se están despachando ${formatoKg(kg)} kg.`
      );
    }
    if (kg > disponibleDespachable + TOLERANCIA_KG) {
      throw new DespachoBiocharInvalido(
        `En bodega hay ${formatoKg(disponibleDespachable)} kg de biochar despachable y se piden ${formatoKg(kg)} kg.`
      );
    }
  }

  const areaCliente = await resolverArea(o.idAreaCliente || pedido.idAreaCliente || undefined, pedido.idCliente);

  const porBache = new Map(disponiblesCore.map((d) => [d.bache, d]));
  const repartoPlan: RepartoPlanBiochar[] = reparto.map(({ bache, kg: kgBache }) => {
    const d = porBache.get(bache);
    const local = baches.get(bache);
    const saldoCore = d?.saldoCore ?? 0;
    const estadoActual = local?.estado ?? '';
    return {
      bache,
      kg: kgBache,
      saldoCore,
      comprometido: d?.comprometido ?? 0,
      disponible: d?.disponible ?? 0,
      disponibleDespues: r2((d?.disponible ?? 0) - kgBache),
      estadoActual,
      estadoNuevo: local ? estadoTrasConsumo(saldoCore, kgBache, estadoActual) : null,
    };
  });

  if (ctx.cliente.distanciaKm === null) {
    advertencias.push(
      `El cliente ${ctx.cliente.nombre} no tiene distancia a la bodega en Clients Core: eUse no podrá calcular el transporte de este despacho.`
    );
  }
  const v2 = reparto.filter((b) => baches.get(b.bache)?.origenRegistro).map((b) => b.bache);
  if (v2.length) {
    advertencias.push(
      `Incluye baches históricos de la era V2 (${v2.join(', ')}): su fórmula en PiroliApp quedará negativa, como en la producción.`
    );
  }
  if (ctx.biochar.divergencia !== null && Math.abs(ctx.biochar.divergencia) > TOLERANCIA_KG) {
    advertencias.push(
      `El Core y los baches difieren en ${formatoKg(ctx.biochar.divergencia)} kg: el despacho se valida contra el Core.`
    );
  }

  const estadoPedidoResultante = estadoPedidoPrevisto(ctx, o.validar ? kg : 0, ids);
  let motivoParcial: string | undefined;
  if (estadoPedidoResultante === 'Enviado Parcial') {
    const otros = ctx.pedido.lineas.some((l) => l.productoId !== ids.biochar && l.productoId !== ids.blend);
    motivoParcial =
      o.validar && kg + TOLERANCIA_KG < kgPendientes
        ? `Salen ${formatoKg(kg)} de los ${formatoKg(kgPendientes)} kg pendientes.`
        : otros
          ? 'El pedido tiene líneas de otros productos que PiroliApp no despacha.'
          : 'El pedido tiene otra línea de pirólisis todavía sin cubrir.';
  }

  return {
    baches,
    disponibles,
    plan: {
      idDespacho: o.idDespacho,
      pedido: {
        codigo: pedido.codigo,
        cliente: ctx.cliente.nombre,
        idCliente: pedido.idCliente,
        kgSolicitados,
        kgDespachados,
        kgPendientes,
      },
      areaCliente,
      kg,
      co2SecuestradoKg: co2Secuestrado(kg),
      reparto: repartoPlan,
      biochar: {
        kgCore: ctx.biochar.kgCore,
        kgBaches: ctx.biochar.kgBaches,
        divergencia: ctx.biochar.divergencia,
        disponibleDespachable,
      },
      estadoPedidoResultante,
      motivoParcial,
      despachoIncompleto: null,
      advertencias,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Despachar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Despacha (o ensaya) un pedido de biochar puro.
 *
 * El ensayo NO escribe nada y devuelve el plan con una llave nueva. La
 * confirmación, con esa llave y ese reparto, escribe en el orden del ancla en
 * Borrador (ver la cabecera). Todo corre bajo `conCandado('despacho-biochar')`:
 * dentro de una instancia, el segundo despacho lee lo que escribió el primero.
 *
 * @throws DespachoBiocharInvalido (409), LecturaCoreFallida (503) o
 *   CandadoOcupado, siempre ANTES de la primera escritura. Lo que falla DESPUÉS
 *   de emitir el Borrador no se lanza: vuelve como paso crítico fallido
 *   (`ok: false`, 500) con `codigoRemision`, porque el documento ya existe y la
 *   UI tiene que ofrecer completarlo. La excepción es `DespachoEnCurso` (503):
 *   se lanza tras emitir y DESCARTAR la propia remisión, sin inventario escrito.
 */
export async function despacharPedidoBiochar(
  i: DespachoBiocharInput,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<DespachoBiocharResult> {
  if (!i.responsableEntrega?.trim()) throw new DespachoBiocharInvalido('Falta quién entrega.');

  if (dryRun) {
    const ctx = await leerContexto(i.idPedido);
    const { plan } = await calcularPlan(ctx, {
      idDespacho: randomUUID(),
      kg: i.kg,
      idAreaCliente: i.idAreaCliente,
      validar: true,
    });
    return { ok: true, plan, steps: [] };
  }

  if (!i.idDespacho) throw new DespachoBiocharInvalido('Confirmar exige la llave del ensayo (idDespacho).');
  if (!i.reparto?.length) throw new DespachoBiocharInvalido('Confirmar exige el reparto por bache del ensayo.');
  const idDespacho = i.idDespacho;

  return conCandado('despacho-biochar', async () => {
    // 0. ¿Esta llave ya tiene remisión? Es un reintento.
    const previas = await leer('las remisiones del despacho', () => listarRemisionesCrudas({ marcaDespacho: idDespacho }));
    if (previas.length) {
      const lider = previas[0];
      if (lider.idPedido !== i.idPedido) {
        throw new DespachoBiocharInvalido(`La llave del despacho pertenece a otro pedido (${lider.idPedido}).`);
      }
      // Anulada: el documento ya no existe para el libro mayor. Completarla
      // escribiría consumo y Salidas DESP-<REM>-<S> contra una remisión cancelada.
      if (lider.estado === ESTADO_REMISION.cancelada) {
        throw new DespachoBiocharInvalido(
          `La remisión ${lider.codigo} de este despacho está anulada: ensaye un despacho nuevo.`
        );
      }
      // Borrador: NO se completa aquí. Puede ser el de otra instancia que todavía
      // está escribiendo su inventario (el candado es por instancia), y
      // completarlo a la vez lo escribiría dos veces. Lo termina el operador con
      // [Completar], cuando ya no hay nadie en medio.
      if (lider.estado === ESTADO_REMISION.borrador) {
        throw new DespachoBiocharInvalido(
          `El despacho ya tiene la remisión ${lider.codigo} en Borrador: complétela o anúlela.`,
          { codigo: lider.codigo, estado: lider.estado }
        );
      }
      const ctx = await leerContexto(lider.idPedido);
      const { plan } = await calcularPlan(ctx, {
        idDespacho,
        reparto: bachesDeNotas(lider.notas),
        idAreaCliente: lider.idAreaCliente || undefined,
        validar: false,
        excluirRemision: lider.codigo,
      });
      const r = await completarInterno(lider, {
        realizaRegistro: i.realizaRegistro,
        responsable: i.responsableEntrega.trim(),
        conTransportista: lider.personasIds.length > 0,
        ctx,
      });
      return { ok: r.ok, plan, yaExistia: true, remision: r.remision, codigoRemision: lider.codigo, enlace: r.enlace, steps: [
        { step: 'remision', ok: true, skipped: true, detail: { codigo: lider.codigo, motivo: 'La llave ya tenía remisión' } },
        ...r.steps,
      ] };
    }

    // 1. Revalidar el reparto del ensayo contra lecturas frescas.
    const ctx = await leerContexto(i.idPedido);
    const { plan } = await calcularPlan(ctx, {
      idDespacho,
      kg: i.kg,
      reparto: i.reparto,
      idAreaCliente: i.idAreaCliente,
      validar: true,
    });
    const ids = idsProducto();
    const fecha = i.fechaDespacho?.trim() || fechaBogota();
    const reparto: BacheDeRemision[] = plan.reparto.map((b) => ({ bache: b.bache, kg: b.kg }));
    const steps: StepResult[] = [];

    // 2. El documento en Borrador y su producto remitido (críticos).
    const emitido = await emitirDocumentoRemision({
      estado: 'Borrador',
      notas: notasRemisionBiochar(reparto, idDespacho, i.observaciones),
      productos: [{ productoId: ids.biochar, kg: plan.kg, notas: notasProductoRemitido(reparto) }],
      idCliente: plan.pedido.idCliente,
      idPedido: plan.pedido.codigo,
      idAreaCliente: plan.areaCliente?.codigo,
      responsableEntrega: i.responsableEntrega.trim(),
      fechaDespacho: fecha,
    });
    steps.push(...emitido.steps);
    if (!emitido.ok || !emitido.remisionRecordId) return { ok: false, plan, remision: null, enlace: null, steps };

    // 3. Lectura y chequeo de líder: si dos instancias emitieron con la misma llave,
    //    gana la de menor numeración. La propia se descarta (aún no tiene
    //    inventario) y se responde «en curso»: el inventario de la líder lo escribe
    //    la instancia que la emitió, no esta.
    let lider: RemisionCruda;
    let perdedora: { lider: string; descartada: string } | null = null;
    try {
      const conLlave = await listarRemisionesCrudas({ marcaDespacho: idDespacho });
      const propia = conLlave.find((r) => r.recordId === emitido.remisionRecordId);
      if (!propia || !propia.codigo) throw new Error('La remisión recién emitida no aparece al releerla');
      lider = conLlave[0];
      if (lider.recordId !== propia.recordId) {
        await descartarRemision(propia.recordId, emitido.productoIds);
        perdedora = { lider: lider.codigo, descartada: propia.codigo };
      } else {
        steps.push({ step: 'lectura', ok: true, detail: { codigo: lider.codigo } });
      }
    } catch (err) {
      steps.push({ step: 'lectura', ok: false, error: sanearError(err) });
      return { ok: false, plan, remision: null, enlace: null, steps };
    }
    if (perdedora) {
      throw new DespachoEnCurso(
        `Otro despacho con la misma llave ya emitió la remisión ${perdedora.lider} y está escribiendo su ` +
          `inventario (la ${perdedora.descartada} se descartó). Espere unos segundos y revise el pedido.`,
        perdedora.lider
      );
    }

    // 4. Transportista (best-effort): la remisión vale sin él, y se imprime en papel.
    if (i.transportista?.cedula && lider.recordId === emitido.remisionRecordId) {
      try {
        const personaId = await buscarOCrearPersona({ ...i.transportista, tipo: TIPO_PERSONA.transportista });
        if (personaId) await vincularPersonas(lider.recordId, [personaId]);
        steps.push({ step: 'transportista', ok: true, detail: { personaId } });
      } catch (err) {
        steps.push({ step: 'transportista', ok: false, error: sanearError(err) });
      }
    }

    // 5…12. Inventario, activación y lo demás, igual que «completar». Lo que
    //    completarInterno lanza (lectura caída, saldo que ya no alcanza) aquí ya
    //    no es un 409/503 "sin escribir": el Borrador existe. Va como paso
    //    crítico, con el código, para que la UI ofrezca completarlo.
    try {
      const r = await completarInterno(lider, {
        realizaRegistro: i.realizaRegistro,
        responsable: i.responsableEntrega.trim(),
        conTransportista: Boolean(i.transportista?.cedula),
        ctx,
      });
      steps.push(...r.steps);
      return { ok: r.ok, plan, remision: r.remision, codigoRemision: lider.codigo, enlace: r.enlace, steps };
    } catch (err) {
      const error =
        err instanceof DespachoBiocharInvalido || err instanceof LecturaCoreFallida ? err.message : sanearError(err);
      steps.push({ step: 'completar', ok: false, error, detail: { codigo: lider.codigo } });
      return { ok: false, plan, remision: null, codigoRemision: lider.codigo, enlace: null, steps };
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Completar / anular
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Termina un despacho de biochar a medias, o lo anula.
 *
 * `completar` es idempotente: escribe solo lo que falte (detalles locales,
 * Salidas, activación) y, si no faltaba nada, no escribe (`yaCompleto`).
 * `anular` solo procede si la remisión sigue en Borrador y NO tiene inventario
 * escrito en ninguna de las dos vistas: con inventario, anular dejaría Salidas
 * que nombran un documento cancelado, y eso se arregla a mano, no con un botón.
 *
 * @throws RemisionBiocharNoEncontrada (404), DespachoBiocharInvalido (409),
 *   LecturaCoreFallida (503).
 */
export async function completarDespachoBiochar(
  codigo: string,
  o: { realizaRegistro: string; accion?: 'completar' | 'anular' }
): Promise<CompletarDespachoResult> {
  return conCandado('despacho-biochar', async () => {
    const cruda = await leer('la remisión', () => leerRemisionCruda(codigo));
    if (!cruda || tipoRemision(cruda) !== 'biochar') {
      throw new RemisionBiocharNoEncontrada(`No existe un despacho de biochar de PiroliApp con el código ${codigo}.`);
    }
    if (cruda.estado === ESTADO_REMISION.cancelada) {
      throw new DespachoBiocharInvalido(`La remisión ${cruda.codigo} está anulada.`);
    }

    if (o.accion === 'anular') return anular(cruda);

    const ctx = await leerContexto(cruda.idPedido);
    return completarInterno(cruda, {
      realizaRegistro: o.realizaRegistro,
      // RemisionCruda no trae `Responsable Entrega`: quien completa queda como
      // responsable de las Salidas que falten, que es quien las está escribiendo.
      responsable: o.realizaRegistro,
      conTransportista: cruda.personasIds.length > 0,
      ctx,
    });
  });
}

async function anular(cruda: RemisionCruda): Promise<CompletarDespachoResult> {
  if (cruda.estado !== ESTADO_REMISION.borrador) {
    throw new DespachoBiocharInvalido(
      `La remisión ${cruda.codigo} está ${cruda.estado}: solo se anula un despacho que quedó en Borrador.`
    );
  }
  const [local, salidas] = await Promise.all([
    leer('el consumo en PiroliApp', () => leerConsumoLocal(marcaDespachoLocal(cruda.codigo))),
    leer('las Salidas del Core', () => documentosSalidaBiochar(cruda.codigo)),
  ]);
  if ((local && local.kgPorBacheId.size > 0) || salidas.size > 0) {
    throw new DespachoBiocharInvalido(
      `La remisión ${cruda.codigo} ya tiene inventario escrito: no se anula, se completa. ` +
        'Si de verdad no salió, hay que revertir el inventario a mano.'
    );
  }
  const steps: StepResult[] = [];
  try {
    await cambiarEstado(cruda.recordId, ESTADO_REMISION.cancelada);
    steps.push({ step: 'anular', ok: true, detail: { codigo: cruda.codigo } });
  } catch (err) {
    steps.push({ step: 'anular', ok: false, error: sanearError(err) });
    return { ok: false, yaCompleto: false, remision: null, steps };
  }
  // El pedido deja de contar estos kg como despachados.
  steps.push(await actualizarEstadoPedidoPirolisis(cruda.idPedido));
  const remision = await resolverRemision(cruda.recordId).catch(() => null);
  return { ok: true, yaCompleto: false, remision, enlace: null, steps };
}

interface OpcionesCompletar {
  realizaRegistro: string;
  /** Responsable de las Salidas del Core. */
  responsable: string;
  conTransportista: boolean;
  ctx: Contexto;
}

/**
 * Los pasos 4…12 sobre una remisión ya emitida. SIN candado: lo toma quien llama
 * (anidarlo sería un bloqueo mutuo).
 *
 * Cada escritura se salta si ya está, así que sirve igual para el despacho nuevo,
 * para el reintento con la misma llave y para el botón «Completar».
 */
async function completarInterno(cruda: RemisionCruda, o: OpcionesCompletar): Promise<CompletarDespachoResult> {
  const steps: StepResult[] = [];
  const fallo = (): CompletarDespachoResult => ({ ok: false, yaCompleto: false, remision: null, enlace: null, steps });
  const { ctx } = o;
  const codigo = cruda.codigo;
  // Anulada: nada que escribir. Cada camino que llega aquí lo revisa antes, pero
  // la guarda vive también aquí porque es la que escribe el inventario.
  if (cruda.estado === ESTADO_REMISION.cancelada) {
    throw new DespachoBiocharInvalido(`La remisión ${codigo} está anulada: no se le escribe inventario.`);
  }
  const reparto = bachesDeNotas(cruda.notas);
  if (!reparto.length) {
    steps.push({ step: 'local', ok: false, error: `La remisión ${codigo} no tiene baches en sus marcas.` });
    return fallo();
  }
  const fecha = cruda.fechaDespacho || fechaBogota();
  const baches = await leer('los baches en PiroliApp', () => resolverBachesPorCodigo(reparto.map((b) => b.bache)));

  // Qué hay escrito. Las Salidas se releen ACOTADAS a esta remisión: el libro del
  // contexto pudo leerse antes de que otra instancia escribiera las suyas.
  const [local, escritas] = await Promise.all([
    leer('el consumo en PiroliApp', () => leerConsumoLocal(marcaDespachoLocal(codigo))),
    leer('las Salidas del Core', () => documentosSalidaBiochar(codigo)),
  ]);
  const enSnapshot = documentosDe(ctx.movimientos);
  const referencia = (b: BacheDeRemision) => referenciaDespachoBache(codigo, b.bache);
  const pendientesCore = reparto.filter((b) => !escritas.has(referencia(b)));

  // Entregada: el cliente ya la recibió. Si las dos vistas están completas no hay
  // nada que hacer (activar, estado, enlace y documento no aplican a un documento
  // cerrado); si falta algo, no se escribe inventario a un documento recibido:
  // eso se concilia a mano.
  if (cruda.estado === ESTADO_REMISION.entregada) {
    const localCompleto = reparto.every((b) => {
      const bache = baches.get(b.bache);
      const hecho = bache ? local?.kgPorBacheId.get(bache.id) : undefined;
      return hecho !== undefined && Math.abs(hecho - r2(b.kg)) <= TOLERANCIA_KG;
    });
    if (localCompleto && !pendientesCore.length) {
      steps.push({ step: 'local', ok: true, skipped: true, detail: { motivo: 'Ya registrado' } });
      for (const b of reparto) {
        steps.push({ step: `core:${b.bache}`, ok: true, skipped: true, detail: { referencia: referencia(b) } });
      }
      steps.push({ step: 'activar', ok: true, skipped: true, detail: { estado: cruda.estado } });
      const remision = await resolverRemision(cruda.recordId).catch(() => null);
      return { ok: true, yaCompleto: true, remision, enlace: null, steps };
    }
    const falta = [
      ...(localCompleto ? [] : ['el consumo en PiroliApp']),
      ...(pendientesCore.length ? [`las Salidas del Core de ${pendientesCore.map((b) => b.bache).join(', ')}`] : []),
    ];
    throw new DespachoBiocharInvalido(
      `La remisión ${codigo} ya está Entregada y le falta ${falta.join(' y ')}: no se completa un ` +
        'documento recibido. Hay que conciliar el inventario a mano.'
    );
  }

  // Antes de escribir: lo que falta tiene que caber en lo despachable de HOY.
  if (pendientesCore.length) {
    const disponibles = saldosDespachables(saldosCore(ctx.movimientos), ctx.remisiones, enSnapshot, {
      excluirRemision: codigo,
    });
    const porBache = new Map(disponibles.map((d) => [d.bache, d.disponible]));
    const faltan = pendientesCore.filter((b) => b.kg > (porBache.get(b.bache) ?? 0) + TOLERANCIA_KG);
    if (faltan.length) {
      throw new DespachoBiocharInvalido(
        `No alcanza el saldo para completar ${codigo}: ` +
          faltan.map((b) => `${b.bache} necesita ${formatoKg(b.kg)} kg y tiene ${formatoKg(porBache.get(b.bache) ?? 0)}`).join('; ') +
          '.'
      );
    }
  }

  // 5. local (CRÍTICO): la fórmula de cada bache, en una sola remisión local.
  const sinRegistro = reparto.filter((b) => !baches.has(b.bache)).map((b) => b.bache);
  if (sinRegistro.length) {
    steps.push({ step: 'local', ok: false, error: `Baches sin registro en PiroliApp: ${sinRegistro.join(', ')}` });
    return fallo();
  }
  const observacionesOperador = cruda.notas.split(SEPARADOR_OBSERVACIONES).slice(1).join(SEPARADOR_OBSERVACIONES).trim();
  steps.push(
    await escribirConsumoLocal(
      {
        marca: marcaDespachoLocal(codigo),
        fecha,
        realizaRegistro: o.realizaRegistro,
        cliente: ctx.cliente.nombre,
        descripcion:
          `Despacho comercial de ${NOMBRE_PRODUCTO.biochar} · pedido ${cruda.idPedido} · remisión ${codigo}` +
          (observacionesOperador ? `\n${observacionesOperador}` : ''),
        lineas: reparto.map((b) => ({ bacheId: baches.get(b.bache)!.id, codigo: b.bache, kg: b.kg })),
      },
      local
    )
  );
  if (criticoFallido(steps[steps.length - 1])) return fallo();

  // 6. core:S-XXXXX (CRÍTICO): una Salida por bache, solo las que falten.
  //
  // Se vuelve a leer JUSTO antes del POST: entre la lectura de arriba y aquí
  // pasaron la escritura local y varias lecturas, y otra instancia (el candado
  // es por instancia) pudo escribir las mismas Salidas en ese tiempo.
  // ⚠️ Riesgo residual: Airtable no tiene restricción de unicidad ni
  // transacciones, así que dos instancias que relean a la vez, antes de que
  // cualquiera de las dos haga su POST, todavía escriben dos veces. La ventana
  // queda en los milisegundos entre esta lectura y el POST; el duplicado sería
  // visible (dos Salidas con el mismo `documento_referencia`) y el paso
  // `verificacion_saldo` lo delataría si deja el bache en negativo.
  let escritasAhora = escritas;
  try {
    if (pendientesCore.length) escritasAhora = await documentosSalidaBiochar(codigo);
  } catch (err) {
    const error = `No se pudo releer las Salidas del Core: ${sanearError(err)}`;
    for (const b of pendientesCore) steps.push({ step: `core:${b.bache}`, ok: false, error });
    return fallo();
  }
  const aEscribir = reparto.filter((b) => !escritasAhora.has(referencia(b)));
  for (const b of reparto.filter((x) => escritasAhora.has(referencia(x)))) {
    steps.push({ step: `core:${b.bache}`, ok: true, skipped: true, detail: { referencia: referencia(b) } });
  }
  if (aEscribir.length) {
    try {
      const resultados = await crearSalidasBiocharPuro(
        aEscribir.map((b) => ({
          kg: b.kg,
          bacheOrigen: b.bache,
          produccionDestino: codigo,
          documentoReferencia: referencia(b),
          motivo: 'Despacho Remisión',
          fecha,
          responsable: o.responsable,
          ubicacionOrigen: codigo,
          ubicacionDestino: cruda.idCliente,
          observaciones:
            `Despacho comercial de ${NOMBRE_PRODUCTO.biochar} del bache ${b.bache} al pedido ` +
            `${cruda.idPedido} (remisión ${codigo}).`,
        }))
      );
      aEscribir.forEach((b, n) => {
        const res = resultados[n];
        steps.push(
          res?.movimientoId
            ? { step: `core:${b.bache}`, ok: true, detail: { referencia: res.documentoReferencia, movimientoId: res.movimientoId, kg: b.kg } }
            : { step: `core:${b.bache}`, ok: false, error: sanearError(res?.error ?? 'No se escribió') }
        );
      });
    } catch (err) {
      const error = sanearError(err);
      for (const b of aEscribir) steps.push({ step: `core:${b.bache}`, ok: false, error });
    }
  }
  if (steps.some(criticoFallido)) return fallo();

  // 7. activar (CRÍTICO): ya están las dos vistas; ahora sí es un despacho.
  const activar = await activarRemision(cruda.recordId, estadoActivacion(o.conTransportista));
  steps.push(activar);
  if (criticoFallido(activar)) return fallo();

  const escribioInventario = steps.some(
    (s) => (s.step === 'local' || s.step.startsWith('core:') || s.step === 'activar') && s.ok && !s.skipped
  );

  // 8. estado_baches (best-effort). Con el saldo de ANTES de esta Salida: si ya
  //    estaba en el libro que se leyó, se le suman de vuelta sus kg.
  const cambios: Array<{ bacheId: string; estado: string }> = [];
  const saldoSnapshot = new Map(saldosCore(ctx.movimientos).map((s) => [s.codigo, s.kg]));
  for (const b of reparto) {
    const local = baches.get(b.bache)!;
    const antes = (saldoSnapshot.get(b.bache) ?? 0) + (enSnapshot.has(referencia(b)) ? b.kg : 0);
    const estado = estadoTrasConsumo(antes, b.kg, local.estado);
    if (estado) cambios.push({ bacheId: local.id, estado });
  }
  if (!cambios.length) {
    steps.push({ step: 'estado_baches', ok: true, skipped: true });
  } else {
    const { errores, actualizados } = await actualizarEstadoBaches(cambios);
    steps.push(
      errores.length
        ? { step: 'estado_baches', ok: false, error: sanearError(errores.join(' | ')) }
        : { step: 'estado_baches', ok: true, detail: { actualizados } }
    );
  }

  // 9. verificacion_saldo (best-effort): la salida y la producción no toman este
  //    candado, así que pudieron consumir el mismo bache a la vez. Se detecta aquí.
  try {
    const saldos = await saldoDeBaches(reparto.map((b) => b.bache));
    const negativos = [...saldos].filter(([, kg]) => kg < -TOLERANCIA_KG);
    steps.push(
      negativos.length
        ? {
            step: 'verificacion_saldo',
            ok: false,
            error: `Quedaron en negativo en el Core: ${negativos.map(([c, kg]) => `${c} (${formatoKg(kg)} kg)`).join(', ')}`,
            detail: Object.fromEntries(saldos),
          }
        : { step: 'verificacion_saldo', ok: true, detail: Object.fromEntries(saldos) }
    );
  } catch (err) {
    steps.push({ step: 'verificacion_saldo', ok: false, error: sanearError(err) });
  }

  // 10. estado_pedido (best-effort), recalculado desde lo remitido.
  steps.push(await actualizarEstadoPedidoPirolisis(cruda.idPedido));

  // 11. enlace (best-effort): sin estado, se emite cada vez que hace falta.
  const actual = await leerRemisionCruda(cruda.recordId).catch(() => null);
  const estadoFinal = actual?.estado ?? (activar.ok ? estadoActivacion(o.conTransportista) : cruda.estado);
  let enlace: EnlaceDespacho | null = null;
  if (esEstadoRecibible(estadoFinal)) {
    const paso = pasoEnlaceRecepcion(cruda.recordId);
    steps.push(paso.paso);
    enlace = paso.enlace ? { url: paso.enlace.url, venceEl: paso.enlace.venceEl } : null;
  } else {
    steps.push({ step: 'enlace', ok: true, skipped: true, detail: { estado: estadoFinal } });
  }

  // 12. documento (best-effort). Si no se escribió nada y ya tiene su PDF, no se
  //     resube: «completar» dos veces no debe escribir dos veces.
  const remision = await resolverRemision(cruda.recordId).catch(() => null);
  const tieneDocumento = (actual?.documentos ?? cruda.documentos).some((d) => d.startsWith(codigo));
  if (!remision) {
    steps.push({ step: 'documento', ok: false, error: 'No se pudo releer la remisión para armar el PDF' });
  } else if (!escribioInventario && tieneDocumento) {
    steps.push({ step: 'documento', ok: true, skipped: true, detail: { motivo: 'Ya tiene documento' } });
  } else {
    // Sin enlace a propósito (decisión de David, 2026-10-21): el QR es una llave
    // para confirmar la recepción y Remisiones Core la lee también DataLab. Al
    // Core va la versión sin QR; el QR viaja solo en el papel (descarga con
    // sesión) y en el enlace que se comparte.
    steps.push(await adjuntarPdfRemision(remision));
  }

  return { ok: true, yaCompleto: !escribioInventario, remision, enlace, steps };
}

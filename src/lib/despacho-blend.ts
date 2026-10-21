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
// Si los lotes se eligen a mano, entre ellos tienen que alcanzar: pedir lotes
// concretos es decir de dónde sale, y fabricar por debajo sería desobedecer.
//
// ═══ UN PEDIDO, UNA REMISIÓN, LOS LOTES QUE HAGAN FALTA ══════════════════════
// Un pedido se produce en tantas tandas como alcancen el abono y el biochar
// (`BLEND-<fecha>-<pedido>`, `…-<pedido>-2`), pero se despacha COMPLETO: una sola
// remisión por el total, con una fila de producto remitido y una Salida por lote.
// La remisión guarda cuánto salió de cada uno (`[kg-lote:…]`), y con eso la
// composición y el CO₂ se siguen derivando exactos, ponderados por lote.
//
// ═══ DESPACHAR PRODUCE ════════════════════════════════════════════════════════
// El Blend no se almacena esperando pedidos: se produce contra el pedido. Si lo
// que hay no alcanza, el despacho produce el faltante con el biochar y el abono de
// bodega (ver `produccion-para-despacho.ts`) ANTES de emitir la remisión, y si ni
// eso alcanza despacha lo que se pueda y deja el pedido en `Enviado Parcial`.
// Producir primero y documentar después es el único orden que no deja un documento
// entregando producto que no existe.
//
// ⚠️ Desde el 2026-09-22 la pantalla de bodega NO usa esa producción en línea: el
// pedido tiene un botón Producir (lote `BLEND-<fecha>-<pedido>`) y el despacho
// sale siempre de un lote elegido. El Blend se produce días antes de que lo
// recojan, y producir desde el despacho exigía tener al conductor delante —su
// nombre y su cédula— para poder producir. El camino sin lote queda para la API.
// Mientras espera su despacho, el lote de un pedido es de ESE pedido: ningún otro
// lo toma (`esLoteDeOtroPedido()`).
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

import { randomUUID } from 'crypto';
import { config } from './config';
import { assertCodigoSimbolico, escapeAirtableValue } from './airtable-escape';
import { fechaBogota } from './fecha-bogota';
import { fetchAll, toNumber, r2 } from './inventario-prod-core';
import { credencialesBlend, resumenBlend } from './blend-inventario-core';
import {
  completarSalidasRemisionBlend,
  crearRemision,
  lotesDeNotas,
  resolverRemision,
  ESTADO_REMISION,
  type LoteDeRemision,
  type RemisionBlend,
} from './blend-remisiones-core';
import { listarRemisionesCrudas } from './remisiones-core';
import { conCandado } from './candado';
import { esEstadoRecibible } from './remision-pirolisis.constants';
import { pasoEnlaceRecepcion } from './recepcion/enlace.server';
import { adjuntarPdfRemision } from './blend-remision-pdf';
import { listarPedidosBlend, type PedidoBlend } from './pedidos-blend-core';
import { listarAreasCliente } from './areas-cliente-core';
import { runProduccionBlend, loteDeProduccion } from './produccion-blend';
import {
  planearProduccionParaDespacho,
  SeleccionBachesInvalida,
  type ConsumoBacheElegido,
  type PlanProduccion,
} from './produccion-para-despacho';
import type { StepResult } from '@/types/step-result';

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
    // Una salida no comercial que cubre varios lotes es UN movimiento con el reparto
    // en las marcas (`salida-blend.ts`): atribuirla entera al lote más largo que
    // aparezca le cargaría a un lote lo que salió de otro.
    const repartida = lotesDeNotas(String(m.fields['observaciones'] ?? ''), kgSalida);
    if (repartida.length > 1) {
      for (const { lote: l, kg: k } of repartida) salidoPorLote.set(l, (salidoPorLote.get(l) ?? 0) + k);
      continue;
    }
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
      const notas = String(r.fields['Notas de Remisión'] ?? '');
      for (const { lote, kg } of lotesDeNotas(notas, toNumber(r.fields['Total Cantidad Remitida']))) {
        porLote.set(lote, (porLote.get(lote) ?? 0) + kg);
      }
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
   * Varios lotes de los que sale el producto, en el orden en que se vacían. Es
   * como despacha la pantalla: un pedido producido en dos tandas se despacha
   * completo en UNA remisión, no en una por tanda. Tiene prioridad sobre `lote`.
   */
  lotes?: string[];
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
   * El usuario de la sesión (`Nombre Apellido`). Queda como quien registró la
   * producción cuando el despacho tiene que producir; sin él, `responsableEntrega`.
   */
  realizaRegistro?: string;
  /**
   * Quien se lleva el producto: el formulario de despacho lo pide (personal del
   * cliente o un conductor). Con cédula se registra en `Personas` y la remisión
   * sale `En Tránsito`; sin él sale `Pendiente`. Nadie firma en la app: la
   * remisión se imprime y se firma en papel (2026-10-02), y quien recibe la
   * confirma con el enlace de recepción.
   */
  transportista?: {
    nombre: string;
    cedula: string;
    telefono?: string;
    email?: string;
  };
  observaciones?: string;
  /**
   * `AC-XXXX`: el área del cliente a la que va (Sanidad, Fertilización…).
   * Omitido = la del pedido, si la tiene. Tiene que ser un área del MISMO
   * cliente: la remisión la imprime, y una ajena mandaría el producto a nombre
   * de otra empresa.
   */
  idAreaCliente?: string;
  /** `YYYY-MM-DD`. Por defecto, hoy en Bogotá. */
  fechaDespacho?: string;
  /**
   * Llave de idempotencia del ensayo (`plan.idDespacho`, UUID v4). Confirmar dos
   * veces con la misma llave devuelve la remisión ya emitida (`yaExistia`) en vez
   * de emitir otra: un doble clic o una respuesta que se cortó no duplican el
   * despacho.
   */
  idDespacho?: string;
}

/** Lo que se produciría para poder despachar, si hace falta producir. */
export interface PlanProduccionDespacho extends PlanProduccion {
  /** Lote `BLEND-…` que se va a crear. */
  lote: string;
}

/** Lo que se va a escribir, para confirmarlo antes de escribirlo. */
export interface PlanDespacho {
  /** Llave del despacho: el ensayo la genera y la confirmación la reenvía. */
  idDespacho: string;
  pedido: {
    codigo: string;
    cliente: string;
    idCliente: string;
    kgSolicitados: number;
    kgDespachados: number;
    kgPendientes: number;
  };
  /** Área del cliente a la que va, o null si no se indicó. */
  areaCliente: { codigo: string; nombre: string } | null;
  kg: number;
  /** Los lotes del despacho separados por coma; uno solo en el caso normal. */
  lote: string;
  /** Cuánto sale de cada lote. Suma `kg`. */
  reparto: LoteDeRemision[];
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
  /** La llave ya tenía remisión: no se escribió nada nuevo. */
  yaExistia?: boolean;
  /** Enlace de recepción vigente, si la remisión está por recibir y está configurado. */
  enlace?: { url: string; venceEl: string } | null;
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
 * Este camino automático busca UN lote que cubra todo. Despachar de varios se pide
 * explícito con `lotes`: la remisión entonces guarda cuánto sale de cada uno
 * (`[kg-lote:…]`), que es lo que le permite derivar composición y CO₂ ciertos.
 */
function elegirLoteExistente(
  lotes: LoteBlendDisponible[],
  kg: number,
  idPedido: string
): LoteBlendDisponible | null {
  const cubre = (l: LoteBlendDisponible) => l.kgDisponibles + TOLERANCIA_KG >= kg;
  return (
    lotes.find((l) => esLoteDePedido(l.lote, idPedido) && cubre(l)) ??
    lotes.find((l) => !esLoteDeOtroPedido(l.lote, idPedido) && cubre(l)) ??
    null
  );
}

/**
 * ¿El lote se produjo para este pedido? `BLEND-<fecha>-<pedido>` o `…-<pedido>-<n>`.
 *
 * El Blend se produce contra lo que el pedido programó, días antes de que lo
 * recojan. Mientras espera, ese lote es de ESE pedido: despacharlo a otro dejaría
 * al primero sin su producto y con el biochar ya consumido.
 */
function esLoteDePedido(lote: string, idPedido: string): boolean {
  const escapado = idPedido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^BLEND-\\d{4}-\\d{2}-\\d{2}-${escapado}(-\\d+)?$`).test(lote);
}

function esLoteDeOtroPedido(lote: string, idPedido: string): boolean {
  return /SIRIUS-PED-/.test(lote) && !esLoteDePedido(lote, idPedido);
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
 * por un producto que no existe. Al revés no tiene arreglo —una remisión emitida
 * tiene consecutivo en el Core y no se puede borrar—.
 *
 * ═══ PARCIAL ANTES QUE NADA ═════════════════════════════════════════════════
 * Si el inventario no da para el pedido completo se despacha lo que alcance y el
 * pedido queda `Enviado Parcial`, con el motivo en el plan. Un camión que sale con
 * la mitad sirve; uno que no sale porque faltaban 40 kg de abono, no.
 *
 * Lanza `DespachoInvalido` cuando nada de lo anterior es posible, sin escribir.
 *
 * ═══ UNO A LA VEZ ═══════════════════════════════════════════════════════════
 * La confirmación corre bajo `conCandado('despacho-blend')`: dentro de una
 * instancia, el segundo despacho (o el doble clic con la misma llave) lee lo que
 * escribió el primero, incluida su remisión. Entre instancias lo cubre el chequeo
 * de líder de `crearRemision()`; la producción, que va antes de la remisión,
 * queda fuera de ese chequeo (riesgo residual: dos instancias con la misma llave
 * y sin lote existente podrían producir las dos). Puede lanzar `CandadoOcupado`.
 */
export async function despacharPedidoBlend(
  input: DespachoBlendInput,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<DespachoBlendResult> {
  if (dryRun) return despacharPedidoBlendSinCandado(input, true);
  return conCandado('despacho-blend', () => despacharPedidoBlendSinCandado(input, false));
}

async function despacharPedidoBlendSinCandado(
  input: DespachoBlendInput,
  dryRun: boolean
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

  // La llave se mira ANTES de validar: tras un despacho exitoso el pedido ya no
  // debe esos kg, y el reintento moriría en «solo le faltan 0 kg» en vez de
  // reconocer la remisión que él mismo emitió.
  if (!dryRun && input.idDespacho) {
    const previo = await despachoYaEmitido(input.idDespacho, pedido, lotes, resumen.kgSegunMovimientos, {
      responsableEntrega: input.responsableEntrega.trim(),
      fechaDespacho: input.fechaDespacho?.trim() || undefined,
    });
    if (previo) return previo;
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

  const areaCliente = await resolverAreaDespacho(
    input.idAreaCliente?.trim() || pedido.idAreaCliente,
    pedido.idCliente
  );

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

  // En Bogotá: después de las 19:00 la fecha UTC ya es mañana.
  const fecha = input.fechaDespacho?.trim() || fechaBogota();

  // ── De dónde sale el producto ───────────────────────────────────────────────
  let lote: LoteBlendDisponible | null = null;
  let produccion: PlanProduccionDespacho | null = null;
  let kg = kgPedido;
  let motivoParcial: string | undefined;
  /** Solo cuando el despacho sale de lotes elegidos: cuánto de cada uno. */
  const repartoElegido: Array<LoteDeRemision & { disponible: number }> = [];

  const lotesElegidos = [...new Set(input.lotes?.length ? input.lotes : input.lote ? [input.lote] : [])];

  if (lotesElegidos.length) {
    // Lotes elegidos a mano: no se produce nada y el tope es lo que esos lotes
    // tengan entre todos. Se vacían en el orden recibido.
    const elegidos = lotesElegidos.map((codigo) => {
      const l = lotes.find((x) => x.lote === codigo);
      if (!l) {
        throw new DespachoInvalido(
          `El lote ${codigo} no tiene ninguna producción de Blend registrada en el Core.`
        );
      }
      if (esLoteDeOtroPedido(l.lote, pedido.codigo)) {
        throw new DespachoInvalido(
          `El lote ${l.lote} se produjo para otro pedido: no se despacha a ${pedido.codigo}.`
        );
      }
      return l;
    });

    const totalDisponible = r2(elegidos.reduce((t, l) => t + l.kgDisponibles, 0));
    if (kg > totalDisponible + TOLERANCIA_KG) {
      throw new DespachoInvalido(
        elegidos.length === 1
          ? `El lote ${elegidos[0].lote} solo tiene ${totalDisponible} kg sin despachar y se están sacando ${kg} kg.`
          : `Los lotes elegidos solo tienen ${totalDisponible} kg sin despachar y se están sacando ${kg} kg.`
      );
    }

    let resto = kg;
    for (const l of elegidos) {
      if (resto <= TOLERANCIA_KG) break;
      const toma = r2(Math.min(resto, l.kgDisponibles));
      if (toma <= TOLERANCIA_KG) continue;
      repartoElegido.push({ lote: l.lote, kg: toma, disponible: l.kgDisponibles });
      resto = r2(resto - toma);
    }
    // El redondeo por lote puede dejar un centavo suelto: va al último.
    const ultimo = repartoElegido[repartoElegido.length - 1];
    if (ultimo && Math.abs(resto) > 0) ultimo.kg = r2(ultimo.kg + resto);

    lote = elegidos.find((l) => l.lote === repartoElegido[0]?.lote) ?? elegidos[0];
  } else {
    lote = elegirLoteExistente(lotes, kg, pedido.codigo);

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
        const conSaldo = lotes.find(
          (l) => l.kgDisponibles > TOLERANCIA_KG && !esLoteDeOtroPedido(l.lote, pedido.codigo)
        );
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
  const reparto: LoteDeRemision[] = repartoElegido.length
    ? repartoElegido.map(({ lote: l, kg: k }) => ({ lote: l, kg: k }))
    : [{ lote: loteCodigo, kg }];
  const disponibleAntes = produccion
    ? 0
    : repartoElegido.length
      ? r2(repartoElegido.reduce((t, l) => t + l.disponible, 0))
      : (lote?.kgDisponibles ?? 0);
  const blendDisponibleAntes = resumen.kgSegunMovimientos;
  const cubre = kg + TOLERANCIA_KG >= pedido.kgPendientes;

  const plan: PlanDespacho = {
    // El ensayo genera la llave; la confirmación usa la que le reenvían, o una
    // nueva si el llamador no la trae (la API vieja), para que la remisión la lleve.
    idDespacho: input.idDespacho ?? randomUUID(),
    pedido: {
      codigo: pedido.codigo,
      cliente: pedido.clienteNombre,
      idCliente: pedido.idCliente,
      kgSolicitados: pedido.kgSolicitados,
      kgDespachados: pedido.kgDespachados,
      kgPendientes: pedido.kgPendientes,
    },
    areaCliente,
    kg,
    lote: reparto.map((l) => l.lote).join(', '),
    reparto,
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

  // ── 1. Producir, si hace falta ──────────────────────────────────────────────
  if (produccion) {
    const resultado = await runProduccionBlend({
      baches: produccion.baches.map((b) => ({ bache: b.codigo, kg: b.kg })),
      kgAbono: produccion.kgAbono,
      kgBlend: produccion.kgBlend,
      sufijoLote: produccion.lote.replace(/^BLEND-\d{4}-\d{2}-\d{2}-?/, '') || undefined,
      fecha,
      realizaRegistro: input.realizaRegistro?.trim() || input.responsableEntrega.trim(),
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
      plan.reparto = [{ lote: loteCodigo, kg: plan.kg }];
    }
  }

  // ── 2. La remisión y la salida del inventario ───────────────────────────────
  const resultado = await crearRemision({
    idPedido: pedido.codigo,
    idCliente: pedido.idCliente,
    idAreaCliente: areaCliente?.codigo,
    lote: plan.reparto[0]?.lote ?? loteCodigo,
    kg: plan.kg,
    reparto: plan.reparto.length > 1 ? plan.reparto : undefined,
    responsableEntrega: input.responsableEntrega.trim(),
    transportista: input.transportista,
    observaciones: input.observaciones,
    fechaDespacho: fecha,
    idDespacho: plan.idDespacho,
    kgSolicitadosRespaldo: pedido.fuenteKg === 'notas' ? pedido.kgSolicitados : undefined,
  });
  steps.push(...resultado.steps);

  // Otra petición con la misma llave ganó entre la validación y la emisión: no se
  // escribió nada y su documento ya lo adjuntó ella.
  if (resultado.yaExistia) {
    const enlace = resultado.remision ? enlaceSiPorRecibir(resultado.remision, steps) : null;
    return { ok: true, plan, remision: resultado.remision, yaExistia: true, enlace, steps };
  }

  // 3. Enlace de recepción y el PDF en el registro del Core (best-effort: la
  //    remisión ya existe y ambos se pueden volver a emitir). Al Core va SIN QR
  //    (decisión de David, 2026-10-21): el QR es una llave para confirmar la
  //    recepción y Remisiones Core la lee también DataLab. El QR viaja solo en el
  //    papel (descarga con sesión) y en el enlace que se comparte.
  let enlace: { url: string; venceEl: string } | null = null;
  if (resultado.ok && resultado.remision) {
    enlace = enlaceSiPorRecibir(resultado.remision, steps);
    steps.push(await adjuntarPdfRemision(resultado.remision));
  }

  return { ok: resultado.ok, plan, remision: resultado.remision, enlace, steps };
}

/** Paso `enlace` si la remisión espera a quien la recibe; lo agrega a `steps`. */
function enlaceSiPorRecibir(
  remision: RemisionBlend,
  steps: StepResult[]
): { url: string; venceEl: string } | null {
  if (!esEstadoRecibible(remision.estado)) {
    steps.push({ step: 'enlace', ok: true, skipped: true, detail: { estado: remision.estado } });
    return null;
  }
  const { paso, enlace } = pasoEnlaceRecepcion(remision.recordId);
  steps.push(paso);
  return enlace ? { url: enlace.url, venceEl: enlace.venceEl } : null;
}

/**
 * Si la llave ya tiene remisión, el resultado de ese despacho sin escribir nada;
 * si no, null. El plan describe lo que se emitió (sus lotes y sus kg), no lo que
 * se pediría hoy.
 */
async function despachoYaEmitido(
  idDespacho: string,
  pedido: PedidoBlend,
  lotes: LoteBlendDisponible[],
  blendDisponible: number,
  respaldo: { responsableEntrega: string; fechaDespacho?: string }
): Promise<DespachoBlendResult | null> {
  const previas = await listarRemisionesCrudas({ marcaDespacho: idDespacho });
  if (!previas.length) return null;
  if (previas[0].idPedido !== pedido.codigo) {
    throw new DespachoInvalido(`La llave del despacho pertenece a otro pedido (${previas[0].idPedido}).`);
  }
  const remision = await resolverRemision(previas[0].recordId);
  if (!remision) throw new Error(`No se pudo leer la remisión ${previas[0].codigo} del despacho.`);

  const disponibles = r2(
    remision.lotes.reduce((t, l) => t + (lotes.find((x) => x.lote === l.lote)?.kgDisponibles ?? 0), 0)
  );
  const steps: StepResult[] = [
    { step: 'remision', ok: true, skipped: true, detail: { codigo: remision.codigo, motivo: 'La llave ya tenía remisión' } },
    // Si la Salida falló en el intento original (es best-effort), el reintento la
    // completa. Idempotente por documento_referencia: si ya está, sale `skipped`.
    ...(await completarSalidasRemisionBlend(remision, {
      responsableEntrega: respaldo.responsableEntrega,
      fechaDespacho: respaldo.fechaDespacho,
      idPedido: pedido.codigo,
      idCliente: pedido.idCliente,
    })),
  ];
  const enlace = enlaceSiPorRecibir(remision, steps);
  return {
    ok: true,
    yaExistia: true,
    remision,
    enlace,
    steps,
    plan: {
      idDespacho,
      pedido: {
        codigo: pedido.codigo,
        cliente: pedido.clienteNombre,
        idCliente: pedido.idCliente,
        kgSolicitados: pedido.kgSolicitados,
        kgDespachados: pedido.kgDespachados,
        kgPendientes: pedido.kgPendientes,
      },
      areaCliente: remision.idAreaCliente
        ? { codigo: remision.idAreaCliente, nombre: remision.areaClienteNombre }
        : null,
      kg: remision.kgTotal,
      lote: remision.lote,
      reparto: remision.lotes,
      origen: 'lote-existente',
      produccion: null,
      // Ya despachado: lo de antes y lo de después es lo que hay hoy.
      loteDisponibleAntes: disponibles,
      loteDisponibleDespues: disponibles,
      blendDisponibleAntes: blendDisponible,
      blendDisponibleDespues: blendDisponible,
      estadoPedidoResultante: pedido.pendiente ? 'Enviado Parcial' : 'Enviado',
    },
  };
}

/**
 * Valida que el área exista y sea del cliente del pedido. Va antes de escribir
 * nada: un área equivocada no se nota hasta que el documento llega impreso. La
 * usa también el despacho de biochar puro: es la misma regla para los dos.
 */
export async function resolverAreaDespacho(
  codigo: string | undefined,
  idCliente: string
): Promise<{ codigo: string; nombre: string } | null> {
  if (!codigo) return null;
  try {
    assertCodigoSimbolico(codigo, 'área del cliente');
  } catch (err) {
    throw new DespachoInvalido(err instanceof Error ? err.message : String(err));
  }
  const areas = await listarAreasCliente(idCliente);
  if (areas === null) {
    throw new DespachoInvalido(
      'Sirius Clients Core no está configurado: no se puede verificar el área del cliente.'
    );
  }
  const area = areas.find((a) => a.codigo === codigo);
  if (!area) {
    throw new DespachoInvalido(
      `El área ${codigo} no es un área activa del cliente ${idCliente}.`
    );
  }
  return { codigo: area.codigo, nombre: area.nombre };
}

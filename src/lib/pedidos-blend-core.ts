// src/lib/pedidos-blend-core.ts
//
// Los pedidos de pirólisis —Biochar Blend (0016) y, desde el 2026-10-21, biochar
// puro (0015)— leídos de Sirius Pedidos Core. Es solo lectura: PiroliApp no es el
// dueño del pedido —lo crea el CRM— y aquí no hay UI para agendarlo.
//
// El nombre del archivo quedó del Blend porque `listarPedidosBlend()` tiene varios
// consumidores; la clasificación de los dos productos es `clasificarPedidos()`.
//
// ═══ PARA QUÉ ═════════════════════════════════════════════════════════════════
// La pantalla de bodega responde "qué hay"; el pedido pendiente responde "para
// qué hace falta". Sin esa segunda mitad, decidir si producir un lote de Blend
// obliga a abrir otra app: el saldo de Blend por sí solo no dice si sobra o falta.
//
// ═══ SE DEVUELVEN TODOS, MARCADOS ═════════════════════════════════════════════
// La lista trae el historial completo de pedidos de Blend y cada uno viene con
// `pendiente` ya resuelto desde su `Estado` del Core:
//   Recibido · Procesando · Enviado Parcial  → pendiente (falta despachar algo)
//   Enviado · Completado · Cancelado         → cerrado
// Filtrar aquí dejaba la pantalla sin poder mostrar lo cerrado —y sin poder decir
// cuántos hay de cada estado, que es lo que hace honesto un filtro—. El corte lo
// hace la UI sobre la lista completa; la clasificación se hace UNA vez, acá, para
// que los contadores de los chips y las filas no puedan contradecirse.
// Un pedido "Enviado Parcial" cuenta como pendiente: sigue debiendo kg, y
// excluirlo es como se pierde de vista el saldo de un despacho partido en dos.
//
// ═══ LOS KG DESPACHADOS SE DERIVAN, NO SE GUARDAN ═════════════════════════════
// Igual que `kgDespachadosDePedido()` en `blend-remisiones-core.ts`: la verdad son
// las Salidas de Blend del libro mayor atribuidas a las remisiones del pedido. Un
// campo acumulador en el pedido sería un segundo número que puede divergir del
// libro, y el libro es el que sostiene el inventario.
//
// La diferencia con esa función es el COSTO: ella resuelve UN pedido y puede
// permitirse leer las remisiones de ese pedido; aquí se resuelven todos los
// pendientes a la vez, así que se lee cada tabla UNA vez y el cruce va en JS
// (rate limit de 5 req/s por base, §3 de CLAUDE.md).

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';
import {
  fetchAll,
  toNumber,
  r2,
  MOVIMIENTO_PROD_FIELDS,
  type AirtableRecord,
} from './inventario-prod-core';
import { credencialesBlend } from './blend-inventario-core';
import {
  kgRemitidoDeRemision,
  remisionCrudaDeRegistro,
  tipoRemision,
  type ProductoPirolisis,
  type RemisionCruda,
} from './remision-pirolisis.constants';
import { ESTADO_REMISION } from './remisiones-core';

/** `Pedidos.Estado` que todavía deben kg. Los demás valores cierran el pedido. */
export const ESTADOS_PEDIDO_PENDIENTE = ['Recibido', 'Procesando', 'Enviado Parcial'] as const;

/** `Origen del Pedido` que marca los pedidos nacidos en esta app. */
const ORIGEN_PIROLISIS = 'PiroliApp (Pirolisis)';

export interface PedidoBlend {
  recordId: string;
  /** `SIRIUS-PED-XXXX`. */
  codigo: string;
  estado: string;
  /** ¿Todavía debe kg? Lo decide `ESTADOS_PEDIDO_PENDIENTE`, no la pantalla. */
  pendiente: boolean;
  /** `CL-XXXX`. */
  idCliente: string;
  /** Nombre comercial; cae al código si Clients Core no responde. */
  clienteNombre: string;
  /**
   * `AC-XXXX`: el área del cliente a la que va el pedido, si quien lo creó la
   * indicó. Es solo lo que el despacho propone por defecto: la remisión guarda la
   * suya, porque un pedido puede salir en tandas para áreas distintas.
   */
  idAreaCliente: string;
  /** `YYYY-MM-DD`. */
  fecha: string;
  kgSolicitados: number;
  kgDespachados: number;
  /**
   * Lo que falta por despachar. Nunca negativo: un sobre-despacho no es deuda.
   * En un pedido cerrado es solo informativo —un cancelado con 1.500 kg sin
   * despachar no es demanda—, así que los totales solo suman los pendientes.
   */
  kgPendientes: number;
  /** De dónde salieron los KG solicitados: el detalle del Core, o las notas. */
  fuenteKg: 'detalle' | 'notas' | 'sin-dato';
  empaque: string;
  observaciones: string;
  /** Códigos `SIRIUS-REM-XXXX` ya emitidos contra el pedido. */
  remisiones: string[];
}

interface PedidosCoreConfig {
  base: string;
  token: string;
  pedidos: string;
  detalles: string;
}

function pedidosCoreConfig(): PedidosCoreConfig | null {
  const base = config.airtable.pedidosCoreBaseId;
  const token = config.airtable.pedidosCoreToken;
  const pedidos = config.airtable.pedidosCorePedidosTable;
  const detalles = config.airtable.pedidosCoreDetallesTable;
  if (!base || !token || !pedidos || !detalles) return null;
  return { base, token, pedidos, detalles };
}

/**
 * Los KG de las notas del pedido: `"Producto: X | KG: 1000 — Empaque: Big Bag | obs"`.
 *
 * Es el formato que escribía el POST de pedidos de esta app, y sigue siendo el
 * RESPALDO de los KG: en el Core hay detalles de Blend que perdieron su link al
 * pedido al editarlos, y para esos las notas son el único rastro de cuánto se
 * pidió. El empaque solo vive ahí.
 */
function parseNotas(notas: string): { kg: number; empaque: string; observaciones: string } {
  const out = { kg: 0, empaque: '', observaciones: '' };
  if (!notas) return out;

  const otras: string[] = [];
  for (const parte of notas.split('|').map((p) => p.trim())) {
    const kgEmpaque = parte.match(/^KG:\s*([\d.,]+)\s*[—-]\s*Empaque:\s*(.+)$/i);
    if (kgEmpaque) {
      out.kg = parseFloat(kgEmpaque[1].replace(',', '.')) || 0;
      out.empaque = kgEmpaque[2].trim();
      continue;
    }
    const soloKg = parte.match(/^KG:\s*([\d.,]+)$/i);
    if (soloKg) {
      out.kg = parseFloat(soloKg[1].replace(',', '.')) || 0;
      continue;
    }
    const empaque = parte.match(/^Empaque:\s*(.+)$/i);
    if (empaque) {
      out.empaque = empaque[1].trim();
      continue;
    }
    if (/^Producto:/i.test(parte)) continue;
    if (parte) otras.push(parte);
  }
  out.observaciones = otras.join(' | ');
  return out;
}

/** `CL-XXXX` → nombre comercial. Best-effort: sin Clients Core queda el código. */
export async function mapaClientes(): Promise<Record<string, string>> {
  const { clientesBaseId, clientesTableId, clientesToken } = config.airtable;
  if (!clientesBaseId || !clientesTableId || !clientesToken) return {};
  try {
    const registros = await fetchAll(clientesBaseId, clientesTableId, clientesToken);
    const mapa: Record<string, string> = {};
    for (const r of registros) {
      const id = String(r.fields['ID'] ?? '');
      const nombre = String(r.fields['Cliente'] ?? '').trim();
      if (id && nombre) mapa[id] = nombre;
    }
    return mapa;
  } catch (err) {
    console.warn('⚠️ No se pudieron leer los clientes de Clients Core:', err);
    return {};
  }
}

export interface PedidoPirolisis extends PedidoBlend {
  /** De qué producto es ESTA fila. Un pedido mixto aparece una vez en cada lista. */
  producto: ProductoPirolisis;
  /**
   * `SIRIUS-REM-XXXX` de un despacho de biochar que quedó en `Borrador` (escrito a
   * medias). Mientras exista, el pedido no admite otro despacho: hay que
   * completarlo o anularlo. Siempre null en el Blend, cuyo despacho no se ancla en
   * un Borrador.
   */
  despachoIncompleto: string | null;
}

export interface PedidosPirolisis {
  blend: PedidoPirolisis[];
  biochar: PedidoPirolisis[];
}

/**
 * Primero lo que todavía se debe, y dentro de eso lo más viejo —que es lo que
 * lleva más tiempo esperando producción—. Los cerrados van después y al revés:
 * como historial, lo último que pasó es lo que se busca.
 */
function ordenarPedidos<T extends PedidoBlend>(lista: T[]): T[] {
  return lista.sort((a, b) => {
    if (a.pendiente !== b.pendiente) return a.pendiente ? -1 : 1;
    const fa = a.fecha || '9999';
    const fb = b.fecha || '9999';
    return a.pendiente ? fa.localeCompare(fb) : fb.localeCompare(fa);
  });
}

/**
 * Clasifica los pedidos de Pedidos Core en Blend (0016) y biochar puro (0015), con
 * lo solicitado y lo despachado de cada uno. PURO: recibe lo leído y no lee nada,
 * para que el despacho de biochar y la pantalla de bodega crucen las MISMAS tablas
 * leídas una sola vez (rate limit, §3 de CLAUDE.md), y para poder probarlo.
 *
 * ═══ QUÉ VA A CADA LISTA ═════════════════════════════════════════════════════
 * Blend: un pedido con línea 0016, o nacido en PiroliApp SIN línea 0015. El
 * respaldo por `Origen del Pedido` existe porque en el Core hay detalles de Blend
 * que perdieron su link al pedido al editarlos; un pedido que ya tiene su línea de
 * biochar no es ese caso, y meterlo en Blend lo ofrecería para producir Blend.
 * Biochar: un pedido con línea 0015. Para el biochar las notas NO son respaldo de
 * kg: el formato `KG: …` de las notas es del Blend viejo, y un pedido de biochar sin
 * línea queda `sin-dato`, que la pantalla dice, en vez de inventar cuánto se pidió.
 * Un pedido mixto aparece en las dos, cada fila con SUS kg.
 *
 * ═══ LO DESPACHADO ═══════════════════════════════════════════════════════════
 * Blend: igual que siempre, las Salidas de Blend del libro mayor atribuidas a las
 * remisiones del pedido por `ubicacion_origen_id`.
 * Biochar: la suma de las marcas `[bache:…=kg]` de sus remisiones de biochar no
 * canceladas, Borrador incluido. El Borrador cuenta porque es un despacho en
 * curso: si no contara, la pantalla ofrecería despachar otra vez lo mismo. No se
 * leen las Salidas del biochar porque el despacho no activa la remisión sin
 * escribirlas: en una remisión activa, las marcas y el libro dicen lo mismo.
 *
 * @param salidasBlend las Salidas de Blend del libro mayor (registros por nombre).
 * @param remisiones TODAS las del Core, en el orden en que se leyeron: la lista de
 *   remisiones del Blend nombra cualquier remisión del pedido —también las del
 *   laboratorio—, como siempre lo hizo.
 */
export function clasificarPedidos(a: {
  pedidos: AirtableRecord[];
  detalles: AirtableRecord[];
  remisiones: RemisionCruda[];
  salidasBlend: AirtableRecord[];
  clientes: Record<string, string>;
  productos: { blend: string; biochar: string };
}): PedidosPirolisis {
  const { blend: idBlend, biochar: idBiochar } = a.productos;

  // 1. Lo solicitado por pedido y producto. Un pedido puede traer varias líneas
  //    del mismo producto: se suman. `undefined` = el pedido no tiene esa línea.
  const kgBlendPorPedido: Record<string, number> = {};
  const kgBiocharPorPedido: Record<string, number> = {};
  for (const d of a.detalles) {
    const producto = String(d.fields['ID Producto Core'] ?? '');
    const destino =
      idBlend && producto === idBlend
        ? kgBlendPorPedido
        : idBiochar && producto === idBiochar
          ? kgBiocharPorPedido
          : null;
    if (!destino) continue;
    const links = (d.fields['Pedido'] as string[] | undefined) ?? [];
    for (const recId of links) {
      destino[recId] = (destino[recId] ?? 0) + toNumber(d.fields['Cantidad Pedido']);
    }
  }

  // 2. Lo despachado de Blend: Salida → remisión → pedido.
  const pedidoDeRemision: Record<string, string> = {};
  const remisionesPorPedido: Record<string, string[]> = {};
  for (const r of a.remisiones) {
    if (!r.codigo || !r.idPedido) continue;
    pedidoDeRemision[r.codigo] = r.idPedido;
    (remisionesPorPedido[r.idPedido] ??= []).push(r.codigo);
  }
  const kgBlendDespachado: Record<string, number> = {};
  for (const m of a.salidasBlend) {
    // Quien llama ya filtra; esto solo evita que una Entrada o un movimiento de
    // otro producto se cuele si algún día se le pasa la tabla completa.
    const tipo = m.fields[MOVIMIENTO_PROD_FIELDS.tipoMovimiento];
    const producto = m.fields[MOVIMIENTO_PROD_FIELDS.productoId];
    if (tipo !== undefined && tipo !== 'Salida') continue;
    if (producto !== undefined && producto !== idBlend) continue;
    const pedido = pedidoDeRemision[String(m.fields[MOVIMIENTO_PROD_FIELDS.ubicacionOrigen] ?? '')];
    if (!pedido) continue;
    kgBlendDespachado[pedido] = r2(
      (kgBlendDespachado[pedido] ?? 0) + toNumber(m.fields[MOVIMIENTO_PROD_FIELDS.cantidad])
    );
  }

  // 3. Lo despachado de biochar: las marcas de sus remisiones, por numeración.
  const kgBiocharDespachado: Record<string, number> = {};
  const remisionesBiochar: Record<string, RemisionCruda[]> = {};
  for (const r of [...a.remisiones].sort((x, y) => x.numeracion - y.numeracion)) {
    if (!r.idPedido || tipoRemision(r) !== 'biochar') continue;
    (remisionesBiochar[r.idPedido] ??= []).push(r);
    if (r.estado === ESTADO_REMISION.cancelada) continue;
    const kr = kgRemitidoDeRemision(r);
    if (!kr) continue;
    kgBiocharDespachado[r.idPedido] = r2((kgBiocharDespachado[r.idPedido] ?? 0) + kr.kg);
  }

  const armar = (p: AirtableRecord, producto: ProductoPirolisis): PedidoPirolisis => {
    const codigo = String(p.fields['ID Pedido Core'] ?? '');
    const estado = String(p.fields['Estado'] ?? '');
    const idCliente = String(p.fields['ID Cliente Core'] ?? '');
    const notas = parseNotas(String(p.fields['Notas'] ?? ''));

    let kgSolicitados: number;
    let fuenteKg: PedidoBlend['fuenteKg'];
    let kgDespachados: number;
    let remisiones: string[];
    let despachoIncompleto: string | null = null;

    if (producto === 'blend') {
      const kgDetalle = kgBlendPorPedido[p.id] ?? 0;
      kgSolicitados = kgDetalle > 0 ? kgDetalle : notas.kg;
      fuenteKg = kgDetalle > 0 ? 'detalle' : notas.kg > 0 ? 'notas' : 'sin-dato';
      kgDespachados = kgBlendDespachado[codigo] ?? 0;
      remisiones = remisionesPorPedido[codigo] ?? [];
    } else {
      kgSolicitados = kgBiocharPorPedido[p.id] ?? 0;
      fuenteKg = kgSolicitados > 0 ? 'detalle' : 'sin-dato';
      kgDespachados = kgBiocharDespachado[codigo] ?? 0;
      const propias = remisionesBiochar[codigo] ?? [];
      remisiones = propias.map((r) => r.codigo);
      despachoIncompleto = propias.find((r) => r.estado === ESTADO_REMISION.borrador)?.codigo ?? null;
    }

    return {
      recordId: p.id,
      codigo,
      estado,
      pendiente: (ESTADOS_PEDIDO_PENDIENTE as readonly string[]).includes(estado),
      idCliente,
      clienteNombre: a.clientes[idCliente] || idCliente || '—',
      idAreaCliente: String(p.fields['ID Area Cliente'] ?? '').trim(),
      fecha: String(p.fields['Fecha de Pedido'] ?? '').slice(0, 10),
      kgSolicitados: r2(kgSolicitados),
      kgDespachados,
      kgPendientes: r2(Math.max(0, kgSolicitados - kgDespachados)),
      fuenteKg,
      empaque: notas.empaque,
      observaciones: notas.observaciones,
      remisiones,
      producto,
      despachoIncompleto,
    };
  };

  const blend: PedidoPirolisis[] = [];
  const biochar: PedidoPirolisis[] = [];
  for (const p of a.pedidos) {
    const tieneBlend = kgBlendPorPedido[p.id] !== undefined;
    const tieneBiochar = kgBiocharPorPedido[p.id] !== undefined;
    const nacioAqui = String(p.fields['Origen del Pedido'] ?? '') === ORIGEN_PIROLISIS;
    if (tieneBlend || (nacioAqui && !tieneBiochar)) blend.push(armar(p, 'blend'));
    if (tieneBiochar) biochar.push(armar(p, 'biochar'));
  }

  return { blend: ordenarPedidos(blend), biochar: ordenarPedidos(biochar) };
}

/**
 * Las remisiones del Core (todas, en el orden de lectura) y las Salidas de Blend.
 *
 * Best-effort y en bloque, como siempre fue lo despachado: si cualquiera de las
 * dos bases falla se devuelven las dos vacías y los pedidos salen con 0
 * despachado, que es preferible a esconderlos. Se leen las tablas completas y se
 * cruza en JS: dos requests contra dos bases, no 2×N contra el rate limit.
 */
async function leerDespachado(): Promise<{ remisiones: RemisionCruda[]; salidasBlend: AirtableRecord[] }> {
  const vacio = { remisiones: [] as RemisionCruda[], salidasBlend: [] as AirtableRecord[] };

  const baseRem = config.airtable.remisionesCoreBaseId;
  const tokenRem = config.airtable.remisionesCoreToken;
  const tablaRem = config.airtable.remisionesCoreRemisionesTable;
  const cred = credencialesBlend();
  if (!baseRem || !tokenRem || !tablaRem || !cred) return vacio;

  try {
    // Sin ordenar por `numeracion` (que es lo que hace `listarRemisionesCrudas`):
    // la lista de remisiones del Blend siempre salió en el orden de lectura.
    const [remisiones, salidasBlend] = await Promise.all([
      fetchAll(baseRem, tablaRem, tokenRem),
      fetchAll(cred.base, cred.movimientos, cred.token, {
        filterByFormula: `AND({${MOVIMIENTO_PROD_FIELDS.tipoMovimiento}} = 'Salida', {${
          MOVIMIENTO_PROD_FIELDS.productoId
        }} = '${escapeAirtableValue(cred.producto)}')`,
      }),
    ]);
    return { remisiones: remisiones.map(remisionCrudaDeRegistro), salidasBlend };
  } catch (err) {
    console.warn('⚠️ No se pudo derivar lo despachado por pedido:', err);
    return vacio;
  }
}

async function leerPedidosPirolisis(
  cfg: PedidosCoreConfig,
  productos: { blend: string; biochar: string }
): Promise<PedidosPirolisis> {
  // Los detalles de los dos productos en UNA lectura: el pedido mixto necesita las
  // dos líneas, y leer por producto duplicaría las requests contra la misma base.
  const condiciones = [productos.blend, productos.biochar]
    .filter(Boolean)
    .map((id) => `{ID Producto Core} = '${escapeAirtableValue(id)}'`);
  const [detalles, pedidos] = await Promise.all([
    fetchAll(cfg.base, cfg.detalles, cfg.token, {
      filterByFormula: condiciones.length === 1 ? condiciones[0] : `OR(${condiciones.join(', ')})`,
    }),
    fetchAll(cfg.base, cfg.pedidos, cfg.token),
  ]);

  // Sin pedidos de pirólisis no se leen ni los clientes ni lo despachado.
  const previa = clasificarPedidos({ pedidos, detalles, remisiones: [], salidasBlend: [], clientes: {}, productos });
  if (!previa.blend.length && !previa.biochar.length) return previa;

  const [clientes, despachado] = await Promise.all([mapaClientes(), leerDespachado()]);
  return clasificarPedidos({ pedidos, detalles, ...despachado, clientes, productos });
}

/**
 * TODOS los pedidos de pirólisis, separados en Blend y biochar puro, cada uno
 * marcado como pendiente o no (ver `clasificarPedidos`).
 *
 * Devuelve `null` si Pedidos Core o alguno de los dos productos no está
 * configurado: `null` es "no se sabe" y la pantalla lo dice, mientras que listas
 * vacías afirmarían que no hay pedidos. LANZA si Pedidos Core no responde.
 */
export async function listarPedidosPirolisis(): Promise<PedidosPirolisis | null> {
  const cfg = pedidosCoreConfig();
  const blend = config.airtable.inventarioProdCoreBiocharBlendProductId;
  const biochar = config.airtable.inventarioProdCoreBiocharPuroProductId;
  if (!cfg || !blend || !biochar) return null;
  return leerPedidosPirolisis(cfg, { blend, biochar });
}

/**
 * TODOS los pedidos de Biochar Blend, del más antiguo al más reciente (lo que
 * lleva más tiempo esperando va primero), cada uno marcado como pendiente o no.
 *
 * Es la lista `blend` de `listarPedidosPirolisis()` con la forma de siempre: sin
 * `producto` ni `despachoIncompleto`, que sus consumidores no esperan. Solo exige
 * el Blend configurado: sin el id del biochar sigue funcionando como antes.
 *
 * Devuelve `null` si Pedidos Core no está configurado: `null` es "no se sabe" y la
 * pantalla lo dice, mientras que `[]` afirmaría que no hay pedidos.
 */
export async function listarPedidosBlend(): Promise<PedidoBlend[] | null> {
  const cfg = pedidosCoreConfig();
  const blend = config.airtable.inventarioProdCoreBiocharBlendProductId;
  if (!cfg || !blend) return null;

  const biochar = config.airtable.inventarioProdCoreBiocharPuroProductId ?? '';
  const { blend: lista } = await leerPedidosPirolisis(cfg, { blend, biochar });
  return lista.map(({ producto: _producto, despachoIncompleto: _incompleto, ...pedido }) => pedido);
}

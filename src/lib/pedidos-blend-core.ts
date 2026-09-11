// src/lib/pedidos-blend-core.ts
//
// Los pedidos de Biochar Blend que TODAVÍA DEBEN ALGO, leídos de Sirius Pedidos
// Core. Es solo lectura: PiroliApp no es el dueño del pedido —lo crea el CRM— y
// aquí no hay UI para agendarlo ni para remisionarlo (§8 de CLAUDE.md).
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
  producto: string;
}

function pedidosCoreConfig(): PedidosCoreConfig | null {
  const base = config.airtable.pedidosCoreBaseId;
  const token = config.airtable.pedidosCoreToken;
  const pedidos = config.airtable.pedidosCorePedidosTable;
  const detalles = config.airtable.pedidosCoreDetallesTable;
  const producto = config.airtable.inventarioProdCoreBiocharBlendProductId;
  if (!base || !token || !pedidos || !detalles || !producto) return null;
  return { base, token, pedidos, detalles, producto };
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
async function mapaClientes(): Promise<Record<string, string>> {
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

/**
 * KG de Blend ya despachados por pedido, y las remisiones que los despacharon.
 *
 * La junta es el código de la remisión: el Core la guarda con su `ID Pedido`, y la
 * Salida de Blend lo lleva en `ubicacion_origen_id`. Best-effort: si alguna de las
 * dos bases falla se devuelve vacío y el pedido se muestra con 0 despachado, que
 * es preferible a esconder el pedido entero.
 */
async function despachadoPorPedido(): Promise<{
  kg: Record<string, number>;
  remisiones: Record<string, string[]>;
}> {
  const vacio = { kg: {} as Record<string, number>, remisiones: {} as Record<string, string[]> };

  const baseRem = config.airtable.remisionesCoreBaseId;
  const tokenRem = config.airtable.remisionesCoreToken;
  const tablaRem = config.airtable.remisionesCoreRemisionesTable;
  const cred = credencialesBlend();
  if (!baseRem || !tokenRem || !tablaRem || !cred) return vacio;

  try {
    // Se lee la tabla completa y se cruza en JS en vez de una consulta por pedido:
    // son dos requests contra dos bases, no 2×N contra el rate limit.
    const [remisiones, movimientos] = await Promise.all([
      fetchAll(baseRem, tablaRem, tokenRem),
      fetchAll(cred.base, cred.movimientos, cred.token, {
        filterByFormula: `AND({${MOVIMIENTO_PROD_FIELDS.tipoMovimiento}} = 'Salida', {${
          MOVIMIENTO_PROD_FIELDS.productoId
        }} = '${escapeAirtableValue(cred.producto)}')`,
      }),
    ]);

    const pedidoDeRemision: Record<string, string> = {};
    const porPedido: Record<string, string[]> = {};
    for (const r of remisiones) {
      const codigo = String(r.fields['ID'] ?? '');
      const pedido = String(r.fields['ID Pedido'] ?? '');
      if (!codigo || !pedido) continue;
      pedidoDeRemision[codigo] = pedido;
      (porPedido[pedido] ??= []).push(codigo);
    }

    const kg: Record<string, number> = {};
    for (const m of movimientos) {
      const origen = String(m.fields[MOVIMIENTO_PROD_FIELDS.ubicacionOrigen] ?? '');
      const pedido = pedidoDeRemision[origen];
      if (!pedido) continue;
      kg[pedido] = r2((kg[pedido] ?? 0) + toNumber(m.fields[MOVIMIENTO_PROD_FIELDS.cantidad]));
    }

    return { kg, remisiones: porPedido };
  } catch (err) {
    console.warn('⚠️ No se pudo derivar lo despachado por pedido:', err);
    return vacio;
  }
}

/**
 * TODOS los pedidos de Biochar Blend, del más antiguo al más reciente (lo que
 * lleva más tiempo esperando va primero), cada uno marcado como pendiente o no.
 *
 * Devuelve `null` si Pedidos Core no está configurado: `null` es "no se sabe" y la
 * pantalla lo dice, mientras que `[]` afirmaría que no hay pedidos.
 */
export async function listarPedidosBlend(): Promise<PedidoBlend[] | null> {
  const cfg = pedidosCoreConfig();
  if (!cfg) return null;

  // 1. Los detalles del producto Blend, indexados por el pedido al que apuntan.
  //    Un pedido puede traer varias líneas del mismo producto: se suman.
  const detalles = await fetchAll(cfg.base, cfg.detalles, cfg.token, {
    filterByFormula: `{ID Producto Core} = '${escapeAirtableValue(cfg.producto)}'`,
  });
  const kgDetallePorPedido: Record<string, number> = {};
  for (const d of detalles) {
    const links = (d.fields['Pedido'] as string[] | undefined) ?? [];
    for (const recId of links) {
      kgDetallePorPedido[recId] = (kgDetallePorPedido[recId] ?? 0) + toNumber(d.fields['Cantidad Pedido']);
    }
  }

  // 2. Un pedido es de pirólisis si tiene un detalle de Blend O si nació aquí.
  //    ⚠️ No basta con seguir el link del detalle: en el Core hay detalles de Blend
  //    SIN link al pedido (se perdió al editarlos), y filtrar solo por él dejaba la
  //    lista vacía.
  const pedidos = await fetchAll(cfg.base, cfg.pedidos, cfg.token);
  const deBlend = pedidos.filter(
    (p) =>
      kgDetallePorPedido[p.id] !== undefined ||
      String(p.fields['Origen del Pedido'] ?? '') === ORIGEN_PIROLISIS
  );

  if (!deBlend.length) return [];

  const [clientes, despachado] = await Promise.all([mapaClientes(), despachadoPorPedido()]);

  const lista = deBlend.map((p: AirtableRecord) => {
    const codigo = String(p.fields['ID Pedido Core'] ?? '');
    const estado = String(p.fields['Estado'] ?? '');
    const idCliente = String(p.fields['ID Cliente Core'] ?? '');
    const notas = parseNotas(String(p.fields['Notas'] ?? ''));

    const kgDetalle = kgDetallePorPedido[p.id] ?? 0;
    const kgSolicitados = kgDetalle > 0 ? kgDetalle : notas.kg;
    const fuenteKg: PedidoBlend['fuenteKg'] =
      kgDetalle > 0 ? 'detalle' : notas.kg > 0 ? 'notas' : 'sin-dato';

    const kgDespachados = despachado.kg[codigo] ?? 0;

    return {
      recordId: p.id,
      codigo,
      estado,
      pendiente: (ESTADOS_PEDIDO_PENDIENTE as readonly string[]).includes(estado),
      idCliente,
      clienteNombre: clientes[idCliente] || idCliente || '—',
      fecha: String(p.fields['Fecha de Pedido'] ?? '').slice(0, 10),
      kgSolicitados: r2(kgSolicitados),
      kgDespachados,
      kgPendientes: r2(Math.max(0, kgSolicitados - kgDespachados)),
      fuenteKg,
      empaque: notas.empaque,
      observaciones: notas.observaciones,
      remisiones: despachado.remisiones[codigo] ?? [],
    };
  });

  // Primero lo que todavía se debe, y dentro de eso lo más viejo —que es lo que
  // lleva más tiempo esperando producción—. Los cerrados van después y al revés:
  // como historial, lo último que pasó es lo que se busca.
  return lista.sort((a, b) => {
    if (a.pendiente !== b.pendiente) return a.pendiente ? -1 : 1;
    const fa = a.fecha || '9999';
    const fb = b.fecha || '9999';
    return a.pendiente ? fa.localeCompare(fb) : fb.localeCompare(fa);
  });
}

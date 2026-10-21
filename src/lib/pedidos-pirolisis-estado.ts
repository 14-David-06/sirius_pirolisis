// src/lib/pedidos-pirolisis-estado.ts
//
// El pedido de Sirius Pedidos Core visto desde pirólisis: sus líneas y el estado
// que le corresponde según lo que ya se le remitió.
//
// ═══ POR QUÉ POR LO REMITIDO Y POR PRODUCTO ═══════════════════════════════════
// Antes `crearRemision()` decidía `Enviado`/`Enviado Parcial` con los kg de UNA
// línea de Blend contra las Salidas del libro mayor más "lo de ahora" (una
// heurística que sumaba o no según cuál fuera mayor). Con el biochar puro en el
// mismo pedido eso ya no sirve: un pedido de 200 kg de Blend y 300 de biochar no
// está enviado porque salieron 500 kg de Blend. Ahora el estado sale de las
// REMISIONES no canceladas del pedido, sumadas por producto
// (`estadoPedidoTrasRemitir()`): la remisión es lo que se le comprometió al
// cliente, y las de biochar ni siquiera se activan sin su inventario escrito.
//
// PiroliApp NO es dueño del pedido: solo lo mueve entre `Enviado` y `Enviado
// Parcial`. `Completado` y `Cancelado` los decide el CRM y nunca se pisan.

import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import { fechaBogota } from './fecha-bogota';
import { estadoPedidoTrasRemitir, kgRemitidoDeRemision } from './remision-pirolisis.constants';
import { AT, ESTADO_REMISION, atAllRemisiones, atRemisiones, listarRemisionesCrudas } from './remisiones-core';
import type { StepResult } from '@/types/step-result';

/** Estados que pone el CRM y que PiroliApp no debe cambiar. */
const ESTADOS_CERRADOS = ['Completado', 'Cancelado'];

export interface LineaPedido {
  /** `SIRIUS-PRODUCT-XXXX`. */
  productoId: string;
  kg: number;
}

export interface PedidoConLineas {
  recordId: string;
  /** `SIRIUS-PED-XXXX`. */
  codigo: string;
  estado: string;
  /** `CL-XXXX`. */
  idCliente: string;
  /** `AC-XXXX` que propone el pedido, o vacío. */
  idAreaCliente: string;
  /** `YYYY-MM-DD` en Bogotá. */
  fecha: string;
  notas: string;
  /** TODAS las líneas, también las de productos que no son de pirólisis. */
  lineas: LineaPedido[];
}

function credenciales() {
  const base = config.airtable.pedidosCoreBaseId;
  const token = config.airtable.pedidosCoreToken;
  const pedidos = config.airtable.pedidosCorePedidosTable;
  const detalles = config.airtable.pedidosCoreDetallesTable;
  if (!base || !token || !pedidos || !detalles) return null;
  return { base, token, pedidos, detalles };
}

function toNumber(v: unknown): number {
  const n = typeof v === 'object' && v !== null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/** `Fecha de Pedido` es dateTime en UTC: leída como texto, de noche ya sería mañana. */
function fechaDePedido(v: unknown): string {
  const s = texto(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : fechaBogota(d);
}

/**
 * El pedido con TODAS sus líneas, o null si no existe. LANZA si Pedidos Core no
 * está configurado o la lectura falla: para despachar, "no pude leer" no es "no
 * hay pedido".
 *
 * Las líneas se leen por los record IDs del link `Detalles del Pedido` (una
 * lectura por cada 50) y no buscando por producto: un pedido mixto tiene líneas
 * de otros productos, y el estado necesita verlas para no declararlo enviado.
 */
export async function leerPedidoConLineas(codigo: string): Promise<PedidoConLineas | null> {
  const cred = credenciales();
  if (!cred) throw new Error('Sirius Pedidos Core no configurado');
  if (!codigo) return null;

  const params = new URLSearchParams({
    filterByFormula: `{ID Pedido Core} = '${escapeAirtableValue(codigo)}'`,
    maxRecords: '1',
  });
  const data = await atRemisiones(`${AT}/${cred.base}/${cred.pedidos}?${params.toString()}`, cred.token);
  const rec = data.records?.[0] as { id: string; fields: Record<string, unknown> } | undefined;
  if (!rec) return null;
  const f = rec.fields ?? {};

  const ids = (Array.isArray(f['Detalles del Pedido']) ? (f['Detalles del Pedido'] as unknown[]) : [])
    .filter((x): x is string => typeof x === 'string' && esRecordId(x));
  const lineas: LineaPedido[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const detalles = await atAllRemisiones(cred.base, cred.detalles, cred.token, {
      filterByFormula: `OR(${lote.map((id) => `RECORD_ID() = '${escapeAirtableValue(id)}'`).join(', ')})`,
    });
    for (const d of detalles) {
      lineas.push({
        productoId: texto(d.fields['ID Producto Core']).trim(),
        kg: toNumber(d.fields['Cantidad Pedido']),
      });
    }
  }

  return {
    recordId: rec.id,
    codigo: texto(f['ID Pedido Core']).trim() || codigo,
    estado: texto(f['Estado']),
    idCliente: texto(f['ID Cliente Core']).trim(),
    idAreaCliente: texto(f['ID Area Cliente']).trim(),
    fecha: fechaDePedido(f['Fecha de Pedido']),
    notas: texto(f['Notas']),
    lineas,
  };
}

/**
 * Pasa el pedido a `Enviado` o `Enviado Parcial` según lo remitido. Paso
 * `estado_pedido`, best-effort.
 *
 * Idempotente: se recalcula desde las remisiones cada vez, y si el estado ya es
 * el que corresponde no escribe. Nunca toca un pedido `Completado` o `Cancelado`.
 *
 * @param o.kgSolicitadosBlendRespaldo kg de Blend a usar como línea cuando el
 *   pedido no tiene NINGUNA línea en Pedidos Core: pedidos viejos de PiroliApp
 *   que guardaban la cantidad fuera del detalle (`pedidos-blend-core.ts`). Sin
 *   líneas y sin respaldo no se afirma que esté completo.
 */
export async function actualizarEstadoPedidoPirolisis(
  idPedido: string,
  o: { kgSolicitadosBlendRespaldo?: number } = {}
): Promise<StepResult> {
  const step = 'estado_pedido';
  const cred = credenciales();
  if (!cred) return { step, ok: false, skipped: true, error: 'Pedidos Core no configurado' };

  const ids = {
    blend: config.airtable.inventarioProdCoreBiocharBlendProductId ?? '',
    biochar: config.airtable.inventarioProdCoreBiocharPuroProductId ?? '',
  };

  try {
    const pedido = await leerPedidoConLineas(idPedido);
    if (!pedido) return { step, ok: false, error: `Pedido ${idPedido} no encontrado en Pedidos Core` };
    if (ESTADOS_CERRADOS.includes(pedido.estado)) {
      return { step, ok: true, skipped: true, detail: { estado: pedido.estado, motivo: 'cerrado por el CRM' } };
    }

    let lineas = pedido.lineas;
    const respaldo = o.kgSolicitadosBlendRespaldo ?? 0;
    if (!lineas.length && respaldo > 0 && ids.blend) lineas = [{ productoId: ids.blend, kg: respaldo }];

    const remisiones = await listarRemisionesCrudas({ pedido: pedido.codigo, soloPirolisis: true });
    const remitido = new Map<string, number>();
    for (const r of remisiones) {
      if (r.estado === ESTADO_REMISION.cancelada) continue;
      const kr = kgRemitidoDeRemision(r);
      if (!kr) continue;
      const producto = kr.tipo === 'blend' ? ids.blend : ids.biochar;
      if (!producto) continue;
      remitido.set(producto, Math.round(((remitido.get(producto) ?? 0) + kr.kg) * 100) / 100);
    }

    // Sin nada remitido no hay estado que decidir. Pasa al anular el único
    // despacho de un pedido: `estadoPedidoTrasRemitir` diría `Enviado Parcial`
    // de un pedido al que no le salió un kg. PiroliApp solo mueve el pedido
    // entre Enviado y Enviado Parcial; devolverlo a pendiente no le toca (el
    // estado previo no se conoce), así que no escribe.
    const totalRemitido = [...remitido.values()].reduce((t, kg) => t + kg, 0);
    if (!(totalRemitido > 0.01)) {
      return {
        step,
        ok: true,
        skipped: true,
        detail: { estado: pedido.estado, motivo: 'sin kg remitidos en remisiones no canceladas' },
      };
    }

    const estado = estadoPedidoTrasRemitir(lineas, remitido, ids);
    const detail = {
      estado,
      anterior: pedido.estado,
      solicitado: lineas,
      remitido: Object.fromEntries(remitido),
    };
    if (estado === pedido.estado) return { step, ok: true, skipped: true, detail };

    await atRemisiones(`${AT}/${cred.base}/${cred.pedidos}/${pedido.recordId}`, cred.token, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Estado: estado } }),
    });
    return { step, ok: true, detail };
  } catch (err) {
    return { step, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

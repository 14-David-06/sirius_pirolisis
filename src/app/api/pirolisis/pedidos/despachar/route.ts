import { NextResponse } from 'next/server';
import {
  despacharPedidoBlend,
  DespachoInvalido,
  type DespachoBlendInput,
} from '@/lib/despacho-blend';

/**
 * POST /api/pirolisis/pedidos/despachar
 *
 * Despacha un pedido de Biochar Blend: produce el Blend que falte con el biochar
 * y el abono de bodega, emite la remisión en Sirius Remisiones Core y descuenta el
 * producto del libro mayor (ver `despacharPedidoBlend()`).
 *
 * `lote` es opcional: sin él, el despacho usa el producto que ya exista y produce
 * lo que falte. Con él, sale de ese lote o no sale — elegirlo a mano es decir de
 * dónde tiene que salir.
 *
 * `baches` ([{ codigo, kg }]) es REQUERIDO cuando hay que producir: de qué bache
 * salió cada kg es la trazabilidad que sostiene la contabilidad de carbono, y la
 * app no puede inventarla. Se ignora si el despacho sale de un lote existente.
 *
 * `dryRun: true` devuelve el plan sin escribir nada. La pantalla lo pide primero
 * y muestra qué va a pasar —cuánto sale, de qué lote, con cuánto queda el lote y
 * la bodega, y en qué estado queda el pedido—: una remisión no se puede deshacer,
 * porque es un documento que el cliente puede firmar desde el celular apenas se
 * emite. Ensayar antes es la única forma de "cancelar" que existe.
 *
 * Códigos:
 *   200 — despachado (o plan, si fue ensayo)
 *   207 — la remisión se emitió pero un paso best-effort falló (el descuento del
 *         inventario o el estado del pedido). Se responde con los `steps` para que
 *         el operador vea exactamente qué quedó a medias.
 *   409 — no se despachó nada: el pedido está cerrado, se pide más de lo que debe,
 *         o no hay ni Blend ni con qué producirlo.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DespachoBlendInput> & { dryRun?: boolean };

    if (!body?.idPedido) {
      return NextResponse.json(
        { error: 'Faltan datos', details: 'Se requiere idPedido' },
        { status: 400 }
      );
    }

    const resultado = await despacharPedidoBlend(
      {
        idPedido: String(body.idPedido),
        lote: body.lote ? String(body.lote) : undefined,
        kg: body.kg === undefined ? undefined : Number(body.kg),
        baches: Array.isArray(body.baches)
          ? body.baches.map((b) => ({ codigo: String(b?.codigo ?? ''), kg: Number(b?.kg) }))
          : undefined,
        responsableEntrega: String(body.responsableEntrega ?? ''),
        transportista: body.transportista,
        observaciones: body.observaciones,
        fechaDespacho: body.fechaDespacho,
      },
      { dryRun: Boolean(body.dryRun) }
    );

    if (body.dryRun) {
      return NextResponse.json({ success: true, dryRun: true, ...resultado }, { status: 200 });
    }

    const fallidos = (resultado.steps ?? []).filter((s) => !s.ok && !s.skipped);
    const codigo = resultado.remision?.codigo ?? '';

    return NextResponse.json(
      {
        success: resultado.ok,
        message: resultado.ok
          ? `Remisión ${codigo} emitida por ${resultado.plan.kg} kg del lote ${resultado.plan.lote}` +
            `${resultado.plan.origen === 'produccion' ? ' (producido en este despacho)' : ''}.`
          : 'El despacho no se pudo completar.',
        ...resultado,
      },
      // Crítico fallido → 500; best-effort fallido con remisión emitida → 207.
      { status: resultado.ok ? (fallidos.length ? 207 : 200) : 500 }
    );
  } catch (err: unknown) {
    if (err instanceof DespachoInvalido) {
      // 409 y no 400: los datos venían bien formados; lo que no cuadra es el
      // estado del inventario o del pedido, y eso el operador lo puede resolver.
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST pirolisis/pedidos/despachar:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

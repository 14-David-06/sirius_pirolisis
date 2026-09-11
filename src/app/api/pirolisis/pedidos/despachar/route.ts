import { NextResponse } from 'next/server';
import {
  despacharPedidoBlend,
  DespachoInvalido,
  type DespachoBlendInput,
} from '@/lib/despacho-blend';

/**
 * POST /api/pirolisis/pedidos/despachar
 *
 * Despacha un pedido de Biochar Blend: emite la remisión en Sirius Remisiones
 * Core y descuenta el producto del libro mayor, SIEMPRE que el inventario y el
 * pedido lo permitan (ver `despacharPedidoBlend()`).
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
 *   409 — no se despachó nada: el pedido está cerrado, no hay tanto Blend en el
 *         lote, o se está despachando más de lo que se debe.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DespachoBlendInput> & { dryRun?: boolean };

    if (!body?.idPedido || !body?.lote) {
      return NextResponse.json(
        { error: 'Faltan datos', details: 'Se requieren idPedido y lote' },
        { status: 400 }
      );
    }

    const resultado = await despacharPedidoBlend(
      {
        idPedido: String(body.idPedido),
        lote: String(body.lote),
        kg: Number(body.kg),
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
          ? `Remisión ${codigo} emitida por ${resultado.plan.kg} kg del lote ${resultado.plan.lote}.`
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

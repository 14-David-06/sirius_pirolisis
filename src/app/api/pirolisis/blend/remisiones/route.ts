import { NextRequest, NextResponse } from 'next/server';
import {
  crearRemision,
  listarRemisiones,
  kgDespachadosDePedido,
  serializarRemision,
} from '../../../../../lib/blend-remisiones-core';

// Remisiones de despacho de Biochar Blend.
//
// ⚠️ MIGRACIÓN 2026-07-30: la remisión ya NO vive en la tabla local
// `blend_remisiones` (borrada). El registro es Sirius Remisiones Core y este
// endpoint es una fachada sobre `src/lib/blend-remisiones-core.ts`. La composición
// del Blend, el CO₂ y los baches no se guardan: se derivan del código de lote.

/**
 * GET /api/pirolisis/blend/remisiones
 * Query: ?estado=…&pedido=SIRIUS-PED-XXXX&cliente=CL-XXXX
 *
 * Con `?pedido=` agrega `kg_despachados`, derivado del libro mayor de inventario:
 * es lo que permite despachos parciales sucesivos sin un contador que se descuadre.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado') ?? undefined;
    const pedido = searchParams.get('pedido') ?? undefined;
    const cliente = searchParams.get('cliente') ?? undefined;

    const remisiones = await listarRemisiones({ estado, pedido, cliente });

    const payload: Record<string, unknown> = {
      records: remisiones.map(serializarRemision),
      total: remisiones.length,
    };
    if (pedido) payload.kg_despachados = await kgDespachadosDePedido(pedido);

    console.log(`📋 Remisiones Blend: ${remisiones.length} registros`);
    return NextResponse.json(payload, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/remisiones:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/pirolisis/blend/remisiones
 *
 * Body:
 *   id_pedido            SIRIUS-PED-XXXX  (requerido)
 *   id_cliente           CL-XXXX          (requerido)
 *   lote                 BLEND-…          (requerido)
 *   kg                   number           (requerido, KG de Blend a despachar)
 *   responsable_entrega  string           (requerido)
 *   transportista        { nombre, cedula, telefono?, email? }
 *   observaciones        string
 *   fecha_despacho       ISO date
 *
 * Responde 207 si la remisión se creó pero algún paso best-effort falló (el
 * movimiento de inventario o el estado del pedido). No hay transacciones entre
 * bases de Airtable: lo único honesto es reportar qué quedó a medias, en vez de
 * fallar en silencio como el flujo del laboratorio.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      id_pedido,
      id_cliente,
      lote,
      kg,
      responsable_entrega,
      transportista,
      observaciones,
      fecha_despacho,
    } = body as Record<string, unknown>;

    const faltantes = Object.entries({ id_pedido, id_cliente, lote, responsable_entrega })
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (faltantes.length) {
      return NextResponse.json(
        { error: 'Campos requeridos faltantes', details: faltantes },
        { status: 400 }
      );
    }
    if (typeof kg !== 'number' || !(kg > 0)) {
      return NextResponse.json({ error: 'kg debe ser un número mayor que 0' }, { status: 400 });
    }

    const t = transportista as Record<string, unknown> | undefined;
    const resultado = await crearRemision({
      idPedido: String(id_pedido),
      idCliente: String(id_cliente),
      lote: String(lote),
      kg,
      responsableEntrega: String(responsable_entrega),
      transportista:
        t?.cedula && t?.nombre
          ? {
              nombre: String(t.nombre),
              cedula: String(t.cedula),
              telefono: t.telefono ? String(t.telefono) : undefined,
              email: t.email ? String(t.email) : undefined,
            }
          : undefined,
      observaciones: observaciones ? String(observaciones) : undefined,
      fechaDespacho: fecha_despacho ? String(fecha_despacho) : undefined,
    });

    if (!resultado.ok) {
      const critico = resultado.steps.find((s) => !s.ok);
      return NextResponse.json(
        { error: critico?.error ?? 'No se pudo crear la remisión', steps: resultado.steps },
        { status: 502 }
      );
    }

    const fallidos = resultado.steps.filter((s) => !s.ok && !s.skipped);
    console.log(
      `✅ Remisión Blend ${resultado.remision?.codigo} — ${kg} kg del lote ${lote}` +
        (fallidos.length ? ` (${fallidos.length} paso(s) con error)` : '')
    );

    return NextResponse.json(
      {
        success: true,
        record: resultado.remision ? serializarRemision(resultado.remision) : null,
        steps: resultado.steps,
        aviso: fallidos.length
          ? 'La remisión se creó, pero algún paso de inventario o de estado del pedido falló. Revisa steps.'
          : undefined,
      },
      { status: fallidos.length ? 207 : 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/remisiones:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

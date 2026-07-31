import { NextResponse } from 'next/server';
import {
  ESTADO_REMISION,
  cambiarEstado,
  resolverRemision,
  serializarRemision,
} from '../../../../../../../lib/blend-remisiones-core';

// PATCH /api/pirolisis/blend/remisiones/[id]/estado
// Body: { estado: string }
//
// ⚠️ MIGRACIÓN 2026-07-30: los estados son los de Sirius Remisiones Core
// (Borrador / Pendiente / En Tránsito / Entregada / Cancelada), no los de la
// difunta `blend_remisiones` ("Pendiente Firma", "Despachado"…).
//
// La transición a `Entregada` NO se hace por aquí: pasa por
// `POST /api/pirolisis/blend/firmar/[remisionId]`, que además registra al receptor
// y regenera el PDF. Permitir el atajo dejaría remisiones entregadas sin firmante.

/** Transiciones permitidas. Fuera de esto es un cambio inválido, no un typo. */
const TRANSICIONES: Record<string, string[]> = {
  [ESTADO_REMISION.borrador]: [ESTADO_REMISION.pendiente, ESTADO_REMISION.cancelada],
  [ESTADO_REMISION.pendiente]: [ESTADO_REMISION.enTransito, ESTADO_REMISION.cancelada],
  [ESTADO_REMISION.enTransito]: [ESTADO_REMISION.cancelada],
  [ESTADO_REMISION.entregada]: [],
  [ESTADO_REMISION.cancelada]: [],
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const estadoNuevo = String((body as Record<string, unknown>).estado ?? '');

    if (!estadoNuevo) {
      return NextResponse.json({ error: 'Campo requerido faltante: estado' }, { status: 400 });
    }

    const remision = await resolverRemision(id);
    if (!remision) {
      return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
    }

    if (estadoNuevo === ESTADO_REMISION.entregada) {
      return NextResponse.json(
        {
          error: 'Para marcar la remisión como Entregada usa el flujo de firma',
          details: `POST /api/pirolisis/blend/firmar/${remision.recordId}`,
        },
        { status: 400 }
      );
    }

    const permitidas = TRANSICIONES[remision.estado] ?? [];
    if (!permitidas.includes(estadoNuevo)) {
      return NextResponse.json(
        {
          error: 'Transición de estado no permitida',
          de: remision.estado,
          a: estadoNuevo,
          permitidas,
        },
        { status: 400 }
      );
    }

    await cambiarEstado(remision.recordId, estadoNuevo);
    const actualizada = await resolverRemision(remision.recordId);

    console.log(`🔄 Remisión ${remision.codigo}: ${remision.estado} → ${estadoNuevo}`);
    return NextResponse.json(
      {
        success: true,
        estado_anterior: remision.estado,
        estado_actual: estadoNuevo,
        record: actualizada ? serializarRemision(actualizada) : null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en PATCH blend/remisiones/[id]/estado:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import {
  completarDespachoBiochar,
  DespachoBiocharInvalido,
  LecturaCoreFallida,
  RemisionBiocharNoEncontrada,
} from '@/lib/despacho-biochar';
import { serializarRemision } from '@/lib/blend-remisiones-core';
import { CandadoOcupado } from '@/lib/candado';
import { qrDataUrl } from '@/lib/recepcion/qr';
import { sanearError } from '@/lib/log-seguro';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CODIGO_REMISION = /^SIRIUS-REM-\d{4,}$/;

/**
 * POST /api/pirolisis/pedidos/despachar-biochar/completar
 *
 *   { remision: 'SIRIUS-REM-XXXX', accion?: 'completar' | 'anular' }
 *     → { success, yaCompleto, remision, recepcion, steps, error? }
 *
 * Un despacho de biochar que quedó en Borrador bloquea su pedido hasta que se
 * termine o se anule. `completar` escribe solo lo que falte y es seguro de
 * repetir. `anular` solo procede si todavía no se escribió inventario en ninguna
 * de las dos vistas: con inventario, la remisión ya existe para el libro mayor.
 *
 * Códigos: 200 · 207 (un paso best-effort falló) · 400 · 401 · 404 (no existe o
 * no es un despacho de biochar de PiroliApp) · 409 (anulada, saldo insuficiente,
 * anular no permitido) · 503 (lectura caída u otro despacho en curso) · 500.
 */
export async function POST(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Sesión vencida: inicie sesión de nuevo.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'El cuerpo no es JSON válido.' }, { status: 400 });
  }
  const codigo = String(body?.remision ?? '').trim();
  if (!CODIGO_REMISION.test(codigo)) {
    return NextResponse.json({ success: false, error: 'remision debe ser un código SIRIUS-REM-XXXX.' }, { status: 400 });
  }
  const accion = body?.accion === undefined ? 'completar' : body.accion;
  if (accion !== 'completar' && accion !== 'anular') {
    return NextResponse.json({ success: false, error: 'accion debe ser "completar" o "anular".' }, { status: 400 });
  }
  const realizaRegistro = `${session.user.Nombre ?? ''} ${session.user.Apellido ?? ''}`.trim() || 'Sistema';

  try {
    const r = await completarDespachoBiochar(codigo, { realizaRegistro, accion });
    const fallidos = r.steps.filter((s) => !s.ok && !s.skipped);
    const recepcion = r.enlace
      ? { url: r.enlace.url, venceEl: r.enlace.venceEl, qrDataUrl: await qrDataUrl(r.enlace.url).catch(() => null) }
      : null;
    return NextResponse.json(
      {
        success: r.ok,
        yaCompleto: r.yaCompleto,
        remision: r.remision ? serializarRemision(r.remision) : null,
        recepcion,
        steps: r.steps,
        ...(r.ok ? {} : { error: fallidos[0]?.error ?? 'No se pudo completar el despacho.' }),
      },
      { status: r.ok ? (fallidos.length ? 207 : 200) : 500 }
    );
  } catch (err) {
    if (err instanceof RemisionBiocharNoEncontrada) {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err instanceof DespachoBiocharInvalido) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    if (err instanceof LecturaCoreFallida || err instanceof CandadoOcupado) {
      return NextResponse.json({ success: false, error: err.message }, { status: 503 });
    }
    const message = sanearError(err);
    console.error('❌ Error en POST despachar-biochar/completar:', message);
    return NextResponse.json({ success: false, error: `No se pudo completar: ${message}` }, { status: 500 });
  }
}

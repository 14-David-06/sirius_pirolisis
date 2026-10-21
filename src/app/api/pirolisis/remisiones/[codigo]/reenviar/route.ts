import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { assertCodigoSimbolico } from '@/lib/airtable-escape';
import { correoConfigurado } from '@/lib/correo/graph.server';
import { sanearError } from '@/lib/log-seguro';
import { checkRateLimit } from '@/middleware/rate-limit';
import { reenviarComprobante } from '@/lib/recepcion/recepcion';

// Reenvía el comprobante de una remisión recibida por enlace (cuando Graph falló
// o el correo se simuló). Los destinatarios son SIEMPRE el Receptor vinculado y
// la copia fija: el cuerpo de la petición no puede nombrar a nadie, o la bodega
// sería un relé de correos con la marca de Sirius.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CODIGO = /^SIRIUS-REM-\d{4,}$/;

/** Ruta fija para la llave del límite: el cupo es por remisión (la clave), no por URL. */
const RUTA_LIMITE = { nextUrl: { pathname: '/api/pirolisis/remisiones/reenviar' } } as NextRequest;

export async function POST(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { codigo: crudo } = await params;
  const codigo = decodeURIComponent(crudo ?? '').trim();
  try {
    assertCodigoSimbolico(codigo, 'código de remisión');
    if (!CODIGO.test(codigo)) throw new Error(`El código de remisión "${codigo}" no tiene un formato válido`);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const correo = correoConfigurado();
  if (!correo.ok) {
    return NextResponse.json({ error: `Correo sin configurar: falta ${correo.falta.join(', ')}` }, { status: 503 });
  }

  // 3 por hora por remisión: un reenvío es una acción manual y cada uno llega a
  // la copia interna; más que eso es un botón atascado o un abuso.
  const limite = checkRateLimit(RUTA_LIMITE, { windowMs: 60 * 60 * 1000, maxRequests: 3 }, `remision:${codigo}`);
  if (!limite.allowed) {
    const segundos = Math.max(1, Math.ceil((limite.resetTime - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Ya se reenvió varias veces en la última hora. Espere antes de intentarlo otra vez.' },
      { status: 429, headers: { 'Retry-After': String(segundos) } }
    );
  }

  try {
    const r = await reenviarComprobante(codigo);
    const steps = Array.isArray(r.body.steps)
      ? (r.body.steps as Array<{ step: string; ok: boolean; skipped?: boolean }>)
      : [];
    console.info(
      '[reenvio]',
      JSON.stringify({
        codigo,
        status: r.status,
        steps: steps.map((s) => ({ step: s.step, ok: s.ok, ...(s.skipped ? { skipped: true } : {}) })),
      })
    );
    return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[reenvio]', sanearError(err));
    return NextResponse.json({ error: 'No se pudo reenviar el comprobante. Intente de nuevo.' }, { status: 500 });
  }
}

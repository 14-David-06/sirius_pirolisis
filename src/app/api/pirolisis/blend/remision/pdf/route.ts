import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { assertCodigoSimbolico } from '@/lib/airtable-escape';
import { resolverRemision } from '@/lib/blend-remisiones-core';
import { construirDatosPdf } from '@/lib/blend-remision-pdf';
import { generateBlendRemisionPdf } from '@/lib/blend-remision-pdf-generator';

/**
 * GET ?remision=SIRIUS-REM-XXXX → el PDF de una remisión de Biochar Blend.
 *
 * Se ARMA de la remisión del Core cada vez, como el acta de entrega: la firma
 * digital del receptor se quitó (2026-10-02) y la remisión se firma en papel, así
 * que no hay un evento que "cierre" el documento y justifique archivar una copia
 * que después podría contradecir a la base.
 *
 * Exige sesión: lleva nombre y cédula de quien se lleva el producto. Antes el
 * único camino al PDF era la página pública de firma, sin autenticar.
 */
export async function GET(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('remision')?.trim() ?? '';
  try {
    assertCodigoSimbolico(id, 'código de remisión');
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const remision = await resolverRemision(id);
    if (!remision) {
      return NextResponse.json({ error: `No existe la remisión ${id}` }, { status: 404 });
    }

    const pdf = await generateBlendRemisionPdf(construirDatosPdf(remision));
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${remision.codigo || remision.recordId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error generando el PDF de la remisión:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

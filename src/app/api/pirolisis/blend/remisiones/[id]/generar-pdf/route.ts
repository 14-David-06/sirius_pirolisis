import { NextResponse } from 'next/server';
import { resolverRemision } from '../../../../../../../lib/blend-remisiones-core';
import { generarYPublicarPdf } from '../../../../../../../lib/blend-remision-pdf';

// POST /api/pirolisis/blend/remisiones/[id]/generar-pdf
//
// Genera el PDF de la remisión, lo sube a S3 y lo adjunta al documento en Sirius
// Remisiones Core. `id` acepta record ID o código legible.
//
// ⚠️ MIGRACIÓN 2026-07-30: lee del Core y la composición del Blend viene DERIVADA
// del lote, no de campos guardados. Toda la mecánica de armar/subir/adjuntar está
// en `src/lib/blend-remision-pdf.ts`, compartida con el flujo de firma: antes
// estaba duplicada en las dos rutas.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const remision = await resolverRemision(id);
    if (!remision) {
      return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
    }

    const pdfUrl = await generarYPublicarPdf(remision);

    return NextResponse.json(
      { success: true, pdf_url: pdfUrl, codigo: remision.codigo },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/remisiones/[id]/generar-pdf:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

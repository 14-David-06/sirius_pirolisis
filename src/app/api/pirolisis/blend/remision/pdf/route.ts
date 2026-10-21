import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { assertCodigoSimbolico } from '@/lib/airtable-escape';
import { ESTADO_REMISION, resolverRemision } from '@/lib/blend-remisiones-core';
import { generarPdfRemision } from '@/lib/blend-remision-pdf';
import { esEstadoRecibible } from '@/lib/remision-pirolisis.constants';
import { crearEnlaceRecepcion } from '@/lib/recepcion/enlace.server';
import { sanearError } from '@/lib/log-seguro';

export const runtime = 'nodejs';

/**
 * GET ?remision=SIRIUS-REM-XXXX → el PDF de una remisión de pirólisis (Biochar
 * Blend o biochar puro).
 *
 * Se ARMA de la remisión del Core cada vez, como el acta de entrega: no hay una
 * copia archivada que pueda contradecir a la base. La que el despacho adjunta al
 * Core es la del momento de emitir.
 *
 * Por estado:
 *  - Borrador: 409. Es un despacho a medias, sin el inventario garantizado: un
 *    papel de eso viajaría con un camión que el sistema todavía no despachó.
 *  - Pendiente / En Tránsito: con el QR de recepción, emitido en este momento
 *    (no se guarda; el mismo día da el mismo enlace).
 *  - Entregada: con el bloque de recibido. Cancelada: con la insignia de anulada.
 *
 * Una remisión del laboratorio u otra ajena responde 404, igual que una que no
 * existe: PiroliApp no emite documentos ajenos ni confirma que existan.
 *
 * Exige sesión: lleva nombre y cédula de quien se lleva el producto.
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
    if (!remision || remision.tipo === 'ajena') {
      return NextResponse.json({ error: `No existe la remisión ${id}` }, { status: 404 });
    }
    if (remision.estado === ESTADO_REMISION.borrador) {
      return NextResponse.json(
        { error: 'Despacho incompleto: complételo antes de imprimir' },
        { status: 409 }
      );
    }

    // Sin configuración de recepción no hay enlace: el PDF sale igual, con las
    // líneas para firmar en papel.
    const enlace = esEstadoRecibible(remision.estado) ? crearEnlaceRecepcion(remision.recordId) : null;
    const pdf = await generarPdfRemision(remision, {
      enlace: enlace ? { url: enlace.url, venceEl: enlace.venceEl } : null,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${remision.codigo || remision.recordId}.pdf"`,
        // Lleva un enlace que es una credencial: ni el navegador ni un proxy lo guardan.
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (err) {
    const message = sanearError(err);
    console.error('❌ Error generando el PDF de la remisión:', message);
    return NextResponse.json({ error: `No se pudo generar el PDF: ${message}` }, { status: 500 });
  }
}

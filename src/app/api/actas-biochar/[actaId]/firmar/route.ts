import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import {
  esParteFirmante,
  firmarActaEntrega,
  leerActaParaFirma,
} from '@/lib/acta-entrega-firma';

/**
 * Firma del Acta de Entrega de Biochar: las DOS partes, cada una en su momento.
 *
 * GET  → lo que la pantalla de firma necesita mostrar (qué se entregó, a quién, y
 *        qué firma falta).
 * POST → registra UNA firma (`parte: "sirius" | "receptor"`).
 *
 * ⚠️ **EXIGE SESIÓN, a diferencia de la firma de remisiones de Blend.** Esa es
 * pública porque el cliente la abre desde su propio celular en la finca; aquí las
 * dos firmas se dan EN VIVO sobre el dispositivo del operador de Sirius (decisión de
 * David, 2026-08-25), así que no hay ningún motivo para que este endpoint viva sin
 * sesión — y sí uno grande para no dejarlo abierto: un POST anónimo podría fabricar
 * la firma de una entrega que nadie hizo.
 *
 * Respuestas del POST:
 *   200 — firma registrada (y acta `Firmada` si completó el par)
 *   207 — firma registrada pero el PDF no se pudo regenerar (ver `steps`)
 *   400 — body inválido o falta la firma
 *   401 — sin sesión
 *   404 — el acta no existe
 *   409 — esa parte ya firmó, o el estado del acta no admite firmas
 *   500 — configuración incompleta o fallo al registrar en Airtable
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ actaId: string }> }
) {
  const sesion = await ServerSessionManager.getSession(request);
  if (!sesion) {
    return NextResponse.json({ success: false, error: 'Sesión requerida' }, { status: 401 });
  }

  const { actaId } = await params;

  try {
    const acta = await leerActaParaFirma(actaId);
    if (!acta) {
      return NextResponse.json({ success: false, error: 'Acta no encontrada' }, { status: 404 });
    }

    // Se devuelve lo que el documento muestra, no el registro entero: la pantalla
    // de firma no necesita —ni debe llevar al navegador— el resto del expediente.
    return NextResponse.json({
      success: true,
      acta: {
        id: acta.id,
        codigo: acta.codigo,
        estado: acta.estado,
        fechaEntrega: acta.pdf.fechaEntrega,
        tipoBiochar: acta.pdf.tipoBiochar,
        loteEntregado: acta.pdf.loteEntregado,
        kgSeca: acta.pdf.kgSeca,
        co2SecuestradoKg: acta.pdf.co2SecuestradoKg,
        receptorNombre: acta.pdf.receptorNombre,
        receptorContacto: acta.pdf.receptorContacto,
        nombreProyecto: acta.pdf.nombreProyecto,
        ubicacionAplicacion: acta.pdf.ubicacionAplicacion,
        categoriaUso: acta.pdf.categoriaUso,
        elaboradoPor: acta.pdf.elaboradoPor,
        firmoSirius: acta.firmoSirius,
        firmoReceptor: acta.firmoReceptor,
        nombreFirmaSirius: acta.pdf.firmaSirius.nombre ?? '',
        nombreFirmaReceptor: acta.pdf.firmaReceptor.nombre ?? '',
        documentoUrl: acta.documentoUrl,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [actas-biochar/firmar] GET:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actaId: string }> }
) {
  const sesion = await ServerSessionManager.getSession(request);
  if (!sesion) {
    return NextResponse.json({ success: false, error: 'Sesión requerida' }, { status: 401 });
  }

  const { actaId } = await params;
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? undefined;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (!esParteFirmante(b.parte)) {
    return NextResponse.json(
      { success: false, error: 'Parte inválida', details: 'Debe ser "sirius" o "receptor".' },
      { status: 400 }
    );
  }
  if (typeof b.firmaBase64 !== 'string' || !b.firmaBase64.trim()) {
    return NextResponse.json(
      { success: false, error: 'Falta la firma', details: 'Envía firmaBase64 con el PNG del trazo.' },
      { status: 400 }
    );
  }
  const nombre = String(b.nombre ?? '').trim();
  if (!nombre) {
    return NextResponse.json(
      { success: false, error: 'Falta el nombre de quien firma' },
      { status: 400 }
    );
  }

  try {
    const resultado = await firmarActaEntrega({
      acta: actaId,
      parte: b.parte,
      firmaBase64: b.firmaBase64,
      nombre,
      cargo: String(b.cargo ?? '').trim() || undefined,
      documento: String(b.documento ?? '').trim() || undefined,
      ip,
    });

    if (!resultado.ok) {
      const fallo = resultado.steps.find((paso) => !paso.ok);
      return NextResponse.json(
        {
          success: false,
          error: fallo?.error ?? 'La firma no se pudo registrar',
          ...resultado,
        },
        { status: 500 }
      );
    }

    const fallidos = resultado.steps.filter((paso) => !paso.ok);
    const mensaje = resultado.actaCompleta
      ? `Acta ${resultado.codigo} FIRMADA por las dos partes.`
      : `Firma de ${resultado.parte === 'sirius' ? 'Sirius' : 'el receptor'} registrada en ${resultado.codigo}. Falta la otra parte.`;

    return NextResponse.json(
      {
        success: true,
        message: fallidos.length
          ? `${mensaje} El documento no se pudo regenerar: la firma está guardada y se puede reintentar.`
          : mensaje,
        ...resultado,
      },
      { status: fallidos.length ? 207 : 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [actas-biochar/firmar] POST:', message);

    // Los rechazos del servicio son del cliente, no del servidor: un 500 haría que
    // la UI ofreciera reintentar una firma que nunca va a entrar.
    const esConflicto = /ya firmó|no admite firmas|Borrador/.test(message);
    const esNoEncontrado = /No existe el acta/.test(message);
    const status = esConflicto ? 409 : esNoEncontrado ? 404 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

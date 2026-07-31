import { NextResponse } from 'next/server';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, awsServerConfig } from '../../../../../../lib/aws-config.server';
import {
  ESTADO_REMISION,
  TIPO_PERSONA,
  firmarRemision,
  resolverRemision,
} from '../../../../../../lib/blend-remisiones-core';
import { generarYPublicarPdf } from '../../../../../../lib/blend-remision-pdf';

// Firma pública de una remisión de Biochar Blend.
//
// ⚠️ MIGRACIÓN 2026-07-30: la remisión vive en Sirius Remisiones Core. El receptor
// es un registro en `Personas` (PER-REM-XXXX), la entrega queda en `Fecha Recibido`
// + `Estado: Entregada`, y la imagen de la firma va a S3 y embebida en el PDF: el
// Core es una base compartida con el laboratorio y no se le agregan campos de firma
// propios del Blend.
//
// ⚠️ ENDPOINT PÚBLICO Y SIN AUTENTICAR (el cliente lo abre desde el celular en la
// finca). Todo valor que entra a una `filterByFormula` va por `escapeAirtableValue`
// dentro de `blend-remisiones-core.ts`; `remisionId` solo se usa para resolver la
// remisión, que valida el formato antes de consultar.

const S3_FOLDER = 'firmas-blend/';

/**
 * GET — datos que necesita la página pública de firma.
 * `remisionId` acepta record ID o código legible (`SIRIUS-REM-XXXX`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ remisionId: string }> }
) {
  const { remisionId } = await params;

  try {
    const remision = await resolverRemision(remisionId);
    if (!remision) {
      return NextResponse.json({ error: 'Remisión no encontrada', details: remisionId }, { status: 404 });
    }

    const receptor = remision.personas.find((p) => p.tipo === TIPO_PERSONA.receptor);
    const yaFirmada = remision.estado === ESTADO_REMISION.entregada;

    return NextResponse.json(
      {
        id: remision.recordId,
        id_legible: remision.codigo,
        cliente: remision.clienteNombre,
        id_cliente: remision.idCliente,
        pedido: remision.idPedido,
        lote: remision.lote,
        fecha_evento: remision.fechaDespacho || remision.fechaRemision,
        kg_total_despachados: remision.kgTotal,
        co2_secuestrado_kg: remision.co2SecuestradoKg,
        composicion: remision.composicion,
        responsable_entrega: remision.responsableEntrega,
        responsable_recibe: receptor?.nombre ?? null,
        num_doc_recibe: receptor?.cedula ?? null,
        email_recibe: receptor?.email ?? null,
        estado: remision.estado,
        compromiso_aceptado: yaFirmada,
        firma_timestamp: remision.fechaRecibido || null,
        documento_url: remision.documentoUrl || null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET firmar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST — registra la firma del receptor.
 *
 * Body: {
 *   firmaBase64: string,          // PNG del trazo
 *   compromiso_aceptado: true,    // autorización Ley 1581 de 2012
 *   responsable_recibe?: string,  // si el receptor no estaba pre-registrado
 *   num_doc_recibe?: string,
 *   telefono_recibe?: string,
 *   email_recibe?: string,
 * }
 *
 * Orden: la firma en el Core (crítica) va antes de regenerar el PDF. Si el PDF
 * falla la entrega ya quedó registrada y se responde 207 — al revés se perdería la
 * firma que el cliente ya dio, que es lo único que no se puede repetir.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ remisionId: string }> }
) {
  const { remisionId } = await params;
  const ip =
    request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';

  try {
    const body = await request.json().catch(() => ({}));
    const {
      firmaBase64,
      compromiso_aceptado,
      responsable_recibe,
      num_doc_recibe,
      telefono_recibe,
      email_recibe,
    } = body as Record<string, unknown>;

    if (compromiso_aceptado !== true) {
      return NextResponse.json(
        {
          error: 'El compromiso debe ser aceptado',
          details: 'Sin la autorización de tratamiento de datos no se puede registrar la firma',
        },
        { status: 400 }
      );
    }
    if (typeof firmaBase64 !== 'string' || firmaBase64.length < 100) {
      return NextResponse.json(
        { error: 'Firma requerida', details: 'firmaBase64 no puede estar vacío' },
        { status: 400 }
      );
    }

    const remision = await resolverRemision(remisionId);
    if (!remision) {
      return NextResponse.json({ error: 'Remisión no encontrada' }, { status: 404 });
    }
    if (remision.estado === ESTADO_REMISION.entregada) {
      return NextResponse.json(
        { error: 'Remisión ya fue firmada', timestamp: remision.fechaRecibido || null },
        { status: 409 }
      );
    }

    // El receptor puede venir pre-registrado (vía /receptor) o llegar en este body,
    // que es el caso de la firma en campo con alguien que no estaba previsto.
    const receptorPrevio = remision.personas.find((p) => p.tipo === TIPO_PERSONA.receptor);
    const nombre = String(responsable_recibe ?? receptorPrevio?.nombre ?? '').trim();
    const cedula = String(num_doc_recibe ?? receptorPrevio?.cedula ?? '').trim();
    if (!nombre || !cedula) {
      return NextResponse.json(
        {
          error: 'Falta identificar quién recibe',
          details: 'Envía responsable_recibe y num_doc_recibe, o regístralos antes en /receptor',
        },
        { status: 400 }
      );
    }

    // 1. Imagen de la firma a S3. Va antes del Core porque su URL se embebe en el PDF.
    const base64 = firmaBase64.replace(/^data:image\/\w+;base64,/, '');
    const key = `${S3_FOLDER}${remision.recordId}-${Date.now()}.png`;
    const s3 = getS3Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: awsServerConfig.bucketName,
        Key: key,
        Body: Buffer.from(base64, 'base64'),
        ContentType: 'image/png',
      })
    );
    // URL firmada a 7 días: es el máximo con credenciales de usuario IAM.
    const firmaUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: awsServerConfig.bucketName, Key: key }),
      { expiresIn: 604800 }
    );

    // 2. La firma en el Core (crítico).
    const timestamp = new Date().toISOString();
    const resultado = await firmarRemision(remision.recordId, {
      receptor: {
        nombre,
        cedula,
        telefono: telefono_recibe ? String(telefono_recibe) : receptorPrevio?.telefono,
        email: email_recibe ? String(email_recibe) : receptorPrevio?.email,
      },
      autorizaDatos: true,
    });

    if (!resultado.ok) {
      const fallo = resultado.steps.find((s) => !s.ok);
      return NextResponse.json(
        { error: fallo?.error ?? 'No se pudo registrar la firma', steps: resultado.steps },
        { status: 502 }
      );
    }

    // 3. PDF con ambas firmas (best-effort: la entrega ya quedó registrada).
    let pdfUrl: string | null = null;
    let avisoPdf: string | undefined;
    try {
      const firmada = resultado.remision ?? (await resolverRemision(remision.recordId));
      if (firmada) {
        pdfUrl = await generarYPublicarPdf(firmada, {
          timestamp,
          imagenUrl: firmaUrl,
          ip,
          compromisoAceptado: true,
        });
      }
    } catch (pdfErr) {
      avisoPdf = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
      console.warn('⚠️ Firma registrada pero el PDF no se pudo regenerar:', avisoPdf);
    }

    console.log(`✍️ Remisión ${remision.codigo} firmada por ${nombre} (${cedula})`);

    return NextResponse.json(
      {
        success: true,
        remision_id: remision.recordId,
        codigo: remision.codigo,
        timestamp,
        pdf_url: pdfUrl,
        firma_url: firmaUrl,
        steps: resultado.steps,
        aviso: avisoPdf
          ? `La firma quedó registrada, pero el PDF no se pudo regenerar: ${avisoPdf}`
          : undefined,
      },
      { status: avisoPdf ? 207 : 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST firmar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { config } from '../../../../../../lib/config';
import { getS3Client } from '../../../../../../lib/aws-config.server';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = 'siriuspirolisis';
const S3_FOLDER = 'firmas-blend/';

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function recordUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendRemisionesTableId}/${id}`;
}

function guardConfig(): NextResponse | null {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta', details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID' },
      { status: 500 }
    );
  }
  return null;
}

// GET /api/pirolisis/blend/firmar/[remisionId]
// Devuelve los datos de la remisión para renderizar la página pública de firma
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ remisionId: string }> }
) {
  const guard = guardConfig();
  if (guard) return guard;

  const { remisionId } = await params;

  const res = await fetch(recordUrl(remisionId), { headers: airtableHeaders() });

  if (!res.ok) {
    if (res.status === 404) {
      return NextResponse.json({ error: 'Remisión no encontrada', details: remisionId }, { status: 404 });
    }
    const data = await res.json();
    return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
  }

  const data = await res.json();
  const f = data.fields ?? {};

  // Normalizar URL del documento PDF adjunto
  const adjuntos = Array.isArray(f['Documento Remision']) ? f['Documento Remision'] : [];
  const documentoUrl: string | null = adjuntos[0]?.url ?? null;

  return NextResponse.json({
    id: remisionId,
    id_legible: (f['ID'] as string | null) ?? null,
    cliente: (f['Cliente'] as string | null) ?? null,
    fecha_evento: (f['Fecha Evento'] as string | null) ?? null,
    kg_total_despachados: (f['KG Total Despachados'] as number | null) ?? null,
    co2_secuestrado_kg: (f['CO2 Secuestrado KG'] as number | null) ?? null,
    responsable_recibe: (f['Responsable Recibe'] as string | null) ?? null,
    num_doc_recibe: (f['Num Doc Recibe'] as string | null) ?? null,
    email_recibe: (f['Email Recibe'] as string | null) ?? null,
    estado: (f['Estado'] as string | null) ?? null,
    compromiso_aceptado: (f['Compromiso Aceptado'] as boolean | null) ?? false,
    firma_timestamp: (f['Firma Timestamp'] as string | null) ?? null,
    documento_url: documentoUrl,
    pedido_origen: Array.isArray(f['Pedido Origen']) ? (f['Pedido Origen'] as string[]) : [],
  }, { status: 200 });
}

// POST /api/pirolisis/blend/firmar/[remisionId]
// Body: { firmaBase64: string, compromiso_aceptado: true }
// Registra la firma digital: sube imagen a S3, actualiza 5 campos en Airtable,
// actualiza pedido a "Despachado"
export async function POST(
  request: Request,
  { params }: { params: Promise<{ remisionId: string }> }
) {
  const guard = guardConfig();
  if (guard) return guard;

  const { remisionId } = await params;
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';

  try {
    const body = await request.json();
    const { firmaBase64, compromiso_aceptado } = body as {
      firmaBase64: string;
      compromiso_aceptado: boolean;
    };

    if (!compromiso_aceptado) {
      return NextResponse.json(
        { error: 'El compromiso debe ser aceptado', details: 'compromiso_aceptado debe ser true' },
        { status: 400 }
      );
    }

    if (!firmaBase64 || firmaBase64.length < 100) {
      return NextResponse.json(
        { error: 'Firma requerida', details: 'firmaBase64 no puede estar vacío' },
        { status: 400 }
      );
    }

    // PREVENCIÓN DE DOBLE FIRMA — verificar estado actual antes de escribir en Airtable
    const checkRes = await fetch(recordUrl(remisionId), { headers: airtableHeaders() });
    if (!checkRes.ok) {
      if (checkRes.status === 404) {
        return NextResponse.json({ error: 'Remisión no encontrada' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Error verificando remisión' }, { status: checkRes.status });
    }

    const checkData = await checkRes.json();
    const f = checkData.fields ?? {};

    // Si ya fue firmada → 409 Conflict
    if (f['Compromiso Aceptado'] === true) {
      return NextResponse.json(
        { error: 'Remisión ya fue firmada', timestamp: (f['Firma Timestamp'] as string | null) ?? null },
        { status: 409 }
      );
    }

    // Subir imagen de firma a S3
    const base64Data = firmaBase64.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const s3Key = `${S3_FOLDER}${remisionId}-${Date.now()}.png`;

    const s3Client = getS3Client();
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: imgBuffer,
      ContentType: 'image/png',
    }));

    // URL firmada con validez de 7 días (máximo IAM user credentials)
    const firmaUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }),
      { expiresIn: 604800 }
    );

    const timestamp = new Date().toISOString();

    // Actualizar los 5 campos en blend_remisiones
    const updateRes = await fetch(recordUrl(remisionId), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields: {
          'Firma Timestamp': timestamp,
          'Compromiso Aceptado': true,
          'Firma Imagen URL': firmaUrl,
          'IP Firma': ip,
          'Estado': 'Entregada',
        },
      }),
    });

    if (!updateRes.ok) {
      const errData = await updateRes.json();
      return NextResponse.json(
        { error: 'Error actualizando remisión en Airtable', details: errData },
        { status: updateRes.status }
      );
    }

    // Actualizar pedido origen a "Despachado" (no crítico — no falla el POST si esto falla)
    // pedidoId se extrae del linked record Pedido Origen[0]
    const pedidoId = Array.isArray(f['Pedido Origen']) ? (f['Pedido Origen'] as string[])[0] : null;
    if (pedidoId) {
      try {
        const origin = new URL(request.url).origin;
        await fetch(
          new URL(`/api/pirolisis/blend/pedidos/${pedidoId}/estado`, origin).toString(),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'Despachado' }),
          }
        );
      } catch (pedidoErr) {
        console.warn('⚠️ No se pudo actualizar estado del pedido (no crítico):', pedidoErr);
      }
    }

    return NextResponse.json({ success: true, remision_id: remisionId, timestamp }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST firmar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

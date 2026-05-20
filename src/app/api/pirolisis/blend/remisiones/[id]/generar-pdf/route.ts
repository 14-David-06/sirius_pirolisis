import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';
import { getS3Client, awsServerConfig } from '../../../../../../../lib/aws-config.server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  generateBlendRemisionPdf,
  BlendRemisionData,
} from '../../../../../../../lib/blend-remision-pdf-generator';


function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function remisionUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendRemisionesTableId}/${id}`;
}

// POST /api/pirolisis/blend/remisiones/[id]/generar-pdf
// Genera el PDF de la remisión, lo sube a S3 y adjunta la URL al campo
// "Documento Remision" de Airtable.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta', details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID' },
      { status: 500 }
    );
  }

  const { id } = await params;

  try {
    // 1. Leer el registro de la remisión
    const getRes = await fetch(remisionUrl(id), { headers: airtableHeaders() });
    const getData = await getRes.json();

    if (!getRes.ok) {
      if (getRes.status === 404) return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
      return NextResponse.json({ error: getData?.error || 'Airtable error', details: getData }, { status: getRes.status });
    }

    const f = getData.fields as Record<string, unknown>;

    // 2. Construir objeto de datos para el PDF
    const idFormula = (f['ID'] as string) || `REM-BLEND-${id}`;

    const pdfData: BlendRemisionData = {
      id: idFormula,
      record_id: id,
      fecha_evento: (f['Fecha Evento'] as string) || new Date().toISOString().split('T')[0],
      cliente: (f['Cliente'] as string) || '',
      nit_cc_cliente: f['NIT/CC Cliente'] as string | undefined,
      pedido_id: (f['Pedido Origen'] as string[] | undefined)?.[0],
      produccion_id: (f['Produccion Origen'] as string[] | undefined)?.[0],
      kg_biochar_puro: (f['KG Biochar Puro'] as number) || 0,
      kg_abono_4g: (f['KG Abono 4G'] as number) || 0,
      kg_agua: (f['KG Agua'] as number) || 0,
      kg_biologicos: (f['KG Biologicos'] as number) || 0,
      kg_total: (f['KG Total Despachados'] as number) || 0,
      co2_secuestrado_kg: (f['CO2 Secuestrado KG'] as number) || 0,
      responsable_entrega: (f['Responsable Entrega'] as string) || '',
      num_doc_entrega: (f['Num Doc Entrega'] as string) || '',
      telefono_entrega: f['Telefono Entrega'] as string | undefined,
      email_entrega: f['Email Entrega'] as string | undefined,
      responsable_recibe: f['Responsable Recibe'] as string | undefined,
      num_doc_recibe: f['Num Doc Recibe'] as string | undefined,
      telefono_recibe: f['Telefono Recibe'] as string | undefined,
      email_recibe: f['Email Recibe'] as string | undefined,
      firma_timestamp: f['Firma Timestamp'] as string | undefined,
      compromiso_aceptado: f['Compromiso Aceptado'] as boolean | undefined,
      firma_imagen_url: f['Firma Imagen URL'] as string | undefined,
      ip_firma: f['IP Firma'] as string | undefined,
      estado: (f['Estado'] as string) || '',
      realiza_registro: (f['Realiza Registro'] as string) || '',
      observaciones: f['Observaciones'] as string | undefined,
    };

    // 3. Generar PDF
    console.log(`📄 Generando PDF para remisión blend ${id}...`);
    const pdfBytes = await generateBlendRemisionPdf(pdfData);
    console.log(`✅ PDF generado: ${pdfBytes.byteLength} bytes`);

    // 4. Subir a S3
    const s3 = getS3Client();
    const key = `blend-remisiones/${id}-${Date.now()}.pdf`;
    await s3.send(
      new PutObjectCommand({
        Bucket: awsServerConfig.bucketName,
        Key: key,
        Body: Buffer.from(pdfBytes),
        ContentType: 'application/pdf',
        ContentDisposition: `attachment; filename="${idFormula}.pdf"`,
      })
    );
    const pdfUrl = `https://${awsServerConfig.bucketName}.s3.${awsServerConfig.region}.amazonaws.com/${key}`;
    console.log(`✅ PDF subido a S3: ${pdfUrl}`);

    // 5. Adjuntar URL al campo "Documento Remision" en Airtable
    const patchRes = await fetch(remisionUrl(id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields: {
          'Documento Remision': [{ url: pdfUrl, filename: `${idFormula}.pdf` }],
        },
      }),
    });
    const patchData = await patchRes.json();

    if (!patchRes.ok) {
      console.warn('⚠️ PDF generado y subido, pero no se pudo adjuntar a Airtable:', patchData);
      return NextResponse.json({
        success: false,
        pdf_url: pdfUrl,
        error: 'PDF generado pero no se pudo adjuntar a Airtable',
        details: patchData,
      }, { status: 207 });
    }

    console.log(`✅ PDF adjuntado a remisión ${id}`);
    return NextResponse.json({
      success: true,
      pdf_url: pdfUrl,
      record: patchData,
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/remisiones/[id]/generar-pdf:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

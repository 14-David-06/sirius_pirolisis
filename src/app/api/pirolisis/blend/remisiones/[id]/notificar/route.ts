import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';
import nodemailer from 'nodemailer';


function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function remisionUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendRemisionesTableId}/${id}`;
}

function buildEmailHtml(fields: Record<string, unknown>, idFormula: string, pdfUrl?: string): string {
  const cliente = (fields['Cliente'] as string) || '—';
  const estado  = (fields['Estado']  as string) || '—';
  const fecha   = (fields['Fecha Evento'] as string) || '—';
  const kgTotal = (fields['KG Total Despachados'] as number)?.toFixed(2) ?? '—';
  const co2     = (fields['CO2 Secuestrado KG'] as number)?.toFixed(4) ?? '—';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Remisión Blend ${idFormula}</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.10);">
    <!-- Header -->
    <div style="background-color: #1A7030; padding: 24px 28px;">
      <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: bold;">REMISIÓN DE DESPACHO</h1>
      <p style="color: #D1EDD6; margin: 4px 0 0; font-size: 13px;">Biochar Blend — Sirius Pirólisis SAS</p>
    </div>
    <!-- Body -->
    <div style="padding: 24px 28px;">
      <p style="margin: 0 0 16px; font-size: 15px;">
        Se ha generado la remisión de despacho <strong>${idFormula}</strong> a nombre de <strong>${cliente}</strong>.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tbody>
          <tr style="background: #f0f7f1;">
            <td style="padding: 8px 10px; font-weight: bold; color: #1A7030; width: 45%;">ID Remisión</td>
            <td style="padding: 8px 10px;">${idFormula}</td>
          </tr>
          <tr>
            <td style="padding: 8px 10px; font-weight: bold; color: #1A7030;">Cliente</td>
            <td style="padding: 8px 10px;">${cliente}</td>
          </tr>
          <tr style="background: #f0f7f1;">
            <td style="padding: 8px 10px; font-weight: bold; color: #1A7030;">Estado</td>
            <td style="padding: 8px 10px;">${estado}</td>
          </tr>
          <tr>
            <td style="padding: 8px 10px; font-weight: bold; color: #1A7030;">Fecha Evento</td>
            <td style="padding: 8px 10px;">${fecha}</td>
          </tr>
          <tr style="background: #f0f7f1;">
            <td style="padding: 8px 10px; font-weight: bold; color: #1A7030;">KG Total Despachados</td>
            <td style="padding: 8px 10px;">${kgTotal} kg</td>
          </tr>
          <tr>
            <td style="padding: 8px 10px; font-weight: bold; color: #1A7030;">CO₂ Secuestrado</td>
            <td style="padding: 8px 10px;">${co2} kg CO₂-eq</td>
          </tr>
        </tbody>
      </table>
      ${pdfUrl ? `
      <div style="text-align: center; margin: 20px 0;">
        <a href="${pdfUrl}"
           style="background-color: #1A7030; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
          Descargar Documento PDF
        </a>
      </div>
      ` : ''}
      <p style="font-size: 12px; color: #666; margin: 20px 0 0;">
        Este correo fue enviado automáticamente por el sistema Sirius Pirólisis SAS.
        Si tiene alguna pregunta, comuníquese con el equipo de operaciones.
      </p>
    </div>
    <!-- Footer -->
    <div style="background-color: #1A7030; padding: 14px 28px; text-align: center;">
      <p style="color: #D1EDD6; font-size: 11px; margin: 0;">
        SIRIUS PIRÓLISIS SAS · Colombia · Transformando residuos en recursos
      </p>
    </div>
  </div>
</body>
</html>
`.trim();
}

// POST /api/pirolisis/blend/remisiones/[id]/notificar
// Body (todos opcionales, si no se envían se toman de la remisión):
//   destinatarios: string[]   — lista de emails (al menos uno)
//   asunto: string            — asunto personalizado
//   adjuntar_pdf: boolean     — si true, adjunta el PDF del campo "Documento Remision"
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta', details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID' },
      { status: 500 }
    );
  }

  // Verificar configuración SMTP
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpFrom = process.env.SMTP_FROM || 'Sirius Pirólisis <noreply@siriuspirolisis.com>';

  if (!smtpUser || !smtpPass) {
    return NextResponse.json(
      { error: 'Configuración de email incompleta', details: 'Faltan SMTP_USER o SMTP_PASS en las variables de entorno' },
      { status: 500 }
    );
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const {
      destinatarios,
      asunto,
      adjuntar_pdf = true,
    } = body as {
      destinatarios?: string[];
      asunto?: string;
      adjuntar_pdf?: boolean;
    };

    // 1. Leer la remisión de Airtable
    const getRes = await fetch(remisionUrl(id), { headers: airtableHeaders() });
    const getData = await getRes.json();

    if (!getRes.ok) {
      if (getRes.status === 404) return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
      return NextResponse.json({ error: getData?.error || 'Airtable error', details: getData }, { status: getRes.status });
    }

    const f = getData.fields as Record<string, unknown>;
    const idFormula = (f['ID'] as string) || `REM-BLEND-${id}`;

    // 2. Resolver lista de destinatarios
    const destFinal: string[] = [];
    if (Array.isArray(destinatarios) && destinatarios.length > 0) {
      destFinal.push(...destinatarios.filter((d) => d && d.includes('@')));
    }
    // Agregar emails de entrega y recepción de la remisión si existen
    const emailEntrega = f['Email Entrega'] as string | undefined;
    const emailRecibe  = f['Email Recibe']  as string | undefined;
    if (emailEntrega && !destFinal.includes(emailEntrega)) destFinal.push(emailEntrega);
    if (emailRecibe  && !destFinal.includes(emailRecibe))  destFinal.push(emailRecibe);

    if (destFinal.length === 0) {
      return NextResponse.json({
        error: 'No hay destinatarios válidos. Envía "destinatarios" en el body o asegúrate que la remisión tenga "Email Entrega" o "Email Recibe".',
      }, { status: 400 });
    }

    // 3. Obtener URL del PDF si existe
    const documentoRemision = f['Documento Remision'] as { url: string }[] | undefined;
    const pdfUrl = documentoRemision?.[0]?.url;

    // 4. Construir email
    const asuntoFinal = asunto || `Remisión de Despacho ${idFormula} — ${f['Cliente'] ?? ''}`;
    const htmlBody = buildEmailHtml(f, idFormula, pdfUrl);

    // 5. Configurar transporte nodemailer
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: smtpFrom,
      to: destFinal.join(', '),
      subject: asuntoFinal,
      html: htmlBody,
    };

    // Adjuntar PDF descargando desde S3 si se solicita y existe URL
    if (adjuntar_pdf && pdfUrl) {
      try {
        const pdfRes = await fetch(pdfUrl);
        if (pdfRes.ok) {
          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
          mailOptions.attachments = [
            {
              filename: `${idFormula}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ];
        }
      } catch (pdfErr) {
        console.warn('⚠️ No se pudo descargar el PDF para adjuntar:', pdfErr);
      }
    }

    // 6. Enviar
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email enviado para remisión ${id}: ${info.messageId} → ${destFinal.join(', ')}`);

    return NextResponse.json({
      success: true,
      message_id: info.messageId,
      destinatarios: destFinal,
      pdf_adjunto: !!mailOptions.attachments,
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/remisiones/[id]/notificar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

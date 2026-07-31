import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { config } from '../../../../../../../lib/config';
import { escapeAirtableValue } from '../../../../../../../lib/airtable-escape';
import { resolverRemision, type RemisionBlend } from '../../../../../../../lib/blend-remisiones-core';

// POST /api/pirolisis/blend/remisiones/[id]/notificar
//
// Envía por correo la remisión al cliente, con el PDF adjunto y el enlace de firma.
//
// ⚠️ MIGRACIÓN 2026-07-30: lee de Sirius Remisiones Core. Los destinatarios ya no
// salen de campos de texto de la remisión: se resuelven del `Personal Clientes` del
// cliente en Sirius Clients Core (que es donde vive el correo de notificación) más
// los correos de las Personas de la remisión.
//
// Body (todo opcional):
//   destinatarios: string[]   — correos extra
//   asunto: string
//   incluir_enlace_firma: boolean (default true)
//   adjuntar_pdf: boolean         (default true)

/** Correos del personal activo del cliente, desde Sirius Clients Core. */
async function correosDelCliente(idCliente: string): Promise<string[]> {
  const { clientesBaseId, clientesToken } = config.airtable;
  const personalTable = config.airtable.clientesPersonalTableId;
  if (!idCliente || !clientesBaseId || !clientesToken || !personalTable) return [];

  try {
    // El vínculo al cliente es un link: en una fórmula se evalúa como el texto del
    // campo primario del registro vinculado, que aquí es `CL-XXXX-PER-XXXX`. Por eso
    // se filtra por prefijo del código y no por igualdad con el ID del cliente.
    const params = new URLSearchParams({
      filterByFormula: `FIND('${escapeAirtableValue(idCliente)}-', {Codigo Persona Cliente}) = 1`,
      pageSize: '100',
    });
    const res = await fetch(
      `https://api.airtable.com/v0/${clientesBaseId}/${personalTable}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${clientesToken}` } }
    );
    const data = await res.json();
    if (!res.ok) {
      console.warn('⚠️ No se pudo leer el personal del cliente:', data);
      return [];
    }

    return (data.records ?? [])
      .filter((r: { fields: Record<string, unknown> }) => {
        const estado = String(r.fields?.['Estado Personal'] ?? '');
        return !estado || estado.toLowerCase().startsWith('activo');
      })
      .flatMap((r: { fields: Record<string, unknown> }) => [
        r.fields?.['Email Notificacion'],
        r.fields?.['Email'],
      ])
      .filter((e: unknown): e is string => typeof e === 'string' && e.includes('@'));
  } catch (err) {
    console.warn('⚠️ Error resolviendo correos del cliente:', err);
    return [];
  }
}

function buildEmailHtml(
  remision: RemisionBlend,
  enlaceFirma: string | null,
  pdfUrl: string | null
): string {
  const fila = (etiqueta: string, valor: string, alterna: boolean) => `
          <tr${alterna ? ' style="background: #f0f7f1;"' : ''}>
            <td style="padding: 8px 10px; font-weight: bold; color: #1A7030; width: 45%;">${etiqueta}</td>
            <td style="padding: 8px 10px;">${valor}</td>
          </tr>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Remisión Blend ${remision.codigo}</title>
</head>
<body style="font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 30px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.10);">
    <div style="background-color: #1A7030; padding: 24px 28px;">
      <h1 style="color: #fff; margin: 0; font-size: 20px; font-weight: bold;">REMISIÓN DE DESPACHO</h1>
      <p style="color: #D1EDD6; margin: 4px 0 0; font-size: 13px;">Biochar Blend — Sirius Pirólisis SAS</p>
    </div>
    <div style="padding: 24px 28px;">
      <p style="margin: 0 0 16px; font-size: 15px;">
        Se ha generado la remisión de despacho <strong>${remision.codigo}</strong> a nombre de
        <strong>${remision.clienteNombre}</strong>.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tbody>
${fila('ID Remisión', remision.codigo, true)}
${fila('Cliente', remision.clienteNombre, false)}
${fila('Estado', remision.estado, true)}
${fila('Fecha de despacho', remision.fechaDespacho || remision.fechaRemision || '—', false)}
${fila('KG despachados', `${remision.kgTotal.toFixed(2)} kg`, true)}
${fila('Lote de producción', remision.lote || '—', false)}
${fila('CO₂ secuestrado', `${remision.co2SecuestradoKg.toFixed(4)} kg CO₂-eq`, true)}
        </tbody>
      </table>
      ${
        enlaceFirma
          ? `<div style="text-align: center; margin: 20px 0;">
        <a href="${enlaceFirma}"
           style="background-color: #1A7030; color: #fff; padding: 14px 30px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 15px;">
          Ver remisión y firmar
        </a>
      </div>
      <p style="font-size: 12px; color: #666; text-align: center; margin: 0 0 16px;">
        Al firmar confirma la recepción del producto y acepta el compromiso de uso responsable.
      </p>`
          : ''
      }
      ${
        pdfUrl
          ? `<div style="text-align: center; margin: 12px 0;">
        <a href="${pdfUrl}" style="color: #1A7030; font-size: 13px;">Descargar documento PDF</a>
      </div>`
          : ''
      }
      <p style="font-size: 12px; color: #666; margin: 20px 0 0;">
        Este correo fue enviado automáticamente por el sistema Sirius Pirólisis SAS.
        Si tiene alguna pregunta, comuníquese con el equipo de operaciones.
      </p>
    </div>
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpFrom = process.env.SMTP_FROM || 'Sirius Pirólisis <noreply@siriuspirolisis.com>';

  if (!smtpUser || !smtpPass) {
    return NextResponse.json(
      { error: 'Configuración de email incompleta', details: 'Faltan SMTP_USER o SMTP_PASS' },
      { status: 500 }
    );
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const {
      destinatarios,
      asunto,
      incluir_enlace_firma = true,
      adjuntar_pdf = true,
    } = body as Record<string, unknown>;

    const remision = await resolverRemision(id);
    if (!remision) {
      return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
    }

    // Destinatarios: los del body + el personal del cliente + las personas de la remisión.
    const destino = new Set<string>();
    if (Array.isArray(destinatarios)) {
      for (const d of destinatarios) if (typeof d === 'string' && d.includes('@')) destino.add(d);
    }
    for (const correo of await correosDelCliente(remision.idCliente)) destino.add(correo);
    for (const p of remision.personas) if (p.email?.includes('@')) destino.add(p.email);
    if (process.env.REMISION_EMAIL_CC) destino.add(process.env.REMISION_EMAIL_CC);

    if (!destino.size) {
      return NextResponse.json(
        {
          error: 'No hay destinatarios válidos',
          details:
            'Envía "destinatarios" en el body, o registra el correo del personal del cliente en Sirius Clients Core.',
        },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const enlaceFirma = incluir_enlace_firma
      ? `${origin}/pirolisis/blend/firmar/${remision.recordId}`
      : null;

    const mailOptions: nodemailer.SendMailOptions = {
      from: smtpFrom,
      to: [...destino].join(', '),
      subject:
        (typeof asunto === 'string' && asunto) ||
        `Remisión de Despacho ${remision.codigo} — ${remision.clienteNombre}`,
      html: buildEmailHtml(remision, enlaceFirma, remision.documentoUrl || null),
    };

    // El PDF se adjunta descargándolo de S3: el cliente no siempre puede abrir el
    // enlace, y un adjunto es lo que queda como soporte del despacho.
    if (adjuntar_pdf && remision.documentoUrl) {
      try {
        const pdfRes = await fetch(remision.documentoUrl);
        if (pdfRes.ok) {
          mailOptions.attachments = [
            {
              filename: `${remision.codigo}.pdf`,
              content: Buffer.from(await pdfRes.arrayBuffer()),
              contentType: 'application/pdf',
            },
          ];
        }
      } catch (pdfErr) {
        console.warn('⚠️ No se pudo adjuntar el PDF; se envía solo el enlace:', pdfErr);
      }
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Remisión ${remision.codigo} notificada a ${destino.size} destinatario(s)`);

    return NextResponse.json(
      {
        success: true,
        message_id: info.messageId,
        destinatarios: [...destino],
        pdf_adjunto: Boolean(mailOptions.attachments),
        enlace_firma: enlaceFirma,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/remisiones/[id]/notificar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

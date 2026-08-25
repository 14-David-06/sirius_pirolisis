import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client } from '@/lib/aws-config.server';

/**
 * POST /api/actas-biochar/fotos — registro fotográfico de la entrega.
 *
 * Las fotos se capturan en el FORMULARIO, antes de firmar (decisión de David,
 * 2026-08-05): son evidencia de la entrega misma, distinta de la evidencia
 * georreferenciada de la aplicación en campo que el receptor debe enviar después
 * (Atestación de Uso, sección 5 del acta).
 *
 * Devuelve una URL firmada que Airtable usa para descargar el archivo al campo
 * `Registro Fotografico Entrega`. Se sube una foto por llamada: el operador está en
 * la finca con datos móviles y un lote grande que falla a la mitad no dice cuál pasó.
 */

const CONFIG = {
  bucketName: 'siriuspirolisis',
  folder: 'actas-biochar/',
  maxFileSize: 25 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'],
} as const;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return NextResponse.json(
        { error: 'Configuración AWS incompleta', details: 'Faltan AWS_ACCESS_KEY_ID o AWS_SECRET_ACCESS_KEY' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const etiqueta = String(formData.get('etiqueta') ?? 'entrega')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .slice(0, 40);

    if (!file) {
      return NextResponse.json(
        { error: 'Archivo no encontrado', details: 'Se requiere un archivo en el campo "file"' },
        { status: 400 }
      );
    }

    const nombre = file.name.toLowerCase();
    if (!CONFIG.allowedTypes.includes(file.type as (typeof CONFIG.allowedTypes)[number])) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido', details: `Solo imágenes o PDF. Recibido: ${file.type}` },
        { status: 400 }
      );
    }
    if (!CONFIG.allowedExtensions.some((ext) => nombre.endsWith(ext))) {
      return NextResponse.json(
        { error: 'Extensión no permitida', details: `Permitidas: ${CONFIG.allowedExtensions.join(', ')}` },
        { status: 400 }
      );
    }
    if (file.size > CONFIG.maxFileSize) {
      const pesa = (file.size / (1024 * 1024)).toFixed(2);
      return NextResponse.json(
        {
          error: 'Archivo demasiado grande',
          details: `"${file.name}" pesa ${pesa}MB y el máximo es ${CONFIG.maxFileSize / (1024 * 1024)}MB. Comprime la imagen o tómala con menor calidad.`,
        },
        { status: 400 }
      );
    }

    const extension = nombre.substring(nombre.lastIndexOf('.'));
    const s3Key = `${CONFIG.folder}acta-${etiqueta}-${Date.now()}${extension}`;

    const s3Client = getS3Client();
    await s3Client.send(
      new PutObjectCommand({
        Bucket: CONFIG.bucketName,
        Key: s3Key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      })
    );

    const fileUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: CONFIG.bucketName, Key: s3Key }),
      { expiresIn: 7 * 24 * 60 * 60 }
    );

    return NextResponse.json({
      success: true,
      fileUrl,
      fileName: s3Key.replace(CONFIG.folder, ''),
      s3Path: `s3://${CONFIG.bucketName}/${s3Key}`,
      fileSize: file.size,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ [actas-biochar/fotos] Error:', message);
    return NextResponse.json({ error: 'Error interno del servidor', details: message }, { status: 500 });
  }
}

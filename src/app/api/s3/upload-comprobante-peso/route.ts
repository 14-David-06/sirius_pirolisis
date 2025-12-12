import { NextRequest, NextResponse } from 'next/server';
import { getS3Client } from '../../../../lib/aws-config.server';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuración específica para comprobantes de peso de baches
const COMPROBANTES_PESO_CONFIG = {
  bucketName: 'siriuspirolisis',
  folder: 'comprobantes-peso-baches/',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'] as const,
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.pdf'] as const,
} as const;

export async function POST(request: NextRequest) {
  try {
    // Validar que las credenciales AWS estén configuradas
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return NextResponse.json({
        error: 'Configuración AWS incompleta',
        details: 'Faltan credenciales AWS_ACCESS_KEY_ID o AWS_SECRET_ACCESS_KEY'
      }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const bacheId = formData.get('bacheId') as string;

    if (!file) {
      return NextResponse.json({
        error: 'Archivo no encontrado',
        details: 'Se requiere un archivo en el campo "file"'
      }, { status: 400 });
    }

    if (!bacheId) {
      return NextResponse.json({
        error: 'ID de bache requerido',
        details: 'Se requiere el ID del bache para nombrar el archivo'
      }, { status: 400 });
    }

    // Validar tipo de archivo
    if (!COMPROBANTES_PESO_CONFIG.allowedTypes.includes(file.type as any)) {
      return NextResponse.json({
        error: 'Tipo de archivo no permitido',
        details: `Solo se permiten imágenes (JPG, PNG, WebP) y PDF. Tipo recibido: ${file.type}`
      }, { status: 400 });
    }

    // Validar extensión del archivo
    const fileName = file.name.toLowerCase();
    const hasValidExtension = COMPROBANTES_PESO_CONFIG.allowedExtensions.some(ext =>
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      return NextResponse.json({
        error: 'Extensión de archivo no permitida',
        details: `Solo se permiten archivos: ${COMPROBANTES_PESO_CONFIG.allowedExtensions.join(', ')}`
      }, { status: 400 });
    }

    // Validar tamaño del archivo
    if (file.size > COMPROBANTES_PESO_CONFIG.maxFileSize) {
      return NextResponse.json({
        error: 'Archivo demasiado grande',
        details: `El archivo no debe superar ${COMPROBANTES_PESO_CONFIG.maxFileSize / (1024 * 1024)}MB`
      }, { status: 400 });
    }

    // Generar nombre único del archivo
    const timestamp = Date.now();
    const extension = fileName.substring(fileName.lastIndexOf('.'));
    const uniqueFileName = `comprobante-peso-${bacheId}-${timestamp}${extension}`;

    // Construir la ruta S3
    const s3Key = `${COMPROBANTES_PESO_CONFIG.folder}${uniqueFileName}`;

    // Convertir archivo a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Subir archivo a S3
    const s3Client = getS3Client();
    const uploadCommand = new PutObjectCommand({
      Bucket: COMPROBANTES_PESO_CONFIG.bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(uploadCommand);

    // Generar signed URL con expiración de 7 días
    const getObjectCommand = new GetObjectCommand({
      Bucket: COMPROBANTES_PESO_CONFIG.bucketName,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
      expiresIn: 7 * 24 * 60 * 60, // 7 días en segundos
    });

    console.log(`✅ Comprobante de peso subido exitosamente: ${uniqueFileName}`);

    return NextResponse.json({
      success: true,
      fileUrl: signedUrl, // URL firmada que Airtable puede usar
      fileName: uniqueFileName,
      s3Path: `s3://${COMPROBANTES_PESO_CONFIG.bucketName}/${s3Key}`, // Ruta S3 completa
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('❌ Error al subir comprobante de peso:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message || 'Error desconocido'
    }, { status: 500 });
  }
}
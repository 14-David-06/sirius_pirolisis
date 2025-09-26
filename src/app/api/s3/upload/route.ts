import { NextRequest, NextResponse } from 'next/server';
import { getS3Client, awsServerConfig } from '../../../../lib/aws-config.server';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuración específica para fichas de seguridad
const SAFETY_SHEETS_CONFIG = {
  bucketName: 'siriuspirolisis',
  folder: 'fichas-seguridad-inventario/',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  minFileSize: 100 * 1024, // 100KB mínimo
  allowedTypes: ['application/pdf'] as const,
  allowedExtensions: ['.pdf'] as const,
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

    if (!file) {
      return NextResponse.json({
        error: 'Archivo no encontrado',
        details: 'Se requiere un archivo en el campo "file"'
      }, { status: 400 });
    }

    // Validar tipo de archivo
    if (!SAFETY_SHEETS_CONFIG.allowedTypes.includes(file.type as any)) {
      return NextResponse.json({
        error: 'Tipo de archivo no permitido',
        details: `Solo se permiten archivos PDF. Tipo recibido: ${file.type}`
      }, { status: 400 });
    }

    // Validar extensión del archivo
    const fileName = file.name.toLowerCase();
    const hasValidExtension = SAFETY_SHEETS_CONFIG.allowedExtensions.some(ext =>
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      return NextResponse.json({
        error: 'Extensión de archivo no permitida',
        details: `Solo se permiten archivos con extensión: ${SAFETY_SHEETS_CONFIG.allowedExtensions.join(', ')}`
      }, { status: 400 });
    }

    // Validar tamaño mínimo del archivo
    if (file.size < SAFETY_SHEETS_CONFIG.minFileSize) {
      const minSizeMB = (SAFETY_SHEETS_CONFIG.minFileSize / (1024 * 1024)).toFixed(2);
      return NextResponse.json({
        error: 'Archivo demasiado pequeño',
        details: `El archivo debe tener al menos ${minSizeMB} MB`
      }, { status: 400 });
    }

    // Validar tamaño máximo del archivo
    if (file.size > SAFETY_SHEETS_CONFIG.maxFileSize) {
      const maxSizeMB = (SAFETY_SHEETS_CONFIG.maxFileSize / (1024 * 1024)).toFixed(2);
      return NextResponse.json({
        error: 'Archivo demasiado grande',
        details: `El archivo no puede superar ${maxSizeMB} MB`
      }, { status: 400 });
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    const uniqueFileName = `ficha-seguridad-${timestamp}-${randomId}${fileExtension}`;
    const s3Key = `${SAFETY_SHEETS_CONFIG.folder}${uniqueFileName}`;

    // Convertir archivo a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Subir archivo a S3
    const s3Client = getS3Client();
    const uploadCommand = new PutObjectCommand({
      Bucket: SAFETY_SHEETS_CONFIG.bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: file.type,
    });

    await s3Client.send(uploadCommand);

    // Generar signed URL con expiración de 7 días (máximo permitido por AWS S3 SigV4)
    const getObjectCommand = new GetObjectCommand({
      Bucket: SAFETY_SHEETS_CONFIG.bucketName,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
      expiresIn: 7 * 24 * 60 * 60, // 7 días en segundos (máximo permitido)
    });

    console.log(`✅ Ficha de seguridad subida exitosamente: ${uniqueFileName}`);

    return NextResponse.json({
      success: true,
      fileUrl: signedUrl, // URL firmada que Airtable puede usar para descargar
      fileName: uniqueFileName,
      s3Path: `s3://${SAFETY_SHEETS_CONFIG.bucketName}/${s3Key}`, // Ruta S3 completa
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('❌ Error al subir ficha de seguridad:', error);
    return NextResponse.json({
      error: 'Error interno del servidor',
      details: error.message || 'Error desconocido'
    }, { status: 500 });
  }
}
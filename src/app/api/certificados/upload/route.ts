import { NextRequest, NextResponse } from 'next/server';
import { getS3Client } from '../../../../lib/aws-config.server';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configuración para certificados
const CERTIFICADOS_CONFIG = {
  bucketName: 'siriuspirolisis',
  folder: 'certificados/',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ] as const,
  allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'] as const,
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
    const file = formData.get('documento') as File;
    const tipoCertificado = formData.get('tipoCertificado') as string;
    const fechaInicio = formData.get('fechaInicio') as string;
    const fechaFin = formData.get('fechaFin') as string;

    if (!file) {
      return NextResponse.json({
        error: 'Archivo no encontrado',
        details: 'Se requiere un archivo en el campo "documento"'
      }, { status: 400 });
    }

    if (!tipoCertificado || !fechaInicio || !fechaFin) {
      return NextResponse.json({
        error: 'Datos incompletos',
        details: 'Se requieren tipoCertificado, fechaInicio y fechaFin'
      }, { status: 400 });
    }

    // Validar tipo de archivo
    if (!CERTIFICADOS_CONFIG.allowedTypes.includes(file.type as any)) {
      return NextResponse.json({
        error: 'Tipo de archivo no permitido',
        details: `Tipos permitidos: PDF, JPG, PNG, DOC, DOCX. Tipo recibido: ${file.type}`
      }, { status: 400 });
    }

    // Validar extensión del archivo
    const fileName = file.name.toLowerCase();
    const hasValidExtension = CERTIFICADOS_CONFIG.allowedExtensions.some(ext =>
      fileName.endsWith(ext)
    );

    if (!hasValidExtension) {
      return NextResponse.json({
        error: 'Extensión de archivo no permitida',
        details: `Solo se permiten archivos con extensión: ${CERTIFICADOS_CONFIG.allowedExtensions.join(', ')}`
      }, { status: 400 });
    }

    // Validar tamaño máximo del archivo
    if (file.size > CERTIFICADOS_CONFIG.maxFileSize) {
      const maxSizeMB = (CERTIFICADOS_CONFIG.maxFileSize / (1024 * 1024)).toFixed(2);
      return NextResponse.json({
        error: 'Archivo demasiado grande',
        details: `El archivo no puede superar ${maxSizeMB} MB`
      }, { status: 400 });
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    const sanitizedTipo = tipoCertificado.toLowerCase().replace(/\s+/g, '-');
    const uniqueFileName = `certificado-${sanitizedTipo}-${timestamp}-${randomId}${fileExtension}`;
    const s3Key = `${CERTIFICADOS_CONFIG.folder}${uniqueFileName}`;

    // Convertir archivo a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Subir archivo a S3
    const s3Client = getS3Client();
    const uploadCommand = new PutObjectCommand({
      Bucket: CERTIFICADOS_CONFIG.bucketName,
      Key: s3Key,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        tipoCertificado: tipoCertificado,
        fechaInicio: fechaInicio,
        fechaFin: fechaFin,
        uploadDate: new Date().toISOString()
      }
    });

    await s3Client.send(uploadCommand);

    // Generar signed URL con expiración de 7 días
    const getObjectCommand = new GetObjectCommand({
      Bucket: CERTIFICADOS_CONFIG.bucketName,
      Key: s3Key,
    });

    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
      expiresIn: 7 * 24 * 60 * 60, // 7 días
    });

    // Aquí podrías guardar la información en Airtable si lo necesitas
    // Por ahora solo retornamos la información del archivo subido

    return NextResponse.json({
      success: true,
      message: 'Certificado cargado exitosamente',
      data: {
        fileName: uniqueFileName,
        s3Key: s3Key,
        signedUrl: signedUrl,
        tipoCertificado: tipoCertificado,
        fechaInicio: fechaInicio,
        fechaFin: fechaFin,
        fileSize: file.size,
        contentType: file.type
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error al cargar certificado:', error);
    return NextResponse.json({
      error: 'Error al cargar el certificado',
      details: error.message || 'Error desconocido'
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, awsServerConfig, validateS3Path, sanitizeLogData } from '../../../../lib/aws-config.server';
import { checkRateLimit, createRateLimitResponse } from '../../../../middleware/rate-limit';

export async function GET(request: NextRequest) {
  // 🛡️ RATE LIMITING: Proteger URLs firmadas
  const rateLimit = checkRateLimit(request, {
    windowMs: 5 * 60 * 1000, // 5 minutos
    maxRequests: 50, // máximo 50 URLs firmadas por IP
  });

  if (!rateLimit.allowed) {
    console.warn(`🚨 Rate limit excedido para signed URLs: ${request.headers.get('x-forwarded-for')}`);
    return createRateLimitResponse(rateLimit.resetTime);
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      console.warn('Solicitud rechazada: parámetro key faltante');
      return NextResponse.json({
        error: 'Parámetro key requerido'
      }, { status: 400 });
    }

    // 🔒 VALIDACIÓN CRÍTICA: Verificar que el path sea seguro
    if (!validateS3Path(key)) {
      console.warn(`🚨 Intento de acceso no autorizado detectado: ${sanitizeLogData(key)}`);
      return NextResponse.json({
        error: 'Acceso no autorizado',
        code: 'INVALID_PATH'
      }, { status: 403 });
    }

    // Verificar configuración AWS (server-side only)
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.error('AWS credentials not configured in server environment');
      return NextResponse.json({
        error: 'Configuración de AWS no encontrada'
      }, { status: 500 });
    }

    const s3Client = getS3Client();

    console.log(`🔗 Generando URL firmada para: ${sanitizeLogData(key)}`);

    // Crear comando para obtener el objeto
    const command = new GetObjectCommand({
      Bucket: awsServerConfig.bucketName,
      Key: key,
    });

    // Generar URL firmada con expiración controlada
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: awsServerConfig.signedUrlExpiry,
    });

    console.log(`✅ URL firmada generada exitosamente para: ${sanitizeLogData(key)}`);

    return NextResponse.json({
      success: true,
      signedUrl,
      key,
      expiresIn: awsServerConfig.signedUrlExpiry,
    });

  } catch (error: any) {
    console.error('❌ Error generando URL firmada:', sanitizeLogData(error.message));

    // No exponer detalles internos del error
    return NextResponse.json({
      error: 'Error interno del servidor',
      code: 'SIGNED_URL_ERROR'
    }, { status: 500 });
  }
}
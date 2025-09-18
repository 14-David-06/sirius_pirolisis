import { NextRequest, NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getS3Client, awsServerConfig, validateS3Path, sanitizeLogData } from '../../../../lib/aws-config.server';
import { checkRateLimit, createRateLimitResponse } from '../../../../middleware/rate-limit';

export async function GET(request: NextRequest) {
  // 🛡️ RATE LIMITING: Proteger contra abuso
  const rateLimit = checkRateLimit(request, {
    windowMs: 5 * 60 * 1000, // 5 minutos
    maxRequests: 20, // máximo 20 requests por IP
  });

  if (!rateLimit.allowed) {
    console.warn(`🚨 Rate limit excedido para IP: ${request.headers.get('x-forwarded-for')}`);
    return createRateLimitResponse(rateLimit.resetTime);
  }

  try {
    // Verificar configuración AWS (server-side only)
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.error('AWS credentials not configured in server environment');
      return NextResponse.json({
        error: 'Configuración de AWS no encontrada'
      }, { status: 500 });
    }

    const s3Client = getS3Client();

    console.log('📂 Listando rutas S3 con validación de seguridad');

    // Listar objetos del bucket con el prefijo específico
    const command = new ListObjectsV2Command({
      Bucket: awsServerConfig.bucketName,
      Prefix: awsServerConfig.routesPrefix,
      MaxKeys: 100, // Limitar resultados para performance
    });

    const response = await s3Client.send(command);

    // Filtrar y validar archivos de imagen
    const imageFiles = response.Contents?.filter(obj => {
      const key = obj.Key || '';

      // Validar que el archivo esté en el path permitido
      if (!validateS3Path(key)) {
        console.warn(`Archivo rechazado por validación de path: ${sanitizeLogData(key)}`);
        return false;
      }

      // Validar tamaño máximo
      if ((obj.Size || 0) > awsServerConfig.maxFileSize) {
        console.warn(`Archivo rechazado por tamaño: ${sanitizeLogData(key)} (${obj.Size} bytes)`);
        return false;
      }

      return true;
    }).map(obj => ({
      key: obj.Key || '',
      name: (obj.Key || '').replace(awsServerConfig.routesPrefix, '').replace(/\.(png|jpg|jpeg)$/i, ''),
      size: obj.Size || 0,
      lastModified: obj.LastModified,
    })) || [];

    console.log(`✅ Encontrados ${imageFiles.length} archivos válidos`);

    return NextResponse.json({
      success: true,
      files: imageFiles,
      total: imageFiles.length,
    });

  } catch (error: any) {
    console.error('❌ Error listando archivos S3:', sanitizeLogData(error.message));
    return NextResponse.json({
      error: 'Error interno del servidor',
      code: 'S3_LIST_ERROR'
    }, { status: 500 });
  }
}
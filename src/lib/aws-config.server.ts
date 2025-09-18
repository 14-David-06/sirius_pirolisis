// src/lib/aws-config.server.ts
// ⚠️  SERVER-SIDE ONLY - NUNCA importar en cliente
// Configuración AWS segura para uso exclusivo en API routes

import { S3Client } from '@aws-sdk/client-s3';

// Singleton S3 Client para optimizar performance
let s3ClientInstance: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'us-east-1';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured in server environment');
    }

    s3ClientInstance = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3ClientInstance;
}

// Configuración AWS server-side
export const awsServerConfig = {
  bucketName: 'siriuspirolisis',
  routesPrefix: 'rutas-biomasa/',
  region: process.env.AWS_REGION || 'us-east-1',
  signedUrlExpiry: 3600, // 1 hora
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedExtensions: ['.png', '.jpg', '.jpeg'] as const,
} as const;

// Función de validación de paths
export function validateS3Path(key: string): boolean {
  // Solo permitir archivos dentro del prefijo rutas-biomasa/
  if (!key.startsWith(awsServerConfig.routesPrefix)) {
    return false;
  }

  // Validar extensión
  const extension = key.toLowerCase().substring(key.lastIndexOf('.'));
  return awsServerConfig.allowedExtensions.includes(extension as any);
}

// Función de sanitización de logs
export function sanitizeLogData(data: any): any {
  if (typeof data === 'object' && data !== null) {
    const sanitized = { ...data };
    // Remover cualquier campo que contenga 'key', 'token', 'secret', 'password'
    Object.keys(sanitized).forEach(key => {
      if (key.toLowerCase().includes('key') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('password')) {
        sanitized[key] = '[REDACTED]';
      }
    });
    return sanitized;
  }
  return data;
}
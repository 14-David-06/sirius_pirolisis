// src/lib/remision-documento-url.ts
// Dónde vive la copia PÚBLICA del PDF de una remisión en S3. Puro, sin red ni
// `server-only`, para que lo usen también los scripts (que corren con tsx); la
// subida está en `remision-documento-s3.server.ts`.

import { awsServerConfig } from './aws-config.server';
import { esRecordId } from './airtable-escape';

export const PREFIJO_REMISIONES_S3 = 'blend-remisiones/';

/**
 * `blend-remisiones/<recId>-<ms>.pdf`, el formato que ya tenían las de la firma
 * digital. El enlace es público: lleva el record ID y no el código porque los
 * códigos son consecutivos, y uno se adivinaría desde el siguiente.
 */
export function keyDocumentoRemision(recordId: string, ahora: Date = new Date()): string {
  if (!esRecordId(recordId)) throw new Error('Record ID de remisión inválido');
  return `${PREFIJO_REMISIONES_S3}${recordId}-${ahora.getTime()}.pdf`;
}

export function urlPublicaS3(key: string): string {
  return `https://${awsServerConfig.bucketName}.s3.${awsServerConfig.region}.amazonaws.com/${key}`;
}

/** ¿Es ya la copia pública en S3? Lo que haya en el campo y no lo sea (un «202» a mano) no se copia. */
export function esUrlDocumentoPublica(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith(urlPublicaS3(PREFIJO_REMISIONES_S3));
}

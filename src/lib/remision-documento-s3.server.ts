// src/lib/remision-documento-s3.server.ts
// ⚠️ SERVER-SIDE ONLY. Publica el PDF de una remisión en S3 y deja el enlace en
// `URL Remision Generada` (Remisiones Core).
//
// ═══ POR QUÉ (decisión de David, 2026-10-23) ═════════════════════════════════
// Finanzas abre las remisiones desde Flujo de caja (`Documento Remisión`) y desde
// el Core con un enlace directo, igual que las del laboratorio. El adjunto del
// Core da URLs que vencen en horas y el PDF de PiroliApp exige sesión: ninguno
// sirve para eso.
//
// ⚠️ El enlace es PÚBLICO y el PDF lleva nombre y cédula de quien transporta y de
// quien recibe. Por eso se publica solo al RECIBIR —el PDF del despacho, que
// todavía puede anularse, no sale del Core— y la key no se deriva del código.

import 'server-only';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { awsServerConfig, getS3Client } from './aws-config.server';
import { keyDocumentoRemision, urlPublicaS3 } from './remision-documento-url';
import { guardarUrlDocumento } from './remisiones-core';

/**
 * Sube el PDF y deja su URL en el Core. Devuelve la URL. LANZA si algo falla:
 * quien llama lo convierte en un paso best-effort.
 *
 * Primero S3 y después el Core: al revés, un fallo de la subida dejaría en la
 * tabla un enlace a un archivo que no existe.
 */
export async function publicarDocumentoRemision(
  recordId: string,
  bytes: Uint8Array,
  ahora: Date = new Date()
): Promise<string> {
  const key = keyDocumentoRemision(recordId, ahora);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: awsServerConfig.bucketName,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: 'application/pdf',
    })
  );
  const url = urlPublicaS3(key);
  await guardarUrlDocumento(recordId, url);
  return url;
}

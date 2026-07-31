// src/lib/blend-remision-pdf.ts
//
// Generación y publicación del PDF de una remisión de Biochar Blend.
//
// Vive aparte del generador de bytes (`blend-remision-pdf-generator.ts`) porque
// junta tres cosas que antes estaban copiadas en dos rutas: armar el objeto de
// datos desde la remisión del Core, subir a S3 y adjuntar la URL al documento.
// La ruta de generar-pdf y la de firmar llamaban a lo mismo con el código pegado,
// que es cómo se llega a que una arregle un bug y la otra no.

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, awsServerConfig } from './aws-config.server';
import { generateBlendRemisionPdf, type BlendRemisionData } from './blend-remision-pdf-generator';
import {
  guardarDocumento,
  TIPO_PERSONA,
  type PersonaRemision,
  type RemisionBlend,
} from './blend-remisiones-core';

/** Datos de la firma, que no viven en el Core: van embebidos en el PDF. */
export interface DatosFirma {
  timestamp?: string;
  imagenUrl?: string;
  ip?: string;
  compromisoAceptado?: boolean;
}

function persona(personas: PersonaRemision[], tipo: string): PersonaRemision | undefined {
  return personas.find((p) => p.tipo === tipo);
}

/** Arma el payload del generador desde una remisión del Core y sus derivados. */
export function construirDatosPdf(
  remision: RemisionBlend,
  firma: DatosFirma = {}
): BlendRemisionData {
  const transportista = persona(remision.personas, TIPO_PERSONA.transportista);
  const receptor = persona(remision.personas, TIPO_PERSONA.receptor);

  return {
    id: remision.codigo,
    record_id: remision.recordId,
    fecha_evento: remision.fechaDespacho || remision.fechaRemision,

    cliente: remision.clienteNombre,
    pedido_id: remision.idPedido,
    // El "origen" de la producción es el lote: no hay record de producción local.
    produccion_id: remision.lote,

    kg_biochar_puro: remision.composicion.biochar,
    kg_abono_4g: remision.composicion.abono,
    kg_agua: remision.composicion.agua,
    kg_biologicos: remision.composicion.biologicos,
    kg_total: remision.kgTotal,
    co2_secuestrado_kg: remision.co2SecuestradoKg,

    responsable_entrega: remision.responsableEntrega || transportista?.nombre || '',
    num_doc_entrega: transportista?.cedula ?? '',
    telefono_entrega: transportista?.telefono,
    email_entrega: transportista?.email,

    responsable_recibe: receptor?.nombre,
    num_doc_recibe: receptor?.cedula,
    telefono_recibe: receptor?.telefono,
    email_recibe: receptor?.email,

    firma_timestamp: firma.timestamp,
    compromiso_aceptado: firma.compromisoAceptado,
    firma_imagen_url: firma.imagenUrl,
    ip_firma: firma.ip,

    estado: remision.estado,
    realiza_registro: remision.responsableEntrega,
    observaciones: remision.notas,
  };
}

/**
 * Genera el PDF, lo sube a S3 y lo adjunta a la remisión del Core.
 *
 * La clave de S3 lleva timestamp para no sobrescribir: al firmar se regenera el
 * documento con ambas firmas y conviene conservar el anterior como rastro. El
 * `filename` del adjunto sí es estable (`SIRIUS-REM-XXXX.pdf`) para que el cliente
 * siempre descargue un archivo con el nombre del documento.
 *
 * @returns la URL pública del PDF.
 */
export async function generarYPublicarPdf(
  remision: RemisionBlend,
  firma: DatosFirma = {}
): Promise<string> {
  const datos = construirDatosPdf(remision, firma);

  const bytes = await generateBlendRemisionPdf(datos);
  const nombreArchivo = `${remision.codigo || remision.recordId}.pdf`;
  const key = `blend-remisiones/${remision.recordId}-${Date.now()}.pdf`;

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: awsServerConfig.bucketName,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: 'application/pdf',
      ContentDisposition: `attachment; filename="${nombreArchivo}"`,
    })
  );

  const url = `https://${awsServerConfig.bucketName}.s3.${awsServerConfig.region}.amazonaws.com/${key}`;
  await guardarDocumento(remision.recordId, url, nombreArchivo);

  console.log(`📄 PDF de ${remision.codigo}: ${bytes.byteLength} bytes → ${url}`);
  return url;
}

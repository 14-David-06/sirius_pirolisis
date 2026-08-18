// src/lib/solicitudesInfra.ts
// Implementación de los puertos de @sirius/solicitudes para PiroliApp.
//
// El paquete trae el documento del día siriano hecho —maqueta institucional,
// logo, QR y firma de Gestión del Ser—; aquí solo se dice dónde archivar la firma
// del trabajador y el PDF. Así el permiso sale igual desde las dos apps.

import { createHash } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type { SolicitudesInfra } from '@sirius/solicitudes/infra';
import { crearDiaSirianoInfra } from '@sirius/solicitudes/dia-siriano';
import { getS3Client } from './aws-config.server';

/**
 * ⚠️ La firma va al bucket de nómina, NO al de pirólisis.
 *
 * La `Firma_S3_Key` que queda en Airtable la lee Gestión del Ser para mostrar el
 * documento del permiso (`/api/documentos`), y ahí resuelve la key contra
 * `S3_BUCKET_FIRMAS`. Si PiroliApp la escribiera en `siriuspirolisis`, el
 * registro apuntaría a un objeto que la otra app no encuentra: el permiso
 * quedaría radicado y su firma inaccesible, sin error visible en ninguna de las
 * dos. Por eso el bucket y la convención de la key son los mismos.
 */
function bucketFirmas(): string {
  const bucket = process.env.S3_BUCKET_FIRMAS;
  // Sin valor por defecto a propósito: adivinar el nombre archiva la firma donde
  // la otra app no la busca, y el permiso queda radicado con una referencia
  // muerta. Es mejor que radicar falle y se vea en el log.
  if (!bucket) {
    throw new Error(
      'Falta S3_BUCKET_FIRMAS: es el bucket de firmas de nómina, el mismo que lee ' +
        'Gestión del Ser para servir el documento del permiso.',
    );
  }
  return bucket;
}

/** Los mismos prefijos que usa Gestión del Ser: la ruta es parte del contrato. */
const PREFIJOS: Record<string, string> = {
  permiso: 'firmas/permisos',
  vacaciones: 'firmas/vacaciones',
  'autorizacion-permiso': 'firmas/autorizaciones',
};

/** Los metadatos de S3 solo admiten ASCII: un nombre con tilde tumba el PUT. */
function soloAscii(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

export const solicitudesInfra: SolicitudesInfra = {
  async guardarFirma({ base64, cedula, idCore, tipo, metadata = {} }) {
    if (!base64 || base64.length < 100) {
      throw new Error('Base64 de firma inválido o vacío');
    }

    const prefijo = PREFIJOS[tipo] ?? 'firmas/permisos';
    const key = `${prefijo}/${idCore}/${Date.now()}_${cedula}.png`;
    const archivadaEn = new Date().toISOString();

    const auditoria: Record<string, string> = {
      cedula,
      idCore,
      tipo,
      uploadedAt: archivadaEn,
      source: 'sirius-pirolisis',
    };
    for (const [k, v] of Object.entries(metadata)) auditoria[k] = soloAscii(v);

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucketFirmas(),
        Key: key,
        Body: Buffer.from(base64, 'base64'),
        ContentType: 'image/png',
        // El bucket de firmas guarda documentos de nómina: cifrado en reposo.
        ServerSideEncryption: 'AES256',
        Metadata: auditoria,
      }),
    );

    return { key, archivadaEn };
  },

  // `adjuntar` se omite a propósito: copiar la firma a un campo Attachment de
  // Airtable es comodidad de consulta, y la referencia canónica ya es la key.

  // El día siriano nace autorizado y el PDF es su único respaldo. El paquete lo
  // emite; PiroliApp lo archiva junto a las firmas, en el bucket de nómina, con
  // la misma estructura que Gestión del Ser: son el mismo expediente.
  diaSiriano: crearDiaSirianoInfra({
    async archivarDocumento({ pdf, cedula, idCore, fechaPermiso, metadata = {} }) {
      if (!pdf || pdf.byteLength === 0) throw new Error('PDF vacío');

      const [anio, mes] = fechaPermiso.split('-');
      const filename = `${idCore}_${cedula}_${fechaPermiso}_${Date.now()}.pdf`;
      // `dias-sirianos`, nunca `dias-pacto`: ese es el prefijo anterior al
      // renombre y solo se conserva para leer los PDF ya emitidos.
      const key = `permisos/dias-sirianos/${anio}/${mes}/${filename}`;
      const cuerpo = Buffer.from(pdf);

      const auditoria: Record<string, string> = {
        cedula,
        idCore,
        fechaPermiso,
        uploadedAt: new Date().toISOString(),
        source: 'sirius-pirolisis',
      };
      for (const [k, v] of Object.entries(metadata)) auditoria[k] = soloAscii(v);

      const bucket = bucketFirmas();
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: cuerpo,
          ContentType: 'application/pdf',
          ServerSideEncryption: 'AES256',
          Metadata: auditoria,
        }),
      );

      return {
        key,
        // Referencia al objeto, no un enlace para el navegador: es privado. El
        // enlace que se guarda en Airtable lo arma el paquete apuntando a
        // /api/documentos/permiso/{id}, que exige sesión.
        url: `https://${bucket}.s3.amazonaws.com/${key}`,
        filename,
        // Huella del documento: permite verificar después que el PDF archivado es
        // el mismo que se firmó.
        sha256: createHash('sha256').update(cuerpo).digest('hex'),
      };
    },
  }),
};

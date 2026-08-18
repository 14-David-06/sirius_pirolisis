/**
 * Sirve el documento oficial de un permiso.
 *
 * ⚠️ **Tener sesión no es autorización.** El PDF de un permiso lleva el motivo
 * —a menudo médico—, la cédula y la firma manuscrita del trabajador. Sin esta
 * comprobación, cualquier colaborador autenticado que conozca un recordId podría
 * descargar el expediente de otro.
 *
 * En PiroliApp la regla es **solo el dueño**, y eso es completo aquí: esta app no
 * autoriza solicitudes ni tiene jefaturas con potestad sobre ellas (eso vive en
 * Gestión del Ser, que además abre el documento a quien autorizó). Los permisos
 * que esta app emite son días sirianos, que nacen autorizados sin que nadie
 * decida.
 *
 * Al denegar responde **404, no 403**: un 403 confirmaría que el registro existe,
 * y eso ya es información sobre un tercero.
 *
 * Dos reglas heredadas del módulo, por si se amplía:
 *  - El cliente nunca nombra el archivo. Pide `(tipo, recordId)` y el servidor
 *    resuelve la key desde el registro.
 *  - No se entrega una URL firmada al navegador: el archivo se transmite por
 *    aquí. Una URL firmada sale del perímetro y funciona sin sesión mientras viva.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { FIELDS, FK_ID_CORE } from '@sirius/solicitudes/schema';
import { ServerSessionManager } from '@/lib/serverSession';
import { solicitudesAirtable } from '@/lib/solicitudesAirtable';
import { getS3Client } from '@/lib/aws-config.server';

/** Forma de un record ID de Airtable — se valida antes de tocar la red. */
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/**
 * Prefijos válidos para el documento de un permiso.
 *
 * `dias-pacto` es el nombre que tenía la carpeta antes del renombre a «días
 * sirianos», y esas keys siguen guardadas en permisos ya emitidos: quitarlo
 * dejaría inaccesibles PDFs que sí existen en el bucket.
 */
const PREFIJO_VALIDO = /^(permisos\/dias-(sirianos|pacto)|autorizaciones\/permiso)\//;

const noEncontrado = () =>
  NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await ServerSessionManager.getSession();
  const idCore = session?.user.idPersonalCore;
  if (!idCore) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  if (!RECORD_ID.test(id)) return noEncontrado();

  const { baseId, apiKey, tablas } = solicitudesAirtableResuelto();

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tablas.permiso)}/${id}`,
    { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' },
  );
  if (!res.ok) return noEncontrado();

  const record = await res.json();
  const fields: Record<string, unknown> = record.fields ?? {};

  // El dueño, y nadie más.
  if (fields[FK_ID_CORE] !== idCore) return noEncontrado();

  const key = String(fields[FIELDS.PERMISO.PDF_AUTORIZACION_S3_KEY] ?? '');
  if (!key) return noEncontrado();

  // Los campos de Airtable son texto editable: sin esta comprobación bastaría
  // cambiar la key a mano para que un acceso legítimo sirviera otro archivo.
  if (!PREFIJO_VALIDO.test(key)) {
    console.error(`[documentos/permiso] key incoherente con la solicitud: ${id}`);
    return noEncontrado();
  }

  const bucket = process.env.S3_BUCKET_FIRMAS;
  if (!bucket) {
    console.error('[documentos/permiso] falta S3_BUCKET_FIRMAS');
    return NextResponse.json({ error: 'Almacenamiento no configurado' }, { status: 500 });
  }

  try {
    const objeto = await getS3Client().send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const cuerpo = await objeto.Body?.transformToByteArray();
    if (!cuerpo) return noEncontrado();

    // Queda rastro: un documento laboral firmado exige poder responder después
    // quién lo consultó.
    console.log(`[documentos/permiso] ${idCore} descargó ${id}`);

    return new NextResponse(Buffer.from(cuerpo), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="permiso-${id}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[documentos/permiso] S3', error);
    return noEncontrado();
  }
}

/** Las mismas credenciales y tablas que usan los handlers del paquete. */
function solicitudesAirtableResuelto() {
  const { baseId, apiKey, tablas } = solicitudesAirtable;
  if (!baseId || !apiKey || !tablas?.permiso) {
    throw new Error('Falta la configuración de Airtable de Novedades Nómina');
  }
  return { baseId, apiKey, tablas: { permiso: tablas.permiso } };
}

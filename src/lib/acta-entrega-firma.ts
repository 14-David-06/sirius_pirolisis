// src/lib/acta-entrega-firma.ts
//
// Las DOS firmas del Acta de Entrega de Biochar: quien entrega por Sirius y quien
// recibe.
//
// ═══ POR QUÉ EN VIVO, Y NO UNA FIRMA GUARDADA ═════════════════════════════════
// Se descartó estampar una firma institucional de Sirius al generar el acta
// (decisión de David, 2026-08-25). Una firma pre-guardada acredita que existe la
// persona, no que estuvo en la entrega; y el valor probatorio del acta ante una
// auditoría de la metodología es justamente que las dos partes estuvieron ahí. Cada
// firma se traza en el momento, con su propio timestamp e IP.
//
// ═══ LOS ESTADOS QUE PUEDEN FIRMAR ════════════════════════════════════════════
// Solo `Generada` y `Firmada`. Un acta en `Borrador` NO se puede firmar: ese estado
// significa que el descuento de inventario FALLÓ (ver `crearActaEntrega`), así que
// firmarla certificaría una entrega que el inventario no refleja. `Anulada` y
// `Atestada` tampoco: la primera ya no vale, la segunda está cerrada.
//
// ═══ UNA FIRMA NO SE SOBRESCRIBE ══════════════════════════════════════════════
// Si la parte ya firmó, se responde conflicto en vez de reemplazar el trazo. Una
// firma es el único dato de todo el sistema que no se puede volver a pedir igual: si
// hay que corregirla, es una decisión de una persona, no un reintento de la app.
//
// ═══ DÓNDE QUEDA EL RASTRO ════════════════════════════════════════════════════
// La tabla tiene `Fecha Firma` (una sola, tipo date) y no tiene campos para el
// timestamp ni la IP de cada parte. El rastro fino va a `Observaciones` como una
// línea por firma, y sobre todo al PDF, que es el documento. No se agregaron campos
// a Airtable porque su API no permite borrarlos: si más adelante hacen falta dos
// `dateTime`, es una decisión consciente, no un efecto colateral de esta función.

import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { awsServerConfig, getS3Client } from './aws-config.server';
import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import { ACTA_FIELDS, ESTADO_ACTA, RECEPTOR_FIELDS } from './actas-biochar.constants';
import { generarActaEntregaPdf, type ActaEntregaPdfData } from './acta-entrega-pdf';
import type { StepResult } from '@/types/step-result';

const AT = 'https://api.airtable.com/v0';
const S3_FOLDER_FIRMAS = 'firmas-actas/';
const S3_FOLDER_ACTAS = 'actas-biochar/';

/** URL firmada a 7 días: es el máximo con credenciales de usuario IAM. */
const EXPIRA_URL_S3 = 7 * 24 * 60 * 60;

export type ParteFirmante = 'sirius' | 'receptor';

export function esParteFirmante(valor: unknown): valor is ParteFirmante {
  return valor === 'sirius' || valor === 'receptor';
}

/** Qué campos toca cada parte. Tenerlo en un mapa evita el `if` repetido. */
const CAMPOS_POR_PARTE = {
  sirius: {
    firma: ACTA_FIELDS.firmaSirius,
    nombre: ACTA_FIELDS.nombreFirmaSirius,
    cargo: ACTA_FIELDS.cargoFirmaSirius,
    rotulo: 'Sirius (quien entrega)',
  },
  receptor: {
    firma: ACTA_FIELDS.firmaReceptor,
    nombre: ACTA_FIELDS.nombreFirmaReceptor,
    cargo: ACTA_FIELDS.cargoFirmaReceptor,
    rotulo: 'Receptor (quien recibe)',
  },
} as const;

function headers() {
  return {
    Authorization: `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

async function atFetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data: data as Record<string, any> };
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : valor == null ? '' : String(valor);
}

function numero(valor: unknown): number {
  const n = typeof valor === 'object' && valor !== null ? NaN : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Primera URL de un campo de adjuntos, o undefined. */
function urlAdjunto(valor: unknown): string | undefined {
  if (!Array.isArray(valor) || !valor.length) return undefined;
  const primero = valor[0] as { url?: string };
  return typeof primero?.url === 'string' ? primero.url : undefined;
}

export interface ActaParaFirma {
  id: string;
  codigo: string;
  estado: string;
  /** Datos ya listos para el PDF, con las firmas que haya hasta ahora. */
  pdf: ActaEntregaPdfData;
  /** true si esa parte ya firmó. */
  firmoSirius: boolean;
  firmoReceptor: boolean;
  observaciones: string;
  documentoUrl: string;
}

/**
 * Lee el acta y su receptor, por record ID o por código (`ACTA-BC-0007`).
 *
 * Los dos identificadores se resuelven porque la pantalla de firma se abre desde la
 * tabla (record ID) pero el código es lo que se comparte por WhatsApp con el
 * receptor, y es lo único que una persona puede transcribir.
 */
export async function leerActaParaFirma(identificador: string): Promise<ActaParaFirma | null> {
  const { baseId, actasBiocharTableId, receptoresBiocharTableId } = config.airtable;
  if (!baseId || !actasBiocharTableId) throw new Error('Falta AIRTABLE_ACTAS_BIOCHAR_TABLE_ID');

  let registro: { id: string; fields: Record<string, unknown> } | null = null;

  if (esRecordId(identificador)) {
    const { ok, data } = await atFetch(`${AT}/${baseId}/${actasBiocharTableId}/${identificador}`, {
      headers: headers(),
    });
    registro = ok ? { id: data.id, fields: data.fields ?? {} } : null;
  } else {
    const url = new URL(`${AT}/${baseId}/${actasBiocharTableId}`);
    url.searchParams.set(
      'filterByFormula',
      `{${ACTA_FIELDS.idActa}} = '${escapeAirtableValue(identificador)}'`
    );
    url.searchParams.set('maxRecords', '1');
    const { ok, data } = await atFetch(url.toString(), { headers: headers() });
    if (!ok) throw new Error(`Error buscando el acta ${identificador}: ${JSON.stringify(data)}`);
    const rec = data.records?.[0];
    registro = rec ? { id: rec.id, fields: rec.fields ?? {} } : null;
  }

  if (!registro) return null;
  const f = registro.fields;

  // El receptor es un link: sus datos viven en la otra tabla y el PDF los imprime.
  // Si la lectura falla, el acta se sigue pudiendo firmar con el nombre que ya
  // guardó el acta — perder el teléfono del receptor no puede bloquear una firma.
  let receptor: Record<string, unknown> = {};
  const receptorIds = Array.isArray(f[ACTA_FIELDS.receptor]) ? (f[ACTA_FIELDS.receptor] as string[]) : [];
  if (receptorIds.length && receptoresBiocharTableId) {
    const { ok, data } = await atFetch(
      `${AT}/${baseId}/${receptoresBiocharTableId}/${receptorIds[0]}`,
      { headers: headers() }
    );
    if (ok) receptor = (data.fields ?? {}) as Record<string, unknown>;
  }

  const firmaSiriusUrl = urlAdjunto(f[ACTA_FIELDS.firmaSirius]);
  const firmaReceptorUrl = urlAdjunto(f[ACTA_FIELDS.firmaReceptor]);
  const observaciones = texto(f[ACTA_FIELDS.observaciones]);

  return {
    id: registro.id,
    codigo: texto(f[ACTA_FIELDS.idActa]) || registro.id,
    estado: texto(f[ACTA_FIELDS.estado]),
    firmoSirius: Boolean(firmaSiriusUrl),
    firmoReceptor: Boolean(firmaReceptorUrl),
    observaciones,
    documentoUrl: texto(f[ACTA_FIELDS.urlDocumentoActa]),
    pdf: {
      codigo: texto(f[ACTA_FIELDS.idActa]) || registro.id,
      estado: texto(f[ACTA_FIELDS.estado]),
      fechaEntrega: texto(f[ACTA_FIELDS.fechaEntrega]),
      elaboradoPor: texto(f[ACTA_FIELDS.elaboradoPor]),
      cargoElaboradoPor: texto(f[ACTA_FIELDS.cargoElaboradoPor]),
      tipoBiochar: texto(f[ACTA_FIELDS.tipoBiochar]),
      loteEntregado: texto(f[ACTA_FIELDS.loteEntregado]),
      detallePorBache: texto(f[ACTA_FIELDS.detallePorBache]),
      kgSeca: numero(f[ACTA_FIELDS.cantidadSeca]),
      humedadPct: numero(f[ACTA_FIELDS.humedadPct]),
      co2SecuestradoKg: numero(f[ACTA_FIELDS.co2]),
      receptorNombre: texto(receptor[RECEPTOR_FIELDS.nombre]),
      receptorTipo: texto(receptor[RECEPTOR_FIELDS.tipo]),
      receptorDocumento: texto(receptor[RECEPTOR_FIELDS.documento]),
      receptorContacto: texto(receptor[RECEPTOR_FIELDS.personaContacto]),
      receptorTelefono: texto(receptor[RECEPTOR_FIELDS.telefono]),
      receptorCorreo: texto(receptor[RECEPTOR_FIELDS.correo]),
      receptorMunicipio: texto(receptor[RECEPTOR_FIELDS.municipio]),
      actuaComoIntermediario: Boolean(f[ACTA_FIELDS.actuaComoIntermediario]),
      nombreProyecto: texto(f[ACTA_FIELDS.nombreProyecto]),
      categoriaUso: texto(f[ACTA_FIELDS.categoriaUso]),
      categoriaUsoOtro: texto(f[ACTA_FIELDS.categoriaUsoOtro]),
      ubicacionAplicacion: texto(f[ACTA_FIELDS.ubicacionAplicacion]),
      coordenadasGps: texto(f[ACTA_FIELDS.coordenadasGps]),
      fechaEstimadaAplicacion: texto(f[ACTA_FIELDS.fechaEstimadaAplicacion]),
      duracionEnsayo: texto(f[ACTA_FIELDS.duracionEnsayo]),
      observaciones,
      firmaSirius: {
        nombre: texto(f[ACTA_FIELDS.nombreFirmaSirius]),
        cargo: texto(f[ACTA_FIELDS.cargoFirmaSirius]),
        imagenUrl: firmaSiriusUrl,
      },
      firmaReceptor: {
        nombre: texto(f[ACTA_FIELDS.nombreFirmaReceptor]),
        cargo: texto(f[ACTA_FIELDS.cargoFirmaReceptor]),
        imagenUrl: firmaReceptorUrl,
      },
    },
  };
}

/** Sube un PNG/PDF a S3 y devuelve su URL firmada. */
async function subirAS3(key: string, cuerpo: Buffer, contentType: string): Promise<string> {
  const s3 = getS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: awsServerConfig.bucketName,
      Key: key,
      Body: cuerpo,
      ContentType: contentType,
    })
  );
  return await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: awsServerConfig.bucketName, Key: key }),
    { expiresIn: EXPIRA_URL_S3 }
  );
}

export interface FirmarActaInput {
  /** Record ID o código del acta. */
  acta: string;
  parte: ParteFirmante;
  /** PNG del trazo, `data:image/png;base64,…` o base64 pelado. */
  firmaBase64: string;
  nombre: string;
  cargo?: string;
  /** C.C. de quien firma. Va al PDF, no a Airtable: no hay campo. */
  documento?: string;
  ip?: string;
}

export interface FirmarActaResult {
  ok: boolean;
  codigo: string;
  parte: ParteFirmante;
  timestamp: string;
  /** true cuando ESTA firma completó el par y el acta pasó a `Firmada`. */
  actaCompleta: boolean;
  estado: string;
  firmaUrl: string;
  documentoUrl: string | null;
  steps: StepResult[];
}

/**
 * Registra una de las dos firmas del acta.
 *
 * ═══ ORDEN DE LOS PASOS ═════════════════════════════════════════════════════
 * S3 → Airtable → PDF, y no otro:
 *   La imagen va primero porque su URL es lo que Airtable guarda y lo que el PDF
 *   embebe. Airtable es el paso CRÍTICO: es donde la firma queda registrada. El PDF
 *   es best-effort y eleva la respuesta a 207 si falla, porque regenerarlo se puede
 *   reintentar y la firma que la persona ya hizo, no.
 *
 * @throws Si el acta no existe, si su estado no admite firma o si esa parte ya
 *   firmó. Son condiciones que se validan ANTES de escribir: la alternativa es
 *   sobrescribir un trazo, y eso no se deshace.
 */
export async function firmarActaEntrega(input: FirmarActaInput): Promise<FirmarActaResult> {
  const { baseId, actasBiocharTableId } = config.airtable;
  if (!baseId || !actasBiocharTableId) throw new Error('Falta AIRTABLE_ACTAS_BIOCHAR_TABLE_ID');

  const base64 = input.firmaBase64.replace(/^data:image\/\w+;base64,/, '');
  if (base64.length < 100) {
    throw new Error('La firma llegó vacía: no se registró nada.');
  }
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error('Falta el nombre de quien firma.');

  const acta = await leerActaParaFirma(input.acta);
  if (!acta) throw new Error(`No existe el acta ${input.acta}`);

  if (acta.estado !== ESTADO_ACTA.generada && acta.estado !== ESTADO_ACTA.firmada) {
    throw new Error(
      acta.estado === ESTADO_ACTA.borrador
        ? `El acta ${acta.codigo} está en Borrador: su descuento de inventario no se completó, así que ` +
          'firmarla certificaría una entrega que el inventario no refleja. Reintenta la creación primero.'
        : `El acta ${acta.codigo} está en estado ${acta.estado} y no admite firmas.`
    );
  }

  const yaFirmo = input.parte === 'sirius' ? acta.firmoSirius : acta.firmoReceptor;
  if (yaFirmo) {
    throw new Error(
      `${CAMPOS_POR_PARTE[input.parte].rotulo} ya firmó el acta ${acta.codigo}. Una firma no se ` +
        'sobrescribe: si hay que corregirla, hay que anular el acta.'
    );
  }

  const timestamp = new Date().toISOString();
  const steps: StepResult[] = [];
  const campos = CAMPOS_POR_PARTE[input.parte];

  // 1. El trazo a S3 (crítico: sin URL no hay nada que guardar ni que imprimir).
  const firmaUrl = await subirAS3(
    `${S3_FOLDER_FIRMAS}${acta.codigo}-${input.parte}-${Date.now()}.png`,
    Buffer.from(base64, 'base64'),
    'image/png'
  );
  steps.push({ step: `firma_s3:${input.parte}`, ok: true, detail: { parte: input.parte } });

  // 2. La firma en Airtable (CRÍTICO).
  const completaElPar = input.parte === 'sirius' ? acta.firmoReceptor : acta.firmoSirius;
  const rastro =
    `[FIRMA:${input.parte}] ${nombre}` +
    (input.cargo?.trim() ? ` — ${input.cargo.trim()}` : '') +
    (input.documento?.trim() ? ` · C.C. ${input.documento.trim()}` : '') +
    ` · ${timestamp}` +
    (input.ip ? ` · IP ${input.ip}` : '');

  const fields: Record<string, unknown> = {
    [campos.firma]: [{ url: firmaUrl }],
    [campos.nombre]: nombre,
    [ACTA_FIELDS.observaciones]: [acta.observaciones.trim(), rastro].filter(Boolean).join('\n'),
  };
  if (input.cargo?.trim()) fields[campos.cargo] = input.cargo.trim();
  // `Fecha Firma` y el estado solo se mueven cuando el par queda completo: un acta
  // con una sola firma no está firmada, y decir que sí es exactamente el error que
  // este módulo existe para no cometer.
  if (completaElPar) {
    fields[ACTA_FIELDS.fechaFirma] = timestamp.split('T')[0];
    fields[ACTA_FIELDS.estado] = ESTADO_ACTA.firmada;
  }

  const patch = await atFetch(`${AT}/${baseId}/${actasBiocharTableId}/${acta.id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields }),
  });
  if (!patch.ok) {
    steps.push({ step: `firma_airtable:${input.parte}`, ok: false, error: JSON.stringify(patch.data) });
    return {
      ok: false,
      codigo: acta.codigo,
      parte: input.parte,
      timestamp,
      actaCompleta: false,
      estado: acta.estado,
      firmaUrl,
      documentoUrl: null,
      steps,
    };
  }
  steps.push({
    step: `firma_airtable:${input.parte}`,
    ok: true,
    detail: { completaElPar, estado: completaElPar ? ESTADO_ACTA.firmada : acta.estado },
  });

  // 3. PDF regenerado con las firmas que haya (best-effort).
  let documentoUrl: string | null = null;
  try {
    const datos: ActaEntregaPdfData = {
      ...acta.pdf,
      estado: completaElPar ? ESTADO_ACTA.firmada : acta.pdf.estado,
      observaciones: fields[ACTA_FIELDS.observaciones] as string,
      firmaSirius:
        input.parte === 'sirius'
          ? { nombre, cargo: input.cargo, documento: input.documento, imagenUrl: firmaUrl, timestamp, ip: input.ip }
          : acta.pdf.firmaSirius,
      firmaReceptor:
        input.parte === 'receptor'
          ? { nombre, cargo: input.cargo, documento: input.documento, imagenUrl: firmaUrl, timestamp, ip: input.ip }
          : acta.pdf.firmaReceptor,
    };

    const bytes = await generarActaEntregaPdf(datos);
    documentoUrl = await subirAS3(
      `${S3_FOLDER_ACTAS}${acta.codigo}-${Date.now()}.pdf`,
      Buffer.from(bytes),
      'application/pdf'
    );

    const patchPdf = await atFetch(`${AT}/${baseId}/${actasBiocharTableId}/${acta.id}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        fields: {
          [ACTA_FIELDS.documentoActa]: [{ url: documentoUrl }],
          [ACTA_FIELDS.urlDocumentoActa]: documentoUrl,
        },
      }),
    });
    steps.push(
      patchPdf.ok
        ? { step: 'documento_acta', ok: true, detail: { documentoUrl } }
        : { step: 'documento_acta', ok: false, error: JSON.stringify(patchPdf.data), detail: { documentoUrl } }
    );
  } catch (err) {
    steps.push({
      step: 'documento_acta',
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    ok: true,
    codigo: acta.codigo,
    parte: input.parte,
    timestamp,
    actaCompleta: completaElPar,
    estado: completaElPar ? ESTADO_ACTA.firmada : acta.estado,
    firmaUrl,
    documentoUrl,
    steps,
  };
}

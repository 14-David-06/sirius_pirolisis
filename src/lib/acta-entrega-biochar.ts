// src/lib/acta-entrega-biochar.ts
//
// Acta de entrega de una salida de biochar SIN contraprestación (investigación,
// ensayo, piloto, donación): el documento que exige el numeral 5.4.2 de la Puro
// Biochar Methodology.
//
// ═══ NO ES UN MÓDULO NUEVO ════════════════════════════════════════════════════
// El módulo de actas (tabla propia, doble firma en vivo) se eliminó el
// 2026-08-21 y su restauración se revirtió el 2026-08-25. Esto es lo mínimo que
// ese hecho necesita: la salida ya la registra `runSalidaBache()` con motivo
// `entrega`, y su remisión en `Remisiones Baches Pirolisis` es el registro del
// evento. Ahí se guarda quién recibe y en qué vehículo, y el acta se ARMA de esa
// fila cada vez que se pide: no hay un PDF archivado que pueda contradecir a la
// base, y corregir un dato es corregir la fila.
//
// La firma es en papel: el acta se imprime, quien recibe firma el compromiso de
// no quemar el biochar y llevarlo al suelo, y la planta la archiva.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';
import { camposReceptor, leerKgDeRemision } from './salida-bache';
import {
  bacheDeReferencia,
  esReferenciaEntrega,
  marcaSalida,
  type ReceptorEntrega,
} from './salida-bache.constants';

const AT = 'https://api.airtable.com/v0';

export interface ActaEntrega {
  referencia: string;
  remisionId: string;
  /** `ID Numerico` de la remisión: el consecutivo que se imprime. */
  numero: number | null;
  /** `YYYY-MM-DD`. */
  fecha: string;
  bache: string;
  kg: number;
  /** Quien registró la salida en la app: es quien entrega por Sirius. */
  responsableEntrega: string;
  receptor: Partial<ReceptorEntrega>;
  /** Solo lo que escribió el operador, sin la línea automática ni la marca. */
  observaciones?: string;
}

export class ActaNoEncontrada extends Error {}

function headers() {
  return { Authorization: `Bearer ${config.airtable.token}`, 'Content-Type': 'application/json' };
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * La remisión de una salida por entrega, con sus campos por field ID.
 *
 * `returnFieldsByFieldId` porque `config` guarda field IDs: la respuesta normal
 * viene indexada por NOMBRE y leer `fields[fieldId]` daría siempre undefined.
 */
async function buscarRemision(referencia: string): Promise<{ id: string; fields: Record<string, unknown> }> {
  if (!esReferenciaEntrega(referencia)) {
    // No es solo validación: la referencia entra en una fórmula, y así nada que no
    // tenga la forma exacta de `SAL-ENT-<fecha>-S-00XXX` llega a Airtable.
    throw new ActaNoEncontrada(`${referencia} no es una salida por entrega sin contraprestación.`);
  }
  const { baseId, remisionesBachesTableId } = config.airtable;
  if (!baseId || !remisionesBachesTableId) throw new Error('Config de remisiones de baches incompleta');

  const url = new URL(`${AT}/${baseId}/${remisionesBachesTableId}`);
  url.searchParams.set('filterByFormula', `FIND('${escapeAirtableValue(marcaSalida(referencia))}', {Observaciones}) > 0`);
  url.searchParams.set('maxRecords', '1');
  url.searchParams.set('returnFieldsByFieldId', 'true');

  const res = await fetch(url.toString(), { headers: headers(), cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Error buscando la salida ${referencia}: ${JSON.stringify(data)}`);

  const registro = data?.records?.[0];
  if (!registro) throw new ActaNoEncontrada(`No hay una salida registrada con la referencia ${referencia}.`);
  return { id: registro.id, fields: registro.fields ?? {} };
}

export async function leerActaEntrega(referencia: string): Promise<ActaEntrega> {
  const { id, fields } = await buscarRemision(referencia);
  const rf = config.airtable.remisionesBachesFields;
  const campo = (fieldId: string | undefined) => (fieldId ? texto(fields[fieldId]) : '');

  // `leerKgDeRemision` lee por NOMBRE el link a los detalles; esta respuesta viene
  // por field ID, así que se le pasa con la llave que espera.
  const detalles = rf.detalleCantidadesBachePirolisis ? fields[rf.detalleCantidadesBachePirolisis] : undefined;
  const kg = await leerKgDeRemision({ fields: { 'Detalle Cantidades Bache Pirolisis': detalles } });

  // Las observaciones se arman `Salida de bache — … Destino: ….\n<operador>\n[SALIDA:…]`:
  // al acta solo le corresponde lo que escribió el operador.
  const observaciones = campo(rf.observaciones)
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('Salida de bache —') && !l.includes('[SALIDA:'))
    .join(' ')
    .trim();

  const numero = rf.idNumerico ? Number(fields[rf.idNumerico]) : NaN;

  return {
    referencia,
    remisionId: id,
    numero: Number.isFinite(numero) ? numero : null,
    fecha: campo(rf.fechaEvento) || referencia.slice('SAL-ENT-'.length, 'SAL-ENT-'.length + 10),
    bache: bacheDeReferencia(referencia) ?? '',
    kg,
    responsableEntrega: campo(rf.realizaRegistro),
    receptor: {
      nombre: campo(rf.responsableRecibe),
      cedula: campo(rf.numeroDocumentoRecibe),
      vehiculo: campo(rf.vehiculoRecibe),
      color: campo(rf.colorVehiculoRecibe),
      placa: campo(rf.placaVehiculoRecibe),
    },
    observaciones: observaciones || undefined,
  };
}

/**
 * Guarda (o corrige) quién recibió una entrega ya registrada.
 *
 * Es lo que permite completar el acta de una salida que se registró antes de que
 * existiera, o con un dato mal digitado. Solo toca campos de texto: no mueve
 * inventario ni reescribe links.
 */
export async function guardarReceptorEntrega(referencia: string, receptor: ReceptorEntrega): Promise<ActaEntrega> {
  const { id } = await buscarRemision(referencia);
  const rf = config.airtable.remisionesBachesFields;
  if (!rf.responsableRecibe || !rf.numeroDocumentoRecibe) {
    throw new Error('Faltan los field IDs de quien recibe en Remisiones Baches Pirolisis');
  }

  const campos = camposReceptor(receptor);
  // Un dato opcional borrado en el formulario se borra también en la base: si no,
  // una placa mal digitada quedaría para siempre aunque se corrija dejándola vacía.
  for (const fieldId of [rf.vehiculoRecibe, rf.colorVehiculoRecibe, rf.placaVehiculoRecibe]) {
    if (fieldId && !(fieldId in campos)) campos[fieldId] = '';
  }

  const res = await fetch(`${AT}/${config.airtable.baseId}/${config.airtable.remisionesBachesTableId}/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ fields: campos }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(`No se guardó quién recibe: ${JSON.stringify(data)}`);
  }
  return leerActaEntrega(referencia);
}

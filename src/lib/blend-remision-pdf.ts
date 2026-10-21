// src/lib/blend-remision-pdf.ts
//
// Datos del PDF de una remisión de pirólisis (Biochar Blend o Biochar puro),
// armados desde el Core.
//
// Vive aparte del generador de bytes (`blend-remision-pdf-generator.ts`) porque
// el generador no sabe nada del Core: aquí se decide qué dato de la remisión va en
// qué casilla del documento.
//
// Sin imports de `*.server.ts`, a propósito: lo usa `scripts/adjuntar-pdf-
// remisiones.ts`, que corre fuera de Next. El enlace de recepción lo emite quien
// llama (despacho, ruta del PDF) y llega aquí ya hecho, como `{ url, venceEl }`.

import { config } from './config';
import { fechaHoraBogotaLegible } from './fecha-bogota';
import { generateBlendRemisionPdf, type BlendRemisionData } from './blend-remision-pdf-generator';
import {
  adjuntarDocumento,
  ESTADO_REMISION,
  TIPO_PERSONA,
  type PersonaRemision,
  type RemisionBlend,
} from './blend-remisiones-core';
import { esEstadoRecibible, NOMBRE_PRODUCTO } from './remision-pirolisis.constants';
import { qrPng } from './recepcion/qr';
import type { StepResult } from '@/types/step-result';

export interface OpcionesPdf {
  /** Enlace de recepción vigente. Solo se imprime si la remisión está por recibir. */
  enlace?: { url: string; venceEl: string } | null;
}

function persona(personas: PersonaRemision[], tipo: string): PersonaRemision | undefined {
  return personas.find((p) => p.tipo === tipo);
}

/**
 * El Receptor más reciente: el de código `PER-REM-` mayor. Una remisión puede
 * tener más de uno si se reabrió a mano (se devolvió a En Tránsito y se volvió a
 * recibir), y el que vale es el último.
 */
function receptorVigente(personas: PersonaRemision[]): PersonaRemision | undefined {
  return personas
    .filter((p) => p.tipo === TIPO_PERSONA.receptor)
    .sort((a, b) => b.codigo.localeCompare(a.codigo, 'es', { numeric: true }))[0];
}

/**
 * Arma el payload del generador desde una remisión del Core y sus derivados.
 *
 * Puro: no lee nada ni genera el QR (llega en `extra`). Las reglas por estado:
 *  - Pendiente / En Tránsito: bloque «recepción pendiente» (QR si lo hay, válido
 *    hasta, líneas para firmar en papel). Sin receptor: nadie recibió todavía.
 *  - Entregada: el Receptor de mayor PER-REM; si no hay (remisiones de antes del
 *    enlace), el transportista. Con `[recibida:]`, la fecha y hora de la
 *    confirmación por enlace.
 *  - Cancelada: anulada, sin recepción ni QR.
 */
export function construirDatosPdf(
  remision: RemisionBlend,
  extra: { qrPng?: Uint8Array; venceEl?: string } = {}
): BlendRemisionData {
  const transportista = persona(remision.personas, TIPO_PERSONA.transportista);
  const anulada = remision.estado === ESTADO_REMISION.cancelada;
  const porRecibir = esEstadoRecibible(remision.estado);
  const entregada = remision.estado === ESTADO_REMISION.entregada;

  let receptor: PersonaRemision | undefined;
  let fechaRecibido: string | undefined;
  if (entregada) {
    const registrado = receptorVigente(remision.personas);
    // Caso heredado: antes del enlace quien se llevaba el pedido era personal del
    // cliente y era él mismo quien recibía, al cargarlo en la planta. La fecha de
    // recepción es entonces la del despacho.
    receptor = registrado ?? transportista;
    fechaRecibido =
      remision.fechaRecibido ||
      (!registrado && transportista ? remision.fechaDespacho || remision.fechaRemision : undefined);
  } else if (!porRecibir && !anulada) {
    // Un estado que no es ninguno de los conocidos (o un Borrador, que la ruta
    // rechaza antes): solo lo que el Core dice, sin heurísticas.
    receptor = receptorVigente(remision.personas);
    fechaRecibido = remision.fechaRecibido || undefined;
  }

  return {
    id: remision.codigo,
    record_id: remision.recordId,
    fecha_evento: remision.fechaDespacho || remision.fechaRemision,

    cliente: remision.clienteNombre,
    id_cliente: remision.idCliente,
    pedido_id: remision.idPedido,
    area_cliente: remision.idAreaCliente
      ? { nombre: remision.areaClienteNombre, codigo: remision.idAreaCliente }
      : undefined,

    producto: remision.productoNombre || NOMBRE_PRODUCTO.blend,
    kg_total: remision.kgTotal,
    // Biochar puro: kg × `config.carbon.factorSecuestroCo2` (lo calcula el mapeo,
    // el mismo factor del acta de entrega). Blend: el biochar real del lote × factor.
    co2_secuestrado_kg: remision.co2SecuestradoKg,
    empresa_nit: config.empresa.nit,

    // Quien entrega es el responsable de planta; la cédula que tiene el Core es
    // la del transportista, y va en su propia tarjeta. Juntarlas hacía decir al
    // documento "Santiago Amaya" con la cédula del conductor.
    responsable_entrega: remision.responsableEntrega,
    transportista: transportista?.cedula
      ? { nombre: transportista.nombre, cedula: transportista.cedula }
      : undefined,
    receptor: receptor?.cedula ? { nombre: receptor.nombre, cedula: receptor.cedula } : undefined,
    fecha_recibido: fechaRecibido || undefined,

    recepcion_pendiente: porRecibir
      ? { qr_png: extra.qrPng, vence_el: extra.qrPng ? extra.venceEl : undefined }
      : undefined,
    recepcion_confirmada:
      entregada && remision.recibidaEn
        ? { fecha_hora: fechaHoraBogotaLegible(remision.recibidaEn) }
        : undefined,
    anulada: anulada || undefined,

    estado: remision.estado,
    // Las notas son `[marcas…] <producto> — <obs>`: las marcas son la trazabilidad
    // que lee la app y el producto la etiqueta del tipo. Al cliente solo le
    // corresponde lo que escribió el operador.
    observaciones: remision.notas.split(' — ').slice(1).join(' — ').trim() || undefined,
  };
}

/**
 * Los bytes del PDF. Si la remisión está por recibir y llega un enlace, lleva su
 * QR; en cualquier otro estado el enlace se ignora: una remisión entregada o
 * anulada con un QR vivo invitaría a "recibirla" otra vez.
 */
export async function generarPdfRemision(remision: RemisionBlend, o: OpcionesPdf = {}): Promise<Uint8Array> {
  const enlace = o.enlace && esEstadoRecibible(remision.estado) ? o.enlace : null;
  const extra = enlace ? { qrPng: await qrPng(enlace.url), venceEl: enlace.venceEl } : {};
  return generateBlendRemisionPdf(construirDatosPdf(remision, extra));
}

/**
 * Adjunta el PDF a la remisión en el Core (`Documento Remision`). Paso
 * `documento`, best-effort.
 *
 * El PDF de `/api/pirolisis/blend/remision/pdf` se arma del Core cada vez, pero
 * solo existe dentro de PiroliApp y con sesión: en la tabla, que es lo que ven el
 * laboratorio y las demás apps, la remisión quedaba sin documento. Hasta el
 * 2026-10-02 lo adjuntaba la firma digital; al quitarla nadie lo hacía
 * (SIRIUS-REM-0202).
 *
 * El adjunto es la copia al momento de emitir (con QR si va por recibir: es igual
 * al papel que viaja) y se REEMPLAZA al recibir por `<REM>-recibida.pdf`. Sin
 * opciones se comporta como siempre (`scripts/adjuntar-pdf-remisiones.ts`).
 *
 * @param o.bytes        un PDF ya generado (la recepción adjunta el mismo que manda por correo)
 * @param o.nombreArchivo por defecto `<REM>.pdf`
 */
export async function adjuntarPdfRemision(
  remision: RemisionBlend,
  o: OpcionesPdf & { bytes?: Uint8Array; nombreArchivo?: string } = {}
): Promise<StepResult> {
  try {
    const bytes = o.bytes ?? (await generarPdfRemision(remision, o));
    const nombre = o.nombreArchivo || `${remision.codigo || remision.recordId}.pdf`;
    await adjuntarDocumento(remision.recordId, bytes, nombre);
    return { step: 'documento', ok: true, detail: { bytes: bytes.byteLength, archivo: nombre } };
  } catch (err) {
    return { step: 'documento', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

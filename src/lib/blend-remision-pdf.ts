// src/lib/blend-remision-pdf.ts
//
// Datos del PDF de una remisión de Biochar Blend, armados desde el Core.
//
// Vive aparte del generador de bytes (`blend-remision-pdf-generator.ts`) porque
// el generador no sabe nada del Core: aquí se decide qué dato de la remisión va en
// qué casilla del documento.

import { type BlendRemisionData } from './blend-remision-pdf-generator';
import { TIPO_PERSONA, type PersonaRemision, type RemisionBlend } from './blend-remisiones-core';

function persona(personas: PersonaRemision[], tipo: string): PersonaRemision | undefined {
  return personas.find((p) => p.tipo === tipo);
}

/** Arma el payload del generador desde una remisión del Core y sus derivados. */
export function construirDatosPdf(remision: RemisionBlend): BlendRemisionData {
  const transportista = persona(remision.personas, TIPO_PERSONA.transportista);
  // Quien se lleva el pedido es personal del cliente, elegido de su nómina en el
  // despacho: es él mismo quien recibe. Antes el receptor se registraba al firmar
  // en la página pública; sin ella (2026-10-02) ninguna remisión nueva tiene uno,
  // y el documento salía sin la casilla de recepción que se firma en papel.
  const receptorRegistrado = persona(remision.personas, TIPO_PERSONA.receptor);
  const receptor = receptorRegistrado ?? transportista;
  // Y si recibe quien se lo lleva, lo recibió al cargarlo en la planta: la fecha
  // de recepción es la del despacho. "Pendiente" sugería una entrega por venir
  // que no existe.
  const fechaRecibido =
    remision.fechaRecibido ||
    (!receptorRegistrado && transportista
      ? remision.fechaDespacho || remision.fechaRemision
      : undefined);

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

    kg_total: remision.kgTotal,
    co2_secuestrado_kg: remision.co2SecuestradoKg,

    // Quien entrega es el responsable de planta; la cédula que tiene el Core es
    // la del transportista, y va en su propia tarjeta. Juntarlas hacía decir al
    // documento "Santiago Amaya" con la cédula del conductor.
    responsable_entrega: remision.responsableEntrega,
    transportista: transportista?.cedula
      ? { nombre: transportista.nombre, cedula: transportista.cedula }
      : undefined,
    receptor: receptor?.cedula ? { nombre: receptor.nombre, cedula: receptor.cedula } : undefined,
    fecha_recibido: fechaRecibido || undefined,

    estado: remision.estado,
    // `crearRemision()` arma las notas como `[marcas…] Biochar Blend — <obs>`:
    // las marcas son la trazabilidad que lee la app y "Biochar Blend" la etiqueta
    // del tipo. Al cliente solo le corresponde lo que escribió el operador.
    observaciones: remision.notas.split(' — ').slice(1).join(' — ').trim() || undefined,
  };
}

// src/lib/recepcion/fixtures.ts
//
// Remisiones y personas de mentira para recorrer la recepción pública de punta a
// punta —en el celular, con el QR impreso— sin tocar Airtable ni mandar correos.
//
// Solo con `RECEPCION_FIXTURES=1` y FUERA de producción: en producción la variable
// se ignora, porque estas dependencias aceptan un secreto de prueba que está
// escrito aquí (con él cualquiera firmaría enlaces, pero solo para estos record
// IDs, que no existen en ninguna base).
//
// Sin imports de `*.server.ts`, a propósito: lo usa también
// `scripts/ensayar-recepcion.ts`, que corre fuera de Next. El envío real llega
// inyectado y solo se usa cuando el modo del entorno ya es `simular`.
//
// Datos inventados: cédulas 99000001…, dominios `example.com` (reservados).

import { co2Secuestrado, composicionDeDespacho, lotesDeNotas, type RemisionBlend } from '../blend-remisiones-core';
import { generarPdfRemision } from '../blend-remision-pdf';
import { resolverModoCorreo, type CorreoSaliente, type ResultadoEnvio } from '../correo/graph';
import { fechaBogota, finDelDiaBogotaSeg, sumarDiasFecha } from '../fecha-bogota';
import type { PersonaCliente } from '../personal-cliente-core';
import type { PersonaRemision } from '../remisiones-core';
import {
  bachesDeNotas,
  conMarca,
  correoDeNotas,
  esEstadoRecibible,
  idDespachoDeNotas,
  kgRemitidoDeRemision,
  NOMBRE_PRODUCTO,
  recibidaDeNotas,
  tipoRemision,
  type RemisionCruda,
} from '../remision-pirolisis.constants';
import { secretoValido } from '../sesion-firma';
import { candidatosReceptor, invalidarCandidatos, type FuentesIdentidad } from './identidad';
import { firmarTokenRecepcion, verificarTokenRecepcion, VIGENCIA_MAXIMA_SEG } from './token';
import type { DepsRecepcion } from './recepcion';

/** Solo para fixtures y fuera de producción. Público a propósito: no protege nada real. */
export const SECRETO_FIXTURES = 'fixtures-recepcion-piroliapp-solo-desarrollo-0001';

export function fixturesHabilitados(): boolean {
  return process.env.RECEPCION_FIXTURES === '1' && process.env.NODE_ENV !== 'production';
}

export const FIXTURE_IDS = {
  blendPendiente: 'recFIXTURE0000001',
  biocharEnTransito: 'recFIXTURE0000002',
  entregada: 'recFIXTURE0000003',
  cancelada: 'recFIXTURE0000004',
} as const;

const CLIENTE = { id: 'CL-9001', nombre: 'FINCA DE PRUEBA S.A.S.' };
const AREA = { id: 'AC-9001', nombre: 'Sanidad' };

/** Cédulas de las personas conocidas, para probar el camino «conocida». */
export const CEDULAS_FIXTURES = {
  transportista: '99000001',
  receptorPrevio: '99000002',
  personalConCorreo: '99000003',
  personalSinCorreo: '99000004',
} as const;

function personasIniciales(): PersonaRemision[] {
  return [
    {
      recordId: 'recFIXPERSONA0001',
      codigo: 'PER-REM-F001',
      nombre: 'Pedro Prueba Ejemplo',
      tipo: 'Transportista',
      cedula: CEDULAS_FIXTURES.transportista,
      email: '',
      telefono: '+57 3000000001',
    },
    {
      recordId: 'recFIXPERSONA0002',
      codigo: 'PER-REM-F002',
      nombre: 'Ana Ensayo Muestra',
      tipo: 'Receptor',
      cedula: CEDULAS_FIXTURES.receptorPrevio,
      email: 'ana.ensayo@example.com',
      telefono: '+57 3000000002',
    },
  ];
}

const PERSONAL_CLIENTE: PersonaCliente[] = [
  {
    recordId: 'recFIXPERSONAL001',
    codigo: 'PER-9001',
    nombre: 'Carlos Simulado Ficticio',
    cedula: CEDULAS_FIXTURES.personalConCorreo,
    cargo: 'Jefe de bodega',
    email: 'carlos.simulado@example.com',
    emailNotificacion: 'carlos.simulado@example.com',
    telefono: '+57 3000000003',
  },
  {
    recordId: 'recFIXPERSONAL002',
    codigo: 'PER-9002',
    nombre: 'Diana Sin Correo',
    cedula: CEDULAS_FIXTURES.personalSinCorreo,
    cargo: 'Auxiliar',
    email: '',
    emailNotificacion: '',
    telefono: '',
  },
];

function remisionesIniciales(hoy: string): RemisionCruda[] {
  const base = {
    areaOrigen: 'Producción',
    idPedido: 'SIRIUS-PED-9001',
    idCliente: CLIENTE.id,
    idAreaCliente: AREA.id,
    fechaDespacho: hoy,
    fechaRecibido: '',
    documentos: [] as string[],
  };
  return [
    {
      ...base,
      recordId: FIXTURE_IDS.blendPendiente,
      codigo: 'SIRIUS-REM-9001',
      numeracion: 8903,
      estado: 'Pendiente',
      notas: '[lote:BLEND-2026-10-20-FIX] Biochar Blend — Entrega de prueba, bultos de 50 kg',
      kgRollup: 1000,
      personasIds: ['recFIXPERSONA0001'],
    },
    {
      ...base,
      recordId: FIXTURE_IDS.biocharEnTransito,
      codigo: 'SIRIUS-REM-9002',
      numeracion: 8904,
      estado: 'En Tránsito',
      notas: '[bache:S-09001=250.00] [bache:S-09002=150.50] Biochar',
      kgRollup: 401,
      personasIds: ['recFIXPERSONA0001'],
    },
    {
      ...base,
      recordId: FIXTURE_IDS.entregada,
      codigo: 'SIRIUS-REM-9003',
      numeracion: 8905,
      estado: 'Entregada',
      notas: '[bache:S-09003=300.00] [recibida:2026-10-01T15:04:00.000Z] Biochar',
      kgRollup: 300,
      fechaRecibido: '2026-10-01',
      personasIds: ['recFIXPERSONA0001', 'recFIXPERSONA0002'],
    },
    {
      ...base,
      recordId: FIXTURE_IDS.cancelada,
      codigo: 'SIRIUS-REM-9004',
      numeracion: 8906,
      estado: 'Cancelada',
      notas: '[lote:BLEND-2026-10-19-FIX] Biochar Blend',
      kgRollup: 500,
      personasIds: [],
    },
  ];
}

interface AlmacenFixtures {
  remisiones: Map<string, RemisionCruda>;
  personas: Map<string, PersonaRemision>;
  documentos: Map<string, { nombre: string; bytes: Uint8Array }>;
  autorizaciones: Array<{ remision: string; datos: string[]; instante: string }>;
  contador: number;
}

/**
 * En `globalThis`: Next carga el módulo una vez por bundle de ruta, y sin esto
 * `consultar` y `confirmar` verían almacenes distintos.
 */
const LLAVE = Symbol.for('piroliapp.recepcion.fixtures');

function almacen(): AlmacenFixtures {
  const g = globalThis as unknown as Record<symbol, AlmacenFixtures | undefined>;
  return (g[LLAVE] ??= nuevoAlmacen());
}

function nuevoAlmacen(): AlmacenFixtures {
  const hoy = fechaBogota(new Date());
  return {
    remisiones: new Map(remisionesIniciales(hoy).map((r) => [r.recordId, r])),
    personas: new Map(personasIniciales().map((p) => [p.recordId, p])),
    documentos: new Map(),
    autorizaciones: [],
    contador: 0,
  };
}

/** Vuelve al estado inicial (para recorrer el flujo otra vez sin reiniciar el servidor). */
export function reiniciarFixtures(): void {
  const g = globalThis as unknown as Record<symbol, AlmacenFixtures | undefined>;
  g[LLAVE] = nuevoAlmacen();
  for (const id of Object.values(FIXTURE_IDS)) invalidarCandidatos(id);
}

/** Las remisiones de fixtures, tal como están ahora. */
export function remisionesFixtures(): RemisionCruda[] {
  return [...almacen().remisiones.values()].map((r) => ({ ...r }));
}

function secretosFixtures(): string[] {
  const real = process.env.RECEPCION_SECRET?.trim();
  return secretoValido(real) ? [real, SECRETO_FIXTURES] : [SECRETO_FIXTURES];
}

/**
 * Token de una remisión de fixtures que vence `dias` días después de hoy (en
 * Bogotá). Con `dias` negativo sale un enlace ya vencido, para probar el 410.
 */
export function tokenFixture(recordId: string, ahora: Date = new Date(), dias = 7): string {
  const vence = sumarDiasFecha(fechaBogota(ahora), dias);
  return firmarTokenRecepcion(recordId, finDelDiaBogotaSeg(vence), secretosFixtures()[0]);
}

function leerFixture(idOCodigo: string): RemisionCruda | null {
  const a = almacen();
  const r = a.remisiones.get(idOCodigo) ?? [...a.remisiones.values()].find((x) => x.codigo === idOCodigo);
  return r ? { ...r, personasIds: [...r.personasIds], documentos: [...r.documentos] } : null;
}

function personasFixture(ids: string[]): PersonaRemision[] {
  const a = almacen();
  return ids.map((id) => a.personas.get(id)).filter((p): p is PersonaRemision => Boolean(p)).map((p) => ({ ...p }));
}

const FUENTES_FIXTURES: FuentesIdentidad = {
  leerPersonas: async (ids) => personasFixture(ids),
  remisionesDelCliente: async (idCliente) => remisionesFixtures().filter((r) => r.idCliente === idCliente),
  personalCliente: async (idCliente) => (idCliente === CLIENTE.id ? PERSONAL_CLIENTE.map((p) => ({ ...p })) : []),
};

/** La remisión con sus derivados, armada en memoria como lo haría `resolverRemision`. */
export function remisionBlendFixture(idOCodigo: string): RemisionBlend | null {
  const r = leerFixture(idOCodigo);
  if (!r) return null;
  const tipo = tipoRemision(r) ?? 'ajena';
  const kgTotal = kgRemitidoDeRemision(r)?.kg ?? r.kgRollup;
  const lotes = tipo === 'blend' ? lotesDeNotas(r.notas, kgTotal) : [];
  const bachesRemitidos = tipo === 'biochar' ? bachesDeNotas(r.notas) : [];
  const composicion =
    tipo === 'blend'
      ? composicionDeDespacho(kgTotal)
      : { biochar: tipo === 'biochar' ? kgTotal : 0, abono: 0, agua: 0, biologicos: 0 };
  return {
    recordId: r.recordId,
    codigo: r.codigo,
    estado: r.estado,
    idPedido: r.idPedido,
    idCliente: r.idCliente,
    clienteNombre: CLIENTE.nombre,
    idAreaCliente: r.idAreaCliente,
    areaClienteNombre: AREA.nombre,
    lote: lotes.map((l) => l.lote).join(', '),
    lotes,
    kgTotal,
    fechaRemision: r.fechaDespacho,
    fechaDespacho: r.fechaDespacho,
    fechaRecibido: r.fechaRecibido,
    responsableEntrega: 'Responsable de Prueba',
    documentoUrl: '',
    notas: r.notas,
    personas: personasFixture(r.personasIds),
    tipo,
    productoId: '',
    productoNombre: tipo === 'ajena' ? '' : NOMBRE_PRODUCTO[tipo],
    idDespacho: idDespachoDeNotas(r.notas),
    bachesRemitidos,
    recibidaEn: recibidaDeNotas(r.notas),
    correoEnviadoEn: correoDeNotas(r.notas),
    documentos: r.documentos,
    composicion,
    co2SecuestradoKg: co2Secuestrado(composicion.biochar),
    baches: bachesRemitidos.map((b) => ({ codigo: b.bache, kg: b.kg, bacheId: '' })),
  };
}

function guardar(r: RemisionCruda): void {
  almacen().remisiones.set(r.recordId, r);
}

/**
 * Las dependencias de la recepción servidas desde memoria.
 *
 * @param enviarReal el envío de verdad; solo se llama si el modo del entorno ya es
 *   `simular` (así `CORREO_GUARDAR_EN` deja el HTML y el PDF para revisarlos).
 *   Con cualquier otro modo el correo se simula aquí: un fixture nunca sale a la red.
 */
export function crearDepsFixtures(enviarReal?: (c: CorreoSaliente) => Promise<ResultadoEnvio>): DepsRecepcion {
  return {
    ahora: () => new Date(),
    verificarToken: (t, a) => verificarTokenRecepcion(t, secretosFixtures(), Math.floor(a.getTime() / 1000), VIGENCIA_MAXIMA_SEG),
    leerRemision: async (id) => leerFixture(id),
    leerPersonas: async (ids) => personasFixture(ids),
    candidatos: (r) => candidatosReceptor(r, FUENTES_FIXTURES),
    invalidarCandidatos,
    nombreCliente: async (id) => (id === CLIENTE.id ? CLIENTE.nombre : id),
    nombreArea: async (id) => (id === AREA.id ? AREA.nombre : null),
    autorizacionesConfiguradas: () => true,
    registrarAutorizacion: async (e) => {
      almacen().autorizaciones.push({ remision: e.remision, datos: e.datos, instante: e.instante.toISOString() });
      return { step: 'autorizacion_datos', ok: true, detail: { fixture: true } };
    },
    crearPersona: async (p) => {
      const a = almacen();
      a.contador++;
      const n = String(a.contador).padStart(6, '0');
      const recordId = `recFIXNUEVA${n}`;
      a.personas.set(recordId, {
        recordId,
        codigo: `PER-REM-N${n}`,
        nombre: p.nombre,
        tipo: p.tipo,
        cedula: p.cedula,
        email: p.correo ?? '',
        telefono: p.telefono ?? '',
      });
      return recordId;
    },
    completarCorreo: async (recordId, correo) => {
      const p = almacen().personas.get(recordId);
      if (!p || p.email) return false;
      p.email = correo;
      return true;
    },
    marcarEntregada: async (i) => {
      const antes = leerFixture(i.recordId);
      if (!antes) throw new Error('La remisión de fixture no existe');
      if (antes.estado === 'Entregada') return { resultado: 'ya-entregada', remision: antes };
      if (!esEstadoRecibible(antes.estado)) return { resultado: 'no-recibible', remision: antes };
      const despues: RemisionCruda = {
        ...antes,
        estado: 'Entregada',
        fechaRecibido: i.fecha,
        personasIds: [...new Set([...antes.personasIds, i.receptorId])],
        notas: conMarca(antes.notas, i.marca),
      };
      guardar(despues);
      return { resultado: 'ok', remision: { ...despues } };
    },
    resolverRemision: async (id) => remisionBlendFixture(id),
    generarPdf: (r) => generarPdfRemision(r),
    adjuntar: async (recId, bytes, nombre) => {
      const r = leerFixture(recId);
      if (!r) throw new Error('La remisión de fixture no existe');
      almacen().documentos.set(recId, { nombre, bytes });
      guardar({ ...r, documentos: [nombre] });
    },
    descargarDocumento: async (recId, sufijo) => {
      const d = almacen().documentos.get(recId);
      return d && d.nombre.endsWith(sufijo) ? d.bytes : null;
    },
    enviarCorreo: async (c) => {
      if (enviarReal && resolverModoCorreo(process.env).modo === 'simular') return enviarReal(c);
      return { modo: 'simular', enviado: false, destinatarios: c.para.length + (c.cc?.length ?? 0), intentos: 0 };
    },
    marcarCorreo: async (recId, marca) => {
      const r = leerFixture(recId);
      if (r) guardar({ ...r, notas: conMarca(r.notas, marca) });
    },
  };
}

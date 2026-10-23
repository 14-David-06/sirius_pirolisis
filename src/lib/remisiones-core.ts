// src/lib/remisiones-core.ts
//
// Acceso a Sirius Remisiones Core sin atarse a un producto.
//
// ═══ POR QUÉ ESTE MÓDULO ══════════════════════════════════════════════════════
// Hasta el 2026-10-21 todo el acceso a Remisiones Core vivía en
// `blend-remisiones-core.ts`, porque la única remisión que emitía PiroliApp era la
// del Blend. Con el despacho comercial de biochar puro y la recepción por enlace
// aparecen tres consumidores más (despacho de biochar, recepción pública, panel de
// remisiones) que necesitan el documento, sus personas y su estado, pero NO la
// composición ni los lotes del Blend. Lo genérico vive aquí y
// `blend-remisiones-core.ts` lo reexporta con los mismos nombres, así que ningún
// importador existente cambia.
//
// ═══ LA TABLA ES COMPARTIDA ═══════════════════════════════════════════════════
// En `Remisiones` conviven las del laboratorio (DataLab, `Area Origen =
// Laboratorio`, 14 de ellas en `Borrador`) y las de PiroliApp (`Producción` +
// marcas `[lote:]`/`[bache:]`). Toda lectura que OPERE con remisiones de PiroliApp
// filtra por `tipoRemision()`: el área sola no basta y las marcas solas tampoco.
//
// ⚠️ Esta base se accede por NOMBRE de campo (la API devuelve `fields` por nombre).

import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import {
  AREA_ORIGEN_PIROLISIS,
  conMarca,
  esEstadoRecibible,
  idDespachoDeNotas,
  marcaDespacho,
  recibidaDeNotas,
  remisionCrudaDeRegistro,
  tipoRemision,
  type RemisionCruda,
} from './remision-pirolisis.constants';
import { esCorreoValido, normalizarCedula, normalizarCorreo } from './recepcion/datos-personales';
import type { StepResult } from '@/types/step-result';

export const AT = 'https://api.airtable.com/v0';

/** Airtable acepta como máximo 10 registros por POST, PATCH o DELETE. */
const LOTE_ESCRITURA = 10;
/** Un `OR(RECORD_ID()=…)` de 50 términos cabe holgado en la URL. */
const LOTE_LECTURA = 50;

/** Estados de `Remisiones.Estado` en el Core. Mandar otro valor devuelve 422. */
export const ESTADO_REMISION = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  enTransito: 'En Tránsito',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
} as const;

/** `Personas.Tipo de Usuario` en el Core. */
export const TIPO_PERSONA = {
  transportista: 'Transportista',
  receptor: 'Receptor',
} as const;

/** `Personas.Base Origen` de lo que registra PiroliApp. */
export const BASE_ORIGEN_PIROLIAPP = 'PiroliApp (Pirolisis)';

export interface PersonaRemision {
  recordId: string;
  codigo: string;
  nombre: string;
  tipo: string;
  cedula: string;
  email: string;
  telefono: string;
}

export interface RegistroAirtable {
  id: string;
  fields: Record<string, unknown>;
}

/**
 * Error de la API de Airtable con su status HTTP. El mensaje es el de siempre
 * (`Airtable <método> <status>: <json>`); el status permite distinguir un 404
 * ("no existe") de una lectura caída sin parsear el texto.
 */
export class ErrorAirtable extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje);
    this.name = 'ErrorAirtable';
  }
}

export function remisionesCoreConfig() {
  const baseId = config.airtable.remisionesCoreBaseId;
  const token = config.airtable.remisionesCoreToken;
  const remisionesTable = config.airtable.remisionesCoreRemisionesTable;
  const productosTable = config.airtable.remisionesCoreProductosTable;
  const personasTable = config.airtable.remisionesCorePersonasTable;

  if (!baseId || !token || !remisionesTable) {
    throw new Error(
      'Configuración de Sirius Remisiones Core incompleta: faltan ' +
        'AIRTABLE_BASE_ID_SIRIUS_REMISIONES_CORE, AIRTABLE_API_KEY_SIRIUS_REMISIONES_CORE ' +
        'o AIRTABLE_TABLE_REMISIONES'
    );
  }
  return { baseId, token, remisionesTable, productosTable, personasTable };
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function atRemisiones(url: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, headers: headers(token) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ErrorAirtable(
      `Airtable ${init.method ?? 'GET'} ${res.status}: ${JSON.stringify(data)}`,
      res.status
    );
  }
  return data;
}

export async function atAllRemisiones(
  baseId: string,
  table: string,
  token: string,
  params: Record<string, string> = {}
): Promise<RegistroAirtable[]> {
  const out: RegistroAirtable[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${AT}/${baseId}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await atRemisiones(url.toString(), token);
    out.push(...((data.records ?? []) as RegistroAirtable[]));
    offset = data.offset;
  } while (offset);
  return out;
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function enLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function orRecordIds(ids: string[]): string {
  return `OR(${ids.map((id) => `RECORD_ID() = '${escapeAirtableValue(id)}'`).join(', ')})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clientes (Clients Core, solo lectura)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nombre comercial de un cliente a partir de su código `CL-XXXX`.
 * Devuelve el propio código si no se puede resolver: es mejor mostrar `CL-0003`
 * que una cadena vacía en el PDF de una remisión.
 */
export async function nombreCliente(idCliente: string): Promise<string> {
  const { clientesBaseId, clientesTableId, clientesToken } = config.airtable;
  if (!idCliente || !clientesBaseId || !clientesTableId || !clientesToken) return idCliente;

  try {
    // En Clients Core el campo primario `ID` es la fórmula CL-XXXX y el nombre
    // comercial vive en `Cliente`.
    const params = new URLSearchParams({
      filterByFormula: `{ID} = '${escapeAirtableValue(idCliente)}'`,
      maxRecords: '1',
    });
    const data = await atRemisiones(
      `${AT}/${clientesBaseId}/${clientesTableId}?${params.toString()}`,
      clientesToken
    );
    const nombre = data.records?.[0]?.fields?.['Cliente'];
    if (typeof nombre === 'string' && nombre.trim()) return nombre.trim();
  } catch (err) {
    console.warn(`⚠️ No se pudo resolver el nombre del cliente ${idCliente}:`, err);
  }
  return idCliente;
}

/**
 * Nombre EXACTO del cliente y su distancia a la bodega.
 *
 * A diferencia de `nombreCliente()`, LANZA si no puede resolverlo: el despacho
 * de biochar escribe ese nombre en `Remisiones Baches Pirolisis.Cliente`, y eUse
 * cruza esa fila con Clients Core por el nombre (`EUseCalculator.ts`). Caer al
 * código `CL-XXXX` ahí haría que eUse lance meses después, lejos de la causa.
 * `distanciaKm` null = el cliente no la tiene, que eUse tampoco tolera (el plan
 * del despacho lo advierte).
 */
export async function datosCliente(
  idCliente: string
): Promise<{ nombre: string; distanciaKm: number | null }> {
  const { clientesBaseId, clientesTableId, clientesToken } = config.airtable;
  if (!clientesBaseId || !clientesTableId || !clientesToken) {
    throw new Error('Sirius Clients Core no configurado: AIRTABLE_CLIENTES_BASE_ID / AIRTABLE_CLIENTES_TABLE_ID');
  }
  if (!idCliente) throw new Error('Falta el código del cliente');

  const params = new URLSearchParams({
    filterByFormula: `{ID} = '${escapeAirtableValue(idCliente)}'`,
    maxRecords: '1',
  });
  const data = await atRemisiones(
    `${AT}/${clientesBaseId}/${clientesTableId}?${params.toString()}`,
    clientesToken
  );
  const f = data.records?.[0]?.fields as Record<string, unknown> | undefined;
  const nombre = typeof f?.['Cliente'] === 'string' ? (f['Cliente'] as string).trim() : '';
  if (!nombre) throw new Error(`El cliente ${idCliente} no existe en Sirius Clients Core`);

  const d = f?.['distancia_bodega_km'];
  const distancia = typeof d === 'number' ? d : typeof d === 'string' && d.trim() ? Number(d) : NaN;
  return { nombre, distanciaKm: Number.isFinite(distancia) ? distancia : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Remisiones crudas (sin derivados)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Una remisión por record ID o por código `SIRIUS-REM-XXXX`, sin derivados.
 *
 * Null si no existe; LANZA si la lectura falla. La diferencia importa: quien
 * despacha o recibe no puede tomar "Airtable no respondió" por "no hay remisión"
 * y crear otra.
 */
export async function leerRemisionCruda(idOCodigo: string): Promise<RemisionCruda | null> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  if (!idOCodigo) return null;

  if (esRecordId(idOCodigo)) {
    try {
      const data = await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${idOCodigo}`, token);
      return remisionCrudaDeRegistro(data as RegistroAirtable);
    } catch (err) {
      if (err instanceof ErrorAirtable && err.status === 404) return null;
      throw err;
    }
  }

  const params = new URLSearchParams({
    filterByFormula: `{ID} = '${escapeAirtableValue(idOCodigo)}'`,
    maxRecords: '1',
  });
  const data = await atRemisiones(`${AT}/${baseId}/${remisionesTable}?${params.toString()}`, token);
  const rec = data.records?.[0];
  return rec ? remisionCrudaDeRegistro(rec as RegistroAirtable) : null;
}

/**
 * Remisiones crudas filtradas, ordenadas por `numeracion` (la más vieja primero).
 *
 * La fórmula acota lo que viaja; el filtro que MANDA se repite en JS sobre las
 * marcas ya parseadas, porque `FIND` busca en todas las notas —también después
 * de « — », donde escribe el operador— y una fórmula no sabe de eso.
 *
 * @param f.soloPirolisis solo las de PiroliApp (`tipoRemision()` no nulo)
 * @param f.marcaDespacho solo la(s) del despacho con esa llave `[desp:<uuid>]`
 */
export async function listarRemisionesCrudas(f: {
  soloPirolisis?: boolean;
  pedido?: string;
  cliente?: string;
  marcaDespacho?: string;
} = {}): Promise<RemisionCruda[]> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  const notas = '{Notas de Remisión}';

  const condiciones: string[] = [];
  if (f.soloPirolisis) {
    condiciones.push(`{Area Origen} = '${escapeAirtableValue(AREA_ORIGEN_PIROLISIS)}'`);
    condiciones.push(`OR(FIND('[lote:', ${notas}), FIND('[bache:', ${notas}))`);
  }
  if (f.pedido) condiciones.push(`{ID Pedido} = '${escapeAirtableValue(f.pedido)}'`);
  if (f.cliente) condiciones.push(`{ID Cliente} = '${escapeAirtableValue(f.cliente)}'`);
  if (f.marcaDespacho !== undefined) {
    // `marcaDespacho()` lanza si no es un UUID v4: una llave mal formada no puede
    // terminar en una fórmula ni "no encontrar" su remisión y crear otra.
    condiciones.push(`FIND('${escapeAirtableValue(marcaDespacho(f.marcaDespacho))}', ${notas})`);
  }

  const params: Record<string, string> = {};
  if (condiciones.length === 1) params.filterByFormula = condiciones[0];
  else if (condiciones.length > 1) params.filterByFormula = `AND(${condiciones.join(', ')})`;

  const registros = await atAllRemisiones(baseId, remisionesTable, token, params);
  return registros
    .map(remisionCrudaDeRegistro)
    .filter((r) => !f.soloPirolisis || tipoRemision(r) !== null)
    .filter((r) => f.marcaDespacho === undefined || idDespachoDeNotas(r.notas) === f.marcaDespacho)
    .sort((a, b) => a.numeracion - b.numeracion);
}

// ─────────────────────────────────────────────────────────────────────────────
// Emisión del documento
// ─────────────────────────────────────────────────────────────────────────────

export interface EmitirRemisionInput {
  /**
   * `Borrador` para el despacho de biochar: el documento existe (y reserva su
   * consecutivo) antes de escribir inventario, y solo se activa cuando las dos
   * vistas del biochar quedaron escritas. El Blend sale activo directamente.
   */
  estado: 'Borrador' | 'Pendiente' | 'En Tránsito';
  notas: string;
  productos: Array<{ productoId: string; kg: number; notas: string }>;
  idCliente: string;
  idPedido: string;
  idAreaCliente?: string;
  responsableEntrega: string;
  /** `YYYY-MM-DD` en Bogotá. */
  fechaDespacho: string;
}

export interface EmitirRemisionResult {
  ok: boolean;
  remisionRecordId: string | null;
  productoIds: string[];
  steps: StepResult[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Crea la remisión y sus `Productos Remitidos`. Pasos CRÍTICOS `remision` y
 * `producto_remitido`.
 *
 * Sin productos `Total Cantidad Remitida` queda en 0, que es de donde sale la
 * cantidad del Blend en todo lo demás: si la fila falla se borra la remisión
 * (y lo que alcanzó a crearse de productos) para no dejar un documento por 0 kg.
 * Los productos van en lotes de 10, el máximo de Airtable por POST.
 */
export async function emitirDocumentoRemision(i: EmitirRemisionInput): Promise<EmitirRemisionResult> {
  const steps: StepResult[] = [];
  const fallo = (step: string, error: string): EmitirRemisionResult => ({
    ok: false,
    remisionRecordId: null,
    productoIds: [],
    steps: [...steps, { step, ok: false, error }],
  });

  const estados: readonly string[] = [ESTADO_REMISION.borrador, ESTADO_REMISION.pendiente, ESTADO_REMISION.enTransito];
  if (!estados.includes(i.estado)) return fallo('remision', `Estado inicial no válido: "${i.estado}"`);
  if (!i.productos.length || i.productos.some((p) => !p.productoId || !(p.kg > 0))) {
    return fallo('remision', 'La remisión necesita al menos un producto con kg mayores que 0');
  }

  let cfg: ReturnType<typeof remisionesCoreConfig>;
  try {
    cfg = remisionesCoreConfig();
  } catch (err) {
    return fallo('remision', mensaje(err));
  }
  const { baseId, token, remisionesTable, productosTable } = cfg;

  const remisionFields: Record<string, unknown> = {
    'Area Origen': AREA_ORIGEN_PIROLISIS,
    Estado: i.estado,
    'Notas de Remisión': i.notas,
    'ID Cliente': i.idCliente,
    'ID Pedido': i.idPedido,
    ...(i.idAreaCliente ? { 'ID Area Cliente': i.idAreaCliente } : {}),
    'Responsable Entrega': i.responsableEntrega,
    'Fecha Pedido Despachado': i.fechaDespacho,
  };

  let remisionRecordId: string;
  try {
    const creada = await atRemisiones(`${AT}/${baseId}/${remisionesTable}`, token, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: remisionFields }] }),
    });
    remisionRecordId = creada.records?.[0]?.id as string;
    if (!remisionRecordId) throw new Error('Airtable no devolvió el ID de la remisión creada');
    steps.push({ step: 'remision', ok: true, detail: { remisionRecordId } });
  } catch (err) {
    return fallo('remision', mensaje(err));
  }

  const borrar = async (productoIds: string[]) => {
    await descartarRemision(remisionRecordId, productoIds).catch((err) => {
      console.error(`❌ No se pudo descartar la remisión ${remisionRecordId} a medias:`, mensaje(err));
    });
  };

  if (!productosTable) {
    await borrar([]);
    return fallo('producto_remitido', 'AIRTABLE_TABLE_PRODUCTOS_REMITIDOS no configurado');
  }

  const productoIds: string[] = [];
  try {
    for (const lote of enLotes(i.productos, LOTE_ESCRITURA)) {
      const res = await atRemisiones(`${AT}/${baseId}/${productosTable}`, token, {
        method: 'POST',
        body: JSON.stringify({
          records: lote.map((p) => ({
            fields: {
              'ID Producto': p.productoId,
              Cantidad: r2(p.kg),
              Unidad: 'Kg',
              'Remisión vinculada': [remisionRecordId],
              Notas: p.notas,
            },
          })),
        }),
      });
      productoIds.push(...((res.records ?? []) as RegistroAirtable[]).map((r) => r.id));
    }
    steps.push({ step: 'producto_remitido', ok: true, detail: { productoIds } });
  } catch (err) {
    await borrar(productoIds);
    return fallo('producto_remitido', mensaje(err));
  }

  return { ok: true, remisionRecordId, productoIds, steps };
}

/**
 * Borra una remisión y sus productos remitidos. Para un documento que no llegó a
 * existir del todo: el producto falló, o un despacho duplicado perdió el chequeo
 * de líder. Nunca para una remisión con inventario escrito: esa se ANULA
 * (`Cancelada`), porque las Salidas del Core la nombran.
 *
 * Primero los productos y después la remisión: al revés, un fallo dejaría filas
 * de producto huérfanas sumando en ningún documento.
 */
export async function descartarRemision(remisionRecordId: string, productoIds: string[]): Promise<void> {
  const { baseId, token, remisionesTable, productosTable } = remisionesCoreConfig();
  if (productoIds.length && productosTable) {
    for (const lote of enLotes(productoIds, LOTE_ESCRITURA)) {
      const q = new URLSearchParams();
      for (const id of lote) q.append('records[]', id);
      await atRemisiones(`${AT}/${baseId}/${productosTable}?${q.toString()}`, token, { method: 'DELETE' });
    }
  }
  await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, { method: 'DELETE' });
}

/**
 * `Borrador` → `Pendiente` o `En Tránsito`. Paso `activar`.
 *
 * Solo desde Borrador: activar es lo que le dice al resto del ecosistema que el
 * inventario ya está escrito en las dos vistas. Si ya estaba activa es un
 * reintento (`skipped`); una Cancelada o Entregada no se toca.
 */
export async function activarRemision(
  recordId: string,
  estado: 'Pendiente' | 'En Tránsito'
): Promise<StepResult> {
  const step = 'activar';
  if (estado !== ESTADO_REMISION.pendiente && estado !== ESTADO_REMISION.enTransito) {
    return { step, ok: false, error: `Estado de activación no válido: "${estado}"` };
  }
  try {
    const actual = await leerRemisionCruda(recordId);
    if (!actual) return { step, ok: false, error: `La remisión ${recordId} no existe` };
    if (esEstadoRecibible(actual.estado)) {
      return { step, ok: true, skipped: true, detail: { estado: actual.estado } };
    }
    if (actual.estado !== ESTADO_REMISION.borrador) {
      return { step, ok: false, error: `La remisión ${actual.codigo} está ${actual.estado}: no se activa` };
    }
    const { baseId, token, remisionesTable } = remisionesCoreConfig();
    await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${recordId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Estado: estado } }),
    });
    return { step, ok: true, detail: { estado } };
  } catch (err) {
    return { step, ok: false, error: mensaje(err) };
  }
}

/** Cambia el estado de una remisión, validando contra los valores del Core. */
export async function cambiarEstado(remisionRecordId: string, estado: string): Promise<void> {
  const valores = Object.values(ESTADO_REMISION) as string[];
  if (!valores.includes(estado)) {
    throw new Error(`Estado "${estado}" no válido. Opciones: ${valores.join(', ')}`);
  }
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Estado: estado } }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Personas
// ─────────────────────────────────────────────────────────────────────────────

function personaDeRegistro(r: RegistroAirtable): PersonaRemision {
  const f = r.fields ?? {};
  return {
    recordId: r.id,
    codigo: String(f['Codigo Persona Remision'] ?? ''),
    nombre: String(f['Nombre Completo'] ?? ''),
    tipo: String(f['Tipo de Usuario'] ?? ''),
    cedula: String(f['Cedula'] ?? ''),
    email: String(f['Correo Electrónico'] ?? ''),
    telefono: String(f['Teléfono'] ?? ''),
  };
}

/**
 * Personas por record ID, una lectura por cada 50 (`OR(RECORD_ID()=…)`) y no una
 * por persona: son 5 req/s por base. Devuelve en el orden pedido; las que no
 * existen se omiten. LANZA si la lectura falla.
 */
export async function leerPersonas(ids: string[]): Promise<PersonaRemision[]> {
  const { baseId, token, personasTable } = remisionesCoreConfig();
  const unicos = [...new Set(ids.filter(esRecordId))];
  if (!personasTable || !unicos.length) return [];

  const porId = new Map<string, PersonaRemision>();
  for (const lote of enLotes(unicos, LOTE_LECTURA)) {
    const registros = await atAllRemisiones(baseId, personasTable, token, {
      filterByFormula: orRecordIds(lote),
    });
    for (const r of registros) porId.set(r.id, personaDeRegistro(r));
  }
  return unicos.map((id) => porId.get(id)).filter((p): p is PersonaRemision => Boolean(p));
}

/** Una persona por cada record ID, tolerando fallos sueltos (la usa el mapeo de la remisión). */
export async function personasDeRemision(recordIds: string[]): Promise<PersonaRemision[]> {
  try {
    return await leerPersonas(recordIds);
  } catch (err) {
    console.warn('⚠️ No se pudieron leer las personas de la remisión:', mensaje(err));
    return [];
  }
}

/**
 * La cédula del campo en su forma canónica, DENTRO de la fórmula.
 *
 * `Cedula` es texto libre y está escrita de todas las formas (`1.234.567`,
 * `1234567 `). Comparar el texto tal cual registraba dos veces a la misma
 * persona. Es la misma regla que `normalizarCedula()`; el resultado se vuelve a
 * comparar en JS, que es la fuente de verdad.
 */
function cedulaCanonicaEnFormula(campo = '{Cedula}'): string {
  let expr = `UPPER(TRIM(${campo} & ''))`;
  for (const c of ['.', ',', ' ', '-']) expr = `SUBSTITUTE(${expr}, '${c}', '')`;
  return expr;
}

/** Normalizada si se puede; si no, el texto recortado (como se guardaba antes). */
function cedulaParaGuardar(cedula: string): string {
  return normalizarCedula(cedula) ?? String(cedula ?? '').trim();
}

/**
 * Busca una persona por cédula y tipo, o la crea. Devuelve su record ID.
 *
 * La cédula se compara y se guarda NORMALIZADA, y va escapada en la fórmula: es
 * el caso que motiva `escapeAirtableValue`. `Remisiones Relacionadas` nunca se
 * escribe: es el inverso del link y se vincula desde la remisión.
 */
export async function buscarOCrearPersona(persona: {
  nombre: string;
  cedula: string;
  tipo: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  baseOrigen?: string;
  idOrigen?: string;
}): Promise<string | null> {
  const { baseId, token, personasTable } = remisionesCoreConfig();
  if (!personasTable) {
    console.warn('⚠️ AIRTABLE_TABLE_PERSONAS_REMISION no configurado: persona no registrada');
    return null;
  }
  if (!persona.cedula) return null;
  const cedula = cedulaParaGuardar(persona.cedula);
  if (!cedula) return null;

  const params = new URLSearchParams({
    filterByFormula: `AND(${cedulaCanonicaEnFormula()} = '${escapeAirtableValue(cedula)}', {Tipo de Usuario} = '${escapeAirtableValue(persona.tipo)}')`,
    maxRecords: '1',
  });
  const existente = await atRemisiones(`${AT}/${baseId}/${personasTable}?${params.toString()}`, token);
  if (existente.records?.length) return existente.records[0].id as string;

  const fields: Record<string, unknown> = {
    'Nombre Completo': persona.nombre,
    Cedula: cedula,
    'Tipo de Usuario': persona.tipo,
    'Base Origen': persona.baseOrigen || BASE_ORIGEN_PIROLIAPP,
  };
  if (persona.email) fields['Correo Electrónico'] = persona.email;
  if (persona.telefono) fields['Teléfono'] = persona.telefono;
  if (persona.direccion) fields['Dirección'] = persona.direccion;
  if (persona.idOrigen) fields['ID Origen'] = persona.idOrigen;

  const creada = await atRemisiones(`${AT}/${baseId}/${personasTable}`, token, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return (creada.records?.[0]?.id as string) ?? null;
}

/**
 * Crea SIEMPRE una persona nueva (sin buscar). Para la recepción, que ya buscó en
 * el alcance del cliente y decidió que hace falta una copia `Receptor` o una
 * persona nueva. LANZA si algo falla: es un paso crítico de quien la llama.
 *
 * El correo se valida antes: `Correo Electrónico` es un campo email y un valor
 * inválido devuelve 422, que tumba el POST completo.
 */
export async function crearPersonaRemision(p: {
  nombre: string;
  cedula: string;
  tipo: 'Receptor' | 'Transportista';
  correo?: string;
  telefono?: string;
  baseOrigen: string;
  idOrigen?: string;
}): Promise<string> {
  const { baseId, token, personasTable } = remisionesCoreConfig();
  if (!personasTable) throw new Error('AIRTABLE_TABLE_PERSONAS_REMISION no configurado');
  if (p.tipo !== TIPO_PERSONA.receptor && p.tipo !== TIPO_PERSONA.transportista) {
    throw new Error(`Tipo de persona no válido: "${p.tipo}"`);
  }
  const cedula = normalizarCedula(p.cedula);
  if (!cedula) throw new Error('Cédula inválida');
  const nombre = String(p.nombre ?? '').trim();
  if (!nombre) throw new Error('Falta el nombre');
  if (p.correo && !esCorreoValido(p.correo)) throw new Error('Correo inválido');

  const fields: Record<string, unknown> = {
    'Nombre Completo': nombre,
    Cedula: cedula,
    'Tipo de Usuario': p.tipo,
    'Base Origen': p.baseOrigen,
  };
  if (p.correo) fields['Correo Electrónico'] = normalizarCorreo(p.correo);
  if (p.telefono) fields['Teléfono'] = p.telefono;
  if (p.idOrigen) fields['ID Origen'] = p.idOrigen;

  const creada = await atRemisiones(`${AT}/${baseId}/${personasTable}`, token, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const id = creada.records?.[0]?.id as string | undefined;
  if (!id) throw new Error('Airtable no devolvió el ID de la persona creada');
  return id;
}

/**
 * Pone el correo a una persona SOLO si no tenía. Devuelve si lo escribió.
 *
 * Nunca reemplaza uno existente: quien recibe por enlace no se autentica más que
 * con la cédula, y dejarle cambiar el correo registrado de otra persona sería
 * dejarle desviar los comprobantes de esa persona.
 */
export async function completarCorreoPersona(recordId: string, correo: string): Promise<boolean> {
  if (!esCorreoValido(correo)) throw new Error('Correo inválido');
  const { baseId, token, personasTable } = remisionesCoreConfig();
  if (!personasTable) throw new Error('AIRTABLE_TABLE_PERSONAS_REMISION no configurado');

  const actual = await atRemisiones(`${AT}/${baseId}/${personasTable}/${recordId}`, token);
  const previo = String(actual.fields?.['Correo Electrónico'] ?? '').trim();
  if (previo) return false;

  await atRemisiones(`${AT}/${baseId}/${personasTable}/${recordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { 'Correo Electrónico': normalizarCorreo(correo) } }),
  });
  return true;
}

/** Añade personas al link de la remisión SIN borrar las ya vinculadas. */
export async function vincularPersonas(
  remisionRecordId: string,
  personaIds: string[]
): Promise<void> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  if (!personaIds.length) return;

  // El PATCH de un campo link REEMPLAZA el array: hay que releer y concatenar o se
  // pierde la persona que ya estaba vinculada.
  const actual = await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token);
  const previas: string[] = Array.isArray(actual.fields?.['Personas'])
    ? (actual.fields['Personas'] as string[])
    : [];
  const union = [...new Set([...previas, ...personaIds])];

  await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Personas: union } }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Recepción y marcas
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoEntrega = 'ok' | 'ya-entregada' | 'no-recibible' | 'carrera';

/**
 * Pasa la remisión a `Entregada` con quien la recibió, en UN solo PATCH.
 *
 * Un solo PATCH porque son cuatro campos que solo tienen sentido juntos (estado,
 * fecha, receptor y la marca `[recibida:ISO]` con la hora): partidos, un fallo
 * entre dos dejaría una remisión "Entregada" sin receptor, o con receptor y aún
 * recibible. `Personas` se relee y se UNE (el PATCH de un link reemplaza).
 *
 * Después se relee: si la marca no es la propia, otra confirmación ganó la
 * carrera (`carrera`) y quien llama NO debe mandar su correo.
 *
 * @param i.fecha `Fecha Recibido`, `YYYY-MM-DD` en Bogotá
 * @param i.marca `[recibida:<ISO>]` (de `marcaRecibida()`)
 */
export async function marcarRemisionEntregada(i: {
  recordId: string;
  receptorId: string;
  fecha: string;
  marca: string;
}): Promise<{ resultado: ResultadoEntrega; remision: RemisionCruda }> {
  const instante = recibidaDeNotas(i.marca);
  if (!instante) throw new Error('La marca de recepción debe ser [recibida:<ISO>]');
  if (!esRecordId(i.receptorId)) throw new Error('Receptor inválido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.fecha)) throw new Error('Fecha de recepción inválida');

  const antes = await leerRemisionCruda(i.recordId);
  if (!antes) throw new Error(`La remisión ${i.recordId} no existe`);
  if (antes.estado === ESTADO_REMISION.entregada) return { resultado: 'ya-entregada', remision: antes };
  if (!esEstadoRecibible(antes.estado)) return { resultado: 'no-recibible', remision: antes };

  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${i.recordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        Estado: ESTADO_REMISION.entregada,
        'Fecha Recibido': i.fecha,
        Personas: [...new Set([...antes.personasIds, i.receptorId])],
        'Notas de Remisión': conMarca(antes.notas, i.marca),
      },
    }),
  });

  const despues = await leerRemisionCruda(i.recordId);
  if (!despues) throw new Error(`La remisión ${i.recordId} desapareció tras marcarla`);
  const gano = recibidaDeNotas(despues.notas) === instante && despues.personasIds.includes(i.receptorId);
  return { resultado: gano ? 'ok' : 'carrera', remision: despues };
}

/**
 * Pone (o reemplaza) una marca de valor único en las notas, p. ej. `[correo:ISO]`.
 * Relee antes de escribir: las notas pueden haber cambiado desde que se leyeron.
 */
export async function agregarMarcaRemision(recordId: string, marca: string): Promise<void> {
  const actual = await leerRemisionCruda(recordId);
  if (!actual) throw new Error(`La remisión ${recordId} no existe`);
  const notas = conMarca(actual.notas, marca);
  if (notas === actual.notas) return;
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${recordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { 'Notas de Remisión': notas } }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Documento
// ─────────────────────────────────────────────────────────────────────────────

const CAMPO_DOCUMENTO = 'Documento Remision';

/**
 * Deja `bytes` como el ÚNICO archivo de `Documento Remision`.
 *
 * Por `uploadAttachment` (contenido en base64) y no por URL, para que el adjunto
 * no dependa de que exista la copia pública. Esa copia (`blend-remisiones/` del
 * bucket) se publica aparte al recibir: `publicarDocumentoRemision()`.
 *
 * `uploadAttachment` AGREGA al campo, así que lo que ya hubiera se quita DESPUÉS
 * de subir el nuevo: al revés, un fallo de la subida dejaría la remisión sin
 * ningún documento.
 */
export async function adjuntarDocumento(
  remisionRecordId: string,
  bytes: Uint8Array,
  nombreArchivo: string
): Promise<void> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  const campo = CAMPO_DOCUMENTO;

  const actual = await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token);
  const previos = new Set(
    ((actual.fields?.[campo] as { id: string }[] | undefined) ?? []).map((a) => a.id)
  );

  const subido = await atRemisiones(
    `https://content.airtable.com/v0/${baseId}/${remisionRecordId}/${encodeURIComponent(campo)}/uploadAttachment`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        contentType: 'application/pdf',
        filename: nombreArchivo,
        file: Buffer.from(bytes).toString('base64'),
      }),
    }
  );
  if (!previos.size) return;

  // La respuesta trae los adjuntos indexados por field ID, no por nombre.
  const adjuntos = Object.values(subido.fields ?? {}).find(
    (v): v is { id: string }[] => Array.isArray(v) && v.some((a) => a?.id && !previos.has(a.id))
  );
  const nuevos = (adjuntos ?? []).filter((a) => !previos.has(a.id));
  if (!nuevos.length) return;
  await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { [campo]: nuevos.map((a) => ({ id: a.id })) } }),
  });
}

/**
 * Escribe `URL Remision Generada`: el enlace público del PDF en S3, el mismo
 * campo que llenan las remisiones del laboratorio y que finanzas copia.
 */
export async function guardarUrlDocumento(remisionRecordId: string, url: string): Promise<void> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { 'URL Remision Generada': url } }),
  });
}

/**
 * Los bytes del adjunto de `Documento Remision` cuyo nombre termina en `sufijo`
 * (p. ej. `-recibida.pdf`), o null si no hay. Para reenviar el comprobante tal
 * como se archivó, sin regenerarlo.
 *
 * La URL del adjunto es firmada y temporal: se usa en el momento y no se guarda
 * ni se devuelve a nadie.
 */
export async function descargarDocumento(recordId: string, sufijo: string): Promise<Uint8Array | null> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();
  const actual = await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${recordId}`, token);
  const adjuntos = (actual.fields?.[CAMPO_DOCUMENTO] as Array<{ filename?: string; url?: string }> | undefined) ?? [];
  const elegido = [...adjuntos].reverse().find((a) => typeof a?.filename === 'string' && a.filename.endsWith(sufijo));
  if (!elegido?.url) return null;

  const res = await fetch(elegido.url);
  if (!res.ok) throw new Error(`No se pudo descargar el documento de la remisión (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

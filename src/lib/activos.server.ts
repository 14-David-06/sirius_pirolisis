import 'server-only';

import { config } from './config';
import { ACTIVOS_FIELD_IDS, ACTIVOS_TABLE_IDS } from './activos.fields';
import type {
  ActivoFijoRecord,
  ActivoNormalizado,
  AsignacionRecord,
  EstadoOperativo,
  TipoActivoOpcion,
  UbicacionOpcion,
} from '@/types/activos';

/**
 * Acceso a Sirius Activos Core desde el servidor.
 *
 * Concentra aquí lo que antes estaba copiado en cada ruta:
 *  - verificación de configuración,
 *  - paginación de Airtable (`offset`),
 *  - resolución de links a nombres legibles (tipos y ubicaciones),
 *  - normalización de un activo a claves planas para el cliente.
 *
 * Las rutas quedan como validación + llamada, y la forma de los datos que
 * consume la UI se define en un solo lugar.
 */

const AIRTABLE_API = 'https://api.airtable.com/v0';

/** Error con código HTTP, para que las rutas respondan el status correcto. */
export class ActivosError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ActivosError';
  }
}

/**
 * Verifica que exista lo mínimo para hablar con la base.
 * Lanza `ActivosError` con el detalle de qué falta configurar.
 */
export function assertActivosConfig(): { baseId: string; token: string } {
  const { base } = ACTIVOS_TABLE_IDS;
  const token = config.airtable.token;

  if (!base || !ACTIVOS_TABLE_IDS.activosFijos) {
    throw new ActivosError('Módulo de Activos Fijos no configurado', 400, {
      faltan: ['AIRTABLE_ACTIVOS_CORE_BASE_ID', 'AIRTABLE_ACTIVOS_FIJOS_TABLE_ID'],
    });
  }
  if (!token) {
    throw new ActivosError('Token de Airtable no configurado', 500, {
      faltan: ['AIRTABLE_TOKEN', 'AIRTABLE_GLOBAL_TOKEN'],
    });
  }

  return { baseId: base, token };
}

/** Requiere una tabla concreta del core (asignaciones, ubicaciones, etc.). */
export function assertTabla(tableId: string | undefined, variable: string): string {
  if (!tableId) {
    throw new ActivosError(`Tabla no configurada: ${variable}`, 400, { faltan: [variable] });
  }
  return tableId;
}

interface AirtableListResponse<T> {
  records?: T[];
  offset?: string;
}

async function airtableRequest<T>(
  path: string,
  init: RequestInit & { searchParams?: URLSearchParams } = {}
): Promise<T> {
  const { baseId, token } = assertActivosConfig();
  const { searchParams, ...rest } = init;
  const query = searchParams?.toString();
  const url = `${AIRTABLE_API}/${baseId}/${path}${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(rest.headers || {}),
    },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const tipo =
      (data as { error?: { type?: string; message?: string } } | null)?.error?.type ||
      'Error de Airtable';
    throw new ActivosError(tipo, response.status, data);
  }

  return data as T;
}

/** Trae TODOS los registros de una tabla siguiendo la paginación de Airtable. */
export async function fetchAllRecords<T>(
  tableId: string,
  searchParams?: URLSearchParams
): Promise<T[]> {
  const registros: T[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams(searchParams);
    params.set('pageSize', '100');
    if (offset) params.set('offset', offset);

    const data = await airtableRequest<AirtableListResponse<T>>(tableId, {
      method: 'GET',
      searchParams: params,
    });

    registros.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return registros;
}

/**
 * Lee un registro con las claves por FIELD ID.
 *
 * Necesario en las guardas previas a una mutación: el resto del código escribe
 * por field ID, y sin este parámetro Airtable devuelve las claves por NOMBRE,
 * así que `fields[FIELD_ID]` sería siempre `undefined` y la guarda no detectaría
 * nada (era el bug que dejaba reasignar un activo ya asignado).
 */
export async function getRawRecordByFieldId(
  tableId: string,
  recordId: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ returnFieldsByFieldId: 'true' });
  const data = await airtableRequest<{ id: string; fields?: Record<string, unknown> }>(
    `${tableId}/${encodeURIComponent(recordId)}`,
    { method: 'GET', searchParams: params }
  );
  return data.fields || {};
}

/** Crea un registro y devuelve la respuesta cruda de Airtable. */
export async function createRecord(
  tableId: string,
  fields: Record<string, unknown>
): Promise<{ id: string; fields: Record<string, unknown>; createdTime: string }> {
  return airtableRequest(tableId, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

/** Actualiza (PATCH) un registro y devuelve la respuesta cruda de Airtable. */
export async function updateRecord(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<{ id: string; fields: Record<string, unknown>; createdTime: string }> {
  return airtableRequest(`${tableId}/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

// ============================================================================
// CATÁLOGOS (tipos de activo y ubicaciones)
// ============================================================================

export interface Catalogos {
  /** record ID → tipo de activo. */
  tipos: Map<string, TipoActivoOpcion>;
  /** record ID → ubicación. */
  ubicaciones: Map<string, UbicacionOpcion>;
}

interface CatalogoCache {
  valor: Catalogos;
  expira: number;
}

/**
 * Los catálogos cambian muy poco y resolverlos cuesta dos consultas extra por
 * cada listado, así que se guardan 60 s en memoria del proceso.
 */
const CATALOGO_TTL_MS = 60_000;
let cacheCatalogos: CatalogoCache | null = null;

/** Airtable devuelve los campos `aiText` como `{ state, value, isStale }`. */
function textoPlano(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (valor && typeof valor === 'object' && 'value' in valor) {
    const interno = (valor as { value: unknown }).value;
    return typeof interno === 'string' ? interno : '';
  }
  if (typeof valor === 'number') return String(valor);
  return '';
}

function numeroONull(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && valor !== null && valor !== undefined && valor !== '' ? n : null;
}

/** Normaliza un registro del catálogo de Tipos de Activo. */
export function normalizarTipo(record: {
  id: string;
  fields: Record<string, unknown>;
}): TipoActivoOpcion {
  const f = record.fields;
  return {
    id: record.id,
    nombre: textoPlano(f['Nombre Tipo']) || textoPlano(f['Código Tipo']) || 'Sin nombre',
    categoria: textoPlano(f['Categoría']),
    descripcion: textoPlano(f['Descripción']),
    requiereVencimiento: Boolean(f['Requiere Vencimiento']),
    requiereMantenimiento: Boolean(f['Requiere Mantenimiento Preventivo']),
    vidaUtil: numeroONull(f['Vida Útil Estimada (años)']),
  };
}

/** Normaliza un registro del catálogo de Ubicaciones. */
export function normalizarUbicacion(record: {
  id: string;
  fields: Record<string, unknown>;
}): UbicacionOpcion {
  const f = record.fields;
  return {
    id: record.id,
    nombre:
      textoPlano(f['Nombre Ubicación']) || textoPlano(f['Código Ubicación']) || 'Sin nombre',
    tipo: textoPlano(f['Tipo Ubicación']),
    descripcion: textoPlano(f['Descripción']),
    codigoArea: textoPlano(f['Código Área Nómina Core']),
  };
}

/** Solo los registros activos del catálogo (o sin estado definido). */
const FILTRO_TIPOS_ACTIVOS = "OR({Estado}='Activo',{Estado}=BLANK())";
const FILTRO_UBICACIONES_ACTIVAS = "OR({Estado}='Activa',{Estado}=BLANK())";

/** Lista los tipos de activo disponibles, ordenados por nombre. */
export async function listarTipos(): Promise<TipoActivoOpcion[]> {
  const tableId = assertTabla(ACTIVOS_TABLE_IDS.tiposActivo, 'AIRTABLE_TIPOS_ACTIVO_TABLE_ID');
  const records = await fetchAllRecords<{ id: string; fields: Record<string, unknown> }>(
    tableId,
    new URLSearchParams({ filterByFormula: FILTRO_TIPOS_ACTIVOS })
  );
  return records
    .map(normalizarTipo)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Lista las ubicaciones disponibles, ordenadas por nombre. */
export async function listarUbicaciones(): Promise<UbicacionOpcion[]> {
  const tableId = assertTabla(ACTIVOS_TABLE_IDS.ubicaciones, 'AIRTABLE_UBICACIONES_TABLE_ID');
  const records = await fetchAllRecords<{ id: string; fields: Record<string, unknown> }>(
    tableId,
    new URLSearchParams({ filterByFormula: FILTRO_UBICACIONES_ACTIVAS })
  );
  return records
    .map(normalizarUbicacion)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Catálogos indexados por record ID, para resolver los links de un activo.
 * Si un catálogo falla (p. ej. tabla sin configurar) se devuelve vacío: es
 * preferible mostrar el listado sin nombres de ubicación que no mostrar nada.
 */
export async function getCatalogos(): Promise<Catalogos> {
  const ahora = Date.now();
  if (cacheCatalogos && cacheCatalogos.expira > ahora) return cacheCatalogos.valor;

  const [tipos, ubicaciones] = await Promise.all([
    listarTipos().catch((error) => {
      console.warn('⚠️ No se pudo resolver el catálogo de tipos de activo:', error);
      return [] as TipoActivoOpcion[];
    }),
    listarUbicaciones().catch((error) => {
      console.warn('⚠️ No se pudo resolver el catálogo de ubicaciones:', error);
      return [] as UbicacionOpcion[];
    }),
  ]);

  const valor: Catalogos = {
    tipos: new Map(tipos.map((tipo) => [tipo.id, tipo])),
    ubicaciones: new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion])),
  };

  cacheCatalogos = { valor, expira: ahora + CATALOGO_TTL_MS };
  return valor;
}

/** Invalida la caché de catálogos (tras crear un tipo o una ubicación). */
export function invalidarCatalogos(): void {
  cacheCatalogos = null;
}

// ============================================================================
// NORMALIZACIÓN DE ACTIVOS
// ============================================================================

function comoArray(valor: unknown): string[] {
  if (Array.isArray(valor)) {
    return valor.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  if (typeof valor === 'string' && valor) return [valor];
  return [];
}

function comoTexto(valor: unknown): string {
  return textoPlano(valor).trim();
}

function comoNumero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function comoBooleano(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.some(Boolean);
  return Boolean(valor);
}

function comoFecha(valor: unknown): string | null {
  const texto = comoTexto(valor);
  return texto || null;
}

/**
 * Convierte un registro crudo de Airtable en la forma que consume la UI:
 * conserva los campos originales y añade las claves normalizadas.
 */
export function normalizarActivo(
  record: { id: string; fields: Record<string, unknown>; createdTime: string },
  catalogos: Catalogos
): ActivoFijoRecord {
  const f = record.fields;

  const tipoIds = comoArray(f['Tipo de Activo']);
  const tipos = tipoIds.map((id) => catalogos.tipos.get(id)?.nombre).filter((n): n is string => !!n);

  const ubicacionIds = comoArray(f['Ubicación Actual']);
  const ubicacionId = ubicacionIds[0] || '';
  const ubicacion = ubicacionId ? catalogos.ubicaciones.get(ubicacionId)?.nombre || '' : '';

  // La categoría es un lookup del tipo; si el lookup viene vacío (o el tipo no
  // está en el catálogo cacheado) se reconstruye desde el catálogo.
  const categoriasLookup = comoArray(f['Categoría']);
  const categoriasCatalogo = tipoIds
    .map((id) => catalogos.tipos.get(id)?.categoria)
    .filter((c): c is string => !!c);
  const categorias = [...new Set(categoriasLookup.length ? categoriasLookup : categoriasCatalogo)];

  const responsable = comoTexto(f['Responsable Asignado']);
  const vidaUtil = comoArray(f['Vida útil Estimada']).map(Number).find(Number.isFinite);

  const normalizado: ActivoNormalizado = {
    codigo: comoTexto(f['Código Activo']),
    nombre: comoTexto(f['Nombre del Activo']) || 'Sin nombre',
    descripcion: comoTexto(f['Descripción']),
    tipos,
    tipoIds,
    categorias,
    ubicacion,
    ubicacionId,
    area: comoTexto(f['Área Responsable']),
    responsable,
    asignado: responsable !== '',
    estado: (comoTexto(f['Estado Operativo']) || 'Operativo') as EstadoOperativo,
    numeroSerie: comoTexto(f['Número de Serie']),
    marca: comoTexto(f['Marca']),
    modelo: comoTexto(f['Modelo']),
    proveedor: comoTexto(f['Proveedor']),
    fechaAdquisicion: comoFecha(f['Fecha de Adquisición']),
    valorAdquisicion: comoNumero(f['Valor de Adquisición']),
    fechaVencimiento: comoFecha(f['Fecha de Vencimiento']),
    diasVencimiento:
      f['Días para Vencimiento'] === undefined || f['Días para Vencimiento'] === null
        ? null
        : comoNumero(f['Días para Vencimiento']),
    proximoMantenimiento: comoFecha(f['Próximo Mantenimiento']),
    requiereVencimiento: comoBooleano(f['Requiere Vencimiento']),
    requiereMantenimiento: comoBooleano(f['Requiere Mantenimiento']),
    vidaUtil: vidaUtil ?? null,
    anioBaja: f['Año de Baja Estimado'] ? comoNumero(f['Año de Baja Estimado']) : null,
    notas: comoTexto(f['Notas']),
    totalEventos: comoArray(f['Historial de Eventos']).length,
    totalAsignaciones: comoArray(f['Asignaciones']).length,
    ultimaAsignacion: comoFecha(f['Última Asignación']),
    ultimaDevolucion: comoFecha(f['Última Devolución']),
    completo: tipoIds.length > 0 && ubicacionId !== '',
  };

  return {
    id: record.id,
    createdTime: record.createdTime,
    fields: { ...f, ...normalizado },
  };
}

/** Lista todos los activos, ya normalizados y ordenados por código. */
export async function listarActivos(): Promise<ActivoFijoRecord[]> {
  const tableId = ACTIVOS_TABLE_IDS.activosFijos as string;
  const [records, catalogos] = await Promise.all([
    fetchAllRecords<{ id: string; fields: Record<string, unknown>; createdTime: string }>(tableId),
    getCatalogos(),
  ]);

  return records
    .map((record) => normalizarActivo(record, catalogos))
    .sort((a, b) =>
      String(a.fields.codigo || '').localeCompare(String(b.fields.codigo || ''), 'es', {
        numeric: true,
      })
    );
}

/** Lee un activo por ID y lo devuelve normalizado. */
export async function obtenerActivo(recordId: string): Promise<ActivoFijoRecord> {
  const tableId = ACTIVOS_TABLE_IDS.activosFijos as string;
  const [record, catalogos] = await Promise.all([
    airtableRequest<{ id: string; fields: Record<string, unknown>; createdTime: string }>(
      `${tableId}/${encodeURIComponent(recordId)}`,
      { method: 'GET' }
    ),
    getCatalogos(),
  ]);
  return normalizarActivo(record, catalogos);
}

/** Campos crudos (por field ID) de un activo. Para las guardas de mutación. */
export function getActivoRaw(recordId: string): Promise<Record<string, unknown>> {
  return getRawRecordByFieldId(ACTIVOS_TABLE_IDS.activosFijos as string, recordId);
}

// ============================================================================
// ASIGNACIONES
// ============================================================================

/** Normaliza un registro de la tabla Asignaciones. */
export function normalizarAsignacion(record: {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}): AsignacionRecord {
  const f = record.fields;
  const fechaDevolucion = comoFecha(f['Fecha Devolución']);

  return {
    id: record.id,
    createdTime: record.createdTime,
    fields: {
      ...f,
      activoId: comoArray(f['Activo'])[0] || '',
      activoNombre: comoArray(f['Nombre Activo'])[0] || '',
      activoCodigo: comoArray(f['Código Activo'])[0] || '',
      responsable: comoTexto(f['Responsable']),
      fechaAsignacion: comoFecha(f['Fecha Asignación']),
      fechaDevolucion,
      activa: !fechaDevolucion,
      diasEnUso: comoNumero(f['Días en Uso']),
    },
  };
}

/**
 * Busca la asignación abierta (sin fecha de devolución) de un activo.
 *
 * Se filtra en memoria a propósito: `filterByFormula` sobre un campo de tipo
 * link obliga a comparar contra el nombre del registro vinculado, que no es
 * estable. El volumen de asignaciones por activo es pequeño.
 */
export async function buscarAsignacionAbierta(activoId: string): Promise<AsignacionRecord | null> {
  const tableId = ACTIVOS_TABLE_IDS.asignaciones;
  if (!tableId) return null;

  const records = await fetchAllRecords<{
    id: string;
    fields: Record<string, unknown>;
    createdTime: string;
  }>(tableId, new URLSearchParams({ filterByFormula: '{Fecha Devolución} = BLANK()' }));

  const abiertas = records
    .map(normalizarAsignacion)
    .filter((asignacion) => asignacion.fields.activoId === activoId)
    .sort((a, b) =>
      String(b.fields.fechaAsignacion || '').localeCompare(String(a.fields.fechaAsignacion || ''))
    );

  return abiertas[0] || null;
}

/** Campos crudos (por field ID) de una asignación. Para las guardas. */
export function getAsignacionRaw(recordId: string): Promise<Record<string, unknown>> {
  const tableId = assertTabla(ACTIVOS_TABLE_IDS.asignaciones, 'AIRTABLE_ASIGNACIONES_TABLE_ID');
  return getRawRecordByFieldId(tableId, recordId);
}

/** Lee el responsable actual de un activo usando su field ID. */
export function responsableDe(fieldsPorId: Record<string, unknown>): string {
  const valor = fieldsPorId[ACTIVOS_FIELD_IDS.responsableAsignado];
  return typeof valor === 'string' ? valor.trim() : '';
}

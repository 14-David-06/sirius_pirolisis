// src/lib/blend-remisiones-core.ts
//
// Remisiones de Biochar Blend, con Sirius Remisiones Core como DUEÑO del registro.
//
// ═══ POR QUÉ ESTE MÓDULO ══════════════════════════════════════════════════════
// Antes la remisión vivía en la tabla local `blend_remisiones` de PiroliApp y
// `blend-core-sync.ts` la espejaba hacia el Core. Esa tabla se borró (era data de
// prueba), así que la propiedad se invierte: el Core es el registro y no hay copia
// local. Mismo modelo que usa el laboratorio.
//
// ═══ DÓNDE VIVE CADA COSA ═════════════════════════════════════════════════════
//   Sirius Remisiones Core  `Remisiones`         → el documento (SIRIUS-REM-XXXX)
//                           `Productos Remitidos`→ una fila: Biochar Blend + KG
//                           `Personas`           → transportista y receptor
//   Sirius Inventario Prod. `Movimientos_Inventario` → la Salida del producto
//   Sirius Pedidos Core     `Pedidos`            → el estado del pedido
//   Sirius Clients Core     `Clientes`           → el nombre del cliente
//   S3                      el PDF firmado
//
// ═══ LO QUE NO SE GUARDA, SE DERIVA ═══════════════════════════════════════════
// Remisiones Core no tiene campos para la composición del Blend, el CO₂ ni los
// baches, y NO se le agregan: es una base compartida con el laboratorio y meterle
// campos de un solo producto la ensucia para todos.
//
// No hace falta: todo eso es DERIVABLE del código de lote, que va en las notas.
//   - composición  → proporción real del lote (o la fórmula de `config.blend`)
//   - CO₂          → kg de biochar × `config.carbon.factorSecuestroCo2`
//   - baches       → las Salidas de biochar del lote en Sirius Insumos Core
// Guardarlo sería duplicar un dato que ya existe y que puede divergir.

import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import {
  getProduccionBlend,
  getProduccionPorLote,
  type BacheDeLote,
} from './blend-produccion-core';

const AT = 'https://api.airtable.com/v0';

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

/** El Blend sale de la planta de pirólisis → área "Producción". */
const AREA_ORIGEN = 'Producción';

/** Marca que identifica una remisión de Blend y su lote dentro de las notas. */
const MARCA_LOTE = /\[lote:([A-Za-z0-9\-_]+)\]/;

export interface ComposicionBlend {
  biochar: number;
  abono: number;
  agua: number;
  biologicos: number;
}

export interface PersonaRemision {
  recordId: string;
  codigo: string;
  nombre: string;
  tipo: string;
  cedula: string;
  email: string;
  telefono: string;
}

export interface RemisionBlend {
  recordId: string;
  /** `SIRIUS-REM-XXXX`. */
  codigo: string;
  estado: string;
  /** `SIRIUS-PED-XXXX`. */
  idPedido: string;
  /** `CL-XXXX`. */
  idCliente: string;
  /** Nombre comercial, resuelto de Clients Core (el Core solo guarda el código). */
  clienteNombre: string;
  /** `BLEND-…`: la llave al lote producido. */
  lote: string;
  kgTotal: number;
  fechaRemision: string;
  fechaDespacho: string;
  fechaRecibido: string;
  responsableEntrega: string;
  documentoUrl: string;
  notas: string;
  personas: PersonaRemision[];
  // ── Derivados (no viven en el Core) ──
  composicion: ComposicionBlend;
  co2SecuestradoKg: number;
  baches: BacheDeLote[];
}

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function coreConfig() {
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

async function at(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: headers(token) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Airtable ${init.method ?? 'GET'} ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function atAll(
  baseId: string,
  table: string,
  token: string,
  params: Record<string, string> = {}
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${AT}/${baseId}/${table}`);
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set('offset', offset);
    const data = await at(url.toString(), token);
    out.push(...((data.records ?? []) as AirtableRecord[]));
    offset = data.offset;
  } while (offset);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivados
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Composición de un despacho de `kg` de Blend.
 *
 * Si el lote tiene Salidas de biochar registradas, el biochar se calcula con la
 * proporción REAL de ese lote y no con el porcentaje teórico: el reparto entre
 * baches redondea a 2 decimales, así que los dos números difieren un poco y el
 * real es el que se descontó del inventario.
 *
 * ⚠️ Los porcentajes de `config.blend` suman 99.7% (decisión abierta sobre los
 * biológicos), así que los cuatro componentes NO suman `kg`. Es a propósito: se
 * respeta la fórmula tal como está en Airtable y no se fuerza el cuadre.
 */
export function composicionDeDespacho(
  kg: number,
  proporcionBiocharReal?: number
): ComposicionBlend {
  const { pctBiochar, pctAbono, pctAgua, pctBiologicos } = config.blend;
  const pctB = proporcionBiocharReal ?? pctBiochar;
  return {
    biochar: r2(kg * pctB),
    abono: r2(kg * pctAbono),
    agua: r2(kg * pctAgua),
    biologicos: r2(kg * pctBiologicos),
  };
}

/** CO₂ secuestrado por los KG de biochar puro del despacho. */
export function co2Secuestrado(kgBiocharPuro: number): number {
  return Number((kgBiocharPuro * config.carbon.factorSecuestroCo2).toFixed(4));
}

/** Lote (`BLEND-…`) codificado en las notas de la remisión. */
export function loteDeNotas(notas: string): string {
  return notas.match(MARCA_LOTE)?.[1] ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
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
    const data = await at(
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

async function personasDeRemision(recordIds: string[]): Promise<PersonaRemision[]> {
  const { baseId, token, personasTable } = coreConfig();
  if (!personasTable || !recordIds.length) return [];

  const personas: PersonaRemision[] = [];
  for (const id of recordIds) {
    try {
      const data = await at(`${AT}/${baseId}/${personasTable}/${id}`, token);
      personas.push({
        recordId: data.id,
        codigo: String(data.fields?.['Codigo Persona Remision'] ?? ''),
        nombre: String(data.fields?.['Nombre Completo'] ?? ''),
        tipo: String(data.fields?.['Tipo de Usuario'] ?? ''),
        cedula: String(data.fields?.['Cedula'] ?? ''),
        email: String(data.fields?.['Correo Electrónico'] ?? ''),
        telefono: String(data.fields?.['Teléfono'] ?? ''),
      });
    } catch (err) {
      console.warn(`⚠️ No se pudo leer la persona ${id}:`, err);
    }
  }
  return personas;
}

/** Normaliza un registro del Core a `RemisionBlend`, resolviendo los derivados. */
async function mapRemision(rec: AirtableRecord): Promise<RemisionBlend> {
  const notas = String(rec.fields['Notas de Remisión'] ?? '');
  const lote = loteDeNotas(notas);
  const kgTotal = toNumber(rec.fields['Total Cantidad Remitida']);
  const idCliente = String(rec.fields['ID Cliente'] ?? '');

  // Proporción real de biochar del lote y sus baches, si el lote se conoce.
  let proporcionBiochar: number | undefined;
  let baches: BacheDeLote[] = [];
  if (lote) {
    try {
      const prod = await getProduccionPorLote(lote);
      if (prod && prod.kgTotal > 0) {
        const kgBiochar = prod.baches.reduce((total, b) => total + b.kg, 0);
        if (kgBiochar > 0) proporcionBiochar = kgBiochar / prod.kgTotal;
        baches = prod.baches;
      }
    } catch (err) {
      console.warn(`⚠️ No se pudo resolver el lote ${lote}:`, err);
    }
  }

  const composicion = composicionDeDespacho(kgTotal, proporcionBiochar);
  const personasIds = Array.isArray(rec.fields['Personas'])
    ? (rec.fields['Personas'] as string[])
    : [];

  const [clienteNombre, personas] = await Promise.all([
    nombreCliente(idCliente),
    personasDeRemision(personasIds),
  ]);

  return {
    recordId: rec.id,
    codigo: String(rec.fields['ID'] ?? ''),
    estado: String(rec.fields['Estado'] ?? ''),
    idPedido: String(rec.fields['ID Pedido'] ?? ''),
    idCliente,
    clienteNombre,
    lote,
    kgTotal,
    fechaRemision: String(rec.fields['Fecha de Remisión'] ?? '').slice(0, 10),
    fechaDespacho: String(rec.fields['Fecha Pedido Despachado'] ?? '').slice(0, 10),
    fechaRecibido: String(rec.fields['Fecha Recibido'] ?? '').slice(0, 10),
    responsableEntrega: String(rec.fields['Responsable Entrega'] ?? ''),
    documentoUrl: String(rec.fields['URL Remision Generada'] ?? ''),
    notas,
    personas,
    composicion,
    co2SecuestradoKg: co2Secuestrado(composicion.biochar),
    baches,
  };
}

/**
 * Resuelve una remisión por record ID (`recXXX`) o por código legible
 * (`SIRIUS-REM-XXXX`). Es el patrón del laboratorio: las APIs aceptan las dos
 * formas indistintamente, porque los enlaces que se comparten con el cliente
 * llevan el código y los internos llevan el record ID.
 */
export async function resolverRemision(idOrCodigo: string): Promise<RemisionBlend | null> {
  const { baseId, token, remisionesTable } = coreConfig();

  if (esRecordId(idOrCodigo)) {
    try {
      const data = await at(`${AT}/${baseId}/${remisionesTable}/${idOrCodigo}`, token);
      return await mapRemision(data as AirtableRecord);
    } catch {
      return null;
    }
  }

  const params = new URLSearchParams({
    filterByFormula: `{ID} = '${escapeAirtableValue(idOrCodigo)}'`,
    maxRecords: '1',
  });
  const data = await at(`${AT}/${baseId}/${remisionesTable}?${params.toString()}`, token);
  const rec = data.records?.[0];
  return rec ? await mapRemision(rec as AirtableRecord) : null;
}

/**
 * Remisiones de Blend, opcionalmente filtradas.
 *
 * El filtro por producto se hace en JS y no en la fórmula: `Productos Remitidos`
 * es un link y en una fórmula se evalúa como el texto del campo primario, no como
 * el ID del producto. Filtrar por la marca `[lote:…]` de las notas es lo que
 * distingue una remisión de Blend de una del laboratorio en la misma tabla.
 */
export async function listarRemisiones(filtros: {
  estado?: string;
  pedido?: string;
  cliente?: string;
} = {}): Promise<RemisionBlend[]> {
  const { baseId, token, remisionesTable } = coreConfig();

  const condiciones: string[] = [];
  if (filtros.estado) condiciones.push(`{Estado} = '${escapeAirtableValue(filtros.estado)}'`);
  if (filtros.pedido) condiciones.push(`{ID Pedido} = '${escapeAirtableValue(filtros.pedido)}'`);
  if (filtros.cliente) condiciones.push(`{ID Cliente} = '${escapeAirtableValue(filtros.cliente)}'`);

  const params: Record<string, string> = {};
  if (condiciones.length === 1) params.filterByFormula = condiciones[0];
  else if (condiciones.length > 1) params.filterByFormula = `AND(${condiciones.join(', ')})`;

  const registros = await atAll(baseId, remisionesTable, token, params);

  // Solo las de Blend, y en serie por remisión para no disparar 4 requests por
  // cada una en paralelo contra el rate limit de Airtable (5 req/s por base).
  const soloBlend = registros.filter((r) =>
    MARCA_LOTE.test(String(r.fields['Notas de Remisión'] ?? ''))
  );

  const out: RemisionBlend[] = [];
  for (const rec of soloBlend) out.push(await mapRemision(rec));

  return out.sort((a, b) => b.fechaRemision.localeCompare(a.fechaRemision));
}

// ─────────────────────────────────────────────────────────────────────────────
// Personas (upsert por cédula + tipo)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca una persona por cédula y tipo, o la crea. Devuelve su record ID.
 *
 * La cédula viene de un formulario PÚBLICO, así que va escapada: es el caso que
 * motiva `escapeAirtableValue`.
 */
export async function buscarOCrearPersona(persona: {
  nombre: string;
  cedula: string;
  tipo: string;
  email?: string;
  telefono?: string;
  direccion?: string;
}): Promise<string | null> {
  const { baseId, token, personasTable } = coreConfig();
  if (!personasTable) {
    console.warn('⚠️ AIRTABLE_TABLE_PERSONAS_REMISION no configurado: persona no registrada');
    return null;
  }
  if (!persona.cedula) return null;

  const params = new URLSearchParams({
    filterByFormula: `AND({Cedula} = '${escapeAirtableValue(persona.cedula)}', {Tipo de Usuario} = '${escapeAirtableValue(persona.tipo)}')`,
    maxRecords: '1',
  });
  const existente = await at(`${AT}/${baseId}/${personasTable}?${params.toString()}`, token);
  if (existente.records?.length) return existente.records[0].id as string;

  const fields: Record<string, unknown> = {
    'Nombre Completo': persona.nombre,
    Cedula: persona.cedula,
    'Tipo de Usuario': persona.tipo,
    'Base Origen': 'PiroliApp (Pirolisis)',
  };
  if (persona.email) fields['Correo Electrónico'] = persona.email;
  if (persona.telefono) fields['Teléfono'] = persona.telefono;
  if (persona.direccion) fields['Dirección'] = persona.direccion;

  const creada = await at(`${AT}/${baseId}/${personasTable}`, token, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  });
  return (creada.records?.[0]?.id as string) ?? null;
}

/** Añade personas al link de la remisión SIN borrar las ya vinculadas. */
export async function vincularPersonas(
  remisionRecordId: string,
  personaIds: string[]
): Promise<void> {
  const { baseId, token, remisionesTable } = coreConfig();
  if (!personaIds.length) return;

  // El PATCH de un campo link REEMPLAZA el array: hay que releer y concatenar o se
  // pierde el transportista al firmar el receptor.
  const actual = await at(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token);
  const previas: string[] = Array.isArray(actual.fields?.['Personas'])
    ? (actual.fields['Personas'] as string[])
    : [];
  const union = [...new Set([...previas, ...personaIds])];

  await at(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Personas: union } }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export interface StepResult {
  step: string;
  ok: boolean;
  skipped?: boolean;
  detail?: unknown;
  error?: string;
}

export interface CrearRemisionInput {
  /** `SIRIUS-PED-XXXX` del pedido que se está despachando. */
  idPedido: string;
  /** `CL-XXXX` del cliente. */
  idCliente: string;
  /** `BLEND-…` del lote del que sale el producto. */
  lote: string;
  /** KG de Blend que se despachan (puede ser un despacho parcial). */
  kg: number;
  responsableEntrega: string;
  /** Transportista: si viene con cédula se registra en `Personas`. */
  transportista?: { nombre: string; cedula: string; telefono?: string; email?: string };
  observaciones?: string;
  fechaDespacho?: string;
}

export interface CrearRemisionResult {
  ok: boolean;
  remision: RemisionBlend | null;
  steps: StepResult[];
}

/**
 * Crea la remisión de despacho y mueve el inventario.
 *
 * Orden deliberado: primero el documento y su producto remitido (críticos, si
 * fallan no hay remisión), después el movimiento de inventario y el estado del
 * pedido (best-effort). Los best-effort NO se silencian como en el flujo del
 * laboratorio: se devuelven en `steps` para que la ruta responda 207 y quede
 * registrado qué quedó a medias. No hay transacciones entre bases de Airtable;
 * lo único honesto es reportar.
 */
export async function crearRemision(input: CrearRemisionInput): Promise<CrearRemisionResult> {
  const { baseId, token, remisionesTable, productosTable } = coreConfig();
  const steps: StepResult[] = [];

  if (!(input.kg > 0)) {
    return {
      ok: false,
      remision: null,
      steps: [{ step: 'validacion', ok: false, error: 'Los KG a despachar deben ser mayores que 0' }],
    };
  }

  // 1. El documento. El lote va en las notas: es la llave a la producción y lo que
  //    identifica esta remisión como de Blend dentro de una tabla compartida.
  const notas =
    `[lote:${input.lote}] Biochar Blend` +
    (input.observaciones ? ` — ${input.observaciones}` : '');

  const remisionFields: Record<string, unknown> = {
    'Area Origen': AREA_ORIGEN,
    Estado: input.transportista?.cedula ? ESTADO_REMISION.enTransito : ESTADO_REMISION.pendiente,
    'Notas de Remisión': notas,
    'ID Cliente': input.idCliente,
    'ID Pedido': input.idPedido,
    'Responsable Entrega': input.responsableEntrega,
    'Fecha Pedido Despachado': input.fechaDespacho || new Date().toISOString().split('T')[0],
  };

  let remisionRecordId: string;
  try {
    const creada = await at(`${AT}/${baseId}/${remisionesTable}`, token, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields: remisionFields }] }),
    });
    remisionRecordId = creada.records?.[0]?.id as string;
    steps.push({ step: 'remision', ok: true, detail: { remisionRecordId } });
  } catch (err) {
    steps.push({ step: 'remision', ok: false, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, remision: null, steps };
  }

  // 2. El producto remitido. Sin esta fila `Total Cantidad Remitida` queda en 0, que
  //    es el campo del que sale la cantidad en todo lo demás → es crítico, y si
  //    falla se borra la remisión para no dejar un documento por 0 kg.
  if (!productosTable) {
    steps.push({ step: 'producto_remitido', ok: false, error: 'AIRTABLE_TABLE_PRODUCTOS_REMITIDOS no configurado' });
    await at(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, { method: 'DELETE' }).catch(() => {});
    return { ok: false, remision: null, steps };
  }
  try {
    await at(`${AT}/${baseId}/${productosTable}`, token, {
      method: 'POST',
      body: JSON.stringify({
        records: [
          {
            fields: {
              'ID Producto': config.airtable.inventarioProdCoreBiocharBlendProductId,
              Cantidad: r2(input.kg),
              Unidad: 'Kg',
              'Remisión vinculada': [remisionRecordId],
              Notas: `Lote ${input.lote}`,
            },
          },
        ],
      }),
    });
    steps.push({ step: 'producto_remitido', ok: true });
  } catch (err) {
    steps.push({ step: 'producto_remitido', ok: false, error: err instanceof Error ? err.message : String(err) });
    await at(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, { method: 'DELETE' }).catch(() => {});
    return { ok: false, remision: null, steps };
  }

  // 3. Transportista (best-effort).
  if (input.transportista?.cedula) {
    try {
      const personaId = await buscarOCrearPersona({ ...input.transportista, tipo: TIPO_PERSONA.transportista });
      if (personaId) await vincularPersonas(remisionRecordId, [personaId]);
      steps.push({ step: 'transportista', ok: true, detail: { personaId } });
    } catch (err) {
      steps.push({ step: 'transportista', ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 4. Leer la remisión ya creada para tener el código SIRIUS-REM-XXXX y los derivados.
  let remision: RemisionBlend | null = null;
  try {
    remision = await resolverRemision(remisionRecordId);
  } catch (err) {
    steps.push({ step: 'lectura', ok: false, error: err instanceof Error ? err.message : String(err) });
  }

  // 5. Salida de producto terminado (best-effort).
  steps.push(await registrarSalidaInventario(input, remision?.codigo ?? remisionRecordId));

  // 6. Estado del pedido (best-effort).
  steps.push(await actualizarEstadoPedido(input.idPedido, input.lote, input.kg));

  const criticos = steps.filter((s) => ['remision', 'producto_remitido'].includes(s.step));
  return { ok: criticos.every((s) => s.ok), remision, steps };
}

/**
 * Salida del producto terminado en Sirius Inventario Production Core.
 * `ubicacion_origen_id` = la remisión, `ubicacion_destino_id` = el cliente.
 */
async function registrarSalidaInventario(
  input: CrearRemisionInput,
  codigoRemision: string
): Promise<StepResult> {
  const base = config.airtable.inventarioProdCoreBaseId;
  const token = config.airtable.inventarioProdCoreToken;
  const movimientos = config.airtable.inventarioProdCoreMovimientosTable;
  const stockTable = config.airtable.inventarioProdCoreStockTable;
  const producto = config.airtable.inventarioProdCoreBiocharBlendProductId;

  if (!base || !token || !movimientos || !producto) {
    return { step: 'inventario', ok: false, skipped: true, error: 'Inventario Production Core no configurado' };
  }

  try {
    // Idempotencia por documento_referencia: reintentar no duplica la salida.
    const doc = `DESP-${codigoRemision}`;
    const dupParams = new URLSearchParams({
      filterByFormula: `{documento_referencia} = '${escapeAirtableValue(doc)}'`,
      maxRecords: '1',
    });
    const dup = await at(`${AT}/${base}/${movimientos}?${dupParams.toString()}`, token);
    if (dup.records?.length) {
      return { step: 'inventario', ok: true, skipped: true, detail: { doc, yaExistia: true } };
    }

    let stockRecordId: string | null = null;
    if (stockTable) {
      const q = new URLSearchParams({
        filterByFormula: `{producto_id} = '${escapeAirtableValue(producto)}'`,
        maxRecords: '1',
      });
      const s = await at(`${AT}/${base}/${stockTable}?${q.toString()}`, token);
      stockRecordId = s.records?.[0]?.id ?? null;
    }

    const fields: Record<string, unknown> = {
      product_id: producto,
      tipo_movimiento: 'Salida',
      cantidad: r2(input.kg),
      unidad_medida: 'kg',
      ubicacion_origen_id: codigoRemision,
      ubicacion_destino_id: input.idCliente,
      motivo: 'Despacho Remisión',
      documento_referencia: doc,
      responsable: input.responsableEntrega,
      fecha_movimiento: `${input.fechaDespacho || new Date().toISOString().split('T')[0]}T12:00:00.000Z`,
      observaciones: `Despacho de Biochar Blend del lote ${input.lote} al pedido ${input.idPedido}.`,
    };
    if (stockRecordId) fields.Stock_Actual = [stockRecordId];

    const res = await at(`${AT}/${base}/${movimientos}`, token, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] }),
    });
    return { step: 'inventario', ok: true, detail: { movimientoId: res.records?.[0]?.id, doc } };
  } catch (err) {
    return { step: 'inventario', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Pasa el pedido a `Enviado` o `Enviado Parcial` según si lo despachado cubre lo
 * solicitado. Lo despachado se deriva del libro mayor (suma de Salidas del
 * pedido), no de un contador: varias remisiones por pedido son el caso normal.
 */
async function actualizarEstadoPedido(
  idPedido: string,
  lote: string,
  kgDespachadosAhora: number
): Promise<StepResult> {
  const base = config.airtable.pedidosCoreBaseId;
  const token = config.airtable.pedidosCoreToken;
  const pedidosTable = config.airtable.pedidosCorePedidosTable;
  const detallesTable = config.airtable.pedidosCoreDetallesTable;
  const producto = config.airtable.inventarioProdCoreBiocharBlendProductId;

  if (!base || !token || !pedidosTable || !detallesTable || !producto) {
    return { step: 'estado_pedido', ok: false, skipped: true, error: 'Pedidos Core no configurado' };
  }

  try {
    const params = new URLSearchParams({
      filterByFormula: `{ID Pedido Core} = '${escapeAirtableValue(idPedido)}'`,
      maxRecords: '1',
    });
    const data = await at(`${AT}/${base}/${pedidosTable}?${params.toString()}`, token);
    const pedido = data.records?.[0];
    if (!pedido) {
      return { step: 'estado_pedido', ok: false, error: `Pedido ${idPedido} no encontrado en Pedidos Core` };
    }

    // KG solicitados: del Detalle del producto Biochar Blend.
    const dParams = new URLSearchParams({
      filterByFormula: `{ID Producto Core} = '${escapeAirtableValue(producto)}'`,
      pageSize: '100',
    });
    const dData = await at(`${AT}/${base}/${detallesTable}?${dParams.toString()}`, token);
    const detalle = (dData.records ?? []).find((d: AirtableRecord) =>
      ((d.fields?.['Pedido'] as string[] | undefined) ?? []).includes(pedido.id)
    );
    const kgSolicitados = toNumber(detalle?.fields?.['Cantidad Pedido']);

    // KG ya despachados: suma de Salidas del producto atribuidas a este pedido.
    const despachado = await kgDespachadosDePedido(idPedido);
    const total = r2(despachado + (despachado >= kgDespachadosAhora ? 0 : kgDespachadosAhora));

    const completo = kgSolicitados > 0 && total + 0.01 >= kgSolicitados;
    const estado = completo ? 'Enviado' : 'Enviado Parcial';

    await at(`${AT}/${base}/${pedidosTable}/${pedido.id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { Estado: estado } }),
    });

    return {
      step: 'estado_pedido',
      ok: true,
      detail: { estado, kgSolicitados, kgDespachados: total, lote },
    };
  } catch (err) {
    return { step: 'estado_pedido', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * KG de Blend ya despachados contra un pedido: suma de las Salidas del producto
 * cuyo `ubicacion_origen_id` es una remisión de ese pedido.
 *
 * Se deriva del libro mayor y no de un campo acumulador, que es lo que permite
 * despachos parciales sucesivos sin que se descuadre el saldo.
 */
export async function kgDespachadosDePedido(idPedido: string): Promise<number> {
  const base = config.airtable.inventarioProdCoreBaseId;
  const token = config.airtable.inventarioProdCoreToken;
  const movimientos = config.airtable.inventarioProdCoreMovimientosTable;
  const producto = config.airtable.inventarioProdCoreBiocharBlendProductId;
  if (!base || !token || !movimientos || !producto) return 0;

  const remisiones = await listarRemisiones({ pedido: idPedido }).catch(() => []);
  const codigos = new Set(remisiones.map((r) => r.codigo).filter(Boolean));
  if (!codigos.size) return 0;

  const params = new URLSearchParams({
    filterByFormula: `AND({tipo_movimiento} = 'Salida', {product_id} = '${escapeAirtableValue(producto)}')`,
    pageSize: '100',
  });
  const salidas = await atAll(base, movimientos, token, Object.fromEntries(params));

  const total = salidas
    .filter((m) => codigos.has(String(m.fields['ubicacion_origen_id'] ?? '')))
    .reduce((t, m) => t + toNumber(m.fields['cantidad']), 0);

  return r2(total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Firma
// ─────────────────────────────────────────────────────────────────────────────

export interface FirmarInput {
  receptor: { nombre: string; cedula: string; telefono?: string; email?: string };
  /** Aceptación explícita del tratamiento de datos (Ley 1581 de 2012). */
  autorizaDatos: boolean;
}

/**
 * Registra la firma del receptor: crea/reutiliza la persona, la vincula, y pasa la
 * remisión a `Entregada` con su `Fecha Recibido`.
 *
 * Idempotente: si ya está Entregada no vuelve a escribir, para que un doble toque
 * en el celular no genere dos receptores.
 */
export async function firmarRemision(
  idOrCodigo: string,
  input: FirmarInput
): Promise<{ ok: boolean; remision: RemisionBlend | null; steps: StepResult[]; yaFirmada?: boolean }> {
  const { baseId, token, remisionesTable } = coreConfig();
  const steps: StepResult[] = [];

  const remision = await resolverRemision(idOrCodigo);
  if (!remision) {
    return { ok: false, remision: null, steps: [{ step: 'resolver', ok: false, error: 'Remisión no encontrada' }] };
  }
  if (remision.estado === ESTADO_REMISION.entregada) {
    return { ok: true, remision, steps: [{ step: 'firma', ok: true, skipped: true }], yaFirmada: true };
  }
  if (!input.autorizaDatos) {
    return {
      ok: false,
      remision,
      steps: [{ step: 'firma', ok: false, error: 'Falta la autorización de tratamiento de datos' }],
    };
  }

  try {
    const personaId = await buscarOCrearPersona({ ...input.receptor, tipo: TIPO_PERSONA.receptor });
    if (personaId) await vincularPersonas(remision.recordId, [personaId]);
    steps.push({ step: 'receptor', ok: true, detail: { personaId } });
  } catch (err) {
    steps.push({ step: 'receptor', ok: false, error: err instanceof Error ? err.message : String(err) });
  }

  try {
    await at(`${AT}/${baseId}/${remisionesTable}/${remision.recordId}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        fields: {
          Estado: ESTADO_REMISION.entregada,
          'Fecha Recibido': new Date().toISOString().split('T')[0],
        },
      }),
    });
    steps.push({ step: 'entregada', ok: true });
  } catch (err) {
    steps.push({ step: 'entregada', ok: false, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, remision, steps };
  }

  return { ok: true, remision: await resolverRemision(remision.recordId), steps };
}

/** Guarda la URL del PDF y lo adjunta al documento del Core. */
export async function guardarDocumento(
  remisionRecordId: string,
  url: string,
  nombreArchivo: string
): Promise<void> {
  const { baseId, token, remisionesTable } = coreConfig();
  await at(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        'URL Remision Generada': url,
        'Documento Remision': [{ url, filename: nombreArchivo }],
      },
    }),
  });
}

/** Cambia el estado de una remisión, validando contra los valores del Core. */
export async function cambiarEstado(remisionRecordId: string, estado: string): Promise<void> {
  const valores = Object.values(ESTADO_REMISION) as string[];
  if (!valores.includes(estado)) {
    throw new Error(`Estado "${estado}" no válido. Opciones: ${valores.join(', ')}`);
  }
  const { baseId, token, remisionesTable } = coreConfig();
  await at(`${AT}/${baseId}/${remisionesTable}/${remisionRecordId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { Estado: estado } }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialización para la API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forma plana en snake_case que consumen la UI y los endpoints.
 *
 * Vive aquí y no en la ruta porque un archivo `route.ts` de Next solo puede
 * exportar handlers HTTP: exportar cualquier otra cosa rompe la verificación de
 * tipos del App Router. Tres rutas la comparten.
 */
export function serializarRemision(r: RemisionBlend) {
  return {
    id: r.recordId,
    codigo: r.codigo,
    estado: r.estado,
    id_pedido: r.idPedido,
    id_cliente: r.idCliente,
    cliente: r.clienteNombre,
    lote: r.lote,
    kg_total: r.kgTotal,
    fecha_remision: r.fechaRemision,
    fecha_despacho: r.fechaDespacho,
    fecha_recibido: r.fechaRecibido,
    responsable_entrega: r.responsableEntrega,
    documento_url: r.documentoUrl,
    observaciones: r.notas,
    personas: r.personas,
    // Derivados de la fórmula y del lote, no campos almacenados.
    kg_biochar_puro: r.composicion.biochar,
    kg_abono_4g: r.composicion.abono,
    kg_agua: r.composicion.agua,
    kg_biologicos: r.composicion.biologicos,
    co2_secuestrado_kg: r.co2SecuestradoKg,
    baches: r.baches,
  };
}

// Re-export para que las rutas no tengan que importar de dos módulos.
export { getProduccionBlend };

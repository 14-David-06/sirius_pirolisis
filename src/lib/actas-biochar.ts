// src/lib/actas-biochar.ts
//
// Acta de Entrega de Biochar: entrega SIN contraprestación comercial (investigación,
// ensayo de campo, piloto demostrativo o donación).
//
// ═══ QUÉ ES Y QUÉ NO ES ═══════════════════════════════════════════════════════
// NO genera remisión ni pedido: no es facturable, no hay cliente y no toca Sirius
// Pedidos Core ni Remisiones Core. Es la tercera puerta de salida del inventario,
// después del consumo productivo (`runBlendDeduction`) y de la salida simple de
// bache (`runSalidaBache`): más pesada que una salida —tiene receptor externo,
// consecutivo, evidencia fotográfica, PDF y firmas— y más liviana que una remisión.
//
// Su razón de ser es metodológica: deja constancia del uso previsto declarado,
// exigida por el numeral 5.4.2 de la Puro Biochar Methodology (2022 V3) siguiendo
// los principios del numeral 3.6 de la Edition 2025 V2.
//
// ═══ DOS LIBROS MAYORES, NO UNO ═══════════════════════════════════════════════
// El "tipo de biochar" del acta no es cosmético: decide de dónde se descuenta.
//
//   Biochar Puro  → insumo `Biochar Puro` en Sirius Insumos Core, con trazabilidad
//                   BACHE POR BACHE (es lo que sostiene la contabilidad de carbono).
//                   Se reusa `runSalidaBache()` una vez por bache.
//   Biochar Blend → producto terminado en Sirius Inventario Production Core, que
//                   sale de un LOTE `BLEND-…` ya producido.
//
// ═══ TODO EN MASA SECA ════════════════════════════════════════════════════════
// Los KG del acta son SIEMPRE masa seca (decisión de David, 2026-08-05), igual que
// el inventario (`Total Cantidad Actual Biochar Seco` y el insumo del Core). No hay
// conversión ni base a elegir: dar la opción de registrar el peso húmedo de la
// balanza contra un inventario seco era la vía directa a dejar el bache con biochar
// que no existe. La humedad se sigue guardando porque la sección 2 del acta la pide,
// pero no participa en ningún cálculo.
//
// ═══ CUÁNDO SE DESCUENTA ══════════════════════════════════════════════════════
// Al GENERAR el acta, no al firmarla (decisión de David, 2026-08-05): el biochar ya
// salió físicamente de la planta. Esperar la firma dejaría el stock mintiendo
// mientras el receptor no firme.

import { config } from './config';
import { escapeAirtableValue } from './airtable-escape';
import { resolveIdResponsableCore } from './movimientos-insumos';
import { runSalidaBache } from './salida-bache';
import { co2Secuestrado, composicionDeDespacho } from './blend-remisiones-core';
import {
  ACTA_FIELDS,
  BASE_SECA,
  ESTADO_ACTA,
  RECEPTOR_FIELDS,
  TIPO_BIOCHAR,
  codigoActa,
  consecutivoDeCodigo,
  normalizarHumedad,
} from './actas-biochar.constants';
import type { TipoBiochar } from './actas-biochar.constants';
import type { StepResult } from './blend-deduction';

const AT = 'https://api.airtable.com/v0';

function localHeaders() {
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

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Las fórmulas de Airtable pueden devolver `{ specialValue: 'NaN' }`. */
function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Receptores
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceptorInput {
  /** Record ID de un receptor ya existente. Si viene, se reutiliza tal cual. */
  id?: string;
  nombre?: string;
  tipo?: string;
  personaContacto?: string;
  documento?: string;
  direccion?: string;
  municipio?: string;
  departamento?: string;
  telefono?: string;
  correo?: string;
  esIntermediario?: boolean;
  observaciones?: string;
}

export interface Receptor {
  id: string;
  nombre: string;
  tipo: string;
  personaContacto: string;
  documento: string;
  direccion: string;
  municipio: string;
  departamento: string;
  telefono: string;
  correo: string;
  esIntermediario: boolean;
}

function mapReceptor(record: { id: string; fields?: Record<string, unknown> }): Receptor {
  const f = record.fields ?? {};
  return {
    id: record.id,
    nombre: String(f[RECEPTOR_FIELDS.nombre] ?? ''),
    tipo: String(f[RECEPTOR_FIELDS.tipo] ?? ''),
    personaContacto: String(f[RECEPTOR_FIELDS.personaContacto] ?? ''),
    documento: String(f[RECEPTOR_FIELDS.documento] ?? ''),
    direccion: String(f[RECEPTOR_FIELDS.direccion] ?? ''),
    municipio: String(f[RECEPTOR_FIELDS.municipio] ?? ''),
    departamento: String(f[RECEPTOR_FIELDS.departamento] ?? ''),
    telefono: String(f[RECEPTOR_FIELDS.telefono] ?? ''),
    correo: String(f[RECEPTOR_FIELDS.correo] ?? ''),
    esIntermediario: Boolean(f[RECEPTOR_FIELDS.esIntermediario]),
  };
}

export async function listarReceptores(): Promise<Receptor[]> {
  const { baseId, receptoresBiocharTableId } = config.airtable;
  if (!baseId || !receptoresBiocharTableId) {
    throw new Error('Falta AIRTABLE_RECEPTORES_BIOCHAR_TABLE_ID');
  }

  const registros: Array<{ id: string; fields?: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const url = new URL(`${AT}/${baseId}/${receptoresBiocharTableId}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const { ok, data } = await atFetch(url.toString(), { headers: localHeaders() });
    if (!ok) throw new Error(`Error al leer receptores: ${JSON.stringify(data)}`);
    registros.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return registros.map(mapReceptor).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Resuelve el receptor: reutiliza el existente si viene `id`, si no lo crea.
 *
 * Los receptores son tabla propia y no clientes de Sirius Clients Core: una
 * universidad o un agricultor que recibe una donación no genera pedido ni factura,
 * y meterlo en Clients Core lo volvería un cliente en todos los reportes de venta
 * del ecosistema. Reutilizarlos sí importa: es lo que permite consolidar
 * trazabilidad por institución cuando entrega varias actas.
 */
async function resolverReceptor(
  input: ReceptorInput,
  realizaRegistro: string,
  /**
   * En un ensayo NO se crea el receptor: se devuelve cómo quedaría. Sin esto el
   * dry-run dejaba un receptor real en Airtable mientras informaba que no había
   * escrito nada, que es peor que no tener dry-run.
   */
  dryRun = false
): Promise<{ receptor: Receptor; creado: boolean }> {
  const { baseId, receptoresBiocharTableId } = config.airtable;
  if (!baseId || !receptoresBiocharTableId) {
    throw new Error('Falta AIRTABLE_RECEPTORES_BIOCHAR_TABLE_ID');
  }

  if (input.id?.trim()) {
    const { ok, data } = await atFetch(
      `${AT}/${baseId}/${receptoresBiocharTableId}/${input.id.trim()}`,
      { headers: localHeaders() }
    );
    if (!ok) throw new Error(`No se encontró el receptor ${input.id}`);
    return { receptor: mapReceptor(data as { id: string; fields?: Record<string, unknown> }), creado: false };
  }

  const nombre = input.nombre?.trim();
  if (!nombre) throw new Error('El receptor necesita nombre (o el record ID de uno existente)');

  if (dryRun) {
    return {
      creado: true,
      receptor: {
        id: '',
        nombre,
        tipo: input.tipo ?? '',
        personaContacto: input.personaContacto ?? '',
        documento: input.documento ?? '',
        direccion: input.direccion ?? '',
        municipio: input.municipio ?? '',
        departamento: input.departamento ?? '',
        telefono: input.telefono ?? '',
        correo: input.correo ?? '',
        esIntermediario: Boolean(input.esIntermediario),
      },
    };
  }

  const fields: Record<string, unknown> = { [RECEPTOR_FIELDS.nombre]: nombre };
  const opcional = (campo: string, valor?: string) => {
    if (valor?.trim()) fields[campo] = valor.trim();
  };
  opcional(RECEPTOR_FIELDS.tipo, input.tipo);
  opcional(RECEPTOR_FIELDS.personaContacto, input.personaContacto);
  opcional(RECEPTOR_FIELDS.documento, input.documento);
  opcional(RECEPTOR_FIELDS.direccion, input.direccion);
  opcional(RECEPTOR_FIELDS.municipio, input.municipio);
  opcional(RECEPTOR_FIELDS.departamento, input.departamento);
  opcional(RECEPTOR_FIELDS.telefono, input.telefono);
  opcional(RECEPTOR_FIELDS.correo, input.correo);
  opcional(RECEPTOR_FIELDS.observaciones, input.observaciones);
  if (input.esIntermediario) fields[RECEPTOR_FIELDS.esIntermediario] = true;
  fields[RECEPTOR_FIELDS.realizaRegistro] = realizaRegistro;

  const { ok, data } = await atFetch(`${AT}/${baseId}/${receptoresBiocharTableId}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!ok) throw new Error(`Error creando el receptor: ${JSON.stringify(data)}`);

  return { receptor: mapReceptor(data as { id: string; fields?: Record<string, unknown> }), creado: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consecutivo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Siguiente `ACTA-BC-XXXX`.
 *
 * Se calcula leyendo el mayor consecutivo existente porque la API de Airtable NO
 * permite crear campos `autoNumber` (`UNSUPPORTED_FIELD_TYPE_FOR_CREATE`), que
 * sería la forma a prueba de carreras. El riesgo real es bajo —las actas se llenan
 * de una en una, a mano— y el llamador verifica que el código no esté tomado antes
 * de escribir. Si algún día se crean en paralelo, la solución es agregar un
 * autoNumber DESDE LA UI de Airtable y leerlo en vez de calcularlo.
 */
async function siguienteCodigoActa(): Promise<string> {
  const { baseId, actasBiocharTableId } = config.airtable;
  if (!baseId || !actasBiocharTableId) throw new Error('Falta AIRTABLE_ACTAS_BIOCHAR_TABLE_ID');

  let mayor = 0;
  let offset: string | undefined;
  do {
    const url = new URL(`${AT}/${baseId}/${actasBiocharTableId}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('fields[]', ACTA_FIELDS.idActa);
    if (offset) url.searchParams.set('offset', offset);
    const { ok, data } = await atFetch(url.toString(), { headers: localHeaders() });
    if (!ok) throw new Error(`Error al leer las actas existentes: ${JSON.stringify(data)}`);
    for (const rec of data.records ?? []) {
      mayor = Math.max(mayor, consecutivoDeCodigo(rec.fields?.[ACTA_FIELDS.idActa]));
    }
    offset = data.offset;
  } while (offset);

  return codigoActa(mayor + 1);
}

/** ¿Ya hay un acta con ese código? Última defensa del consecutivo calculado. */
async function codigoTomado(codigo: string): Promise<boolean> {
  const { baseId, actasBiocharTableId } = config.airtable;
  const url = new URL(`${AT}/${baseId}/${actasBiocharTableId}`);
  url.searchParams.set(
    'filterByFormula',
    `{${ACTA_FIELDS.idActa}} = '${escapeAirtableValue(codigo)}'`
  );
  url.searchParams.set('maxRecords', '1');
  const { ok, data } = await atFetch(url.toString(), { headers: localHeaders() });
  if (!ok) throw new Error(`No se pudo verificar el consecutivo: ${JSON.stringify(data)}`);
  return (data.records ?? []).length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Origen del biochar
// ─────────────────────────────────────────────────────────────────────────────

export interface BacheEntregado {
  /** Record ID o `Codigo Bache`. */
  bache: string;
  /** KG a tomar de ese bache, en la base declarada por el acta. */
  kg: number;
}

interface OrigenResuelto {
  /** Códigos legibles de lo entregado: baches o el lote. */
  loteEntregado: string;
  /** Humedad del lote, en %. 0 si no se pudo determinar. */
  humedadPct: number;
  /** URL al registro de producción en la app. */
  vinculo: string;
  detalle: string;
}

/**
 * Códigos, disponible y humedad de los baches entregados.
 *
 * La humedad NO se digita en el formulario: el bache ya la tiene y el acta la trae
 * de aquí. Sale del lookup `% Humedad (MC) (from Monitoreo Baches)`, que es
 * `multilineText` porque un bache monitoreado varias veces trae varias lecturas y
 * ninguna es "la" humedad; se promedian las que haya.
 *
 * La humedad del LOTE (cuando son varios baches) se pondera por los KG que sale de
 * cada uno, no con un promedio simple: 500 kg al 12% con 5 kg al 40% es un lote al
 * 12,3%, no al 26%. Es un número que va impreso en un acta firmada.
 */
async function resolverBaches(
  baches: BacheEntregado[],
  origen: string
): Promise<OrigenResuelto & { codigos: string[]; disponibles: number[] }> {
  const { baseId, bachesTableId } = config.airtable;
  if (!baseId || !bachesTableId) throw new Error('Configuración de baches incompleta');

  const codigos: string[] = [];
  const disponibles: number[] = [];
  /** Humedad de cada bache y los KG con que pondera. */
  const ponderadas: Array<{ humedad: number; kg: number }> = [];

  for (const item of baches) {
    const esRec = /^rec[A-Za-z0-9]{14}$/.test(item.bache);
    let fields: Record<string, unknown> = {};

    if (esRec) {
      const { ok, data } = await atFetch(`${AT}/${baseId}/${bachesTableId}/${item.bache}`, {
        headers: localHeaders(),
      });
      if (!ok) throw new Error(`No se encontró el bache ${item.bache}`);
      fields = data.fields ?? {};
    } else {
      const url = new URL(`${AT}/${baseId}/${bachesTableId}`);
      url.searchParams.set('filterByFormula', `{Codigo Bache} = '${escapeAirtableValue(item.bache)}'`);
      url.searchParams.set('maxRecords', '1');
      const { ok, data } = await atFetch(url.toString(), { headers: localHeaders() });
      if (!ok || !data.records?.length) throw new Error(`No existe un bache con código ${item.bache}`);
      fields = data.records[0].fields ?? {};
    }

    codigos.push(String(fields['Codigo Bache'] ?? item.bache));
    disponibles.push(toNumber(fields['Total Cantidad Actual Biochar Seco']));

    const crudo = String(fields['% Humedad (MC) (from Monitoreo Baches)'] ?? '');
    const lecturas = crudo.match(/[\d.]+/g)?.map(Number).filter(Number.isFinite) ?? [];
    if (lecturas.length) {
      ponderadas.push({
        humedad: lecturas.reduce((a, b) => a + b, 0) / lecturas.length,
        kg: Number(item.kg) || 0,
      });
    }
  }

  const kgConHumedad = ponderadas.reduce((s, p) => s + p.kg, 0);

  return {
    codigos,
    disponibles,
    loteEntregado: codigos.join(', '),
    humedadPct: kgConHumedad
      ? r2(ponderadas.reduce((s, p) => s + p.humedad * p.kg, 0) / kgConHumedad)
      : 0,
    vinculo: codigos.length === 1 ? `${origen}/bache/${codigos[0]}` : `${origen}/sistema-baches`,
    detalle: baches.map((b, i) => `${codigos[i]}=${b.kg}`).join('\n'),
  };
}

/** Stock de Biochar Blend en Inventario Production Core, en kg. */
async function stockBlendCore(): Promise<number | null> {
  const base = config.airtable.inventarioProdCoreBaseId;
  const token = config.airtable.inventarioProdCoreToken;
  const stockTable = config.airtable.inventarioProdCoreStockTable;
  const productId = config.airtable.inventarioProdCoreBiocharBlendProductId;
  if (!base || !token || !stockTable || !productId) return null;

  const url = new URL(`${AT}/${base}/${stockTable}`);
  url.searchParams.set('filterByFormula', `{producto_id} = '${escapeAirtableValue(productId)}'`);
  url.searchParams.set('maxRecords', '1');
  const { ok, data } = await atFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!ok) return null;

  const rec = data.records?.[0];
  if (!rec) return null;
  // El nombre del campo de saldo varía entre bases del ecosistema; se tolera.
  const f = rec.fields ?? {};
  const candidato = ['stock_actual', 'Stock Actual', 'cantidad_actual', 'saldo'].find(
    (k) => f[k] !== undefined
  );
  return candidato ? toNumber(f[candidato]) : null;
}

/**
 * Salida de Biochar Blend (producto terminado) en Inventario Production Core.
 *
 * Idempotente por `documento_referencia` = el código del acta, igual que el
 * despacho de una remisión usa `DESP-<remisión>`. Reintentar no descuenta dos veces.
 */
async function descontarBlend(
  codigoActaEntrega: string,
  kg: number,
  receptor: string,
  fecha: string,
  responsable: string
): Promise<StepResult> {
  const base = config.airtable.inventarioProdCoreBaseId;
  const token = config.airtable.inventarioProdCoreToken;
  const movimientos = config.airtable.inventarioProdCoreMovimientosTable;
  const stockTable = config.airtable.inventarioProdCoreStockTable;
  const productId = config.airtable.inventarioProdCoreBiocharBlendProductId;

  if (!base || !token || !movimientos || !productId) {
    return {
      step: 'inventario_blend',
      ok: false,
      error:
        'Sirius Inventario Production Core no está configurado: la salida de Blend no se registró y ' +
        'el stock de producto terminado queda por encima del real.',
    };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const doc = `ACTA-${codigoActaEntrega}`;

  const dup = new URL(`${AT}/${base}/${movimientos}`);
  dup.searchParams.set('filterByFormula', `{documento_referencia} = '${escapeAirtableValue(doc)}'`);
  dup.searchParams.set('maxRecords', '1');
  const yaEsta = await atFetch(dup.toString(), { headers });
  if (yaEsta.ok && yaEsta.data.records?.length) {
    return { step: 'inventario_blend', ok: true, skipped: true, detail: { doc, yaExistia: true } };
  }

  let stockRecordId: string | null = null;
  if (stockTable) {
    const q = new URL(`${AT}/${base}/${stockTable}`);
    q.searchParams.set('filterByFormula', `{producto_id} = '${escapeAirtableValue(productId)}'`);
    q.searchParams.set('maxRecords', '1');
    const s = await atFetch(q.toString(), { headers });
    if (s.ok) stockRecordId = s.data.records?.[0]?.id ?? null;
  }

  const fields: Record<string, unknown> = {
    product_id: productId,
    tipo_movimiento: 'Salida',
    cantidad: r2(kg),
    unidad_medida: 'kg',
    motivo: 'Entrega con acta (sin contraprestación comercial)',
    documento_referencia: doc,
    responsable,
    ubicacion_destino_id: receptor,
    fecha_movimiento: `${fecha}T12:00:00.000Z`,
    observaciones: `Entrega documentada en el acta ${codigoActaEntrega}. No es una venta: no genera remisión ni pedido.`,
  };
  if (stockRecordId) fields.Stock_Actual = [stockRecordId];

  const res = await atFetch(`${AT}/${base}/${movimientos}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!res.ok) return { step: 'inventario_blend', ok: false, error: JSON.stringify(res.data) };

  return {
    step: 'inventario_blend',
    ok: true,
    detail: { movimientoId: res.data.records?.[0]?.id, doc, kg: r2(kg) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Creación del acta
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearActaInput {
  tipoBiochar: TipoBiochar;
  /** Solo para Biochar Puro: de qué baches y cuántos kg de cada uno. */
  baches?: BacheEntregado[];
  /** Solo para Biochar Blend: lote `BLEND-…` y KG (masa seca). */
  lote?: string;
  kg?: number;
  /**
   * Humedad del lote en %, informativa para el acta.
   *
   * El formulario NO la envía: para el biochar puro la trae el monitoreo del bache.
   * Sigue aceptándose porque el Blend no cuelga de un bache y es la única forma de
   * registrarla en esa rama. No entra en ningún cálculo.
   */
  humedadPct?: number;

  receptor: ReceptorInput;

  nombreProyecto: string;
  ubicacionAplicacion: string;
  coordenadasGps?: string;
  categoriaUso: string;
  categoriaUsoOtro?: string;
  fechaEstimadaAplicacion?: string;
  duracionEnsayo?: string;

  fechaEntrega?: string;
  elaboradoPor: string;
  cargoElaboradoPor?: string;
  idResponsableCore?: string;
  observaciones?: string;
  /** URLs ya subidas (S3) de las fotos de la entrega. */
  fotos?: string[];

  /** Origen de la app, para armar el vínculo al registro de producción. */
  origenUrl?: string;
  /** Valida y calcula todo sin escribir nada. */
  dryRun?: boolean;
}

export interface CrearActaResult {
  ok: boolean;
  codigoActa: string;
  actaId: string | null;
  dryRun?: boolean;
  receptor: Receptor;
  receptorCreado: boolean;
  tipoBiochar: TipoBiochar;
  loteEntregado: string;
  /** `kg` es masa seca: es lo entregado, lo descontado y lo que firma el acta. */
  cantidad: { kg: number; base: typeof BASE_SECA; humedadPct: number };
  co2SecuestradoKg: number;
  steps: StepResult[];
}

/**
 * Crea el acta y descuenta el inventario.
 *
 * Orden deliberado: el acta se escribe PRIMERO en `Borrador` para tener el
 * consecutivo, porque ese código es la llave de idempotencia de los descuentos
 * (`ACTA-BC-0007-S-00171` en cada bache, `ACTA-ACTA-BC-0007` en el Blend). Si se
 * descontara antes, un fallo al crear el acta dejaría inventario descontado sin
 * documento que lo explique — el "biochar fantasma" de la auditoría del 2026-07-29.
 *
 * El acta pasa a `Generada` solo si el descuento crítico salió bien; si falla, queda
 * en `Borrador` con el error a la vista en vez de aparentar estar en regla.
 */
export async function crearActaEntrega(input: CrearActaInput): Promise<CrearActaResult> {
  const { baseId, actasBiocharTableId } = config.airtable;
  if (!baseId || !actasBiocharTableId) throw new Error('Falta AIRTABLE_ACTAS_BIOCHAR_TABLE_ID');

  const fecha = input.fechaEntrega?.trim() || new Date().toISOString().split('T')[0];
  const origen = input.origenUrl?.replace(/\/$/, '') ?? '';
  const steps: StepResult[] = [];

  // 1. Origen del biochar y humedad, según la rama. `kgSeca` son los KG que el
  //    operador digitó: ya son masa seca, no hay otra base.
  let loteEntregado: string;
  let humedadPct = normalizarHumedad(input.humedadPct);
  let vinculo = '';
  let detalle = '';
  let kgSeca: number;
  let porBache: Array<{ codigo: string; kg: number; disponible: number }> = [];

  if (input.tipoBiochar === TIPO_BIOCHAR.puro) {
    const baches = (input.baches ?? []).filter((b) => b.bache?.trim() && Number(b.kg) > 0);
    if (!baches.length) throw new Error('Selecciona al menos un bache y los KG que salen de cada uno');

    const resuelto = await resolverBaches(baches, origen);
    loteEntregado = resuelto.loteEntregado;
    vinculo = resuelto.vinculo;
    detalle = resuelto.detalle;
    if (!input.humedadPct) humedadPct = normalizarHumedad(resuelto.humedadPct);
    kgSeca = r2(baches.reduce((s, b) => s + Number(b.kg), 0));
    porBache = baches.map((b, i) => ({
      codigo: resuelto.codigos[i],
      kg: r2(Number(b.kg)),
      disponible: resuelto.disponibles[i],
    }));
  } else {
    const lote = input.lote?.trim();
    kgSeca = r2(Number(input.kg));
    if (!lote) throw new Error('Indica el lote de Blend entregado (BLEND-…)');
    if (!Number.isFinite(kgSeca) || kgSeca <= 0) throw new Error('Indica los KG de Blend entregados');

    const stock = await stockBlendCore();
    if (stock !== null && kgSeca > stock + 0.01) {
      throw new Error(
        `Solo hay ${stock.toFixed(2)} kg de Biochar Blend en inventario (se pidieron ${kgSeca.toFixed(2)}).`
      );
    }
    loteEntregado = lote;
    vinculo = origen ? `${origen}/calendario-blend` : '';
    detalle = `${lote}=${kgSeca}`;
  }

  // 2. Stock por bache.
  //
  // Va ANTES de crear el acta y también corre en el ensayo. Antes la única defensa
  // estaba dentro de `runSalidaBache`, es decir DESPUÉS de haber escrito el acta:
  // un pedido imposible dejaba un acta en Borrador y un ensayo que reportaba 99.999
  // kg de un bache de 579 como si nada.
  for (const b of porBache) {
    if (b.kg > b.disponible + 0.01) {
      throw new Error(
        `El bache ${b.codigo} solo tiene ${b.disponible.toFixed(2)} kg de biochar seco ` +
          `(se pidieron ${b.kg.toFixed(2)} kg).`
      );
    }
  }

  // 3. CO₂ del biochar entregado. Informativo: la sección 7 del acta declara que los
  //    CORCs están desacoplados del producto físico y no los reclama el receptor.
  const kgBiocharPuro =
    input.tipoBiochar === TIPO_BIOCHAR.puro ? kgSeca : composicionDeDespacho(kgSeca).biochar;
  const co2 = co2Secuestrado(kgBiocharPuro);

  // 4. Receptor (se reutiliza o se crea; en un ensayo solo se previsualiza).
  const { receptor, creado } = await resolverReceptor(
    input.receptor,
    input.elaboradoPor,
    input.dryRun === true
  );

  const base = {
    ok: true,
    receptor,
    receptorCreado: creado,
    tipoBiochar: input.tipoBiochar,
    loteEntregado,
    cantidad: { kg: kgSeca, base: BASE_SECA, humedadPct },
    co2SecuestradoKg: co2,
  };

  if (input.dryRun) {
    return {
      ...base,
      codigoActa: await siguienteCodigoActa(),
      actaId: null,
      dryRun: true,
      steps: [
        {
          step: 'acta',
          ok: true,
          detail: { porEscribir: { loteEntregado, kgSeca, humedadPct, co2 } },
        },
      ],
    };
  }

  // 5. Consecutivo y acta en Borrador.
  let codigo = await siguienteCodigoActa();
  if (await codigoTomado(codigo)) {
    // Otra creación se metió en el medio: se recalcula una sola vez. Un segundo
    // choque significa concurrencia real y ahí toca el autoNumber desde la UI.
    codigo = await siguienteCodigoActa();
    if (await codigoTomado(codigo)) {
      throw new Error(`El consecutivo ${codigo} ya está tomado: vuelve a intentar.`);
    }
  }

  const idResponsable = await resolveIdResponsableCore(input.idResponsableCore);

  const fields: Record<string, unknown> = {
    [ACTA_FIELDS.idActa]: codigo,
    [ACTA_FIELDS.fechaEntrega]: fecha,
    [ACTA_FIELDS.elaboradoPor]: input.elaboradoPor,
    [ACTA_FIELDS.estado]: ESTADO_ACTA.borrador,
    [ACTA_FIELDS.tipoBiochar]: input.tipoBiochar,
    [ACTA_FIELDS.loteEntregado]: loteEntregado,
    [ACTA_FIELDS.detallePorBache]: detalle,
    // Entregada y seca son el MISMO número: la planta maneja todo en masa seca.
    // `Cantidad Humeda KG` se deja vacío a propósito: nadie pesó eso, y un derivado
    // impreso en un acta firmada se lee como una medición que no se hizo.
    [ACTA_FIELDS.cantidadEntregada]: kgSeca,
    [ACTA_FIELDS.baseCantidad]: BASE_SECA,
    [ACTA_FIELDS.cantidadSeca]: kgSeca,
    [ACTA_FIELDS.humedadPct]: humedadPct,
    [ACTA_FIELDS.co2]: co2,
    [ACTA_FIELDS.receptor]: [receptor.id],
    [ACTA_FIELDS.actuaComoIntermediario]: Boolean(input.receptor.esIntermediario ?? receptor.esIntermediario),
    [ACTA_FIELDS.nombreProyecto]: input.nombreProyecto,
    [ACTA_FIELDS.ubicacionAplicacion]: input.ubicacionAplicacion,
    [ACTA_FIELDS.categoriaUso]: input.categoriaUso,
  };
  if (input.cargoElaboradoPor?.trim()) fields[ACTA_FIELDS.cargoElaboradoPor] = input.cargoElaboradoPor.trim();
  if (idResponsable) fields[ACTA_FIELDS.idResponsableCore] = idResponsable;
  if (vinculo) fields[ACTA_FIELDS.vinculoProduccion] = vinculo;
  if (input.coordenadasGps?.trim()) fields[ACTA_FIELDS.coordenadasGps] = input.coordenadasGps.trim();
  if (input.categoriaUsoOtro?.trim()) fields[ACTA_FIELDS.categoriaUsoOtro] = input.categoriaUsoOtro.trim();
  if (input.fechaEstimadaAplicacion?.trim()) {
    fields[ACTA_FIELDS.fechaEstimadaAplicacion] = input.fechaEstimadaAplicacion.trim();
  }
  if (input.duracionEnsayo?.trim()) fields[ACTA_FIELDS.duracionEnsayo] = input.duracionEnsayo.trim();
  if (input.observaciones?.trim()) fields[ACTA_FIELDS.observaciones] = input.observaciones.trim();
  if (input.fotos?.length) {
    fields[ACTA_FIELDS.registroFotografico] = input.fotos.map((url) => ({ url }));
  }

  const creacion = await atFetch(`${AT}/${baseId}/${actasBiocharTableId}`, {
    method: 'POST',
    headers: localHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!creacion.ok) {
    throw new Error(`Error creando el acta: ${JSON.stringify(creacion.data)}`);
  }
  const actaId = creacion.data.id as string;
  steps.push({ step: 'acta', ok: true, detail: { actaId, codigo } });

  // 6. Descuento del inventario (CRÍTICO), con el código del acta como llave.
  let descuentoOk = true;
  if (input.tipoBiochar === TIPO_BIOCHAR.puro) {
    const baches = (input.baches ?? []).filter((b) => b.bache?.trim() && Number(b.kg) > 0);

    for (const item of baches) {
      try {
        const salida = await runSalidaBache({
          bache: item.bache,
          kg: r2(Number(item.kg)),
          motivo: 'entrega',
          destino: receptor.nombre,
          observaciones: `Entrega con acta ${codigo} — proyecto ${input.nombreProyecto}`,
          realizaRegistro: input.elaboradoPor,
          idResponsableCore: input.idResponsableCore,
          fecha,
          referenciaBase: codigo,
        });
        for (const paso of salida.steps) {
          steps.push({ ...paso, step: `${paso.step}:${salida.bache.codigo}` });
        }
        if (!salida.ok) descuentoOk = false;
      } catch (err) {
        descuentoOk = false;
        steps.push({
          step: `salida_bache:${item.bache}`,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else {
    const paso = await descontarBlend(codigo, kgSeca, receptor.nombre, fecha, input.elaboradoPor);
    steps.push(paso);
    if (!paso.ok) descuentoOk = false;
  }

  // 7. El acta pasa a Generada solo si el inventario quedó descontado.
  if (descuentoOk) {
    const patch = await atFetch(`${AT}/${baseId}/${actasBiocharTableId}/${actaId}`, {
      method: 'PATCH',
      headers: localHeaders(),
      body: JSON.stringify({ fields: { [ACTA_FIELDS.estado]: ESTADO_ACTA.generada } }),
    });
    steps.push(
      patch.ok
        ? { step: 'estado_acta', ok: true, detail: { estado: ESTADO_ACTA.generada } }
        : { step: 'estado_acta', ok: false, error: JSON.stringify(patch.data) }
    );
  } else {
    steps.push({
      step: 'estado_acta',
      ok: false,
      error: `El acta ${codigo} queda en Borrador: el descuento de inventario falló. Revisa los pasos y reintenta (es idempotente).`,
    });
  }

  return { ...base, ok: descuentoOk, codigoActa: codigo, actaId, steps };
}

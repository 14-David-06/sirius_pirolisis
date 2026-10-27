// src/lib/blend-remisiones-core.ts
//
// Remisiones de pirólisis —Biochar Blend y, desde el 2026-10-21, Biochar puro—
// con Sirius Remisiones Core como DUEÑO del registro.
//
// ═══ POR QUÉ ESTE MÓDULO ══════════════════════════════════════════════════════
// Antes la remisión vivía en la tabla local `blend_remisiones` de PiroliApp y
// `blend-core-sync.ts` la espejaba hacia el Core. Esa tabla se borró (era data de
// prueba), así que la propiedad se invierte: el Core es el registro y no hay copia
// local. Mismo modelo que usa el laboratorio.
//
// El acceso GENÉRICO al Core (configuración, personas, estado, documento,
// lecturas crudas) se mudó a `remisiones-core.ts` y se reexporta desde aquí con
// los mismos nombres. Aquí queda lo que es del producto: el mapeo con derivados
// (`RemisionBlend`), la emisión del despacho de Blend y su Salida de inventario.
//
// ═══ DÓNDE VIVE CADA COSA ═════════════════════════════════════════════════════
//   Sirius Remisiones Core  `Remisiones`         → el documento (SIRIUS-REM-XXXX)
//                           `Productos Remitidos`→ una fila por lote (Blend) o por
//                                                  el total (biochar)
//                           `Personas`           → transportista y receptor
//   Sirius Inventario Prod. `Movimientos_Inventario` → la Salida del producto
//   Sirius Pedidos Core     `Pedidos`            → el estado del pedido
//   Sirius Clients Core     `Clientes`           → el nombre del cliente
//
// ═══ LO QUE NO SE GUARDA, SE DERIVA ═══════════════════════════════════════════
// Remisiones Core no tiene campos para la composición del Blend, el CO₂ ni los
// baches, y NO se le agregan: es una base compartida con el laboratorio y meterle
// campos de un solo producto la ensucia para todos.
//
// No hace falta: todo eso es DERIVABLE de las marcas de las notas.
//   - composición  → proporción real del lote (o la fórmula de `config.blend`)
//   - CO₂          → kg de biochar × `config.carbon.factorSecuestroCo2`
//   - baches       → Blend: las Salidas de biochar del lote; biochar: `[bache:S=kg]`
// Guardarlo sería duplicar un dato que ya existe y que puede divergir.

import { config } from './config';
import { escapeAirtableValue, esRecordId } from './airtable-escape';
import { obtenerAreaCliente } from './areas-cliente-core';
import {
  getProduccionBlend,
  getProduccionPorLote,
  type BacheDeLote,
} from './blend-produccion-core';
import { fechaBogota } from './fecha-bogota';
import {
  NOMBRE_PRODUCTO,
  bachesDeNotas,
  correoDeNotas,
  esIdDespacho,
  idDespachoDeNotas,
  kgRemitidoDeRemision,
  marcaDespacho,
  recibidaDeNotas,
  remisionCrudaDeRegistro,
  tipoRemision,
  type BacheDeRemision,
  type ProductoPirolisis,
} from './remision-pirolisis.constants';
import {
  AT,
  ESTADO_REMISION,
  TIPO_PERSONA,
  atAllRemisiones,
  atRemisiones,
  buscarOCrearPersona,
  descartarRemision,
  emitirDocumentoRemision,
  listarRemisionesCrudas,
  nombreCliente,
  personasDeRemision,
  remisionesCoreConfig,
  vincularPersonas,
  type PersonaRemision,
  type RegistroAirtable,
} from './remisiones-core';
import { actualizarEstadoPedidoPirolisis } from './pedidos-pirolisis-estado';
import type { StepResult } from '@/types/step-result';

// Lo genérico vive en `remisiones-core.ts`; se reexporta para que ningún
// importador existente (rutas, despacho, scripts) tenga que cambiar.
export {
  ESTADO_REMISION,
  TIPO_PERSONA,
  adjuntarDocumento,
  buscarOCrearPersona,
  cambiarEstado,
  nombreCliente,
  vincularPersonas,
} from './remisiones-core';
export type { PersonaRemision } from './remisiones-core';
export type { StepResult } from '@/types/step-result';

/** Marca que identifica una remisión de Blend y su lote dentro de las notas. */
const MARCA_LOTE_G = /\[lote:([A-Za-z0-9\-_]+)\]/g;
const MARCA_LOTE = /\[lote:([A-Za-z0-9\-_]+)\]/;

/**
 * KG que salen de cada lote cuando la remisión cubre VARIOS: `[kg-lote:<lote>=<kg>]`.
 *
 * Un pedido se produce en tantas tandas como alcancen el abono y el biochar, y se
 * despacha completo en un solo documento. Sin el reparto, la composición y el CO₂
 * de la remisión no se podrían derivar: cada lote tiene su propia proporción real
 * de biochar. Con una sola marca `[lote:…]` no hace falta: todo sale de ese lote.
 */
const MARCA_KG_LOTE_G = /\[kg-lote:([A-Za-z0-9\-_]+)=([0-9.]+)\]/g;

export interface LoteDeRemision {
  lote: string;
  kg: number;
}

export interface ComposicionBlend {
  biochar: number;
  abono: number;
  agua: number;
  biologicos: number;
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
  /** `AC-XXXX` del área del cliente a la que va, o vacío si no se indicó. */
  idAreaCliente: string;
  /** Nombre del área, resuelto de Clients Core. Cae al código si no responde. */
  areaClienteNombre: string;
  /** `BLEND-…`: la llave al lote producido. Con varios lotes, separados por coma. */
  lote: string;
  /** De qué lote sale cada kg. Uno solo en la remisión normal; vacío en biochar. */
  lotes: LoteDeRemision[];
  kgTotal: number;
  fechaRemision: string;
  fechaDespacho: string;
  fechaRecibido: string;
  responsableEntrega: string;
  documentoUrl: string;
  notas: string;
  personas: PersonaRemision[];
  /**
   * De qué producto es. `ajena` = no la emitió PiroliApp (DataLab, o una prueba
   * vieja como `[blend:TEST-DIAG]`): se muestra pero no se le deriva nada.
   */
  tipo: ProductoPirolisis | 'ajena';
  /** `SIRIUS-PRODUCT-…` del producto remitido, o vacío si es ajena. */
  productoId: string;
  /** Como lo imprime el documento: `Biochar Blend`, `Biochar`. */
  productoNombre: string;
  /** Llave `[desp:<uuid>]` del despacho que la creó, si la tiene. */
  idDespacho: string | null;
  /**
   * De qué bache sale cada kg de biochar puro (`[bache:S=kg]`). En una de Blend,
   * el biochar que viaja con él en la misma entrega (mixta); casi siempre vacío.
   */
  bachesRemitidos: BacheDeRemision[];
  /** Instante ISO de la confirmación por enlace (`[recibida:]`), con hora. */
  recibidaEn: string | null;
  /** Instante ISO en que el comprobante salió por correo (`[correo:]`). */
  correoEnviadoEn: string | null;
  /** Nombres de archivo de `Documento Remision`. */
  documentos: string[];
  // ── Derivados (no viven en el Core) ──
  composicion: ComposicionBlend;
  co2SecuestradoKg: number;
  baches: BacheDeLote[];
}

/** El mismo tipo con un nombre que no miente: ya no es solo de Blend. */
export type RemisionPirolisis = RemisionBlend;

function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

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

/**
 * Los lotes de una remisión con los KG de cada uno.
 *
 * Una remisión de un solo lote no lleva `[kg-lote:…]`: todo el total es de ese
 * lote. Es la forma de todas las emitidas antes de los despachos multilote. La
 * excepción es la mixta (Blend con biochar puro): su total suma los dos productos,
 * así que el lote lleva su `[kg-lote:…]` y manda la marca.
 */
export function lotesDeNotas(notas: string, kgTotal: number): LoteDeRemision[] {
  const codigos = [...new Set([...notas.matchAll(MARCA_LOTE_G)].map((m) => m[1]))];
  const kgPorLote = new Map(
    [...notas.matchAll(MARCA_KG_LOTE_G)].map((m) => [m[1], toNumber(m[2])] as const)
  );
  if (codigos.length === 1 && !kgPorLote.has(codigos[0])) return [{ lote: codigos[0], kg: kgTotal }];
  return codigos.map((lote) => ({ lote, kg: kgPorLote.get(lote) ?? 0 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

const SIN_COMPOSICION: ComposicionBlend = { biochar: 0, abono: 0, agua: 0, biologicos: 0 };

/**
 * Composición y baches de una remisión de Blend, desde sus lotes. Es la ÚNICA
 * parte del mapeo que lee el inventario, y solo corre para el Blend: una de
 * biochar ya trae sus baches en las marcas y una ajena no tiene lotes nuestros
 * (aunque alguien haya escrito `[lote:` en sus notas).
 */
async function derivadosBlend(
  lotes: LoteDeRemision[],
  kgTotal: number
): Promise<{ composicion: ComposicionBlend; baches: BacheDeLote[] }> {
  // Proporción real de biochar de cada lote y sus baches. Con varios lotes, el
  // biochar de la remisión es lo que aporta cada uno con SU proporción: un
  // promedio simple le daría a la tanda chica el mismo peso que a la grande.
  let kgBiocharReal = 0;
  let todosConProporcion = lotes.length > 0;
  const baches: BacheDeLote[] = [];
  for (const { lote, kg } of lotes) {
    let proporcion: number | undefined;
    try {
      const prod = await getProduccionPorLote(lote);
      if (prod && prod.kgTotal > 0) {
        const kgBiochar = prod.baches.reduce((total, b) => total + b.kg, 0);
        if (kgBiochar > 0) proporcion = kgBiochar / prod.kgTotal;
        baches.push(...prod.baches);
      }
    } catch (err) {
      console.warn(`⚠️ No se pudo resolver el lote ${lote}:`, err);
    }
    if (proporcion === undefined) todosConProporcion = false;
    kgBiocharReal += kg * (proporcion ?? config.blend.pctBiochar);
  }
  // Si a algún lote le falta la proporción real, se cae a la fórmula para todo:
  // mezclar lo real con lo teórico daría un número que no es ninguno de los dos.
  const proporcionBiochar =
    todosConProporcion && kgTotal > 0 ? kgBiocharReal / kgTotal : undefined;

  return { composicion: composicionDeDespacho(kgTotal, proporcionBiochar), baches };
}

/** Normaliza un registro del Core a `RemisionBlend`, resolviendo los derivados. */
async function mapRemision(rec: RegistroAirtable): Promise<RemisionBlend> {
  const cruda = remisionCrudaDeRegistro(rec);
  const tipo = tipoRemision(cruda) ?? 'ajena';
  const notas = cruda.notas;

  let kgTotal = cruda.kgRollup;
  let lotes: LoteDeRemision[] = [];
  let bachesRemitidos: BacheDeRemision[] = [];
  let composicion = SIN_COMPOSICION;
  let baches: BacheDeLote[] = [];

  if (tipo === 'blend') {
    // Mixta: el biochar puro que viaja con el Blend, y el total que queda es solo
    // el Blend (el rollup trae los dos).
    bachesRemitidos = bachesDeNotas(notas);
    kgTotal = kgRemitidoDeRemision(cruda)?.kg ?? kgTotal;
    lotes = lotesDeNotas(notas, kgTotal);
    ({ composicion, baches } = await derivadosBlend(lotes, kgTotal));
  } else if (tipo === 'biochar') {
    // Los kg salen de las marcas, no del rollup: el Core lo muestra sin decimales
    // y las marcas son lo que se descontó del inventario, bache por bache.
    bachesRemitidos = bachesDeNotas(notas);
    kgTotal = kgRemitidoDeRemision(cruda)?.kg ?? kgTotal;
    composicion = { ...SIN_COMPOSICION, biochar: r2(kgTotal) };
    baches = bachesRemitidos.map((b) => ({ codigo: b.bache, kg: b.kg, bacheId: '' }));
  }

  const idAreaCliente = cruda.idAreaCliente;
  const [clienteNombre, personas, area] = await Promise.all([
    nombreCliente(cruda.idCliente),
    personasDeRemision(cruda.personasIds),
    idAreaCliente
      ? obtenerAreaCliente(idAreaCliente).catch((err) => {
          console.warn(`⚠️ No se pudo resolver el área ${idAreaCliente}:`, err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const productoId =
    tipo === 'blend'
      ? config.airtable.inventarioProdCoreBiocharBlendProductId ?? ''
      : tipo === 'biochar'
        ? config.airtable.inventarioProdCoreBiocharPuroProductId ?? ''
        : '';

  return {
    recordId: rec.id,
    codigo: cruda.codigo,
    estado: cruda.estado,
    idPedido: cruda.idPedido,
    idCliente: cruda.idCliente,
    clienteNombre,
    idAreaCliente,
    areaClienteNombre: area?.nombre || idAreaCliente,
    lote: lotes.map((l) => l.lote).join(', '),
    lotes,
    kgTotal,
    fechaRemision: String(rec.fields['Fecha de Remisión'] ?? '').slice(0, 10),
    fechaDespacho: cruda.fechaDespacho,
    fechaRecibido: cruda.fechaRecibido,
    responsableEntrega: String(rec.fields['Responsable Entrega'] ?? ''),
    documentoUrl: String(rec.fields['URL Remision Generada'] ?? ''),
    notas,
    personas,
    tipo,
    productoId,
    productoNombre: tipo === 'ajena' ? '' : NOMBRE_PRODUCTO[tipo],
    idDespacho: idDespachoDeNotas(notas),
    bachesRemitidos,
    recibidaEn: recibidaDeNotas(notas),
    correoEnviadoEn: correoDeNotas(notas),
    documentos: cruda.documentos,
    composicion,
    // En una mixta el carbono del documento es el del Blend más el del biochar puro.
    co2SecuestradoKg: co2Secuestrado(
      composicion.biochar + (tipo === 'blend' ? bachesRemitidos.reduce((t, b) => t + b.kg, 0) : 0)
    ),
    baches,
  };
}

export interface LineaRemision {
  /** `SIRIUS-PRODUCT-…`. */
  productoId: string;
  /** Como lo imprime el documento. */
  nombre: string;
  kg: number;
}

/**
 * Los renglones de producto de una remisión: el suyo y, en una mixta, el biochar
 * puro que viajó con el Blend. Es lo que listan el PDF y Flujo de caja; los lotes
 * no son renglones (al cliente se le despacha un producto, no tandas).
 */
export function lineasDeRemision(r: RemisionBlend): LineaRemision[] {
  const lineas: LineaRemision[] = [
    { productoId: r.productoId, nombre: r.productoNombre || NOMBRE_PRODUCTO.blend, kg: r.kgTotal },
  ];
  if (r.tipo === 'blend' && r.bachesRemitidos.length) {
    lineas.push({
      productoId: config.airtable.inventarioProdCoreBiocharPuroProductId ?? '',
      nombre: NOMBRE_PRODUCTO.biochar,
      kg: r2(r.bachesRemitidos.reduce((t, b) => t + b.kg, 0)),
    });
  }
  return lineas;
}

/**
 * Resuelve una remisión por record ID (`recXXX`) o por código legible
 * (`SIRIUS-REM-XXXX`). Es el patrón del laboratorio: las APIs aceptan las dos
 * formas indistintamente, porque los enlaces que se comparten con el cliente
 * llevan el código y los internos llevan el record ID.
 *
 * Devuelve también las AJENAS (`tipo: 'ajena'`): decidir si se muestran es de
 * quien llama (el PDF de PiroliApp las rechaza con 404).
 */
export async function resolverRemision(idOrCodigo: string): Promise<RemisionBlend | null> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();

  if (esRecordId(idOrCodigo)) {
    try {
      const data = await atRemisiones(`${AT}/${baseId}/${remisionesTable}/${idOrCodigo}`, token);
      return await mapRemision(data as RegistroAirtable);
    } catch {
      return null;
    }
  }

  const params = new URLSearchParams({
    filterByFormula: `{ID} = '${escapeAirtableValue(idOrCodigo)}'`,
    maxRecords: '1',
  });
  const data = await atRemisiones(`${AT}/${baseId}/${remisionesTable}?${params.toString()}`, token);
  const rec = data.records?.[0];
  return rec ? await mapRemision(rec as RegistroAirtable) : null;
}

/**
 * Remisiones de Blend, opcionalmente filtradas.
 *
 * El filtro por producto se hace en JS y no en la fórmula: `Productos Remitidos`
 * es un link y en una fórmula se evalúa como el texto del campo primario, no como
 * el ID del producto. Lo que distingue una de Blend de una del laboratorio en la
 * misma tabla es `tipoRemision()`: `Area Origen = Producción` Y la marca
 * `[lote:…]` antes de « — ».
 */
export async function listarRemisiones(filtros: {
  estado?: string;
  pedido?: string;
  cliente?: string;
} = {}): Promise<RemisionBlend[]> {
  const { baseId, token, remisionesTable } = remisionesCoreConfig();

  const condiciones: string[] = [];
  if (filtros.estado) condiciones.push(`{Estado} = '${escapeAirtableValue(filtros.estado)}'`);
  if (filtros.pedido) condiciones.push(`{ID Pedido} = '${escapeAirtableValue(filtros.pedido)}'`);
  if (filtros.cliente) condiciones.push(`{ID Cliente} = '${escapeAirtableValue(filtros.cliente)}'`);

  const params: Record<string, string> = {};
  if (condiciones.length === 1) params.filterByFormula = condiciones[0];
  else if (condiciones.length > 1) params.filterByFormula = `AND(${condiciones.join(', ')})`;

  const registros = await atAllRemisiones(baseId, remisionesTable, token, params);

  // Solo las de Blend, y en serie por remisión para no disparar 4 requests por
  // cada una en paralelo contra el rate limit de Airtable (5 req/s por base).
  const soloBlend = registros.filter((r) => tipoRemision(remisionCrudaDeRegistro(r)) === 'blend');

  const out: RemisionBlend[] = [];
  for (const rec of soloBlend) out.push(await mapRemision(rec));

  return out.sort((a, b) => b.fechaRemision.localeCompare(a.fechaRemision));
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export interface CrearRemisionInput {
  /** `SIRIUS-PED-XXXX` del pedido que se está despachando. */
  idPedido: string;
  /** `CL-XXXX` del cliente. */
  idCliente: string;
  /** `AC-XXXX`: el área del cliente a la que va el despacho. */
  idAreaCliente?: string;
  /** `BLEND-…` del lote del que sale el producto. */
  lote: string;
  /** KG de Blend que se despachan (puede ser un despacho parcial). */
  kg: number;
  /**
   * Cuando el despacho sale de VARIOS lotes: cuánto de cada uno, sumando `kg`.
   * Omitido = todo sale de `lote`.
   */
  reparto?: LoteDeRemision[];
  responsableEntrega: string;
  /** Transportista: si viene con cédula se registra en `Personas`. */
  transportista?: { nombre: string; cedula: string; telefono?: string; email?: string };
  observaciones?: string;
  /** `YYYY-MM-DD`. Por defecto, hoy en Bogotá. */
  fechaDespacho?: string;
  /**
   * Llave de idempotencia del despacho (UUID v4 que genera el ensayo). Va en las
   * notas como `[desp:<uuid>]`; si ya hay una remisión con ella, no se crea otra.
   */
  idDespacho?: string;
  /** Kg pedidos de Blend cuando el pedido no tiene líneas en Pedidos Core. */
  kgSolicitadosRespaldo?: number;
}

export interface CrearRemisionResult {
  ok: boolean;
  remision: RemisionBlend | null;
  /** La llave `idDespacho` ya tenía remisión: no se escribió nada. */
  yaExistia?: boolean;
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
 *
 * Las escrituras exactas están fijadas por `crearRemisionCaracterizacion.test.ts`.
 */
export async function crearRemision(input: CrearRemisionInput): Promise<CrearRemisionResult> {
  const steps: StepResult[] = [];
  const invalido = (error: string): CrearRemisionResult => ({
    ok: false,
    remision: null,
    steps: [{ step: 'validacion', ok: false, error }],
  });

  if (!(input.kg > 0)) return invalido('Los KG a despachar deben ser mayores que 0');
  if (input.idDespacho !== undefined && !esIdDespacho(input.idDespacho)) {
    return invalido('La llave del despacho no es un UUID v4');
  }

  const reparto = input.reparto?.length ? input.reparto : [{ lote: input.lote, kg: input.kg }];
  const sumaReparto = r2(reparto.reduce((t, l) => t + l.kg, 0));
  if (Math.abs(sumaReparto - r2(input.kg)) > 0.01 || reparto.some((l) => !(l.kg > 0))) {
    return invalido(`El reparto por lote suma ${sumaReparto} kg y el despacho es de ${input.kg} kg.`);
  }
  const multilote = reparto.length > 1;
  const fechaDespacho = input.fechaDespacho || fechaBogota();

  // 0. Idempotencia: un reintento de la misma confirmación (doble clic, red que
  //    cortó la respuesta) encuentra su remisión y no emite otra.
  if (input.idDespacho) {
    try {
      const previas = await listarRemisionesCrudas({ marcaDespacho: input.idDespacho });
      if (previas.length) {
        const remision = await resolverRemision(previas[0].recordId);
        return {
          ok: true,
          yaExistia: true,
          remision,
          steps: [
            { step: 'remision', ok: true, skipped: true, detail: { codigo: previas[0].codigo } },
            // La Salida es best-effort: si falló en el intento original, el
            // reintento es lo que la completa (idempotente por documento_referencia).
            ...(remision ? await completarSalidasRemisionBlend(remision, input) : []),
          ],
        };
      }
    } catch (err) {
      // Sin poder comprobarlo no se emite: crear a ciegas es justo el duplicado
      // que la llave existe para evitar.
      return {
        ok: false,
        remision: null,
        steps: [{ step: 'remision', ok: false, error: err instanceof Error ? err.message : String(err) }],
      };
    }
  }

  // 1-2. El documento y su producto remitido (críticos). El lote va en las notas:
  //      es la llave a la producción y lo que identifica esta remisión como de
  //      Blend dentro de una tabla compartida.
  const notas =
    reparto.map((l) => `[lote:${l.lote}]`).join(' ') +
    (multilote ? ' ' + reparto.map((l) => `[kg-lote:${l.lote}=${r2(l.kg)}]`).join(' ') : '') +
    (input.idDespacho ? ` ${marcaDespacho(input.idDespacho)}` : '') +
    ` ${NOMBRE_PRODUCTO.blend}` +
    (input.observaciones ? ` — ${input.observaciones}` : '');

  // Una fila de producto por lote: es el renglón del documento que dice de dónde
  // salió cada kg, y `Total Cantidad Remitida` las suma.
  const emitido = await emitirDocumentoRemision({
    estado: input.transportista?.cedula ? ESTADO_REMISION.enTransito : ESTADO_REMISION.pendiente,
    notas,
    productos: reparto.map((l) => ({
      productoId: config.airtable.inventarioProdCoreBiocharBlendProductId ?? '',
      kg: l.kg,
      notas: `Lote ${l.lote}`,
    })),
    idCliente: input.idCliente,
    idPedido: input.idPedido,
    idAreaCliente: input.idAreaCliente,
    responsableEntrega: input.responsableEntrega,
    fechaDespacho,
  });
  steps.push(...emitido.steps);
  if (!emitido.ok || !emitido.remisionRecordId) return { ok: false, remision: null, steps };
  const remisionRecordId = emitido.remisionRecordId;

  // 2b. Chequeo de líder: dos instancias (el candado del despacho es por
  //     instancia) pueden pasar el paso 0 a la vez y emitir las dos con la misma
  //     llave. Gana la de menor numeración; la propia se descarta antes de que
  //     tenga Salidas, y la de inventario la escribe quien emitió la líder.
  //     Sin poder releer no se sabe quién ganó: no se escribe la Salida (un
  //     reintento con la misma llave la completa por el camino `yaExistia`).
  let liderVerificado = true;
  if (input.idDespacho) {
    try {
      const conLlave = await listarRemisionesCrudas({ marcaDespacho: input.idDespacho });
      const lider = conLlave[0];
      if (lider && lider.recordId !== remisionRecordId) {
        const descartada = conLlave.find((r) => r.recordId === remisionRecordId)?.codigo ?? remisionRecordId;
        try {
          await descartarRemision(remisionRecordId, emitido.productoIds);
          steps.push({
            step: 'lider',
            ok: true,
            detail: { codigo: lider.codigo, descartada, motivo: 'Otra petición emitió primero con la misma llave' },
          });
        } catch (err) {
          steps.push({
            step: 'lider',
            ok: false,
            error: `Otra petición emitió ${lider.codigo} con la misma llave y no se pudo descartar ${descartada}: ` +
              (err instanceof Error ? err.message : String(err)),
          });
        }
        const remisionLider = await resolverRemision(lider.recordId).catch(() => null);
        return { ok: true, yaExistia: true, remision: remisionLider, steps };
      }
    } catch (err) {
      liderVerificado = false;
      steps.push({
        step: 'lider',
        ok: false,
        error: `No se pudo verificar la llave del despacho; la Salida queda para el reintento: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
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

  // 5. Salida de producto terminado, una por lote (best-effort). Por lote y no una
  //    por el total: el saldo de cada lote se lee de las Salidas que lo nombran
  //    (`lotesDisponiblesBlend()`), y una sola que nombrara dos lotes se le
  //    cargaría entera a uno de ellos.
  const codigoRemision = remision?.codigo ?? remisionRecordId;
  for (const l of liderVerificado ? reparto : []) {
    const paso = await registrarSalidaInventario(
      { ...input, fechaDespacho, lote: l.lote, kg: l.kg },
      codigoRemision,
      multilote ? `DESP-${codigoRemision}-${l.lote}` : `DESP-${codigoRemision}`
    );
    steps.push(multilote ? { ...paso, step: `inventario:${l.lote}` } : paso);
  }

  // 6. Estado del pedido (best-effort), por lo remitido y por producto.
  steps.push(
    await actualizarEstadoPedidoPirolisis(input.idPedido, {
      kgSolicitadosBlendRespaldo: input.kgSolicitadosRespaldo,
    })
  );

  const criticos = steps.filter((s) => ['remision', 'producto_remitido'].includes(s.step));
  return { ok: criticos.every((s) => s.ok), remision, steps };
}

/**
 * Vuelve a registrar las Salidas de una remisión de Blend ya emitida, para el
 * reintento con la misma llave (`yaExistia`): si el paso `inventario` falló en el
 * intento original, aquí se completa. Idempotente por `documento_referencia`, con
 * las mismas llaves que `crearRemision()`; si ya están, cada paso sale `skipped`.
 *
 * Los lotes y los kg salen de la REMISIÓN (sus marcas), no de la petición: es lo
 * que se emitió. Una anulada no recibe Salidas.
 *
 * ⚠️ Riesgo residual: si la instancia que emitió la remisión sigue escribiendo su
 * Salida en este mismo momento, los dos chequeos de duplicado pueden pasar a la
 * vez. El candado `despacho-blend` lo evita dentro de una instancia; entre
 * instancias la ventana es la del GET de duplicado al POST.
 */
export async function completarSalidasRemisionBlend(
  remision: RemisionBlend,
  respaldo: { responsableEntrega: string; fechaDespacho?: string; idPedido: string; idCliente: string }
): Promise<StepResult[]> {
  if (remision.estado === ESTADO_REMISION.cancelada) {
    return [{ step: 'inventario', ok: true, skipped: true, detail: { motivo: `${remision.codigo} está anulada` } }];
  }
  const lotes = remision.lotes.length ? remision.lotes : remision.lote ? [{ lote: remision.lote, kg: remision.kgTotal }] : [];
  if (!lotes.length) {
    return [{ step: 'inventario', ok: false, error: `La remisión ${remision.codigo} no tiene lotes en sus marcas` }];
  }
  const multilote = lotes.length > 1;
  const datos = {
    idPedido: remision.idPedido || respaldo.idPedido,
    idCliente: remision.idCliente || respaldo.idCliente,
    responsableEntrega: remision.responsableEntrega || respaldo.responsableEntrega,
    fechaDespacho: remision.fechaDespacho || respaldo.fechaDespacho || fechaBogota(),
  };
  const out: StepResult[] = [];
  for (const l of lotes) {
    const paso = await registrarSalidaInventario(
      { ...datos, lote: l.lote, kg: l.kg },
      remision.codigo,
      multilote ? `DESP-${remision.codigo}-${l.lote}` : `DESP-${remision.codigo}`
    );
    out.push(multilote ? { ...paso, step: `inventario:${l.lote}` } : paso);
  }
  return out;
}

/**
 * Salida del producto terminado en Sirius Inventario Production Core.
 * `ubicacion_origen_id` = la remisión, `ubicacion_destino_id` = el cliente.
 */
async function registrarSalidaInventario(
  input: Pick<CrearRemisionInput, 'idPedido' | 'idCliente' | 'lote' | 'kg' | 'responsableEntrega'> & {
    fechaDespacho: string;
  },
  codigoRemision: string,
  doc: string
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
    const dupParams = new URLSearchParams({
      filterByFormula: `{documento_referencia} = '${escapeAirtableValue(doc)}'`,
      maxRecords: '1',
    });
    const dup = await atRemisiones(`${AT}/${base}/${movimientos}?${dupParams.toString()}`, token);
    if (dup.records?.length) {
      return { step: 'inventario', ok: true, skipped: true, detail: { doc, yaExistia: true } };
    }

    let stockRecordId: string | null = null;
    if (stockTable) {
      const q = new URLSearchParams({
        filterByFormula: `{producto_id} = '${escapeAirtableValue(producto)}'`,
        maxRecords: '1',
      });
      const s = await atRemisiones(`${AT}/${base}/${stockTable}?${q.toString()}`, token);
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
      fecha_movimiento: `${input.fechaDespacho}T12:00:00.000Z`,
      observaciones: `Despacho de Biochar Blend del lote ${input.lote} al pedido ${input.idPedido}.`,
    };
    if (stockRecordId) fields.Stock_Actual = [stockRecordId];

    const res = await atRemisiones(`${AT}/${base}/${movimientos}`, token, {
      method: 'POST',
      body: JSON.stringify({ records: [{ fields }] }),
    });
    return { step: 'inventario', ok: true, detail: { movimientoId: res.records?.[0]?.id, doc } };
  } catch (err) {
    return { step: 'inventario', ok: false, error: err instanceof Error ? err.message : String(err) };
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
  const salidas = await atAllRemisiones(base, movimientos, token, Object.fromEntries(params));

  const total = salidas
    .filter((m) => codigos.has(String(m.fields['ubicacion_origen_id'] ?? '')))
    .reduce((t, m) => t + toNumber(m.fields['cantidad']), 0);

  return r2(total);
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
    tipo: r.tipo,
    producto_id: r.productoId,
    producto: r.productoNombre,
    id_pedido: r.idPedido,
    id_cliente: r.idCliente,
    cliente: r.clienteNombre,
    id_area_cliente: r.idAreaCliente,
    area_cliente: r.areaClienteNombre,
    lote: r.lote,
    lotes: r.lotes,
    baches_remitidos: r.bachesRemitidos,
    kg_total: r.kgTotal,
    fecha_remision: r.fechaRemision,
    fecha_despacho: r.fechaDespacho,
    fecha_recibido: r.fechaRecibido,
    responsable_entrega: r.responsableEntrega,
    documento_url: r.documentoUrl,
    documentos: r.documentos,
    id_despacho: r.idDespacho,
    recibida_en: r.recibidaEn,
    correo_enviado_en: r.correoEnviadoEn,
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

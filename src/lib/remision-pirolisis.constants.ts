// src/lib/remision-pirolisis.constants.ts
//
// Contrato de las remisiones de pirólisis —Biochar Blend y Biochar puro— dentro de
// Sirius Remisiones Core, la tabla que comparten todas las apps del ecosistema.
//
// Sin imports, a propósito: lo leen el servidor, la UI y los tests, y nada de aquí
// puede arrastrar `config` ni un `fetch` a un bundle de cliente.
//
// ═══ LAS MARCAS ══════════════════════════════════════════════════════════════
// Remisiones Core no tiene campos para la trazabilidad de pirólisis y no se le
// agregan: es una base compartida con el laboratorio. La trazabilidad viaja como
// marcas entre corchetes al principio de `Notas de Remisión`:
//
//   [lote:BLEND-…] [kg-lote:…=kg]   Blend: de qué lote sale (crearRemision)
//   [bache:S-00140=75.00]           Biochar puro: de qué bache sale cada kg
//   [desp:<uuid>]                   llave de idempotencia del despacho
//   [recibida:<ISO>]                confirmada por enlace, con hora
//   [correo:<ISO>]                  el comprobante salió por correo
//
// y después la etiqueta del producto (`Biochar Blend`, `Biochar`). Todo lo que va
// DESPUÉS del primer « — » es texto del operador: el PDF lo imprime como
// observaciones y NUNCA se lee como marca. Si se leyera, un `[bache:S-00999=500]`
// escrito a mano entraría a la contabilidad de carbono.

export type ProductoPirolisis = 'blend' | 'biochar';

/** Como se llaman en Sirius Product Core (0016 y 0015): es lo que imprime el documento. */
export const NOMBRE_PRODUCTO: Record<ProductoPirolisis, string> = {
  blend: 'Biochar Blend',
  biochar: 'Biochar',
};

/** `Area Origen` de toda remisión que emite PiroliApp. Las de DataLab llevan `Laboratorio`. */
export const AREA_ORIGEN_PIROLISIS = 'Producción';

/**
 * Estados en los que una remisión espera a quien la recibe. `Borrador` no: es un
 * despacho a medias, sin el inventario garantizado. Al pasar a `Entregada` mueren
 * todos los enlaces de recepción de la remisión: el uso único del enlace ES este
 * estado, no un registro aparte.
 */
export const ESTADOS_RECIBIBLES = ['Pendiente', 'En Tránsito'] as const;

export function esEstadoRecibible(estado: string): boolean {
  return (ESTADOS_RECIBIBLES as readonly string[]).includes(estado);
}

/** Separa las marcas (antes) del texto libre del operador (después). */
export const SEPARADOR_OBSERVACIONES = ' — ';

export interface BacheDeRemision {
  /** `S-00XXX`. */
  bache: string;
  kg: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Un rollup o una fórmula pueden llegar como `{ specialValue: 'NaN' }`, no como número. */
function toNumber(valor: unknown): number {
  const n = typeof valor === 'object' && valor !== null ? NaN : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  return typeof valor === 'number' && Number.isFinite(valor) ? String(valor) : '';
}

const CODIGO_BACHE = /^S-\d{5}$/;
const CODIGO_REMISION = /^SIRIUS-REM-\d{4,}$/;
const MARCA_LOTE = /\[lote:[A-Za-z0-9\-_]+\]/;
const MARCA_BACHE = /\[bache:S-\d{5}=\d+(?:\.\d+)?\]/;
const MARCA_BACHE_G = /\[bache:(S-\d{5})=(\d+(?:\.\d+)?)\]/g;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MARCA_DESP = /\[desp:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]/;
const ISO_UTC = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z';
const MARCA_RECIBIDA = new RegExp(`\\[recibida:(${ISO_UTC})\\]`);
const MARCA_CORREO = new RegExp(`\\[correo:(${ISO_UTC})\\]`);
/** `[tipo:valor]`: sin espacios ni corchetes en el valor, para que nunca se corte a medias. */
const MARCA_SUELTA = /^\[([A-Za-z][A-Za-z-]*):[^\]\s]+\]$/;
const MARCA_G = /\[[A-Za-z][A-Za-z-]*:[^\]\s]+\]/g;
/** Se repiten una por lote o por bache: reemplazarlas borraría la trazabilidad. */
const TIPOS_MULTIPLES = new Set(['lote', 'kg-lote', 'bache']);

// ─────────────────────────────────────────────────────────────────────────────
// Marcas
// ─────────────────────────────────────────────────────────────────────────────

/** Lo anterior al primer « — »: el único tramo de las notas donde viven las marcas. */
export function prefijoMarcas(notas: string): string {
  const todo = typeof notas === 'string' ? notas : '';
  const i = todo.indexOf(SEPARADOR_OBSERVACIONES);
  return i === -1 ? todo : todo.slice(0, i);
}

/**
 * Pone `marca` en las notas, reemplazando la del mismo tipo si ya había una.
 *
 * Va después de la última marca y antes de la etiqueta del producto, que es como
 * las escriben los despachos (`[lote:…] [recibida:…] Biochar Blend`), y nunca
 * después de « — »: ahí la imprimiría el PDF como si la hubiera escrito el
 * operador. Lo que sigue a « — » se conserva intacto.
 *
 * Solo para marcas de valor único (`desp`, `recibida`, `correo`): `lote` y
 * `bache` se repiten, y reemplazarlas borraría el reparto.
 */
export function conMarca(notas: string, marca: string): string {
  const tipo = MARCA_SUELTA.exec(marca)?.[1];
  if (!tipo) throw new Error(`Marca mal formada: "${marca}"`);
  if (TIPOS_MULTIPLES.has(tipo)) {
    throw new Error(`[${tipo}:…] se repite por lote o por bache: conMarca solo reemplaza marcas de valor único`);
  }

  const todo = typeof notas === 'string' ? notas : '';
  const i = todo.indexOf(SEPARADOR_OBSERVACIONES);
  const prefijo = i === -1 ? todo : todo.slice(0, i);
  const resto = i === -1 ? '' : todo.slice(i);

  const sinAnterior = prefijo.replace(new RegExp(`\\[${tipo}:[^\\]]*\\]`, 'g'), ' ');
  let fin = 0;
  for (const m of sinAnterior.matchAll(MARCA_G)) fin = (m.index ?? 0) + m[0].length;
  const nuevo = `${sinAnterior.slice(0, fin)} ${marca} ${sinAnterior.slice(fin)}`.replace(/\s+/g, ' ').trim();
  return nuevo + resto;
}

/**
 * `[bache:S-00140=75.00] [bache:S-00141=125.00]`: de qué bache sale cada kg.
 *
 * Lleva los kg aunque sea un solo bache, a diferencia de `[lote:…]` en el Blend:
 * el total de la remisión no se lee del rollup, que el Core muestra sin decimales.
 * Lanza ante un dato inválido en vez de escribir una marca que después no se lea.
 */
export function marcasBaches(reparto: BacheDeRemision[]): string {
  const vistos = new Set<string>();
  return reparto
    .map(({ bache, kg }) => {
      if (!CODIGO_BACHE.test(bache)) throw new Error(`Código de bache inválido: "${bache}"`);
      if (vistos.has(bache)) throw new Error(`El bache ${bache} está dos veces en el reparto`);
      vistos.add(bache);
      const kg2 = r2(kg);
      if (!Number.isFinite(kg2) || kg2 <= 0) throw new Error(`Kg inválidos para ${bache}: ${kg}`);
      return `[bache:${bache}=${kg2.toFixed(2)}]`;
    })
    .join(' ');
}

/**
 * Los baches de una remisión de biochar con sus kg, leídos SOLO de las marcas
 * (antes de « — »). Una marca repetida se suma: es lo que dicen las notas.
 */
export function bachesDeNotas(notas: string): BacheDeRemision[] {
  const porBache = new Map<string, number>();
  for (const m of prefijoMarcas(notas).matchAll(MARCA_BACHE_G)) {
    porBache.set(m[1], r2((porBache.get(m[1]) ?? 0) + Number(m[2])));
  }
  return [...porBache].map(([bache, kg]) => ({ bache, kg }));
}

/**
 * ¿Es una llave de despacho? Un UUID v4 que genera el servidor en el ensayo
 * (`crypto.randomUUID()`) y que la confirmación reenvía.
 *
 * Solo minúsculas: la remisión del despacho se busca con `FIND('[desp:<id>]', …)`,
 * que distingue mayúsculas, y una llave que no encuentra su propia remisión
 * crearía el despacho dos veces.
 */
export function esIdDespacho(v: unknown): v is string {
  return typeof v === 'string' && UUID_V4.test(v);
}

export function marcaDespacho(id: string): string {
  if (!esIdDespacho(id)) throw new Error(`Llave de despacho inválida: "${id}"`);
  return `[desp:${id}]`;
}

export function idDespachoDeNotas(notas: string): string | null {
  return MARCA_DESP.exec(prefijoMarcas(notas))?.[1] ?? null;
}

function instanteIso(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) throw new Error('Fecha inválida para la marca');
  return d.toISOString();
}

/**
 * Cuándo se confirmó la recepción por enlace, con hora: `Fecha Recibido` es un
 * campo `date` y la pierde. Sirve además para detectar una carrera: después del
 * PATCH, si la marca no es la propia, otra confirmación ganó.
 */
export function marcaRecibida(d: Date): string {
  return `[recibida:${instanteIso(d)}]`;
}

export function recibidaDeNotas(notas: string): string | null {
  return MARCA_RECIBIDA.exec(prefijoMarcas(notas))?.[1] ?? null;
}

/**
 * Cuándo salió el comprobante por correo. Solo se escribe si se envió de verdad
 * (no en modo simulado): es lo que el panel lee para ofrecer «Reenviar», y vive
 * en la remisión y no en un log, que no sobrevive.
 */
export function marcaCorreo(d: Date): string {
  return `[correo:${instanteIso(d)}]`;
}

export function correoDeNotas(notas: string): string | null {
  return MARCA_CORREO.exec(prefijoMarcas(notas))?.[1] ?? null;
}

/** `<marcas de baches> [desp:<uuid>] Biochar[ — observaciones]`. */
export function notasRemisionBiochar(
  reparto: BacheDeRemision[],
  idDespacho: string,
  observaciones?: string
): string {
  if (!reparto.length) throw new Error('Un despacho de biochar necesita al menos un bache');
  const obs = (observaciones ?? '').trim();
  return (
    `${marcasBaches(reparto)} ${marcaDespacho(idDespacho)} ${NOMBRE_PRODUCTO.biochar}` +
    (obs ? `${SEPARADOR_OBSERVACIONES}${obs}` : '')
  );
}

/**
 * De qué producto de pirólisis es una remisión, o null si no es de PiroliApp.
 *
 * Hacen falta las dos cosas: `Area Origen = Producción` y una marca de lote o de
 * bache antes de « — ». El área sola no basta (REM-0170 es de Producción y solo
 * lleva `[blend:TEST-DIAG]`, de una prueba de la sincronización vieja), y las
 * marcas solas tampoco: la tabla es compartida y nada impide que alguien escriba
 * `[lote:` en una remisión del laboratorio.
 */
export function tipoRemision(r: { areaOrigen: string; notas: string }): ProductoPirolisis | null {
  const area = texto(r?.areaOrigen).normalize('NFC').trim();
  if (area !== AREA_ORIGEN_PIROLISIS) return null;
  const prefijo = prefijoMarcas(texto(r.notas));
  if (MARCA_LOTE.test(prefijo)) return 'blend';
  if (MARCA_BACHE.test(prefijo)) return 'biochar';
  return null;
}

function codigoRemisionValido(codigo: string): string {
  if (!CODIGO_REMISION.test(codigo)) throw new Error(`Código de remisión inválido: "${codigo}"`);
  return codigo;
}

/**
 * `documento_referencia` de la Salida de un bache en Inventario Production Core:
 * `DESP-SIRIUS-REM-0231-S-00140`. Una por bache, o el chequeo de duplicados
 * encontraría la primera Salida y se saltaría las demás.
 */
export function referenciaDespachoBache(codigoRemision: string, bache: string): string {
  codigoRemisionValido(codigoRemision);
  if (!CODIGO_BACHE.test(bache)) throw new Error(`Código de bache inválido: "${bache}"`);
  return `DESP-${codigoRemision}-${bache}`;
}

/**
 * Marca de la remisión local en PiroliApp (`Remisiones Baches Pirolisis`) que
 * descuenta el biochar de la fórmula de cada bache. Entre corchetes por lo mismo
 * que `marcaSalida`: `FIND('[DESPACHO:SIRIUS-REM-0231]')` no puede confundirse con
 * `SIRIUS-REM-02310`.
 */
export function marcaDespachoLocal(codigoRemision: string): string {
  return `[DESPACHO:${codigoRemisionValido(codigoRemision)}]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// La remisión tal como viene del Core
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los campos de `Remisiones` que lee `remisionCrudaDeRegistro`, por NOMBRE: así
 * los devuelve la API sin `returnFieldsByFieldId`. Sirve también para pedir solo
 * esos campos (`fields[]`) y no traer de más.
 */
export const CAMPOS_REMISION_CRUDA = {
  codigo: 'ID',
  numeracion: 'numeracion',
  estado: 'Estado',
  areaOrigen: 'Area Origen',
  idPedido: 'ID Pedido',
  idCliente: 'ID Cliente',
  idAreaCliente: 'ID Area Cliente',
  notas: 'Notas de Remisión',
  kgRollup: 'Total Cantidad Remitida',
  fechaDespacho: 'Fecha Pedido Despachado',
  fechaRecibido: 'Fecha Recibido',
  personas: 'Personas',
  documentos: 'Documento Remision',
} as const;

/** Una remisión del Core sin derivados: sin lecturas de lotes, clientes ni personas. */
export interface RemisionCruda {
  recordId: string;
  /** `SIRIUS-REM-XXXX`. */
  codigo: string;
  /** Autonumber del Core: si un despacho se duplicó, la de menor número es la líder. */
  numeracion: number;
  estado: string;
  areaOrigen: string;
  idPedido: string;
  idCliente: string;
  idAreaCliente: string;
  notas: string;
  /** `Total Cantidad Remitida`. Manda en el Blend; en el biochar mandan las marcas. */
  kgRollup: number;
  fechaDespacho: string;
  fechaRecibido: string;
  personasIds: string[];
  /** Nombres de archivo de `Documento Remision` (`<REM>.pdf`, `<REM>-recibida.pdf`). */
  documentos: string[];
}

export function remisionCrudaDeRegistro(rec: { id: string; fields: Record<string, unknown> }): RemisionCruda {
  const f = rec.fields ?? {};
  const C = CAMPOS_REMISION_CRUDA;
  const personas = f[C.personas];
  const documentos = f[C.documentos];
  return {
    recordId: rec.id,
    codigo: texto(f[C.codigo]).trim(),
    numeracion: toNumber(f[C.numeracion]),
    estado: texto(f[C.estado]),
    areaOrigen: texto(f[C.areaOrigen]),
    idPedido: texto(f[C.idPedido]).trim(),
    idCliente: texto(f[C.idCliente]).trim(),
    idAreaCliente: texto(f[C.idAreaCliente]).trim(),
    notas: texto(f[C.notas]),
    kgRollup: toNumber(f[C.kgRollup]),
    fechaDespacho: texto(f[C.fechaDespacho]).slice(0, 10),
    fechaRecibido: texto(f[C.fechaRecibido]).slice(0, 10),
    personasIds: Array.isArray(personas) ? personas.filter((p): p is string => typeof p === 'string') : [],
    documentos: Array.isArray(documentos)
      ? documentos.map((d) => texto((d as { filename?: unknown } | null)?.filename)).filter(Boolean)
      : [],
  };
}

/**
 * Kg que una remisión de pirólisis le remite a su pedido, y de qué producto. Null
 * si no es de PiroliApp.
 *
 * Blend: el rollup, que suma una fila de `Productos Remitidos` por lote. Biochar:
 * la suma de las marcas, que es lo que se descontó del inventario.
 *
 * No mira el estado: quien suma decide (una `Cancelada` no remite nada).
 */
export function kgRemitidoDeRemision(r: RemisionCruda): { tipo: ProductoPirolisis; kg: number } | null {
  const tipo = tipoRemision(r);
  if (!tipo) return null;
  if (tipo === 'biochar') {
    const baches = bachesDeNotas(r.notas);
    if (baches.length) return { tipo, kg: r2(baches.reduce((t, b) => t + b.kg, 0)) };
  }
  return { tipo, kg: r2(r.kgRollup) };
}

/**
 * El estado del pedido después de remitirle: `Enviado` solo si TODAS sus líneas son
 * de pirólisis y cada producto quedó cubierto (tolerancia de 0,01 kg).
 *
 * Por producto y no por el total: un pedido de Blend y biochar no está enviado
 * porque se despachó de sobra uno de los dos. Una línea de otro producto (del
 * laboratorio, en un pedido mixto) deja el pedido en parcial porque PiroliApp no
 * sabe si esa parte salió. Sin cantidad pedida no se afirma que esté completo.
 *
 * @param remitido kg remitidos por `productoId` (remisiones no canceladas).
 * @param ids los `productoId` de Blend (0016) y biochar (0015) en Product Core.
 */
export function estadoPedidoTrasRemitir(
  lineas: Array<{ productoId: string; kg: number }>,
  remitido: ReadonlyMap<string, number>,
  ids: { blend: string; biochar: string }
): 'Enviado' | 'Enviado Parcial' {
  const propios = new Set([ids.blend, ids.biochar].filter(Boolean));
  const solicitado = new Map<string, number>();
  for (const l of lineas) {
    if (!propios.has(l.productoId)) return 'Enviado Parcial';
    solicitado.set(l.productoId, (solicitado.get(l.productoId) ?? 0) + (Number.isFinite(l.kg) ? l.kg : 0));
  }
  if (!solicitado.size) return 'Enviado Parcial';

  for (const [producto, kg] of solicitado) {
    if (!(kg > 0)) return 'Enviado Parcial';
    const falta = r2(kg - (remitido.get(producto) ?? 0));
    if (falta > 0.01) return 'Enviado Parcial';
  }
  return 'Enviado';
}

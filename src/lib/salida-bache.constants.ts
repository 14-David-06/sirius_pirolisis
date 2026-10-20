// src/lib/salida-bache.constants.ts
//
// Contrato compartido de la salida de baches entre el servicio y la UI.
//
// Vive aparte de `salida-bache.ts` A PROPÓSITO: ese módulo arrastra `config`,
// `stock-insumos` y `serverSession`, que no pueden entrar en un bundle de cliente.
// Aquí no hay imports, así que el formulario puede leer los motivos sin llevarse
// medio servidor consigo.

/**
 * Motivos de salida de un bache que NO son producción de Blend.
 *
 * El prefijo entra en la referencia (`SAL-LAB-2026-08-05-S-00171`) para que el
 * motivo se lea en el propio código del movimiento, sin abrir el registro. No hay
 * campo `Motivo` en ninguna de las dos tablas —verificado contra el esquema—, así
 * que el motivo vive en la referencia, en las Observaciones de la remisión y en las
 * notas del Core.
 */
export const MOTIVOS_SALIDA = {
  laboratorio: {
    prefijo: 'LAB',
    etiqueta: 'Laboratorio',
    descripcion: 'Se envió a un laboratorio para análisis.',
  },
  muestra: {
    prefijo: 'MUE',
    etiqueta: 'Muestra',
    descripcion: 'Muestra entregada a un cliente o para uso interno.',
  },
  merma: {
    prefijo: 'MER',
    etiqueta: 'Merma',
    descripcion: 'Pérdida, derrame o material descartado.',
  },
  traslado: {
    prefijo: 'TRA',
    etiqueta: 'Traslado',
    descripcion: 'Salida hacia otra área o sede de Sirius.',
  },
  entrega: {
    prefijo: 'ENT',
    etiqueta: 'Entrega sin contraprestación',
    // Ya NO dice "con acta": el módulo de actas se eliminó el 2026-08-21. El hecho
    // sigue existiendo —investigación, ensayo, piloto, donación— y el numeral 5.4.2
    // de la Puro Biochar Methodology exige documentarlo, así que el motivo se
    // conserva; hoy el respaldo son las observaciones de esta salida.
    descripcion: 'Investigación, ensayo, piloto o donación. Sin contraprestación comercial.',
  },
} as const;

export type MotivoSalida = keyof typeof MOTIVOS_SALIDA;

/**
 * Los motivos por los que se puede sacar Biochar Blend: todos menos la entrega.
 *
 * La entrega sin contraprestación sale con acta, y el acta se arma de la remisión
 * de baches de PiroliApp, donde vive quien recibe —a propósito fuera de los Core,
 * que comparte todo el ecosistema—. El Blend solo existe en el Core, así que no
 * tiene dónde guardar la cédula de quien recibe sin publicarla en una base ajena.
 */
export const MOTIVOS_SALIDA_BLEND = ['laboratorio', 'muestra', 'merma', 'traslado'] as const satisfies readonly MotivoSalida[];
export type MotivoSalidaBlend = (typeof MOTIVOS_SALIDA_BLEND)[number];

export function esMotivoSalidaBlend(valor: unknown): valor is MotivoSalidaBlend {
  return (MOTIVOS_SALIDA_BLEND as readonly unknown[]).includes(valor);
}

const PREFIJOS_NO_COMERCIALES = Object.values(MOTIVOS_SALIDA).map((m) => m.prefijo).join('|');
/**
 * `SAL-REMISION-<n>-<bache>`: las salidas de la UI de remisión de baches, anterior
 * a los motivos. Ninguna corresponde a un despacho de Blend de la hoja de bodega.
 */
const NO_COMERCIAL = new RegExp(`^SAL-(${PREFIJOS_NO_COMERCIALES}|REMISION)-`);

/**
 * ¿La salida de biochar NO fue una venta? Laboratorio, muestra, merma, traslado,
 * entrega sin contraprestación y las remisiones de baches viejas.
 *
 * Comerciales son las demás: los lotes `BLEND-…` y los despachos a un cliente
 * (`SAL-<CLIENTE>-<fecha>`). Son las que suma la hoja de salidas de bodega, y por
 * eso el total despachado no las mezcla con las otras (2026-10-07).
 */
export function esSalidaNoComercial(destino: string): boolean {
  return NO_COMERCIAL.test(destino);
}

export function esMotivoSalida(valor: unknown): valor is MotivoSalida {
  return typeof valor === 'string' && valor in MOTIVOS_SALIDA;
}

/**
 * Referencia de la salida: su identidad y su llave de deduplicación.
 *
 * Determinista a propósito (mismo motivo + misma fecha + mismo bache → misma
 * referencia): reintentar no duplica, agrupa. Dos salidas DISTINTAS del mismo
 * bache por el mismo motivo el mismo día —lo normal desde que la salida se pide
 * por total y el reparto FIFO cae siempre en el bache más viejo— no se distinguen
 * aquí sino con `referenciaBaseSalida(…, n)`, que el ensayo elige libre.
 */
export function referenciaSalida(
  motivo: MotivoSalida,
  fecha: string,
  codigoBache: string,
  /**
   * Prefijo alterno cuando la salida pertenece a un documento que ya tiene
   * identidad propia (un acta de entrega, p. ej.). Se le concatena el bache para
   * que cada bache siga teniendo su propia llave: si N baches compartieran una
   * referencia, el chequeo de idempotencia encontraría la primera salida y se
   * saltaría las demás.
   */
  referenciaBase?: string
): string {
  if (referenciaBase?.trim()) return `${referenciaBase.trim()}-${codigoBache}`;
  return `SAL-${MOTIVOS_SALIDA[motivo].prefijo}-${fecha}-${codigoBache}`;
}

/**
 * Prefijo de la N-ésima salida del día por un mismo motivo: `SAL-MUE-<fecha>-2`.
 *
 * La primera conserva la forma de siempre (sin número) para que las referencias
 * ya escritas sigan siendo las mismas. El número lo elige el ENSAYO —el primero
 * cuyo reparto no choque con una salida existente— y la confirmación lo reenvía tal
 * cual: así un reintento de la confirmación vuelve a dar las mismas referencias y
 * completa lo que faltó en vez de duplicarlo.
 */
export function referenciaBaseSalida(motivo: MotivoSalida, fecha: string, n: number): string | undefined {
  return n <= 1 ? undefined : `SAL-${MOTIVOS_SALIDA[motivo].prefijo}-${fecha}-${n}`;
}

/** El primer `n` cuyas referencias no existen todavía para ninguno de los baches. */
export function referenciaBaseLibre(
  motivo: MotivoSalida,
  fecha: string,
  codigosBache: string[],
  existe: (referencia: string) => boolean
): string | undefined {
  for (let n = 1; n < 1000; n++) {
    const base = referenciaBaseSalida(motivo, fecha, n);
    if (!codigosBache.some((codigo) => existe(referenciaSalida(motivo, fecha, codigo, base)))) return base;
  }
  throw new Error(`Demasiadas salidas por ${MOTIVOS_SALIDA[motivo].etiqueta} el ${fecha}.`);
}

/**
 * Reparte una salida pedida como TOTAL entre los baches, del más antiguo al más
 * nuevo.
 *
 * El operador piensa en "sacar 75 kg de biochar", no en qué lona abrir; pero el
 * libro mayor necesita el bache de cada kg (`bache_origen_id` sostiene la
 * contabilidad de carbono), así que el total se convierte en una salida por bache.
 * FIFO es la misma regla que propone la producción: evita que los baches viejos
 * queden abiertos para siempre.
 *
 * @returns null si el total excede lo que hay.
 */
export function repartirSalidaFIFO(
  baches: Array<{ codigo: string; kg: number }>,
  kgTotal: number
): Array<{ codigo: string; kg: number }> | null {
  return repartirEnOrden([...baches].sort((a, b) => a.codigo.localeCompare(b.codigo)), kgTotal);
}

/**
 * Reparte un total tomando las fuentes EN EL ORDEN EN QUE LLEGAN.
 *
 * Los lotes de Blend no se ordenan por código como los baches: `BLEND-…` y los
 * `SAL-<CLIENTE>-…` históricos no comparten formato, así que su antigüedad la da
 * la fecha de producción, y quien llama ya los trae ordenados por ella.
 *
 * @returns null si el total excede lo que hay.
 */
export function repartirEnOrden(
  fuentes: Array<{ codigo: string; kg: number }>,
  kgTotal: number
): Array<{ codigo: string; kg: number }> | null {
  const porAntiguedad = fuentes.filter((b) => b.kg > 0.01);
  const reparto: Array<{ codigo: string; kg: number }> = [];
  let restante = Math.round(kgTotal * 100) / 100;
  for (const b of porAntiguedad) {
    if (restante <= 0.01) break;
    const kg = Math.min(b.kg, restante);
    reparto.push({ codigo: b.codigo, kg: Math.round(kg * 100) / 100 });
    restante = Math.round((restante - kg) * 100) / 100;
  }
  return restante > 0.01 ? null : reparto;
}

/**
 * Marca de la salida en las Observaciones de la remisión.
 *
 * Va entre corchetes por la misma razón que `marcaBache`: `FIND('[SALIDA:…-S-00171]')`
 * no puede confundirse con `S-001710`, que sí pasaría buscando el texto a secas.
 */
export function marcaSalida(referencia: string): string {
  return `[SALIDA:${referencia}]`;
}

/**
 * Quién se lleva el biochar en una entrega sin contraprestación.
 *
 * Vive en la remisión de la salida (`Remisiones Baches Pirolisis`), no en Clients
 * Core: quien recibe una donación o un piloto no es un cliente, y darlo de alta
 * allá lo metería en pedidos y en el CRM de las otras apps.
 */
export interface ReceptorEntrega {
  nombre: string;
  cedula: string;
  vehiculo?: string;
  color?: string;
  placa?: string;
}

/**
 * El compromiso que asume quien recibe. Lo muestra el formulario y lo imprime el
 * acta: tienen que decir lo mismo, porque lo que se firma es el papel.
 *
 * No quemarlo y llevarlo al suelo es lo que hace que ese biochar siga siendo
 * carbono secuestrado: quemado, el CO₂ vuelve a la atmósfera y la entrega deja de
 * poder contarse en la contabilidad de carbono.
 */
export const COMPROMISO_ENTREGA_BIOCHAR =
  'Quien recibe se compromete con Sirius Regenerative Solutions S.A.S. ZOMAC a NO QUEMAR ' +
  'este biochar y a LLEVARLO AL SUELO como enmienda. El biochar es carbono estable: ' +
  'quemarlo devuelve ese carbono a la atmósfera como CO₂ y anula el secuestro que ' +
  'respalda esta entrega.';

/** Solo las salidas por `entrega` tienen acta. El `-<n>` es la N-ésima del día. */
export function esReferenciaEntrega(referencia: string): boolean {
  return /^SAL-ENT-\d{4}-\d{2}-\d{2}(-\d+)?-S-\d{5}$/.test(referencia);
}

/** El bache va al final de la referencia (`SAL-ENT-<fecha>-S-00144`). */
export function bacheDeReferencia(referencia: string): string | null {
  return referencia.match(/(S-\d{5})$/)?.[1] ?? null;
}

/**
 * Nombre y cédula son obligatorios: sin ellos el acta no dice a quién se le
 * entregó, que es justamente lo que la metodología pide documentar.
 */
export function receptorIncompleto(r: Partial<ReceptorEntrega> | undefined | null): string | null {
  if (!r?.nombre?.trim()) return 'Falta el nombre de quien recibe.';
  if (!r?.cedula?.trim()) return 'Falta la cédula de quien recibe.';
  return null;
}

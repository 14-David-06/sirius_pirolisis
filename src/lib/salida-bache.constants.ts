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
    descripcion: 'El bache se envió a un laboratorio para análisis.',
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

export function esMotivoSalida(valor: unknown): valor is MotivoSalida {
  return typeof valor === 'string' && valor in MOTIVOS_SALIDA;
}

/**
 * Referencia de la salida: su identidad y su llave de deduplicación.
 *
 * Determinista a propósito (mismo motivo + misma fecha + mismo bache → misma
 * referencia): reintentar no duplica, agrupa. El costo es que dos salidas del mismo
 * bache al laboratorio el mismo día se leen como una; se acepta porque el escenario
 * real es un bigbag que sale una vez, y el riesgo contrario —descontar dos veces
 * 487 kg— es mucho peor.
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

/** Solo las salidas por `entrega` tienen acta. */
export function esReferenciaEntrega(referencia: string): boolean {
  return /^SAL-ENT-\d{4}-\d{2}-\d{2}-S-\d{5}$/.test(referencia);
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

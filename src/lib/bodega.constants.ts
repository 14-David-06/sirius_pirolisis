/**
 * Constantes del módulo Bodega — materias primas del Biochar Blend.
 *
 * La bodega controla SOLO las tres materias primas que entran a la fórmula del
 * Blend. No es un segundo inventario de consumibles: los consumibles del área
 * (lonas, químicos, EPP…) siguen en /inventario-pirolisis y las herramientas en
 * /activos-fijos.
 *
 * ⚠️ MIGRACIÓN 2026-07-30: las TRES materias primas son insumos de Sirius Insumos
 * Core y toda esta página sale del Core. Antes el biochar era la excepción (su
 * stock vivía en la tabla de baches de PiroliApp), lo que dejaba dos fuentes de
 * verdad en la misma pantalla y un flag `fuente` que decía una cosa y hacía otra.
 *
 * El biochar conserva una particularidad real: además del saldo tiene desglose
 * BACHE POR BACHE, que se reconstruye del libro mayor del Core
 * (`ID Bache Origen` en cada movimiento), no de la tabla de baches. La tabla de
 * baches es el historial de PRODUCCIÓN de pirólisis; el Core es el libro mayor de
 * BODEGA, y lo que dice el Core es lo que se puede despachar.
 */

import { config } from './config';

/** Claves estables de las materias primas (contrato con la API y la UI). */
export const MATERIA_PRIMA_KEYS = ['biochar', 'bioabono', 'biologicos'] as const;

export type MateriaPrimaKey = (typeof MATERIA_PRIMA_KEYS)[number];

/**
 * De dónde sale el stock. Ya todas son `insumos_core`; el tipo se conserva porque
 * es parte del contrato con la UI y porque documenta que la fuente es una decisión
 * explícita y no un accidente.
 */
export type FuenteMateriaPrima = 'insumos_core';

export interface MateriaPrimaDef {
  key: MateriaPrimaKey;
  /** Nombre para la UI. */
  nombre: string;
  /** Nombre con el que existe en la base de datos, si difiere del anterior. */
  nombreCore?: string;
  /** Unidad base en la que se mide el stock. */
  unidad: string;
  fuente: FuenteMateriaPrima;
  /** Proporción de esta materia prima en 1 kg de Blend. */
  pctBlend: number;
  /** Se pueden registrar entradas manuales desde la bodega. */
  permiteEntradaManual: boolean;
  /**
   * Tiene desglose bache por bache además del saldo. Solo el biochar: es lo único
   * que entra a bodega en bultos identificados y trazables a un lote de producción.
   *
   * Antes esta distinción se codificaba en `fuente: 'baches'`, que además implicaba
   * —falsamente— que el saldo salía de otra base.
   */
  tieneDesglosePorBache?: boolean;
  descripcion: string;
}

/**
 * Registro de materias primas.
 *
 * `pctBlend` viene de `config.blend` (env vars): la bodega, la verificación de
 * stock y la auto-deducción de producción leen las MISMAS proporciones, así que
 * no pueden divergir. El agua (pctAgua) no se inventaría.
 */
export const MATERIAS_PRIMAS: Record<MateriaPrimaKey, MateriaPrimaDef> = {
  biochar: {
    key: 'biochar',
    nombre: 'Biochar puro',
    nombreCore: 'Biochar Puro',
    unidad: 'kg',
    fuente: 'insumos_core',
    pctBlend: config.blend.pctBiochar,
    // No se digita: entra a bodega al registrar el bache, y sale al producir Blend.
    permiteEntradaManual: false,
    tieneDesglosePorBache: true,
    descripcion:
      'Producido en planta. Entra a bodega por bache y sale al producir Blend. Stock en Sirius Insumos Core.',
  },
  bioabono: {
    key: 'bioabono',
    nombre: 'Bioabono',
    nombreCore: 'Abono 4G',
    unidad: 'kg',
    fuente: 'insumos_core',
    pctBlend: config.blend.pctAbono,
    permiteEntradaManual: true,
    descripcion: 'Abono 4G recibido de la planta de abonos. Stock en Sirius Insumos Core.',
  },
  biologicos: {
    key: 'biologicos',
    nombre: 'Biológicos',
    nombreCore: 'Biológicos DataLab',
    unidad: 'L',
    fuente: 'insumos_core',
    pctBlend: config.blend.pctBiologicos,
    permiteEntradaManual: true,
    descripcion: 'Inóculo biológico producido por DataLab. Stock en Sirius Insumos Core.',
  },
};

/** Las materias primas en el orden en que se muestran (mayor proporción primero). */
export const MATERIAS_PRIMAS_ORDENADAS: MateriaPrimaDef[] = [
  MATERIAS_PRIMAS.bioabono,
  MATERIAS_PRIMAS.biochar,
  MATERIAS_PRIMAS.biologicos,
];

/**
 * Lote de Blend de referencia, en kg, para calcular el mínimo de cada materia
 * prima: "tener bodega para producir al menos un lote".
 *
 * Se prefiere esto a un número inventado por materia prima porque el umbral se
 * deriva de la fórmula: con 1.000 kg de referencia el mínimo es 740 kg de
 * bioabono, 200 kg de biochar y 7 L de biológicos. Si el Core define un
 * `Stock Minimo` para el insumo, ese gana (ver /api/bodega/materias-primas).
 */
export const LOTE_BLEND_REFERENCIA_KG = parseFloat(
  process.env.BODEGA_LOTE_BLEND_REFERENCIA_KG || '1000'
);

/** Mínimo de una materia prima: lo que consume un lote de referencia. */
export function minimoPorLoteReferencia(pctBlend: number): number {
  return Number((LOTE_BLEND_REFERENCIA_KG * pctBlend).toFixed(2));
}

/** Capacidad de producción de Blend limitada por la materia prima más escasa. */
export interface CapacidadBlend {
  kgBlend: number;
  /** Materia prima que limita la producción; `null` si la fórmula no pide ninguna. */
  limitante: MateriaPrimaKey | null;
  loteReferenciaKg: number;
  /** kg de Blend que alcanzan con el stock de cada materia prima por separado. */
  porMateria: Record<MateriaPrimaKey, number>;
}

/**
 * Cuántos kg de Blend se pueden producir con el stock que hay, y qué materia prima
 * lo limita.
 *
 * Cada materia prima alcanza para `stock / pctBlend` kg de Blend; la más escasa
 * manda. Una proporción en 0 (materia prima desactivada en la fórmula) no limita
 * nada ni tiene un "alcanza para X kg" con sentido.
 *
 * Está aquí, y no en el endpoint de bodega, porque la agenda muestra la MISMA
 * conclusión: si cada pantalla la calculara, la bodega podría decir "no alcanza
 * para producir" al lado de una agenda que da los pedidos por cubiertos.
 */
export function calcularCapacidadBlend(
  stock: Partial<Record<MateriaPrimaKey, number>>
): CapacidadBlend {
  const porMateria = { biochar: 0, bioabono: 0, biologicos: 0 } as Record<MateriaPrimaKey, number>;

  let kgBlend = 0;
  let limitante: MateriaPrimaKey | null = null;

  for (const def of MATERIAS_PRIMAS_ORDENADAS) {
    if (def.pctBlend <= 0) continue;

    const posibles = Math.floor(Math.max(stock[def.key] ?? 0, 0) / def.pctBlend);
    porMateria[def.key] = posibles;

    if (limitante === null || posibles < kgBlend) {
      kgBlend = posibles;
      limitante = def.key;
    }
  }

  return { kgBlend, limitante, loteReferenciaKg: LOTE_BLEND_REFERENCIA_KG, porMateria };
}

// ============================================================================
// SALIDAS: NO SE REGISTRAN A MANO (2026-07-29)
// ============================================================================
// La bodega solo registra ENTRADAS. Las salidas de materia prima las genera la
// auto-deducción al confirmar una producción de Blend (src/lib/blend-deduction.ts)
// y las del biochar salen por remisión de baches. Un formulario de salida manual
// abría la puerta a descontar dos veces el mismo consumo.

export const MENSAJES_BODEGA = {
  EXITO: {
    ENTRADA: 'Entrada registrada en bodega',
  },
  ERROR: {
    SELECCIONAR_MATERIAL: 'Selecciona una materia prima',
    CANTIDAD_INVALIDA: 'Ingresa una cantidad mayor que cero',
    BIOCHAR_NO_MANUAL:
      'El biochar no se ingresa a mano: entra al inventario al registrar producción en baches.',
  },
} as const;

/**
 * Constantes del módulo Bodega — materias primas del Biochar Blend.
 *
 * La bodega controla SOLO las tres materias primas que entran a la fórmula del
 * Blend. No es un segundo inventario de consumibles: los consumibles del área
 * (lonas, químicos, EPP…) siguen en /inventario-pirolisis y las herramientas en
 * /activos-fijos.
 *
 * Cada materia prima tiene una fuente de verdad distinta y eso es deliberado:
 *   - Bioabono y Biológicos son insumos de Sirius Insumos Core: su stock es
 *     SUM(entradas) - SUM(salidas) en `Stock Insumos`.
 *   - El Biochar puro NO es un insumo del Core: se produce en la planta y su
 *     stock vive en los baches (`Total Cantidad Actual Biochar Seco`). Por eso
 *     en la bodega es de solo lectura: se ingresa produciendo, no digitando.
 */

import { config } from './config';

/** Claves estables de las materias primas (contrato con la API y la UI). */
export const MATERIA_PRIMA_KEYS = ['biochar', 'bioabono', 'biologicos'] as const;

export type MateriaPrimaKey = (typeof MATERIA_PRIMA_KEYS)[number];

/** De dónde sale el stock de cada materia prima. */
export type FuenteMateriaPrima = 'baches' | 'insumos_core';

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
    unidad: 'kg',
    fuente: 'baches',
    pctBlend: config.blend.pctBiochar,
    permiteEntradaManual: false,
    descripcion:
      'Producido en planta. El stock es la suma del biochar seco disponible en los baches.',
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

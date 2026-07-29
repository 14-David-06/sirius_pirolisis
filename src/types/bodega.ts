/**
 * Tipos del módulo Bodega (materias primas del Biochar Blend).
 * Contrato entre /api/bodega/* y la UI.
 */

import type { EstadoStock } from '@/lib/inventario.format';
import type { FuenteMateriaPrima, MateriaPrimaKey } from '@/lib/bodega.constants';

/** Bache con biochar seco disponible. */
export interface BacheBiochar {
  id: string;
  codigo: string;
  kg: number;
  estado: string;
}

/** Una materia prima con su stock resuelto. */
export interface MateriaPrima {
  key: MateriaPrimaKey;
  nombre: string;
  /** Nombre del insumo en el Core, cuando difiere del nombre de la UI. */
  nombreCore: string | null;
  /** Código simbólico del Core (SIRIUS-INS-XXXX); vacío para el biochar. */
  codigo: string;
  /** Record ID en Sirius Insumos Core; null para el biochar. */
  insumoId: string | null;
  unidad: string;
  fuente: FuenteMateriaPrima;
  /** Proporción en 1 kg de Blend. */
  pctBlend: number;
  stock: number;
  /** Umbral de reposición: el del Core, o lo que consume un lote de referencia. */
  stockMinimo: number;
  estado: EstadoStock;
  permiteEntradaManual: boolean;
  descripcion: string;
  /** kg de Blend que alcanzan a producirse con el stock de esta materia prima. */
  kgBlendPosibles: number;
}

/** Capacidad de producción de Blend limitada por la materia prima más escasa. */
export interface CapacidadProduccion {
  kgBlend: number;
  /** Materia prima que limita la producción; null si no hay stock de ninguna. */
  limitante: MateriaPrimaKey | null;
  loteReferenciaKg: number;
}

export interface BodegaData {
  materiales: MateriaPrima[];
  capacidad: CapacidadProduccion;
  formula: {
    pctBiochar: number;
    pctAbono: number;
    pctBiologicos: number;
    pctAgua: number;
  };
  baches: BacheBiochar[];
  /** Avisos no fatales: config incompleta, stock sin registro en el Core, etc. */
  advertencias: string[];
}

/** Movimiento de una materia prima del Core (entrada o salida). */
export interface MovimientoBodega {
  id: string;
  codigo: string;
  materia: MateriaPrimaKey | null;
  materiaNombre: string;
  tipo: 'Entrada' | 'Salida' | string;
  cantidad: number;
  unidad: string;
  notas: string;
  fecha: string | null;
}

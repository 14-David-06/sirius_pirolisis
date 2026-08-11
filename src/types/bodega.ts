/**
 * Tipos del módulo Bodega (materias primas del Biochar Blend).
 * Contrato entre /api/bodega/* y la UI.
 */

import type { EstadoStock } from '@/lib/inventario.format';
import type { CapacidadBlend, FuenteMateriaPrima, MateriaPrimaKey } from '@/lib/bodega.constants';
import type { FuenteBiochar } from '@/types/agenda-blend';

/**
 * Bache con biochar disponible en bodega.
 *
 * Se reconstruye del libro mayor de Sirius Insumos Core, no de la tabla de baches:
 * `id` y `codigo` son el mismo `Codigo Bache` (S-00XXX) porque el Core guarda el
 * código, no el record ID — no hay links entre bases.
 */
export interface BacheBiochar {
  id: string;
  codigo: string;
  kg: number;
  /** Estado de BODEGA derivado del saldo, no el `Estado Bache` de PiroliApp. */
  estado: string;
}

/** Una materia prima con su stock resuelto. */
export interface MateriaPrima {
  key: MateriaPrimaKey;
  nombre: string;
  /** Nombre del insumo en el Core, cuando difiere del nombre de la UI. */
  nombreCore: string | null;
  /** Código simbólico del Core (SIRIUS-INS-XXXX). */
  codigo: string;
  /** Record ID en Sirius Insumos Core. */
  insumoId: string | null;
  unidad: string;
  fuente: FuenteMateriaPrima;
  /** Tiene desglose bache por bache además del saldo. Solo el biochar. */
  tieneDesglosePorBache?: boolean;
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

/**
 * Capacidad de producción de Blend limitada por la materia prima más escasa.
 *
 * Es el mismo tipo que devuelve la agenda (`calcularCapacidadBlend`): las dos
 * pantallas muestran esta conclusión y no pueden diferir.
 */
export type CapacidadProduccion = CapacidadBlend;

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
  /** De dónde salió el número del biochar, igual que en la agenda. */
  fuenteBiochar: FuenteBiochar;
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

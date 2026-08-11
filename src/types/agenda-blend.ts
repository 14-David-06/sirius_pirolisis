/**
 * Tipos de la agenda de producción de Biochar Blend.
 * Contrato entre /api/pirolisis/blend/agenda y la UI de /calendario-blend.
 */

import type { CapacidadBlend } from '@/lib/bodega.constants';

/** Cobertura de un pedido contra la demanda ACUMULADA hasta su fecha. */
export type Cobertura = 'cubierto' | 'parcial' | 'sin_stock' | 'no_aplica';

export interface MateriaPrimaTerna {
  biochar: number;
  abono: number;
  biologicos: number;
}

export interface EventoAgenda {
  pedidoRecordId: string;
  idPedidoCore: string;
  cliente: string;
  nit: string;
  /** Fecha de entrega comprometida (ISO). Vacío si el pedido no tiene fecha. */
  fecha: string;
  kg: number;
  estado: string;
  empaque: string;
  observaciones: string;
  /** Materia prima que consume este pedido. */
  requerido: MateriaPrimaTerna;
  /** Demanda acumulada de los pedidos abiertos hasta este, inclusive. */
  acumulado: MateriaPrimaTerna;
  cobertura: Cobertura;
  /** Materia prima que se agota primero: 'biochar' | 'abono' | 'biologicos'. */
  limitante: string | null;
  /** 'notas' = el detalle del pedido en Core perdió su link y no podrá producir. */
  kgFuente: string;
  detalleRecordId: string;
}

export interface ResumenAgenda {
  pedidosTotales: number;
  pedidosAbiertos: number;
  kgComprometidos: number;
  kgCubiertos: number;
  kgSinCobertura: number;
  /** Primera fecha de entrega que el stock actual no alcanza a cubrir. */
  primeraFechaSinCobertura: string | null;
  pedidosSinDetalle: number;
}

/** Un lote de Blend ya producido (Sirius Inventario Production Core). */
export interface LoteProducido {
  /** Código de lote (BLEND-AAAA-MM-DD): la llave que une las tres bases Core. */
  lote: string;
  kg: number;
  fecha: string;
  motivo: string;
}

export interface ProduccionBlend {
  /** Saldo de producto terminado: producido menos despachado. */
  kgEnInventario: number;
  kgProducidos: number;
  lotes: LoteProducido[];
}

/**
 * De dónde salió el número de biochar. Sirius Insumos Core es la fuente desde el
 * 2026-07-30; el total de los baches queda como contraste para detectar consumos
 * escritos en una sola de las dos vistas.
 */
export interface FuenteBiochar {
  origen: 'insumos-core' | 'baches';
  /** `null` si no se pudo leer la tabla de baches: no hay con qué contrastar. */
  kgBaches: number | null;
  kgCore: number | null;
  /** kgCore − kgBaches. `null` si falta cualquiera de las dos vistas. */
  divergencia: number | null;
}

export interface AgendaData {
  eventos: EventoAgenda[];
  disponible: MateriaPrimaTerna;
  formula: {
    pctBiochar: number;
    pctAbono: number;
    pctBiologicos: number;
    pctAgua: number;
  };
  /**
   * Cuánto Blend permite producir el stock de bodega y qué materia prima lo limita.
   *
   * Se calcula con la MISMA función que la bodega (`calcularCapacidadBlend`): sin
   * esto, la agenda mostraba tres stocks sueltos y podía dar pedidos por cubiertos
   * al lado de una bodega que decía "sin stock suficiente para producir".
   */
  capacidad: CapacidadBlend;
  resumen: ResumenAgenda;
  /** `null` si Inventario Production Core no está configurado o falló. */
  produccion: ProduccionBlend | null;
  fuenteBiochar: FuenteBiochar;
}

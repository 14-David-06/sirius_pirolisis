/**
 * Tipos de la agenda de producción de Biochar Blend.
 * Contrato entre /api/pirolisis/blend/agenda y la UI de /calendario-blend.
 */

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

export interface AgendaData {
  eventos: EventoAgenda[];
  disponible: MateriaPrimaTerna;
  formula: {
    pctBiochar: number;
    pctAbono: number;
    pctBiologicos: number;
    pctAgua: number;
  };
  resumen: ResumenAgenda;
}

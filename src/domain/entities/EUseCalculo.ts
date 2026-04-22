// src/domain/entities/EUseCalculo.ts
// Entidad de dominio para el cálculo de emisiones eUse (Etapa 4)
// Transporte de biochar desde bodega Sirius hasta clientes.

export interface EUseConstantes {
  fe_euse_liviano: number;   // kg CO2 / ton·km
  fe_euse_pesado: number;    // kg CO2 / ton·km
  umbral_ton: number;        // toneladas
}

export type TipoVehiculo = 'liviano' | 'pesado';

export interface EUseRemisionDetalle {
  remision_id: string;          // ID Airtable de la remisión
  remision_numero: string;      // Identificador legible si existe
  cliente: string;              // Nombre cliente como aparece en remisión
  cliente_match: string;        // Nombre cliente como aparece en Clientes (match)
  fecha_evento: string;         // YYYY-MM-DD
  kg_despachados: number;
  ton_despachados: number;
  distancia_km: number;
  tipo_vehiculo: TipoVehiculo;
  factor_emision_usado: number;
  emisiones_kg: number;
}

export interface EUseResumen {
  remisiones_liviano: number;
  remisiones_pesado: number;
  emisiones_liviano_kg: number;
  emisiones_pesado_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
}

export interface EUseResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  remisiones_analizadas: number;
  remisiones_liviano: number;
  remisiones_pesado: number;
  emisiones_liviano_kg: number;
  emisiones_pesado_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose_remisiones: EUseRemisionDetalle[];
  constantes_usadas: EUseConstantes;
  calculado_por: string;
  created_at: string;
}

export interface EUseCalculoInput {
  fecha_inicio: string;
  fecha_fin: string;
  calculado_por: string;
}

export interface EUseCalculoResponse {
  periodo: { fecha_inicio: string; fecha_fin: string };
  remisiones_analizadas: number;
  desglose_por_remision: EUseRemisionDetalle[];
  resumen: EUseResumen;
  constantes_usadas: EUseConstantes;
}

// Datos crudos que el repositorio entrega al use case para que éste calcule
export interface EUseRemisionRaw {
  remision_id: string;
  remision_numero: string;
  cliente: string;
  fecha_evento: string;
  kg_despachados: number;
}

export interface EUseClienteDistancia {
  nombre: string;
  distancia_km: number;
}

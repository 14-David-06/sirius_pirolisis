// src/domain/entities/EBiomasCalculo.ts
// Entidad de dominio para el cálculo de emisiones eBiomass

export interface EBiomasConstantes {
  consumo_diesel_por_viaje: number;
  densidad_diesel: number;
  fe_produccion_diesel: number;
  fe_combustion_diesel: number;
}

export interface EBiomasResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  turno_id: string | null;
  total_viajes: number;
  litros_diesel: number;
  kg_diesel: number;
  emisiones_produccion_kg: number;
  emisiones_combustion_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  constantes_usadas: EBiomasConstantes;
  calculado_por: string;
  created_at: string;
}

export interface EBiomasCalculoInput {
  fecha_inicio: string;
  fecha_fin: string;
  turno_id?: string | null;
  calculado_por: string;
}

export interface EBiomasCalculoResponse {
  periodo: {
    fecha_inicio: string;
    fecha_fin: string;
  };
  total_viajes: number;
  litros_diesel: number;
  kg_diesel: number;
  emisiones_produccion_kg: number;
  emisiones_combustion_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose: {
    factor_produccion_usado: number;
    factor_combustion_usado: number;
    consumo_diesel_por_viaje: number;
    densidad_diesel: number;
  };
}

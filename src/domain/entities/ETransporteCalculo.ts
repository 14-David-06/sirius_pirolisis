// src/domain/entities/ETransporteCalculo.ts
// Entidad de dominio para el cálculo de emisiones eTransporte (Etapa 3)

export interface ETransporteConstantes {
  distancia_km_viaje: number;
  consumo_L_km: number;
  densidad_diesel: number;
  fe_combustion: number;
  fe_upstream: number;
}

export interface ETransporteResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  total_baches: number;
  total_viajes: number;
  distancia_total_km: number;
  litros_diesel: number;
  kg_diesel: number;
  emisiones_combustion_kg: number;
  emisiones_upstream_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  constantes_usadas: ETransporteConstantes;
  calculado_por: string;
  created_at: string;
}

export interface ETransporteCalculoInput {
  fecha_inicio: string;
  fecha_fin: string;
  calculado_por: string;
}

export interface ETransporteCalculoResponse {
  periodo: {
    fecha_inicio: string;
    fecha_fin: string;
  };
  total_baches: number;
  total_viajes: number;
  distancia_total_km: number;
  litros_diesel: number;
  kg_diesel: number;
  emisiones_combustion_kg: number;
  emisiones_upstream_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose: {
    distancia_km_viaje: number;
    consumo_L_km: number;
    densidad_diesel: number;
    fe_combustion: number;
    fe_upstream: number;
  };
}

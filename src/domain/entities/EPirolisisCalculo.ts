// src/domain/entities/EPirolisisCalculo.ts
// Entidad de dominio para el cálculo de emisiones ePirólisis (Etapa 2)

export interface EPirolisisConstantes {
  fe_electricidad: number;
  fe_co2_biogas: number;
  fe_ch4_biogas: number;
  fe_n2o_biogas: number;
  fe_big_bag: number;
  fe_lona: number;
  fe_residuo_kg: number;
}

export interface EPirolisisComponentes {
  electricidad_kg: number;
  electricidad_suma_al_total: false;
  co2_biogenico_kg: number;
  co2_biogenico_suma_al_total: false;
  ch4_kg: number;
  n2o_kg: number;
  big_bags_kg: number;
  big_bags_factor_pendiente: boolean;
  lonas_kg: number;
  lonas_factor_pendiente: boolean;
  residuos_kg: number;
  residuos_factor_pendiente: boolean;
}

export interface EPirolisisResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  turno_id: string | null;
  turnos_analizados: number;
  kwh_total: number;
  m3_biogas_total: number;
  total_big_bags: number;
  total_lonas: number;
  total_residuos_kg: number;
  emisiones_electricidad_kg: number;
  emisiones_co2_biogenico_kg: number;
  emisiones_ch4_kg: number;
  emisiones_n2o_kg: number;
  emisiones_big_bags_kg: number;
  emisiones_lonas_kg: number;
  emisiones_residuos_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  constantes_usadas: EPirolisisConstantes;
  factores_pendientes: string[];
  calculado_por: string;
  created_at: string;
}

export interface EPirolisisCalculoInput {
  fecha_inicio: string;
  fecha_fin: string;
  turno_id?: string | null;
  calculado_por: string;
}

export interface EPirolisisDatosAgregados {
  turnos_analizados: number;
  kwh_total: number;
  m3_biogas_total: number;
  total_big_bags: number;
  total_lonas: number;
  total_residuos_kg: number;
}

export interface EPirolisisCalculoResponse {
  periodo: {
    fecha_inicio: string;
    fecha_fin: string;
  };
  turnos_analizados: number;
  kwh_total: number;
  m3_biogas_total: number;
  total_big_bags: number;
  total_lonas: number;
  total_residuos_kg: number;
  componentes: EPirolisisComponentes;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose: {
    factores_usados: EPirolisisConstantes;
    factores_pendientes: string[];
  };
}

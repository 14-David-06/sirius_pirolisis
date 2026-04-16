// src/domain/entities/EPirolisisCalculo.ts
// Entidad de dominio para el cálculo de emisiones ePirólisis (Etapa 2)

export interface EPirolisisConstantes {
  fe_electricidad: number;
  fe_co2_biogas: number;
  fe_ch4_biogas: number;
  fe_n2o_biogas: number;
  fe_big_bag: number;
  peso_vacio_big_bag_kg: number;
  fe_big_bag_pp_no_tejido: number;
  fe_big_bag_fibra_tejida: number;
  fe_big_bag_film_ldpe: number;
  fe_big_bag_descarte_pp: number;
  fe_lona: number;
  peso_vacio_lona_kg: number;
  fe_lona_pp_no_tejido: number;
  fe_lona_fibra_tejida: number;
  // Residuos por categoría (Alcance 3)
  fe_residuo_lubricants: number;
  fe_residuo_used_oil: number;
  fe_residuo_paint_cans: number;
  fe_residuo_ppe: number;
  // Gases de chimenea (flue gases)
  chimenea_co_kg_hr: number;
  chimenea_co2_kg_hr: number;
  chimenea_ch4_kg_hr: number;
  chimenea_n2o_kg_hr: number;
  gwp_ch4: number;
  gwp_n2o: number;
}

export interface EPirolisisComponentes {
  electricidad_kg: number;
  electricidad_suma_al_total: false;
  co2_biogenico_kg: number;
  co2_biogenico_suma_al_total: false;
  ch4_kg: number;
  n2o_kg: number;
  big_bags_masa_total_kg: number;
  big_bags_pp_no_tejido_kg: number;
  big_bags_fibra_tejida_kg: number;
  big_bags_film_ldpe_kg: number;
  big_bags_descarte_pp_kg: number;
  big_bags_total_kg: number;
  big_bags_factor_pendiente: false;
  lonas_masa_total_kg: number;
  lonas_pp_no_tejido_kg: number;
  lonas_fibra_tejida_kg: number;
  lonas_total_kg: number;
  lonas_factor_pendiente: false;
  // Residuos por categoría (Alcance 3)
  residuos_lubricants_kg: number;
  residuos_used_oil_kg: number;
  residuos_paint_cans_kg: number;
  residuos_ppe_kg: number;
  // Gases de chimenea (flue gases)
  chimenea_co_kg: number;
  chimenea_co_suma_al_total: false;
  chimenea_co2_kg: number;
  chimenea_co2_suma_al_total: false;
  chimenea_ch4_kg: number;
  chimenea_ch4_co2eq_kg: number;
  chimenea_n2o_kg: number;
  chimenea_n2o_co2eq_kg: number;
}

export interface EPirolisisResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  turno_id: string | null;
  turnos_analizados: number;
  horas_producidas: number;
  kwh_total: number;
  m3_biogas_total: number;
  total_big_bags: number;
  total_lonas: number;
  residuos_lubricants_kg: number;
  residuos_used_oil_kg: number;
  residuos_paint_cans_kg: number;
  residuos_ppe_kg: number;
  emisiones_electricidad_kg: number;
  emisiones_co2_biogenico_kg: number;
  emisiones_ch4_kg: number;
  emisiones_n2o_kg: number;
  masa_total_big_bags_kg: number;
  emisiones_big_bags_pp_no_tejido_kg: number;
  emisiones_big_bags_fibra_tejida_kg: number;
  emisiones_big_bags_film_ldpe_kg: number;
  emisiones_big_bags_descarte_pp_kg: number;
  emisiones_big_bags_total_kg: number;
  masa_total_lonas_kg: number;
  emisiones_lonas_pp_no_tejido_kg: number;
  emisiones_lonas_fibra_tejida_kg: number;
  emisiones_lonas_total_kg: number;
  emisiones_residuos_lubricants_kg: number;
  emisiones_residuos_used_oil_kg: number;
  emisiones_residuos_paint_cans_kg: number;
  emisiones_residuos_ppe_kg: number;
  emisiones_residuos_total_kg: number;
  emisiones_chimenea_co_kg: number;
  emisiones_chimenea_co2_kg: number;
  emisiones_chimenea_ch4_kg: number;
  emisiones_chimenea_ch4_co2eq_kg: number;
  emisiones_chimenea_n2o_kg: number;
  emisiones_chimenea_n2o_co2eq_kg: number;
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
  horas_producidas: number;
  kwh_total: number;
  m3_biogas_total: number;
  total_big_bags: number;
  total_lonas: number;
  residuos_lubricants_kg: number;
  residuos_used_oil_kg: number;
  residuos_paint_cans_kg: number;
  residuos_ppe_kg: number;
}

export interface EPirolisisCalculoResponse {
  periodo: {
    fecha_inicio: string;
    fecha_fin: string;
  };
  turnos_analizados: number;
  horas_producidas: number;
  kwh_total: number;
  m3_biogas_total: number;
  total_big_bags: number;
  total_lonas: number;
  residuos_lubricants_kg: number;
  residuos_used_oil_kg: number;
  residuos_paint_cans_kg: number;
  residuos_ppe_kg: number;
  componentes: EPirolisisComponentes;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose: {
    factores_usados: EPirolisisConstantes;
    factores_pendientes: string[];
  };
}

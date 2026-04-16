// src/application/services/CalcularEPirolisisUseCase.ts
// Caso de uso para calcular emisiones ePirólisis y guardar resultado

import { IEPirolisisRepository } from '../../domain/repositories/IEPirolisisRepository';
import { EPirolisisCalculoInput, EPirolisisCalculoResponse, EPirolisisResultado } from '../../domain/entities/EPirolisisCalculo';
import { CarbonConfigService } from './CarbonConfigService';

export class CalcularEPirolisisUseCase {
  constructor(private repository: IEPirolisisRepository) {}

  async ejecutar(input: EPirolisisCalculoInput): Promise<{ resultado: EPirolisisCalculoResponse; guardado: EPirolisisResultado }> {
    const constantes = CarbonConfigService.getEPirolisisConstantes();
    const factoresPendientes = CarbonConfigService.getFactoresPendientes();

    // Obtener datos agregados del período
    const datos = await this.repository.obtenerDatosAgregados(
      input.fecha_inicio,
      input.fecha_fin,
      input.turno_id
    );

    // Componente 1 — Electricidad (informativo, NO suma al total)
    const emisiones_electricidad_kg = datos.kwh_total * constantes.fe_electricidad;

    // Componente 2 — CO₂ biogénico del biogás (informativo, NO suma al total)
    const emisiones_co2_biogenico_kg = datos.m3_biogas_total * constantes.fe_co2_biogas;

    // Componente 3 — CH₄ del biogás (SÍ suma al total)
    const emisiones_ch4_kg = datos.m3_biogas_total * constantes.fe_ch4_biogas;

    // Componente 4 — N₂O del biogás (SÍ suma al total)
    const emisiones_n2o_kg = datos.m3_biogas_total * constantes.fe_n2o_biogas;

    // Componente 5 — Big Bags (3 sub-componentes LCA)
    const masa_total_big_bags_kg = datos.total_big_bags * constantes.peso_vacio_big_bag_kg;
    const emisiones_big_bags_pp_no_tejido_kg = masa_total_big_bags_kg * constantes.fe_big_bag_pp_no_tejido;
    const emisiones_big_bags_fibra_tejida_kg = masa_total_big_bags_kg * constantes.fe_big_bag_fibra_tejida;
    const emisiones_big_bags_film_ldpe_kg = masa_total_big_bags_kg * constantes.fe_big_bag_film_ldpe;
    const emisiones_big_bags_descarte_pp_kg = masa_total_big_bags_kg * constantes.fe_big_bag_descarte_pp;
    const emisiones_big_bags_total_kg = emisiones_big_bags_pp_no_tejido_kg
      + emisiones_big_bags_fibra_tejida_kg + emisiones_big_bags_film_ldpe_kg + emisiones_big_bags_descarte_pp_kg;

    // Componente 6 — Lonas (2 sub-componentes LCA)
    const masa_total_lonas_kg = datos.total_lonas * constantes.peso_vacio_lona_kg;
    const emisiones_lonas_pp_no_tejido_kg = masa_total_lonas_kg * constantes.fe_lona_pp_no_tejido;
    const emisiones_lonas_fibra_tejida_kg = masa_total_lonas_kg * constantes.fe_lona_fibra_tejida;
    const emisiones_lonas_total_kg = emisiones_lonas_pp_no_tejido_kg + emisiones_lonas_fibra_tejida_kg;

    // Componentes 7-10 — Residuos por categoría (Alcance 3)
    const emisiones_residuos_lubricants_kg = datos.residuos_lubricants_kg * constantes.fe_residuo_lubricants;
    const emisiones_residuos_used_oil_kg = datos.residuos_used_oil_kg * constantes.fe_residuo_used_oil;
    const emisiones_residuos_paint_cans_kg = datos.residuos_paint_cans_kg * constantes.fe_residuo_paint_cans;
    const emisiones_residuos_ppe_kg = datos.residuos_ppe_kg * constantes.fe_residuo_ppe;
    const emisiones_residuos_total_kg = emisiones_residuos_lubricants_kg + emisiones_residuos_used_oil_kg
      + emisiones_residuos_paint_cans_kg + emisiones_residuos_ppe_kg;

    // Componentes 11-14 — Gases de chimenea (flue gases)
    // CO: informativo, NO suma al total
    const emisiones_chimenea_co_kg = datos.horas_producidas * constantes.chimenea_co_kg_hr;
    // CO₂: informativo, NO suma al total (biogénico)
    const emisiones_chimenea_co2_kg = datos.horas_producidas * constantes.chimenea_co2_kg_hr;
    // CH₄: SÍ suma al total (masa × GWP)
    const chimenea_ch4_masa_kg = datos.horas_producidas * constantes.chimenea_ch4_kg_hr;
    const emisiones_chimenea_ch4_co2eq_kg = chimenea_ch4_masa_kg * constantes.gwp_ch4;
    // N₂O: SÍ suma al total (masa × GWP)
    const chimenea_n2o_masa_kg = datos.horas_producidas * constantes.chimenea_n2o_kg_hr;
    const emisiones_chimenea_n2o_co2eq_kg = chimenea_n2o_masa_kg * constantes.gwp_n2o;

    // Total: solo componentes que suman
    const emisiones_total_kg = emisiones_ch4_kg + emisiones_n2o_kg
      + emisiones_big_bags_total_kg + emisiones_lonas_total_kg + emisiones_residuos_total_kg
      + emisiones_chimenea_ch4_co2eq_kg + emisiones_chimenea_n2o_co2eq_kg;
    const emisiones_total_ton = emisiones_total_kg / 1000;

    const round = (n: number) => Math.round(n * 1000000) / 1000000;

    const calculoData = {
      fecha_inicio_periodo: input.fecha_inicio,
      fecha_fin_periodo: input.fecha_fin,
      turno_id: input.turno_id || null,
      turnos_analizados: datos.turnos_analizados,
      horas_producidas: round(datos.horas_producidas),
      kwh_total: round(datos.kwh_total),
      m3_biogas_total: round(datos.m3_biogas_total),
      total_big_bags: datos.total_big_bags,
      total_lonas: datos.total_lonas,
      residuos_lubricants_kg: round(datos.residuos_lubricants_kg),
      residuos_used_oil_kg: round(datos.residuos_used_oil_kg),
      residuos_paint_cans_kg: round(datos.residuos_paint_cans_kg),
      residuos_ppe_kg: round(datos.residuos_ppe_kg),
      emisiones_electricidad_kg: round(emisiones_electricidad_kg),
      emisiones_co2_biogenico_kg: round(emisiones_co2_biogenico_kg),
      emisiones_ch4_kg: round(emisiones_ch4_kg),
      emisiones_n2o_kg: round(emisiones_n2o_kg),
      masa_total_big_bags_kg: round(masa_total_big_bags_kg),
      emisiones_big_bags_pp_no_tejido_kg: round(emisiones_big_bags_pp_no_tejido_kg),
      emisiones_big_bags_fibra_tejida_kg: round(emisiones_big_bags_fibra_tejida_kg),
      emisiones_big_bags_film_ldpe_kg: round(emisiones_big_bags_film_ldpe_kg),
      emisiones_big_bags_descarte_pp_kg: round(emisiones_big_bags_descarte_pp_kg),
      emisiones_big_bags_total_kg: round(emisiones_big_bags_total_kg),
      masa_total_lonas_kg: round(masa_total_lonas_kg),
      emisiones_lonas_pp_no_tejido_kg: round(emisiones_lonas_pp_no_tejido_kg),
      emisiones_lonas_fibra_tejida_kg: round(emisiones_lonas_fibra_tejida_kg),
      emisiones_lonas_total_kg: round(emisiones_lonas_total_kg),
      emisiones_residuos_lubricants_kg: round(emisiones_residuos_lubricants_kg),
      emisiones_residuos_used_oil_kg: round(emisiones_residuos_used_oil_kg),
      emisiones_residuos_paint_cans_kg: round(emisiones_residuos_paint_cans_kg),
      emisiones_residuos_ppe_kg: round(emisiones_residuos_ppe_kg),
      emisiones_residuos_total_kg: round(emisiones_residuos_total_kg),
      emisiones_chimenea_co_kg: round(emisiones_chimenea_co_kg),
      emisiones_chimenea_co2_kg: round(emisiones_chimenea_co2_kg),
      emisiones_chimenea_ch4_kg: round(chimenea_ch4_masa_kg),
      emisiones_chimenea_ch4_co2eq_kg: round(emisiones_chimenea_ch4_co2eq_kg),
      emisiones_chimenea_n2o_kg: round(chimenea_n2o_masa_kg),
      emisiones_chimenea_n2o_co2eq_kg: round(emisiones_chimenea_n2o_co2eq_kg),
      emisiones_total_kg: round(emisiones_total_kg),
      emisiones_total_ton: round(emisiones_total_ton),
      constantes_usadas: constantes,
      factores_pendientes: factoresPendientes,
      calculado_por: input.calculado_por,
    };

    const guardado = await this.repository.guardarResultado(calculoData);

    const resultado: EPirolisisCalculoResponse = {
      periodo: { fecha_inicio: input.fecha_inicio, fecha_fin: input.fecha_fin },
      turnos_analizados: datos.turnos_analizados,
      horas_producidas: round(datos.horas_producidas),
      kwh_total: round(datos.kwh_total),
      m3_biogas_total: round(datos.m3_biogas_total),
      total_big_bags: datos.total_big_bags,
      total_lonas: datos.total_lonas,
      residuos_lubricants_kg: round(datos.residuos_lubricants_kg),
      residuos_used_oil_kg: round(datos.residuos_used_oil_kg),
      residuos_paint_cans_kg: round(datos.residuos_paint_cans_kg),
      residuos_ppe_kg: round(datos.residuos_ppe_kg),
      componentes: {
        electricidad_kg: round(emisiones_electricidad_kg),
        electricidad_suma_al_total: false,
        co2_biogenico_kg: round(emisiones_co2_biogenico_kg),
        co2_biogenico_suma_al_total: false,
        ch4_kg: round(emisiones_ch4_kg),
        n2o_kg: round(emisiones_n2o_kg),
        big_bags_masa_total_kg: round(masa_total_big_bags_kg),
        big_bags_pp_no_tejido_kg: round(emisiones_big_bags_pp_no_tejido_kg),
        big_bags_fibra_tejida_kg: round(emisiones_big_bags_fibra_tejida_kg),
        big_bags_film_ldpe_kg: round(emisiones_big_bags_film_ldpe_kg),
        big_bags_descarte_pp_kg: round(emisiones_big_bags_descarte_pp_kg),
        big_bags_total_kg: round(emisiones_big_bags_total_kg),
        big_bags_factor_pendiente: false,
        lonas_masa_total_kg: round(masa_total_lonas_kg),
        lonas_pp_no_tejido_kg: round(emisiones_lonas_pp_no_tejido_kg),
        lonas_fibra_tejida_kg: round(emisiones_lonas_fibra_tejida_kg),
        lonas_total_kg: round(emisiones_lonas_total_kg),
        lonas_factor_pendiente: false,
        residuos_lubricants_kg: round(emisiones_residuos_lubricants_kg),
        residuos_used_oil_kg: round(emisiones_residuos_used_oil_kg),
        residuos_paint_cans_kg: round(emisiones_residuos_paint_cans_kg),
        residuos_ppe_kg: round(emisiones_residuos_ppe_kg),
        chimenea_co_kg: round(emisiones_chimenea_co_kg),
        chimenea_co_suma_al_total: false,
        chimenea_co2_kg: round(emisiones_chimenea_co2_kg),
        chimenea_co2_suma_al_total: false,
        chimenea_ch4_kg: round(chimenea_ch4_masa_kg),
        chimenea_ch4_co2eq_kg: round(emisiones_chimenea_ch4_co2eq_kg),
        chimenea_n2o_kg: round(chimenea_n2o_masa_kg),
        chimenea_n2o_co2eq_kg: round(emisiones_chimenea_n2o_co2eq_kg),
      },
      emisiones_total_kg: round(emisiones_total_kg),
      emisiones_total_ton: round(emisiones_total_ton),
      desglose: {
        factores_usados: constantes,
        factores_pendientes: factoresPendientes,
      },
    };

    return { resultado, guardado };
  }
}

// src/application/services/PreviewEPirolisisUseCase.ts
// Caso de uso para preview de ePirólisis sin guardar

import { IEPirolisisRepository } from '../../domain/repositories/IEPirolisisRepository';
import { EPirolisisCalculoResponse } from '../../domain/entities/EPirolisisCalculo';
import { CarbonConfigService } from './CarbonConfigService';

export class PreviewEPirolisisUseCase {
  constructor(private repository: IEPirolisisRepository) {}

  async ejecutar(fechaInicio: string, fechaFin: string, turnoId?: string | null): Promise<EPirolisisCalculoResponse> {
    const constantes = CarbonConfigService.getEPirolisisConstantes();
    const factoresPendientes = CarbonConfigService.getFactoresPendientes();

    const datos = await this.repository.obtenerDatosAgregados(fechaInicio, fechaFin, turnoId);

    const emisiones_electricidad_kg = datos.kwh_total * constantes.fe_electricidad;
    const emisiones_co2_biogenico_kg = datos.m3_biogas_total * constantes.fe_co2_biogas;
    const emisiones_ch4_kg = datos.m3_biogas_total * constantes.fe_ch4_biogas;
    const emisiones_n2o_kg = datos.m3_biogas_total * constantes.fe_n2o_biogas;
    const emisiones_big_bags_kg = datos.total_big_bags * constantes.fe_big_bag;
    const emisiones_lonas_kg = datos.total_lonas * constantes.fe_lona;

    // Residuos por categoría (Alcance 3)
    const emisiones_residuos_lubricants_kg = datos.residuos_lubricants_kg * constantes.fe_residuo_lubricants;
    const emisiones_residuos_used_oil_kg = datos.residuos_used_oil_kg * constantes.fe_residuo_used_oil;
    const emisiones_residuos_paint_cans_kg = datos.residuos_paint_cans_kg * constantes.fe_residuo_paint_cans;
    const emisiones_residuos_ppe_kg = datos.residuos_ppe_kg * constantes.fe_residuo_ppe;
    const emisiones_residuos_total_kg = emisiones_residuos_lubricants_kg + emisiones_residuos_used_oil_kg
      + emisiones_residuos_paint_cans_kg + emisiones_residuos_ppe_kg;

    // Gases de chimenea
    const emisiones_chimenea_co_kg = datos.horas_producidas * constantes.chimenea_co_kg_hr;
    const emisiones_chimenea_co2_kg = datos.horas_producidas * constantes.chimenea_co2_kg_hr;
    const chimenea_ch4_masa_kg = datos.horas_producidas * constantes.chimenea_ch4_kg_hr;
    const emisiones_chimenea_ch4_co2eq_kg = chimenea_ch4_masa_kg * constantes.gwp_ch4;
    const chimenea_n2o_masa_kg = datos.horas_producidas * constantes.chimenea_n2o_kg_hr;
    const emisiones_chimenea_n2o_co2eq_kg = chimenea_n2o_masa_kg * constantes.gwp_n2o;

    const emisiones_total_kg = emisiones_ch4_kg + emisiones_n2o_kg
      + emisiones_big_bags_kg + emisiones_lonas_kg + emisiones_residuos_total_kg
      + emisiones_chimenea_ch4_co2eq_kg + emisiones_chimenea_n2o_co2eq_kg;
    const emisiones_total_ton = emisiones_total_kg / 1000;

    const round = (n: number) => Math.round(n * 1000000) / 1000000;

    return {
      periodo: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
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
        big_bags_kg: round(emisiones_big_bags_kg),
        big_bags_factor_pendiente: factoresPendientes.includes('fe_big_bag'),
        lonas_kg: round(emisiones_lonas_kg),
        lonas_factor_pendiente: factoresPendientes.includes('fe_lona'),
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
  }
}

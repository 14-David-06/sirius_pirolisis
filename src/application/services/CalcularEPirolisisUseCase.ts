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

    // Componente 5 — Big Bags (factor pendiente)
    const emisiones_big_bags_kg = datos.total_big_bags * constantes.fe_big_bag;

    // Componente 6 — Lonas (factor pendiente)
    const emisiones_lonas_kg = datos.total_lonas * constantes.fe_lona;

    // Componente 7 — Residuos (factor pendiente)
    const emisiones_residuos_kg = datos.total_residuos_kg * constantes.fe_residuo_kg;

    // Total: solo componentes que suman
    const emisiones_total_kg = emisiones_ch4_kg + emisiones_n2o_kg
      + emisiones_big_bags_kg + emisiones_lonas_kg + emisiones_residuos_kg;
    const emisiones_total_ton = emisiones_total_kg / 1000;

    const round = (n: number) => Math.round(n * 1000000) / 1000000;

    const calculoData = {
      fecha_inicio_periodo: input.fecha_inicio,
      fecha_fin_periodo: input.fecha_fin,
      turno_id: input.turno_id || null,
      turnos_analizados: datos.turnos_analizados,
      kwh_total: round(datos.kwh_total),
      m3_biogas_total: round(datos.m3_biogas_total),
      total_big_bags: datos.total_big_bags,
      total_lonas: datos.total_lonas,
      total_residuos_kg: round(datos.total_residuos_kg),
      emisiones_electricidad_kg: round(emisiones_electricidad_kg),
      emisiones_co2_biogenico_kg: round(emisiones_co2_biogenico_kg),
      emisiones_ch4_kg: round(emisiones_ch4_kg),
      emisiones_n2o_kg: round(emisiones_n2o_kg),
      emisiones_big_bags_kg: round(emisiones_big_bags_kg),
      emisiones_lonas_kg: round(emisiones_lonas_kg),
      emisiones_residuos_kg: round(emisiones_residuos_kg),
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
      kwh_total: round(datos.kwh_total),
      m3_biogas_total: round(datos.m3_biogas_total),
      total_big_bags: datos.total_big_bags,
      total_lonas: datos.total_lonas,
      total_residuos_kg: round(datos.total_residuos_kg),
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
        residuos_kg: round(emisiones_residuos_kg),
        residuos_factor_pendiente: factoresPendientes.includes('fe_residuo_kg'),
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

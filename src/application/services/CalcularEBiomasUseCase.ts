// src/application/services/CalcularEBiomasUseCase.ts
// Caso de uso para calcular emisiones eBiomass

import { IEBiomasRepository } from '../../domain/repositories/IEBiomasRepository';
import { EBiomasCalculoInput, EBiomasCalculoResponse, EBiomasResultado } from '../../domain/entities/EBiomasCalculo';
import { CarbonConfigService } from './CarbonConfigService';

export class CalcularEBiomasUseCase {
  constructor(private repository: IEBiomasRepository) {}

  async ejecutar(input: EBiomasCalculoInput): Promise<{ resultado: EBiomasCalculoResponse; guardado: EBiomasResultado }> {
    const constantes = CarbonConfigService.getEBiomasConstantes();

    // Paso 1 — Total viajes en el período
    const total_viajes = await this.repository.contarViajesPorPeriodo(
      input.fecha_inicio,
      input.fecha_fin,
      input.turno_id
    );

    // Paso 2 — Litros de diésel consumidos
    const litros_diesel = total_viajes * constantes.consumo_diesel_por_viaje;

    // Paso 3 — Kilogramos de diésel consumidos
    const kg_diesel = litros_diesel * constantes.densidad_diesel;

    // Paso 4 — Emisiones de producción del diésel (upstream)
    const emisiones_produccion_kg = kg_diesel * constantes.fe_produccion_diesel;

    // Paso 5 — Emisiones de combustión del diésel (CO₂ + CH₄ + N₂O)
    const emisiones_combustion_kg = kg_diesel * constantes.fe_combustion_diesel;

    // Paso 6 — Emisiones totales eBiomass
    const emisiones_total_kg = emisiones_produccion_kg + emisiones_combustion_kg;
    const emisiones_total_ton = emisiones_total_kg / 1000;

    // Redondear a 3 decimales
    const round = (n: number) => Math.round(n * 1000) / 1000;

    const calculoData = {
      fecha_inicio_periodo: input.fecha_inicio,
      fecha_fin_periodo: input.fecha_fin,
      turno_id: input.turno_id || null,
      total_viajes,
      litros_diesel: round(litros_diesel),
      kg_diesel: round(kg_diesel),
      emisiones_produccion_kg: round(emisiones_produccion_kg),
      emisiones_combustion_kg: round(emisiones_combustion_kg),
      emisiones_total_kg: round(emisiones_total_kg),
      emisiones_total_ton: round(emisiones_total_ton),
      constantes_usadas: constantes,
      calculado_por: input.calculado_por,
    };

    // Guardar resultado en tabla carbon_ebiomas_resultados
    const guardado = await this.repository.guardarResultado(calculoData);

    const resultado: EBiomasCalculoResponse = {
      periodo: {
        fecha_inicio: input.fecha_inicio,
        fecha_fin: input.fecha_fin,
      },
      total_viajes,
      litros_diesel: round(litros_diesel),
      kg_diesel: round(kg_diesel),
      emisiones_produccion_kg: round(emisiones_produccion_kg),
      emisiones_combustion_kg: round(emisiones_combustion_kg),
      emisiones_total_kg: round(emisiones_total_kg),
      emisiones_total_ton: round(emisiones_total_ton),
      desglose: {
        factor_produccion_usado: constantes.fe_produccion_diesel,
        factor_combustion_usado: constantes.fe_combustion_diesel,
        consumo_diesel_por_viaje: constantes.consumo_diesel_por_viaje,
        densidad_diesel: constantes.densidad_diesel,
      },
    };

    return { resultado, guardado };
  }
}

// src/application/services/PreviewEBiomasUseCase.ts
// Caso de uso para calcular preview sin guardar (tiempo real)

import { IEBiomasRepository } from '../../domain/repositories/IEBiomasRepository';
import { EBiomasCalculoResponse } from '../../domain/entities/EBiomasCalculo';
import { CarbonConfigService } from './CarbonConfigService';

export class PreviewEBiomasUseCase {
  constructor(private repository: IEBiomasRepository) {}

  async ejecutar(fechaInicio: string, fechaFin: string, turnoId?: string | null): Promise<EBiomasCalculoResponse> {
    const constantes = CarbonConfigService.getEBiomasConstantes();

    const total_viajes = await this.repository.contarViajesPorPeriodo(fechaInicio, fechaFin, turnoId);

    const litros_diesel = total_viajes * constantes.consumo_diesel_por_viaje;
    const kg_diesel = litros_diesel * constantes.densidad_diesel;
    const emisiones_produccion_kg = kg_diesel * constantes.fe_produccion_diesel;
    const emisiones_combustion_kg = kg_diesel * constantes.fe_combustion_diesel;
    const emisiones_total_kg = emisiones_produccion_kg + emisiones_combustion_kg;
    const emisiones_total_ton = emisiones_total_kg / 1000;

    const round = (n: number) => Math.round(n * 1000) / 1000;

    return {
      periodo: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
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
  }
}

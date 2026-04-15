// src/application/services/PreviewETransporteUseCase.ts
// Caso de uso para calcular preview sin guardar (tiempo real)

import { IETransporteRepository } from '../../domain/repositories/IETransporteRepository';
import { ETransporteCalculoResponse } from '../../domain/entities/ETransporteCalculo';
import { CarbonConfigService } from './CarbonConfigService';

export class PreviewETransporteUseCase {
  constructor(private repository: IETransporteRepository) {}

  async ejecutar(fechaInicio: string, fechaFin: string): Promise<ETransporteCalculoResponse> {
    const constantes = CarbonConfigService.getETransporteConstantes();

    const total_baches = await this.repository.contarBachesPorPeriodo(fechaInicio, fechaFin);
    const total_viajes = Math.floor(total_baches / 10);
    const distancia_total_km = total_viajes * constantes.distancia_km_viaje;
    const litros_diesel = distancia_total_km * constantes.consumo_L_km;
    const kg_diesel = litros_diesel * constantes.densidad_diesel;
    const emisiones_combustion_kg = kg_diesel * constantes.fe_combustion;
    const emisiones_upstream_kg = kg_diesel * constantes.fe_upstream;
    const emisiones_total_kg = emisiones_combustion_kg + emisiones_upstream_kg;
    const emisiones_total_ton = emisiones_total_kg / 1000;

    const round = (n: number) => Math.round(n * 1000) / 1000;

    return {
      periodo: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
      total_baches,
      total_viajes,
      distancia_total_km: round(distancia_total_km),
      litros_diesel: round(litros_diesel),
      kg_diesel: round(kg_diesel),
      emisiones_combustion_kg: round(emisiones_combustion_kg),
      emisiones_upstream_kg: round(emisiones_upstream_kg),
      emisiones_total_kg: round(emisiones_total_kg),
      emisiones_total_ton: round(emisiones_total_ton),
      desglose: {
        distancia_km_viaje: constantes.distancia_km_viaje,
        consumo_L_km: constantes.consumo_L_km,
        densidad_diesel: constantes.densidad_diesel,
        fe_combustion: constantes.fe_combustion,
        fe_upstream: constantes.fe_upstream,
      },
    };
  }
}

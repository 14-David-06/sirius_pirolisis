// src/application/services/CalcularETransporteUseCase.ts
// Caso de uso para calcular emisiones eTransporte (Etapa 3)

import { IETransporteRepository } from '../../domain/repositories/IETransporteRepository';
import { ETransporteCalculoInput, ETransporteCalculoResponse, ETransporteResultado } from '../../domain/entities/ETransporteCalculo';
import { CarbonConfigService } from './CarbonConfigService';

export class CalcularETransporteUseCase {
  constructor(private repository: IETransporteRepository) {}

  async ejecutar(input: ETransporteCalculoInput): Promise<{ resultado: ETransporteCalculoResponse; guardado: ETransporteResultado }> {
    const constantes = CarbonConfigService.getETransporteConstantes();

    // Paso 1 — Total baches en el período
    const total_baches = await this.repository.contarBachesPorPeriodo(
      input.fecha_inicio,
      input.fecha_fin
    );

    // Paso 2 — Viajes = FLOOR(baches / 10) — 1 viaje cada 10 baches
    const total_viajes = Math.floor(total_baches / 10);

    // Paso 3 — Distancia total
    const distancia_total_km = total_viajes * constantes.distancia_km_viaje;

    // Paso 4 — Litros de diésel consumidos
    const litros_diesel = distancia_total_km * constantes.consumo_L_km;

    // Paso 5 — Kilogramos de diésel
    const kg_diesel = litros_diesel * constantes.densidad_diesel;

    // Paso 6 — Emisiones combustión
    const emisiones_combustion_kg = kg_diesel * constantes.fe_combustion;

    // Paso 7 — Emisiones upstream
    const emisiones_upstream_kg = kg_diesel * constantes.fe_upstream;

    // Paso 8 — Total eTransporte
    const emisiones_total_kg = emisiones_combustion_kg + emisiones_upstream_kg;
    const emisiones_total_ton = emisiones_total_kg / 1000;

    // Redondear a 3 decimales
    const round = (n: number) => Math.round(n * 1000) / 1000;

    const calculoData = {
      fecha_inicio_periodo: input.fecha_inicio,
      fecha_fin_periodo: input.fecha_fin,
      total_baches,
      total_viajes,
      distancia_total_km: round(distancia_total_km),
      litros_diesel: round(litros_diesel),
      kg_diesel: round(kg_diesel),
      emisiones_combustion_kg: round(emisiones_combustion_kg),
      emisiones_upstream_kg: round(emisiones_upstream_kg),
      emisiones_total_kg: round(emisiones_total_kg),
      emisiones_total_ton: round(emisiones_total_ton),
      constantes_usadas: constantes,
      calculado_por: input.calculado_por,
    };

    // Guardar resultado en tabla carbon_etransporte_resultados
    const guardado = await this.repository.guardarResultado(calculoData);

    const resultado: ETransporteCalculoResponse = {
      periodo: {
        fecha_inicio: input.fecha_inicio,
        fecha_fin: input.fecha_fin,
      },
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

    return { resultado, guardado };
  }
}

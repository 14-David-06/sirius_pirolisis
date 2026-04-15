// src/application/services/CarbonConfigService.ts
// Servicio para leer las constantes de carbono desde variables de entorno

import { EBiomasConstantes } from '../../domain/entities/EBiomasCalculo';
import { EPirolisisConstantes } from '../../domain/entities/EPirolisisCalculo';
import { ETransporteConstantes } from '../../domain/entities/ETransporteCalculo';

export class CarbonConfigService {
  private static parseEnvFloat(name: string): number {
    const value = process.env[name];
    if (value === undefined || value === '') {
      throw new Error(`Variable de entorno requerida no configurada: ${name}`);
    }
    return parseFloat(value);
  }

  static getEBiomasConstantes(): EBiomasConstantes {
    return {
      consumo_diesel_por_viaje: this.parseEnvFloat('CARBON_CONSUMO_DIESEL_POR_VIAJE'),
      densidad_diesel: this.parseEnvFloat('CARBON_DENSIDAD_DIESEL'),
      fe_produccion_diesel: this.parseEnvFloat('CARBON_FE_PRODUCCION_DIESEL'),
      fe_combustion_diesel: this.parseEnvFloat('CARBON_FE_COMBUSTION_DIESEL'),
    };
  }

  static getEPirolisisConstantes(): EPirolisisConstantes {
    return {
      fe_electricidad: this.parseEnvFloat('CARBON_FE_ELECTRICIDAD'),
      fe_co2_biogas: this.parseEnvFloat('CARBON_FE_CO2_BIOGAS'),
      fe_ch4_biogas: this.parseEnvFloat('CARBON_FE_CH4_BIOGAS'),
      fe_n2o_biogas: this.parseEnvFloat('CARBON_FE_N2O_BIOGAS'),
      fe_big_bag: this.parseEnvFloat('CARBON_FE_BIG_BAG'),
      fe_lona: this.parseEnvFloat('CARBON_FE_LONA'),
      fe_residuo_lubricants: this.parseEnvFloat('CARBON_FE_RESIDUO_LUBRICANTS'),
      fe_residuo_used_oil: this.parseEnvFloat('CARBON_FE_RESIDUO_USED_OIL'),
      fe_residuo_paint_cans: this.parseEnvFloat('CARBON_FE_RESIDUO_PAINT_CANS'),
      fe_residuo_ppe: this.parseEnvFloat('CARBON_FE_RESIDUO_PPE'),
      chimenea_co_kg_hr: this.parseEnvFloat('CARBON_CHIMENEA_CO_KG_HR'),
      chimenea_co2_kg_hr: this.parseEnvFloat('CARBON_CHIMENEA_CO2_KG_HR'),
      chimenea_ch4_kg_hr: this.parseEnvFloat('CARBON_CHIMENEA_CH4_KG_HR'),
      chimenea_n2o_kg_hr: this.parseEnvFloat('CARBON_CHIMENEA_N2O_KG_HR'),
      gwp_ch4: this.parseEnvFloat('CARBON_GWP_CH4'),
      gwp_n2o: this.parseEnvFloat('CARBON_GWP_N2O'),
    };
  }

  static getFactoresPendientes(): string[] {
    const pendientes: string[] = [];
    if (this.parseEnvFloat('CARBON_FE_BIG_BAG') === 0) pendientes.push('fe_big_bag');
    if (this.parseEnvFloat('CARBON_FE_LONA') === 0) pendientes.push('fe_lona');
    return pendientes;
  }

  static getETransporteConstantes(): ETransporteConstantes {
    return {
      distancia_km_viaje: this.parseEnvFloat('CARBON_TRANSPORTE_DISTANCIA_KM'),
      consumo_L_km: this.parseEnvFloat('CARBON_TRANSPORTE_CONSUMO_L_KM'),
      densidad_diesel: this.parseEnvFloat('CARBON_TRANSPORTE_DENSIDAD_DIESEL'),
      fe_combustion: this.parseEnvFloat('CARBON_TRANSPORTE_FE_COMBUSTION'),
      fe_upstream: this.parseEnvFloat('CARBON_TRANSPORTE_FE_UPSTREAM'),
    };
  }
}

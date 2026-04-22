// src/application/services/CalcularEUseUseCase.ts
// Caso de uso: calcula eUse y persiste en carbon_euse_resultados.

import { IEUseRepository } from '../../domain/repositories/IEUseRepository';
import {
  EUseCalculoInput,
  EUseCalculoResponse,
  EUseResultado,
} from '../../domain/entities/EUseCalculo';
import { CarbonConfigService } from './CarbonConfigService';
import { calcularEUse } from './EUseCalculator';

export class CalcularEUseUseCase {
  constructor(private repository: IEUseRepository) {}

  async ejecutar(
    input: EUseCalculoInput
  ): Promise<{ resultado: EUseCalculoResponse; guardado: EUseResultado }> {
    const constantes = CarbonConfigService.getEUseConstantes();

    const [remisiones, clientes] = await Promise.all([
      this.repository.listarRemisionesPorPeriodo(input.fecha_inicio, input.fecha_fin),
      this.repository.listarClientesConDistancia(),
    ]);

    const { desglose, resumen } = calcularEUse(remisiones, clientes, constantes);

    const guardado = await this.repository.guardarResultado({
      fecha_inicio_periodo: input.fecha_inicio,
      fecha_fin_periodo: input.fecha_fin,
      remisiones_analizadas: remisiones.length,
      remisiones_liviano: resumen.remisiones_liviano,
      remisiones_pesado: resumen.remisiones_pesado,
      emisiones_liviano_kg: resumen.emisiones_liviano_kg,
      emisiones_pesado_kg: resumen.emisiones_pesado_kg,
      emisiones_total_kg: resumen.emisiones_total_kg,
      emisiones_total_ton: resumen.emisiones_total_ton,
      desglose_remisiones: desglose,
      constantes_usadas: constantes,
      calculado_por: input.calculado_por,
    });

    const resultado: EUseCalculoResponse = {
      periodo: { fecha_inicio: input.fecha_inicio, fecha_fin: input.fecha_fin },
      remisiones_analizadas: remisiones.length,
      desglose_por_remision: desglose,
      resumen,
      constantes_usadas: constantes,
    };

    return { resultado, guardado };
  }
}

// src/application/services/PreviewEUseUseCase.ts
// Preview: mismo cálculo que CalcularEUseUseCase pero NO persiste.

import { IEUseRepository } from '../../domain/repositories/IEUseRepository';
import { EUseCalculoResponse } from '../../domain/entities/EUseCalculo';
import { CarbonConfigService } from './CarbonConfigService';
import { calcularEUse } from './EUseCalculator';

export class PreviewEUseUseCase {
  constructor(private repository: IEUseRepository) {}

  async ejecutar(fechaInicio: string, fechaFin: string): Promise<EUseCalculoResponse> {
    const constantes = CarbonConfigService.getEUseConstantes();

    const [remisiones, clientes] = await Promise.all([
      this.repository.listarRemisionesPorPeriodo(fechaInicio, fechaFin),
      this.repository.listarClientesConDistancia(),
    ]);

    const { desglose, resumen } = calcularEUse(remisiones, clientes, constantes);

    return {
      periodo: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
      remisiones_analizadas: remisiones.length,
      desglose_por_remision: desglose,
      resumen,
      constantes_usadas: constantes,
    };
  }
}

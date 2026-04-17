// src/application/services/InferirTipoAperturaUseCase.ts
// Caso de uso: Inferir si el turno es arranque o continuidad
// Lógica: si existe al menos un turno cerrado (Fecha Fin Turno != null) → continuidad, si no → arranque

import { TipoApertura } from '../../domain/entities/Aforo';
import { IAforoRepository } from '../../domain/repositories/IAforoRepository';
import { LoggerService } from '../../infrastructure/services/LoggerService';

export class InferirTipoAperturaUseCase {
  constructor(private readonly aforoRepository: IAforoRepository) {}

  async ejecutar(): Promise<{ tipoSugerido: TipoApertura }> {
    const existeTurnoCerrado = await this.aforoRepository.existeTurnoCerrado();

    const tipoSugerido: TipoApertura = existeTurnoCerrado ? 'continuidad' : 'arranque';

    LoggerService.info('Tipo de apertura inferido', {
      tipoSugerido,
      existeTurnoCerrado,
    });

    return { tipoSugerido };
  }
}

// src/application/services/GetAforosByTurnoUseCase.ts
// Caso de uso: Obtener todos los aforos de un turno

import { Aforo } from '../../domain/entities/Aforo';
import { IAforoRepository } from '../../domain/repositories/IAforoRepository';

export class GetAforosByTurnoUseCase {
  constructor(private readonly aforoRepository: IAforoRepository) {}

  async ejecutar(turnoId: string): Promise<Aforo[]> {
    if (!turnoId) {
      throw new Error('El ID del turno es requerido');
    }
    return this.aforoRepository.findByTurno(turnoId);
  }
}

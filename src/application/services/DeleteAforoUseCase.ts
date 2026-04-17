// src/application/services/DeleteAforoUseCase.ts
// Caso de uso: Eliminar un aforo — solo Admin/Supervisor

import { IAforoRepository } from '../../domain/repositories/IAforoRepository';
import { LoggerService } from '../../infrastructure/services/LoggerService';

export class DeleteAforoUseCase {
  constructor(private readonly aforoRepository: IAforoRepository) {}

  async ejecutar(id: string, eliminadoPor: string): Promise<boolean> {
    if (!id) {
      throw new Error('El ID del aforo es requerido');
    }

    const deleted = await this.aforoRepository.delete(id);

    LoggerService.warn('Aforo eliminado', {
      aforoId: id,
      eliminadoPor,
    });

    return deleted;
  }
}

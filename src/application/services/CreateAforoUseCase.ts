// src/application/services/CreateAforoUseCase.ts
// Caso de uso: Crear un registro de aforo en un turno activo

import { Aforo, CreateAforoInput, CreateAforoSchema } from '../../domain/entities/Aforo';
import { IAforoRepository } from '../../domain/repositories/IAforoRepository';
import { LoggerService } from '../../infrastructure/services/LoggerService';

export class CreateAforoUseCase {
  constructor(private readonly aforoRepository: IAforoRepository) {}

  async ejecutar(input: CreateAforoInput, realizaRegistro: string): Promise<Aforo> {
    // Validar input con Zod
    const validated = CreateAforoSchema.parse(input);

    const aforo = await this.aforoRepository.create(validated, realizaRegistro);

    LoggerService.info('Aforo creado exitosamente', {
      aforoId: aforo.id,
      turnoId: aforo.turnoId,
      rendimiento: aforo.rendimientoInstantaneo,
      registradoPor: realizaRegistro,
    });

    return aforo;
  }
}

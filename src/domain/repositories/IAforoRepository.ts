// src/domain/repositories/IAforoRepository.ts
// Interfaz del repositorio de aforos operacionales

import { Aforo, CreateAforoInput } from '../entities/Aforo';

export interface IAforoRepository {
  create(input: CreateAforoInput, realizaRegistro: string): Promise<Aforo>;
  findByTurno(turnoId: string): Promise<Aforo[]>;
  delete(id: string): Promise<boolean>;
  existeTurnoCerrado(): Promise<boolean>;
}

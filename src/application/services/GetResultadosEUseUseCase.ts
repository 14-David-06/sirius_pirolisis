// src/application/services/GetResultadosEUseUseCase.ts
// Listar y obtener resultados eUse persistidos.

import { IEUseRepository } from '../../domain/repositories/IEUseRepository';
import { EUseResultado } from '../../domain/entities/EUseCalculo';

export class GetResultadosEUseUseCase {
  constructor(private repository: IEUseRepository) {}

  async listar(
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ resultados: EUseResultado[]; total: number }> {
    return this.repository.listarResultados(page, pageSize);
  }

  async obtenerPorId(id: string): Promise<EUseResultado | null> {
    return this.repository.obtenerResultadoPorId(id);
  }
}

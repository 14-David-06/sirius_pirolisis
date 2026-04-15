// src/application/services/GetResultadosEPirolisisUseCase.ts
// Caso de uso para listar y obtener resultados de ePirólisis

import { IEPirolisisRepository } from '../../domain/repositories/IEPirolisisRepository';
import { EPirolisisResultado } from '../../domain/entities/EPirolisisCalculo';

export class GetResultadosEPirolisisUseCase {
  constructor(private repository: IEPirolisisRepository) {}

  async listar(page: number = 1, pageSize: number = 20): Promise<{ resultados: EPirolisisResultado[]; total: number }> {
    return this.repository.listarResultados(page, pageSize);
  }

  async obtenerPorId(id: string): Promise<EPirolisisResultado | null> {
    return this.repository.obtenerResultadoPorId(id);
  }
}

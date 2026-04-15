// src/application/services/GetResultadosEBiomasUseCase.ts
// Caso de uso para listar y obtener resultados de eBiomass

import { IEBiomasRepository } from '../../domain/repositories/IEBiomasRepository';
import { EBiomasResultado } from '../../domain/entities/EBiomasCalculo';

export class GetResultadosEBiomasUseCase {
  constructor(private repository: IEBiomasRepository) {}

  async listar(page: number = 1, pageSize: number = 20): Promise<{ resultados: EBiomasResultado[]; total: number }> {
    return this.repository.listarResultados(page, pageSize);
  }

  async obtenerPorId(id: string): Promise<EBiomasResultado | null> {
    return this.repository.obtenerResultadoPorId(id);
  }
}

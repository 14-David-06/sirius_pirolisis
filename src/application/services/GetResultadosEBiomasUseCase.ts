// src/application/services/GetResultadoseBiomasUseCase.ts
// Caso de uso para listar y obtener resultados de eBiomass

import { IeBiomasRepository } from '../../domain/repositories/IEBiomasRepository';
import { eBiomasResultado } from '../../domain/entities/EBiomasCalculo';

export class GetResultadoseBiomasUseCase {
  constructor(private repository: IeBiomasRepository) {}

  async listar(page: number = 1, pageSize: number = 20): Promise<{ resultados: eBiomasResultado[]; total: number }> {
    return this.repository.listarResultados(page, pageSize);
  }

  async obtenerPorId(id: string): Promise<eBiomasResultado | null> {
    return this.repository.obtenerResultadoPorId(id);
  }
}

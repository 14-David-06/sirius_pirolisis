// src/application/services/GetResultadosETransporteUseCase.ts
// Caso de uso para listar y obtener resultados de eTransporte

import { IETransporteRepository } from '../../domain/repositories/IETransporteRepository';
import { ETransporteResultado } from '../../domain/entities/ETransporteCalculo';

export class GetResultadosETransporteUseCase {
  constructor(private repository: IETransporteRepository) {}

  async listar(page: number = 1, pageSize: number = 20): Promise<{ resultados: ETransporteResultado[]; total: number }> {
    return this.repository.listarResultados(page, pageSize);
  }

  async obtenerPorId(id: string): Promise<ETransporteResultado | null> {
    return this.repository.obtenerResultadoPorId(id);
  }
}

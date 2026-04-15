// src/domain/repositories/IETransporteRepository.ts
// Interfaz de repositorio para operaciones de eTransporte

import { ETransporteResultado } from '../entities/ETransporteCalculo';

export interface IETransporteRepository {
  contarBachesPorPeriodo(fechaInicio: string, fechaFin: string): Promise<number>;
  guardarResultado(resultado: Omit<ETransporteResultado, 'id' | 'created_at'>): Promise<ETransporteResultado>;
  listarResultados(page: number, pageSize: number): Promise<{ resultados: ETransporteResultado[]; total: number }>;
  obtenerResultadoPorId(id: string): Promise<ETransporteResultado | null>;
}

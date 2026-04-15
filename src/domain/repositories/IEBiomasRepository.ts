// src/domain/repositories/IEBiomasRepository.ts
// Interfaz de repositorio para operaciones de eBiomass

import { EBiomasResultado } from '../entities/EBiomasCalculo';

export interface IEBiomasRepository {
  contarViajesPorPeriodo(fechaInicio: string, fechaFin: string, turnoId?: string | null): Promise<number>;
  guardarResultado(resultado: Omit<EBiomasResultado, 'id' | 'created_at'>): Promise<EBiomasResultado>;
  listarResultados(page: number, pageSize: number): Promise<{ resultados: EBiomasResultado[]; total: number }>;
  obtenerResultadoPorId(id: string): Promise<EBiomasResultado | null>;
}

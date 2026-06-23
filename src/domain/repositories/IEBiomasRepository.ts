// src/domain/repositories/IeBiomasRepository.ts
// Interfaz de repositorio para operaciones de eBiomass

import { eBiomasResultado } from '../entities/EBiomasCalculo';

export interface IeBiomasRepository {
  contarViajesPorPeriodo(fechaInicio: string, fechaFin: string, turnoId?: string | null): Promise<number>;
  guardarResultado(resultado: Omit<eBiomasResultado, 'id' | 'created_at'>): Promise<eBiomasResultado>;
  listarResultados(page: number, pageSize: number): Promise<{ resultados: eBiomasResultado[]; total: number }>;
  obtenerResultadoPorId(id: string): Promise<eBiomasResultado | null>;
}

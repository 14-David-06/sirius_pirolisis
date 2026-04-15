// src/domain/repositories/IEPirolisisRepository.ts
// Interfaz de repositorio para operaciones de ePirólisis

import { EPirolisisResultado, EPirolisisDatosAgregados } from '../entities/EPirolisisCalculo';

export interface IEPirolisisRepository {
  obtenerDatosAgregados(fechaInicio: string, fechaFin: string, turnoId?: string | null): Promise<EPirolisisDatosAgregados>;
  guardarResultado(resultado: Omit<EPirolisisResultado, 'id' | 'created_at'>): Promise<EPirolisisResultado>;
  listarResultados(page: number, pageSize: number): Promise<{ resultados: EPirolisisResultado[]; total: number }>;
  obtenerResultadoPorId(id: string): Promise<EPirolisisResultado | null>;
}

// src/domain/repositories/IEUseRepository.ts
// Interfaz de repositorio para operaciones de eUse (Etapa 4)

import {
  EUseResultado,
  EUseRemisionRaw,
  EUseClienteDistancia,
} from '../entities/EUseCalculo';

export interface IEUseRepository {
  /**
   * Lee remisiones de biochar dentro del rango Fecha Evento (inclusive).
   * Para cada remisión devuelve la suma de kg despachados de su detalle vinculado.
   */
  listarRemisionesPorPeriodo(
    fechaInicio: string,
    fechaFin: string
  ): Promise<EUseRemisionRaw[]>;

  /**
   * Obtiene todos los clientes con distancia desde la base cross-base Sirius Clients Core.
   */
  listarClientesConDistancia(): Promise<EUseClienteDistancia[]>;

  guardarResultado(
    resultado: Omit<EUseResultado, 'id' | 'created_at'>
  ): Promise<EUseResultado>;

  listarResultados(
    page: number,
    pageSize: number
  ): Promise<{ resultados: EUseResultado[]; total: number }>;

  obtenerResultadoPorId(id: string): Promise<EUseResultado | null>;
}

"use client";

import { useState, useEffect } from 'react';
import type {
  ActivoFijoRecord,
  AsignacionRecord,
  ActivosData,
  AsignacionesData,
  ActivosFilters,
  AsignacionesFilters,
  EstadoOperativo,
  EstadisticasActivos,
} from '@/types/activos';

/**
 * Helper genérico para obtener valores de campos con fallbacks
 * Reduce duplicación de código y centraliza la lógica de acceso a campos
 */
function getFieldValue<T = string>(
  record: ActivoFijoRecord | AsignacionRecord,
  fieldNames: Array<string>,
  defaultValue: T
): T {
  for (const fieldName of fieldNames) {
    const value = record.fields[fieldName];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return defaultValue;
}

/**
 * Hook personalizado para gestión de Activos Fijos
 * Proporciona estado, funciones de fetch y getters para acceder a datos de activos
 */
export function useActivos(filters?: ActivosFilters) {
  const [data, setData] = useState<ActivosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivos = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.categoria) params.set('categoria', filters.categoria);
      if (filters?.estadoOperativo) params.set('estado', filters.estadoOperativo);
      if (filters?.ubicacion) params.set('ubicacion', filters.ubicacion);
      if (filters?.area) params.set('area', filters.area);
      if (filters?.soloAsignados) params.set('soloAsignados', 'true');
      if (filters?.soloDisponibles) params.set('soloDisponibles', 'true');
      if (filters?.proximosAVencer) params.set('proximosAVencer', 'true');

      const qs = params.toString();
      const url = `/api/activos/list${qs ? `?${qs}` : ''}`;

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error?.includes('no configurado')) {
          throw new Error('Módulo de Activos Fijos no configurado. Verifica las variables de entorno.');
        }
        throw new Error(result.error || 'Error al obtener datos de activos');
      }

      setData(result);

      if (result.records && result.records.length === 0) {
        console.info('📦 No hay activos registrados o no hay resultados con los filtros aplicados');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar activos';
      console.error('❌ Error al cargar activos:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivos();
  }, [
    filters?.categoria,
    filters?.estadoOperativo,
    filters?.ubicacion,
    filters?.area,
    filters?.soloAsignados,
    filters?.soloDisponibles,
    filters?.proximosAVencer,
  ]);

  // ============================================================================
  // FUNCIÓN DE REFRESH MANUAL
  // ============================================================================

  const refreshActivos = async () => {
    await fetchActivos();
  };

  // ============================================================================
  // GETTERS PARA ACTIVOS FIJOS
  // ============================================================================

  const getActivoNombre = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Nombre del Activo', 'Nombre', 'Name'],
      'Sin nombre'
    );
  };

  const getActivoCodigo = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Código Activo', 'Codigo', 'ID'],
      'N/A'
    );
  };

  const getActivoDescripcion = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Descripción', 'Descripcion'],
      ''
    );
  };

  const getActivoCategoria = (record: ActivoFijoRecord): string => {
    const categorias = getFieldValue<string[]>(
      record,
      ['Categoría', 'Categoria'],
      []
    );
    return Array.isArray(categorias) && categorias.length > 0
      ? categorias.join(', ')
      : 'Sin categoría';
  };

  const getActivoEstado = (record: ActivoFijoRecord): EstadoOperativo => {
    return getFieldValue(
      record,
      ['Estado Operativo', 'Estado'],
      'Operativo'
    ) as EstadoOperativo;
  };

  const getActivoUbicacion = (record: ActivoFijoRecord): string => {
    // Las ubicaciones vienen como array de record IDs
    // Idealmente deberíamos hacer lookup, pero por ahora retornamos el ID
    const ubicaciones = getFieldValue<string[]>(
      record,
      ['Ubicación Actual', 'Ubicacion'],
      []
    );
    return Array.isArray(ubicaciones) && ubicaciones.length > 0
      ? ubicaciones.join(', ')
      : 'Sin ubicación';
  };

  const getActivoArea = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Área Responsable', 'Area Responsable', 'Area'],
      ''
    );
  };

  const getActivoResponsable = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Responsable Asignado', 'Responsable'],
      ''
    );
  };

  const getActivoEstaAsignado = (record: ActivoFijoRecord): boolean => {
    const responsable = getActivoResponsable(record);
    return responsable.trim() !== '';
  };

  const getActivoNumeroSerie = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Número de Serie', 'Numero de Serie', 'Serie'],
      ''
    );
  };

  const getActivoCodigoInterno = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Código Interno', 'Codigo Interno'],
      ''
    );
  };

  const getActivoMarca = (record: ActivoFijoRecord): string => {
    return getFieldValue(record, ['Marca'], '');
  };

  const getActivoModelo = (record: ActivoFijoRecord): string => {
    return getFieldValue(record, ['Modelo'], '');
  };

  const getActivoFechaAdquisicion = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Fecha de Adquisición', 'Fecha Adquisicion'],
      ''
    );
  };

  const getActivoValorAdquisicion = (record: ActivoFijoRecord): number => {
    return getFieldValue(
      record,
      ['Valor de Adquisición', 'Valor Adquisicion', 'Valor'],
      0
    );
  };

  const getActivoProveedor = (record: ActivoFijoRecord): string => {
    return getFieldValue(record, ['Proveedor'], '');
  };

  const getActivoFechaVencimiento = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Fecha de Vencimiento', 'Fecha Vencimiento'],
      ''
    );
  };

  const getActivoDiasVencimiento = (record: ActivoFijoRecord): number | null => {
    const dias = getFieldValue<number | null>(
      record,
      ['Días para Vencimiento', 'Dias para Vencimiento'],
      null
    );
    return typeof dias === 'number' ? dias : null;
  };

  const getActivoProximoMantenimiento = (record: ActivoFijoRecord): string => {
    return getFieldValue(
      record,
      ['Próximo Mantenimiento', 'Proximo Mantenimiento'],
      ''
    );
  };

  const getActivoNotas = (record: ActivoFijoRecord): string => {
    return getFieldValue(record, ['Notas'], '');
  };

  // ============================================================================
  // FUNCIONES DE CÁLCULO Y ANÁLISIS
  // ============================================================================

  const getTotalActivos = (): number => {
    return data?.records?.length || 0;
  };

  const getActivosByCategoria = (): Record<string, ActivoFijoRecord[]> => {
    const records = data?.records || [];
    const grouped: Record<string, ActivoFijoRecord[]> = {};

    records.forEach((record) => {
      const categoria = getActivoCategoria(record);
      if (!grouped[categoria]) {
        grouped[categoria] = [];
      }
      grouped[categoria].push(record);
    });

    return grouped;
  };

  const getActivosByEstado = (estado: EstadoOperativo): ActivoFijoRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => getActivoEstado(record) === estado);
  };

  const getActivosOperativos = (): ActivoFijoRecord[] => {
    return getActivosByEstado('Operativo');
  };

  const getActivosEnReparacion = (): ActivoFijoRecord[] => {
    return getActivosByEstado('En Reparación');
  };

  const getActivosAsignados = (): ActivoFijoRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => getActivoEstaAsignado(record));
  };

  const getActivosDisponibles = (): ActivoFijoRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => {
      return !getActivoEstaAsignado(record) && getActivoEstado(record) === 'Operativo';
    });
  };

  const getActivosProximosAVencer = (diasAnticipacion: number = 30): ActivoFijoRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => {
      const dias = getActivoDiasVencimiento(record);
      return dias !== null && dias > 0 && dias <= diasAnticipacion;
    });
  };

  const getActivosVencidos = (): ActivoFijoRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => {
      const dias = getActivoDiasVencimiento(record);
      return dias !== null && dias <= 0;
    });
  };

  const getActivosByArea = (area: string): ActivoFijoRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => getActivoArea(record) === area);
  };

  const getActivosByUbicacion = (ubicacion: string): ActivoFijoRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => getActivoUbicacion(record).includes(ubicacion));
  };

  const getValorTotalActivos = (): number => {
    const records = data?.records || [];
    return records.reduce((total, record) => {
      return total + getActivoValorAdquisicion(record);
    }, 0);
  };

  // ============================================================================
  // RETORNO DEL HOOK
  // ============================================================================

  return {
    // Estado
    data,
    loading,
    error,

    // Funciones de fetch
    refreshActivos,

    // Getters individuales
    getActivoNombre,
    getActivoCodigo,
    getActivoDescripcion,
    getActivoCategoria,
    getActivoEstado,
    getActivoUbicacion,
    getActivoArea,
    getActivoResponsable,
    getActivoEstaAsignado,
    getActivoNumeroSerie,
    getActivoCodigoInterno,
    getActivoMarca,
    getActivoModelo,
    getActivoFechaAdquisicion,
    getActivoValorAdquisicion,
    getActivoProveedor,
    getActivoFechaVencimiento,
    getActivoDiasVencimiento,
    getActivoProximoMantenimiento,
    getActivoNotas,

    // Funciones de cálculo
    getTotalActivos,
    getActivosByCategoria,
    getActivosByEstado,
    getActivosOperativos,
    getActivosEnReparacion,
    getActivosAsignados,
    getActivosDisponibles,
    getActivosProximosAVencer,
    getActivosVencidos,
    getActivosByArea,
    getActivosByUbicacion,
    getValorTotalActivos,
  };
}

// ============================================================================
// HOOK PARA ASIGNACIONES
// ============================================================================

export function useAsignaciones(filters?: AsignacionesFilters) {
  const [data, setData] = useState<AsignacionesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAsignaciones = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.responsable) params.set('responsable', filters.responsable);
      if (filters?.area) params.set('area', filters.area);
      if (filters?.soloActivas) params.set('soloActivas', 'true');
      if (filters?.activoId) params.set('activoId', filters.activoId);

      const qs = params.toString();
      const url = `/api/activos/asignaciones/list${qs ? `?${qs}` : ''}`;

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al obtener asignaciones');
      }

      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al cargar asignaciones:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAsignaciones();
  }, [filters?.responsable, filters?.area, filters?.soloActivas, filters?.activoId]);

  const refreshAsignaciones = async () => {
    await fetchAsignaciones();
  };

  // Getters para asignaciones
  const getAsignacionResponsable = (record: AsignacionRecord): string => {
    return getFieldValue(record, ['Responsable'], 'Sin responsable');
  };

  const getAsignacionActivoNombre = (record: AsignacionRecord): string => {
    const nombres = getFieldValue<string[]>(record, ['Nombre Activo'], []);
    return Array.isArray(nombres) && nombres.length > 0 ? nombres[0] : 'N/A';
  };

  const getAsignacionCodigoActivo = (record: AsignacionRecord): string => {
    const codigos = getFieldValue<string[]>(record, ['Código Activo'], []);
    return Array.isArray(codigos) && codigos.length > 0 ? codigos[0] : 'N/A';
  };

  const getAsignacionFechaAsignacion = (record: AsignacionRecord): string => {
    return getFieldValue(record, ['Fecha Asignación', 'Fecha Asignacion'], '');
  };

  const getAsignacionFechaDevolucion = (record: AsignacionRecord): string => {
    return getFieldValue(record, ['Fecha Devolución', 'Fecha Devolucion'], '');
  };

  const getAsignacionEstado = (record: AsignacionRecord): string => {
    return getFieldValue(record, ['Estado Asignación', 'Estado Asignacion'], '');
  };

  const getAsignacionDiasEnUso = (record: AsignacionRecord): number => {
    return getFieldValue(record, ['Días en Uso', 'Dias en Uso'], 0);
  };

  const getAsignacionPropositoUso = (record: AsignacionRecord): string => {
    return getFieldValue(record, ['Propósito de Uso', 'Proposito de Uso'], '');
  };

  const getAsignacionesActivas = (): AsignacionRecord[] => {
    const records = data?.records || [];
    return records.filter((record) => !getAsignacionFechaDevolucion(record));
  };

  const getTotalAsignaciones = (): number => {
    return data?.records?.length || 0;
  };

  return {
    data,
    loading,
    error,
    refreshAsignaciones,
    getAsignacionResponsable,
    getAsignacionActivoNombre,
    getAsignacionCodigoActivo,
    getAsignacionFechaAsignacion,
    getAsignacionFechaDevolucion,
    getAsignacionEstado,
    getAsignacionDiasEnUso,
    getAsignacionPropositoUso,
    getAsignacionesActivas,
    getTotalAsignaciones,
  };
}

// ============================================================================
// HOOK PARA ESTADÍSTICAS
// ============================================================================

export function useEstadisticasActivos() {
  const [estadisticas, setEstadisticas] = useState<EstadisticasActivos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEstadisticas = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/activos/estadisticas');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al obtener estadísticas');
      }

      setEstadisticas(result.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al cargar estadísticas:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstadisticas();
  }, []);

  const refreshEstadisticas = async () => {
    await fetchEstadisticas();
  };

  return {
    estadisticas,
    loading,
    error,
    refreshEstadisticas,
  };
}

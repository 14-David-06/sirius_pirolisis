"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CATEGORIA_SIN_CLASIFICAR,
  clasificarVencimiento,
  normalizeEstadoOperativo,
} from './activos.format';
import { DIAS_ALERTA_MANTENIMIENTO, DIAS_ALERTA_VENCIMIENTO } from './activos.constants';
import type {
  ActivoFijoRecord,
  ActivosData,
  ActivosFilters,
  AsignacionRecord,
  AsignacionesData,
  AsignacionesFilters,
  EstadisticasActivos,
  EstadoOperativo,
} from '@/types/activos';

/**
 * Estado y derivados del módulo de Activos Fijos.
 *
 * Mismo patrón que `useInventario`: el endpoint devuelve el parque completo en
 * una sola llamada y TODO el filtrado ocurre en memoria. Antes cada cambio de
 * filtro reconstruía un `filterByFormula` y volvía a consultar Airtable, con lo
 * que la tabla parpadeaba y la búsqueda (que era local) no se combinaba con los
 * demás filtros.
 */

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
function normalizarTexto(valor: string): string {
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function comoTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function comoArray(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

export function useActivos(filters?: ActivosFilters) {
  const [data, setData] = useState<ActivosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/activos/list');
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && String(result.error || '').includes('no configurado')) {
          throw new Error(
            'Módulo de Activos Fijos no configurado. Revisa AIRTABLE_ACTIVOS_CORE_BASE_ID y AIRTABLE_ACTIVOS_FIJOS_TABLE_ID en .env.local'
          );
        }
        if (response.status === 403) {
          throw new Error('Sin permisos sobre Sirius Activos Core. Verifica el token de Airtable.');
        }
        throw new Error(result.error || 'Error al obtener datos de activos');
      }

      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar activos';
      console.error('❌ Error al cargar activos:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivos();
  }, [fetchActivos]);

  // ==========================================================================
  // GETTERS — leen los campos normalizados de /api/activos/list
  // ==========================================================================

  const getActivoNombre = (record: ActivoFijoRecord): string =>
    comoTexto(record.fields.nombre) || comoTexto(record.fields['Nombre del Activo']) || 'Sin nombre';

  const getActivoCodigo = (record: ActivoFijoRecord): string =>
    comoTexto(record.fields.codigo) || comoTexto(record.fields['Código Activo']) || '';

  const getActivoDescripcion = (record: ActivoFijoRecord): string =>
    comoTexto(record.fields.descripcion);

  /**
   * Categorías legibles del activo.
   * ⚠️ El lookup `Categoría` puede venir vacío si el activo no tiene tipo; el
   * endpoint ya intenta reconstruirlo desde el catálogo de tipos.
   */
  const getActivoCategorias = (record: ActivoFijoRecord): string[] =>
    comoArray(record.fields.categorias);

  /** Categoría principal, para agrupar y filtrar. */
  const getActivoCategoria = (record: ActivoFijoRecord): string =>
    getActivoCategorias(record)[0] || CATEGORIA_SIN_CLASIFICAR;

  const getActivoTipos = (record: ActivoFijoRecord): string[] => comoArray(record.fields.tipos);

  const getActivoEstado = (record: ActivoFijoRecord): EstadoOperativo =>
    normalizeEstadoOperativo(
      comoTexto(record.fields.estado) || comoTexto(record.fields['Estado Operativo'])
    );

  /** Nombre de la ubicación (nunca el record ID). */
  const getActivoUbicacion = (record: ActivoFijoRecord): string =>
    comoTexto(record.fields.ubicacion);

  const getActivoArea = (record: ActivoFijoRecord): string => comoTexto(record.fields.area);

  const getActivoResponsable = (record: ActivoFijoRecord): string =>
    comoTexto(record.fields.responsable);

  const getActivoEstaAsignado = (record: ActivoFijoRecord): boolean =>
    Boolean(record.fields.asignado);

  const getActivoNumeroSerie = (record: ActivoFijoRecord): string =>
    comoTexto(record.fields.numeroSerie);

  const getActivoMarca = (record: ActivoFijoRecord): string => comoTexto(record.fields.marca);

  const getActivoModelo = (record: ActivoFijoRecord): string => comoTexto(record.fields.modelo);

  const getActivoProveedor = (record: ActivoFijoRecord): string =>
    comoTexto(record.fields.proveedor);

  const getActivoFechaAdquisicion = (record: ActivoFijoRecord): string | null =>
    (record.fields.fechaAdquisicion as string | null) ?? null;

  const getActivoValor = (record: ActivoFijoRecord): number => {
    const valor = Number(record.fields.valorAdquisicion);
    return Number.isFinite(valor) ? valor : 0;
  };

  const getActivoFechaVencimiento = (record: ActivoFijoRecord): string | null =>
    (record.fields.fechaVencimiento as string | null) ?? null;

  const getActivoDiasVencimiento = (record: ActivoFijoRecord): number | null => {
    const dias = record.fields.diasVencimiento;
    return typeof dias === 'number' && Number.isFinite(dias) ? dias : null;
  };

  const getActivoProximoMantenimiento = (record: ActivoFijoRecord): string | null =>
    (record.fields.proximoMantenimiento as string | null) ?? null;

  const getActivoNotas = (record: ActivoFijoRecord): string => comoTexto(record.fields.notas);

  /** `false` cuando falta tipo o ubicación: el activo no se puede clasificar. */
  const getActivoEstaCompleto = (record: ActivoFijoRecord): boolean =>
    Boolean(record.fields.completo);

  // ==========================================================================
  // DERIVADOS — filtrado, agrupación y métricas en memoria
  // ==========================================================================

  const registros = useMemo(() => data?.records ?? [], [data]);

  /** Categorías presentes en los datos, ordenadas. Alimenta el filtro. */
  const categoriasDisponibles = useMemo(() => {
    const nombres = new Set<string>();
    registros.forEach((record) => {
      const categorias = getActivoCategorias(record);
      if (categorias.length === 0) nombres.add(CATEGORIA_SIN_CLASIFICAR);
      categorias.forEach((categoria) => nombres.add(categoria));
    });
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  }, [registros]);

  /** Ubicaciones presentes en los datos, ordenadas. */
  const ubicacionesDisponibles = useMemo(() => {
    const nombres = new Set<string>();
    registros.forEach((record) => {
      const ubicacion = getActivoUbicacion(record);
      if (ubicacion) nombres.add(ubicacion);
    });
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  }, [registros]);

  /** Áreas responsables presentes en los datos, ordenadas. */
  const areasDisponibles = useMemo(() => {
    const nombres = new Set<string>();
    registros.forEach((record) => {
      const area = getActivoArea(record);
      if (area) nombres.add(area);
    });
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  }, [registros]);

  /** Registros que pasan los filtros activos. */
  const registrosFiltrados = useMemo(() => {
    const busqueda = filters?.busqueda ? normalizarTexto(filters.busqueda) : '';

    return registros.filter((record) => {
      if (filters?.categoria) {
        const categorias = getActivoCategorias(record);
        const coincide =
          filters.categoria === CATEGORIA_SIN_CLASIFICAR
            ? categorias.length === 0
            : categorias.includes(filters.categoria);
        if (!coincide) return false;
      }
      if (filters?.estado && getActivoEstado(record) !== filters.estado) return false;
      if (filters?.ubicacion && getActivoUbicacion(record) !== filters.ubicacion) return false;
      if (filters?.area && getActivoArea(record) !== filters.area) return false;
      if (filters?.asignacion === 'asignados' && !getActivoEstaAsignado(record)) return false;
      if (filters?.asignacion === 'disponibles' && getActivoEstaAsignado(record)) return false;
      if (filters?.soloIncompletos && getActivoEstaCompleto(record)) return false;

      if (busqueda) {
        const heno = normalizarTexto(
          [
            getActivoNombre(record),
            getActivoCodigo(record),
            getActivoNumeroSerie(record),
            getActivoMarca(record),
            getActivoModelo(record),
            getActivoResponsable(record),
            getActivoUbicacion(record),
            getActivoCategorias(record).join(' '),
            getActivoTipos(record).join(' '),
          ].join(' ')
        );
        if (!heno.includes(busqueda)) return false;
      }

      return true;
    });
  }, [
    registros,
    filters?.categoria,
    filters?.estado,
    filters?.ubicacion,
    filters?.area,
    filters?.asignacion,
    filters?.soloIncompletos,
    filters?.busqueda,
  ]);

  const getTotalActivos = (): number => registros.length;

  /**
   * Activos filtrados y agrupados por categoría, ordenados alfabéticamente
   * (categorías y activos). Un activo con varias categorías aparece en la
   * principal.
   */
  const getActivosByCategoria = (): Record<string, ActivoFijoRecord[]> => {
    const grupos = new Map<string, ActivoFijoRecord[]>();

    for (const record of registrosFiltrados) {
      const categoria = getActivoCategoria(record);
      const grupo = grupos.get(categoria) ?? [];
      grupo.push(record);
      grupos.set(categoria, grupo);
    }

    return Object.fromEntries(
      [...grupos.entries()]
        .sort(([a], [b]) => {
          // "Sin clasificar" al final: es una bandeja de pendientes, no una categoría.
          if (a === CATEGORIA_SIN_CLASIFICAR) return 1;
          if (b === CATEGORIA_SIN_CLASIFICAR) return -1;
          return a.localeCompare(b, 'es');
        })
        .map(([categoria, activos]) => [
          categoria,
          activos.sort((a, b) => getActivoNombre(a).localeCompare(getActivoNombre(b), 'es')),
        ])
    );
  };

  const getActivosByEstado = (estado: EstadoOperativo): ActivoFijoRecord[] =>
    registros.filter((record) => getActivoEstado(record) === estado);

  const getActivosOperativos = (): ActivoFijoRecord[] => getActivosByEstado('Operativo');

  const getActivosEnReparacion = (): ActivoFijoRecord[] => getActivosByEstado('En Reparación');

  const getActivosEnMantenimiento = (): ActivoFijoRecord[] =>
    getActivosByEstado('En Mantenimiento');

  const getActivosDadosDeBaja = (): ActivoFijoRecord[] => getActivosByEstado('Dado de Baja');

  const getActivosAsignados = (): ActivoFijoRecord[] =>
    registros.filter((record) => getActivoEstaAsignado(record));

  /** Disponibles: sin responsable y en un estado en que se pueden entregar. */
  const getActivosDisponibles = (): ActivoFijoRecord[] =>
    registros.filter((record) => {
      if (getActivoEstaAsignado(record)) return false;
      const estado = getActivoEstado(record);
      return estado === 'Operativo' || estado === 'Disponible en Almacén';
    });

  /** Activos sin tipo o sin ubicación: no se pueden clasificar ni encontrar. */
  const getActivosIncompletos = (): ActivoFijoRecord[] =>
    registros.filter((record) => !getActivoEstaCompleto(record));

  const getActivosProximosAVencer = (
    diasAnticipacion: number = DIAS_ALERTA_VENCIMIENTO
  ): ActivoFijoRecord[] =>
    registros.filter((record) => {
      const nivel = clasificarVencimiento(getActivoDiasVencimiento(record), diasAnticipacion);
      return nivel === 'proximo' || nivel === 'critico';
    });

  const getActivosVencidos = (): ActivoFijoRecord[] =>
    registros.filter(
      (record) =>
        clasificarVencimiento(getActivoDiasVencimiento(record), DIAS_ALERTA_VENCIMIENTO) ===
        'vencido'
    );

  /** Activos con mantenimiento programado dentro de la ventana de alerta. */
  const getMantenimientosProximos = (
    dias: number = DIAS_ALERTA_MANTENIMIENTO
  ): ActivoFijoRecord[] => {
    const hoy = new Date();
    const limite = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);

    return registros.filter((record) => {
      const fechaStr = getActivoProximoMantenimiento(record);
      if (!fechaStr) return false;
      const fecha = new Date(fechaStr);
      if (Number.isNaN(fecha.getTime())) return false;
      return fecha <= limite;
    });
  };

  /**
   * Valor de adquisición acumulado. Excluye los activos dados de baja: sumarlos
   * infla el valor del parque con bienes que ya no existen.
   */
  const getValorTotalActivos = (): number =>
    registros
      .filter((record) => getActivoEstado(record) !== 'Dado de Baja')
      .reduce((total, record) => total + getActivoValor(record), 0);

  return {
    // Estado
    data,
    loading,
    error,
    refreshActivos: fetchActivos,

    // Datos derivados
    registros,
    registrosFiltrados,
    categoriasDisponibles,
    ubicacionesDisponibles,
    areasDisponibles,

    // Conteos y agrupaciones
    getTotalActivos,
    getActivosByCategoria,
    getActivosByEstado,
    getActivosOperativos,
    getActivosEnReparacion,
    getActivosEnMantenimiento,
    getActivosDadosDeBaja,
    getActivosAsignados,
    getActivosDisponibles,
    getActivosIncompletos,
    getActivosProximosAVencer,
    getActivosVencidos,
    getMantenimientosProximos,
    getValorTotalActivos,

    // Getters por registro
    getActivoNombre,
    getActivoCodigo,
    getActivoDescripcion,
    getActivoCategoria,
    getActivoCategorias,
    getActivoTipos,
    getActivoEstado,
    getActivoUbicacion,
    getActivoArea,
    getActivoResponsable,
    getActivoEstaAsignado,
    getActivoNumeroSerie,
    getActivoMarca,
    getActivoModelo,
    getActivoProveedor,
    getActivoFechaAdquisicion,
    getActivoValor,
    getActivoFechaVencimiento,
    getActivoDiasVencimiento,
    getActivoProximoMantenimiento,
    getActivoNotas,
    getActivoEstaCompleto,
  };
}

// ============================================================================
// ASIGNACIONES
// ============================================================================

export function useAsignaciones(filters?: AsignacionesFilters) {
  const [data, setData] = useState<AsignacionesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { responsable, area, soloActivas, activoId } = filters || {};

  const fetchAsignaciones = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (responsable) params.set('responsable', responsable);
      if (area) params.set('area', area);
      if (soloActivas) params.set('soloActivas', 'true');
      if (activoId) params.set('activoId', activoId);

      const qs = params.toString();
      const response = await fetch(`/api/activos/asignaciones/list${qs ? `?${qs}` : ''}`);
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Error al obtener asignaciones');

      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al cargar asignaciones:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [responsable, area, soloActivas, activoId]);

  useEffect(() => {
    fetchAsignaciones();
  }, [fetchAsignaciones]);

  const registros = useMemo(() => data?.records ?? [], [data]);

  const getAsignacionResponsable = (record: AsignacionRecord): string =>
    comoTexto(record.fields.responsable) || 'Sin responsable';

  const getAsignacionActivoNombre = (record: AsignacionRecord): string =>
    comoTexto(record.fields.activoNombre) || 'N/A';

  const getAsignacionCodigoActivo = (record: AsignacionRecord): string =>
    comoTexto(record.fields.activoCodigo) || 'N/A';

  const getAsignacionFechaAsignacion = (record: AsignacionRecord): string | null =>
    (record.fields.fechaAsignacion as string | null) ?? null;

  const getAsignacionFechaDevolucion = (record: AsignacionRecord): string | null =>
    (record.fields.fechaDevolucion as string | null) ?? null;

  const getAsignacionEstado = (record: AsignacionRecord): string =>
    record.fields.activa ? 'Activa' : 'Devuelto';

  const getAsignacionDiasEnUso = (record: AsignacionRecord): number => {
    const dias = Number(record.fields.diasEnUso);
    return Number.isFinite(dias) ? dias : 0;
  };

  const getAsignacionesActivas = (): AsignacionRecord[] =>
    registros.filter((record) => Boolean(record.fields.activa));

  return {
    data,
    loading,
    error,
    refreshAsignaciones: fetchAsignaciones,
    registros,
    getAsignacionResponsable,
    getAsignacionActivoNombre,
    getAsignacionCodigoActivo,
    getAsignacionFechaAsignacion,
    getAsignacionFechaDevolucion,
    getAsignacionEstado,
    getAsignacionDiasEnUso,
    getAsignacionesActivas,
    getTotalAsignaciones: () => registros.length,
  };
}

// ============================================================================
// ESTADÍSTICAS AGREGADAS (endpoint independiente)
// ============================================================================

/**
 * Consume `/api/activos/estadisticas`.
 *
 * ⚠️ La página de activos NO lo usa: sus indicadores salen de los registros ya
 * cargados por `useActivos`, para no pagar dos consultas por la misma verdad.
 * Existe para tableros que solo necesitan los agregados.
 */
export function useEstadisticasActivos() {
  const [estadisticas, setEstadisticas] = useState<EstadisticasActivos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEstadisticas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/activos/estadisticas');
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Error al obtener estadísticas');

      setEstadisticas(result.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al cargar estadísticas:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEstadisticas();
  }, [fetchEstadisticas]);

  return { estadisticas, loading, error, refreshEstadisticas: fetchEstadisticas };
}

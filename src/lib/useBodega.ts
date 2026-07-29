"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BodegaData, MateriaPrima, MovimientoBodega } from '@/types/bodega';
import type { MateriaPrimaKey } from './bodega.constants';

/**
 * Hook del módulo Bodega.
 *
 * Una sola llamada trae las tres materias primas con su stock, la capacidad de
 * producción y el detalle de baches; otra trae los últimos movimientos. Todos
 * los porcentajes y umbrales vienen del servidor: las env vars de la fórmula
 * (BLEND_PCT_*) no existen en el cliente, así que calcularlos aquí daría los
 * valores por defecto en silencio.
 */
export function useBodega(limiteMovimientos = 20) {
  const [data, setData] = useState<BodegaData | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoBodega[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorMovimientos, setErrorMovimientos] = useState<string | null>(null);

  const fetchMateriasPrimas = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/bodega/materias-primas');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al obtener las materias primas');
      }

      setData(result as BodegaData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Error al cargar la bodega:', message);
      setError(message || 'Error desconocido al cargar la bodega');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Los movimientos son complementarios: si fallan, la bodega sigue siendo
   * utilizable, así que su error se guarda aparte y no bloquea la página.
   */
  const fetchMovimientos = useCallback(async () => {
    try {
      setErrorMovimientos(null);

      const response = await fetch(`/api/bodega/movimientos?limit=${limiteMovimientos}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al obtener los movimientos');
      }

      setMovimientos((result.movimientos ?? []) as MovimientoBodega[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('⚠️ No se pudieron cargar los movimientos de bodega:', message);
      setErrorMovimientos(message);
    }
  }, [limiteMovimientos]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchMateriasPrimas(), fetchMovimientos()]);
  }, [fetchMateriasPrimas, fetchMovimientos]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const materiales = useMemo(() => data?.materiales ?? [], [data]);

  const getMaterial = useCallback(
    (key: MateriaPrimaKey): MateriaPrima | undefined =>
      materiales.find((material) => material.key === key),
    [materiales]
  );

  /** Materias primas con entrada/salida manual: las que viven en el Core. */
  const materialesGestionables = useMemo(
    () => materiales.filter((material) => material.permiteEntradaManual && material.insumoId),
    [materiales]
  );

  /** Materias primas por debajo (o en) su umbral de reposición. */
  const materialesEnAlerta = useMemo(
    () => materiales.filter((material) => material.estado !== 'disponible'),
    [materiales]
  );

  return {
    data,
    materiales,
    movimientos,
    baches: data?.baches ?? [],
    capacidad: data?.capacidad ?? null,
    formula: data?.formula ?? null,
    advertencias: data?.advertencias ?? [],
    loading,
    error,
    errorMovimientos,
    refresh,
    getMaterial,
    materialesGestionables,
    materialesEnAlerta,
  };
}

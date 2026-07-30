"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgendaData, EventoAgenda } from '@/types/agenda-blend';

/** Clave YYYY-MM-DD de una fecha ISO; '' si no hay fecha válida. */
export function claveDia(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/**
 * Hook de la agenda de producción de Blend.
 *
 * Los porcentajes de la fórmula y la cobertura vienen calculados del servidor:
 * las env vars `BLEND_PCT_*` no existen en el cliente, así que recalcular aquí
 * daría los valores por defecto en silencio.
 */
export function useAgendaBlend(incluirCerrados = true) {
  const [data, setData] = useState<AgendaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgenda = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (!incluirCerrados) params.set('incluirCerrados', 'false');

      const response = await fetch(`/api/pirolisis/blend/agenda?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al obtener la agenda de producción');
      }

      setData(result as AgendaData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Error al cargar la agenda de Blend:', message);
      setError(message || 'Error desconocido al cargar la agenda');
    } finally {
      setLoading(false);
    }
  }, [incluirCerrados]);

  useEffect(() => {
    fetchAgenda();
  }, [fetchAgenda]);

  const eventos = useMemo(() => data?.eventos ?? [], [data]);

  /** Eventos agrupados por día (YYYY-MM-DD). Los sin fecha van en la clave ''. */
  const porDia = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>();
    for (const evento of eventos) {
      const clave = claveDia(evento.fecha);
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(evento);
    }
    return mapa;
  }, [eventos]);

  /** Pedidos sin fecha de entrega: no se pueden agendar. */
  const sinFecha = useMemo(() => porDia.get('') ?? [], [porDia]);

  return {
    data,
    eventos,
    porDia,
    sinFecha,
    disponible: data?.disponible ?? null,
    formula: data?.formula ?? null,
    resumen: data?.resumen ?? null,
    loading,
    error,
    refresh: fetchAgenda,
  };
}

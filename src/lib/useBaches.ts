"use client";

import { useState, useEffect } from 'react';

interface BacheRecord {
  id: string;
  fields: {
    // Campos reales de Airtable
    'ID'?: string;
    'Auto Number'?: number;
    'Fecha Creacion'?: string;
    'Recuento Lonas'?: number;
    'Total Biochar Bache (KG)'?: number;
    'Codigo Bache'?: string;
    'Estado Bache'?: string;
    'Balances Masa'?: string;
    // Campos alternativos por si cambian
    'ID Bache'?: string;
    'Estado'?: string;
    'Total KG'?: number;
    'Vendido KG'?: number;
    'Lonas Usadas'?: number;
    'Fecha'?: string;
    'Creado'?: string;
    // Campos adicionales que podrían existir
    [key: string]: any;
  };
  createdTime: string;
}

interface BachesData {
  records: BacheRecord[];
}

export function useBaches() {
  const [data, setData] = useState<BachesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBaches = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/baches/list');
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Error al obtener datos de baches');
        }

        // Si no hay registros, no usar datos de ejemplo - mostrar estado vacío
        if (!result.records || result.records.length === 0) {
          console.log('No hay baches registrados en Airtable');
          setData({ records: [] });
        } else {
          setData(result);
        }
      } catch (err: any) {
        setError(err.message || 'Error desconocido');
        console.error('Error fetching baches:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBaches();
  }, []);

  // Función para obtener el bache más reciente (último creado)
  const getLatestBache = () => {
    if (!data?.records || data.records.length === 0) return null;

    // Ordenar por fecha de creación descendente (más reciente primero)
    const sortedRecords = [...data.records].sort((a, b) =>
      new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
    );

    return sortedRecords[0];
  };

  // Función para calcular el progreso basado en lonas (de 20 lonas)
  const calculateProgress = (bache: BacheRecord) => {
    const lonasUsadas = bache.fields['Recuento Lonas'] || bache.fields['Lonas Usadas'] || bache.fields['Lonas'] || 0;
    const totalLonas = 20; // Siempre 20 lonas necesarias
    const progressPercentage = Math.min((lonasUsadas / totalLonas) * 100, 100);

    return {
      lonasUsadas,
      totalLonas,
      progressPercentage,
      isComplete: lonasUsadas >= totalLonas
    };
  };

  // Función para determinar el estado del bache
  const getBacheStatus = (bache: BacheRecord) => {
    const estado = bache.fields['Estado Bache'] || bache.fields['Estado'];
    if (estado) return estado;

    const progress = calculateProgress(bache);
    if (progress.isComplete) return 'Completado';
    if (progress.lonasUsadas > 0) return 'En Progreso';
    return 'Bache en proceso';
  };

  // Función para obtener el ID del bache
  const getBacheId = (bache: BacheRecord) => {
    return bache.fields['Codigo Bache'] || bache.fields['ID Bache'] || bache.fields['ID'] || `Bache ${bache.id.slice(-6)}`;
  };

  // Función para obtener valores numéricos con fallbacks
  const getNumericValue = (bache: BacheRecord, fieldNames: string[]) => {
    for (const fieldName of fieldNames) {
      const value = bache.fields[fieldName];
      if (typeof value === 'number' && !isNaN(value)) {
        return value;
      }
    }
    return 0;
  };

  // Función para obtener el total de biochar
  const getTotalBiochar = (bache: BacheRecord) => {
    return getNumericValue(bache, ['Total Biochar Bache (KG)', 'Total KG', 'Total']);
  };

  // Función para obtener el biochar vendido (por ahora 0 ya que no hay campo específico)
  const getBiocharVendido = (bache: BacheRecord) => {
    return getNumericValue(bache, ['Vendido KG', 'Vendido']);
  };

  // Función para obtener fecha con fallbacks
  const getDateValue = (bache: BacheRecord) => {
    return bache.fields['Fecha Creacion'] || bache.fields['Fecha'] || bache.fields['Creado'] || bache.createdTime;
  };

  return {
    data,
    loading,
    error,
    getLatestBache,
    calculateProgress,
    getBacheStatus,
    getBacheId,
    getNumericValue,
    getDateValue,
    getTotalBiochar,
    getBiocharVendido,
    refetch: () => {
      setLoading(true);
      setError(null);
      // Re-fetch logic would go here
      window.location.reload(); // Simple refresh for now
    }
  };
}
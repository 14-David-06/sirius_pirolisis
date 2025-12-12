"use client";

import { useState, useEffect } from 'react';

interface BacheRecord {
  id: string;
  fields: {
    // Campos reales de Airtable según documentación
    'ID'?: string;
    'Auto Number'?: number;
    'Fecha Creacion'?: string;
    'Recuento Lonas'?: number;
    'Total Biochar Bache (WM)(KG)'?: number;
    'Cantidad Biochar Vendido'?: number;
    'Cantidad Biochar Blend'?: number;
    'Total Biochar Humedo Bache (KG)'?: number;
    'Codigo Bache'?: string;
    'Estado Bache'?: string;
    'Monitoreado'?: string;
    'Balances Masa'?: string[];
    'Monitoreo Baches'?: string[];
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
    // Primero verificar si hay un estado explícito en Airtable
    const estado = bache.fields['Estado Bache'] || bache.fields['Estado'];
    if (estado) return estado;

    // Si no hay estado, determinar basado en progreso
    const progress = calculateProgress(bache);
    if (progress.isComplete) return 'Bache Completo Planta';
    if (progress.lonasUsadas > 0) return 'Bache en proceso';
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
    const value = getNumericValue(bache, [
      'Total Biochar Bache (WM)(KG)', // Campo calculado principal: 25 * Recuento Lonas
      'Total Biochar Humedo Bache (KG)', // Campo alternativo
      'Total KG',
      'Total',
      'Biochar Total',
      'Biochar Producido',
      'KG Totales',
      'Total Biochar'
    ]);

    // Debug: mostrar qué campos están disponibles si no encuentra valor
    if (value === 0) {
      console.log('Campos disponibles para biochar total en bache', getBacheId(bache), ':', Object.keys(bache.fields));
      console.log('Valores de campos relacionados:', {
        'Total Biochar Bache (WM)(KG)': bache.fields['Total Biochar Bache (WM)(KG)'],
        'Total Biochar Humedo Bache (KG)': bache.fields['Total Biochar Humedo Bache (KG)'],
        'Cantidad Biochar Vendido': bache.fields['Cantidad Biochar Vendido']
      });
    }

    return value;
  };

  // Función para obtener el biochar vendido
  const getBiocharVendido = (bache: BacheRecord) => {
    return getNumericValue(bache, [
      'Cantidad Biochar Vendido', // Campo correcto según documentación
      'Vendido KG',
      'Vendido',
      'Biochar Vendido',
      'KG Vendidos',
      'Total Vendido'
    ]);
  };

  // Función para obtener fecha con fallbacks
  const getDateValue = (bache: BacheRecord) => {
    return bache.fields['Fecha Creacion'] || bache.fields['Fecha'] || bache.fields['Creado'] || bache.createdTime;
  };

  // Función para verificar si el bache tiene peso húmedo actualizado
  const hasPesoHumedoActualizado = (bache: BacheRecord) => {
    const pesoHumedo = getNumericValue(bache, [
      'Total Biochar Humedo Bache (KG)',
      'Peso Humedo',
      'Biochar Humedo'
    ]);
    return pesoHumedo > 0;
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
    hasPesoHumedoActualizado,
    refetch: () => {
      setLoading(true);
      setError(null);
      // Re-fetch logic
      const fetchBaches = async () => {
        try {
          const response = await fetch('/api/baches/list');
          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Error al obtener datos de baches');
          }

          if (!result.records || result.records.length === 0) {
            setData({ records: [] });
          } else {
            setData(result);
          }
        } catch (err: any) {
          setError(err.message || 'Error desconocido');
        } finally {
          setLoading(false);
        }
      };

      fetchBaches();
    }
  };
}
"use client";

import { useState, useEffect } from 'react';

interface InventarioRecord {
  id: string;
  fields: {
    // Campos principales de la tabla actual
    'ID'?: string;
    'Insumo'?: string;
    'Unidad'?: string;
    'Presentacion Insumo'?: number;
    'Descripción'?: string;

    // Campos alternativos por si cambian los nombres
    'Nombre'?: string;
    'Name'?: string;
    'Categoria'?: string;
    'Category'?: string;
    'Cantidad'?: number;
    'Stock'?: number;
    'Stock Minimo'?: number;
    'Min Stock'?: number;

    // Campos adicionales que podrían existir
    [key: string]: any;
  };
  createdTime: string;
}

interface InventarioData {
  records: InventarioRecord[];
}

export function useInventario() {
  const [data, setData] = useState<InventarioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInventario = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/inventario/list');
        const result = await response.json();

        if (!response.ok) {
          // Si es un error de configuración, mostrar mensaje específico
          if (response.status === 400 && result.error?.includes('AIRTABLE_INVENTARIO_TABLE_ID')) {
            throw new Error('Tabla de inventario no configurada. Configura AIRTABLE_INVENTARIO_TABLE_ID en .env.local');
          }
          if (response.status === 403 && result.error?.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND') {
            throw new Error('Tabla de inventario no encontrada. Verifica que la tabla existe en Airtable y que el ID es correcto');
          }
          throw new Error(result.error || 'Error al obtener datos del inventario');
        }

        setData(result);

        // Si la tabla existe pero está vacía, mostrar mensaje informativo
        if (result.records && result.records.length === 0) {
          console.info('📦 Tabla de inventario encontrada pero está vacía');
        }
      } catch (err: any) {
        console.error('❌ Error al cargar inventario:', err);
        setError(err.message || 'Error desconocido al cargar inventario');
      } finally {
        setLoading(false);
      }
    };

    fetchInventario();
  }, []);

  // Función helper para obtener el nombre del item
  const getItemName = (record: InventarioRecord): string => {
    return record.fields['Insumo'] ||
           record.fields['Nombre'] ||
           record.fields['Name'] ||
           'Sin nombre';
  };

  // Función helper para obtener la categoría del item
  const getItemCategory = (record: InventarioRecord): string => {
    return record.fields['Categoria'] ||
           record.fields['Category'] ||
           'General';
  };

  // Función helper para obtener la cantidad/stock del item
  const getItemQuantity = (record: InventarioRecord): number => {
    return record.fields['Presentacion Insumo'] ||
           record.fields['Cantidad'] ||
           record.fields['Stock'] ||
           0;
  };

  // Función helper para obtener la unidad del item
  const getItemUnit = (record: InventarioRecord): string => {
    return record.fields['Unidad'] ||
           record.fields['Unit'] ||
           'unidades';
  };

  // Función helper para obtener la descripción del item
  const getItemDescription = (record: InventarioRecord): string => {
    return record.fields['Descripción'] ||
           record.fields['Notas'] ||
           record.fields['Notes'] ||
           '';
  };

  // Función helper para obtener el stock mínimo del item
  const getMinStock = (record: InventarioRecord): number => {
    const minStock = record.fields['Stock Minimo'] ||
                     record.fields['Min Stock'];
    return typeof minStock === 'number' ? minStock : parseInt(String(minStock)) || 0;
  };

  // Función para obtener el total de items
  const getTotalItems = (): number => {
    return data?.records?.length || 0;
  };

  // Función para obtener items agrupados por categoría
  const getItemsByCategory = (): Record<string, InventarioRecord[]> => {
    if (!data?.records) return {};

    const categories: Record<string, InventarioRecord[]> = {};

    data.records.forEach(record => {
      const category = getItemCategory(record);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(record);
    });

    return categories;
  };

  // Función para obtener items con stock bajo
  const getLowStockItems = (): InventarioRecord[] => {
    if (!data?.records) return [];

    return data.records.filter(record => {
      const quantity = getItemQuantity(record);
      const minStock = getMinStock(record);
      return quantity <= minStock && minStock > 0;
    });
  };

  // Función para obtener items por estado
  const getItemsByStatus = (status: string): InventarioRecord[] => {
    if (!data?.records) return [];

    return data.records.filter(record => {
      const itemStatus = record.fields['Estado'] ||
                        record.fields['Status'] ||
                        '';
      return itemStatus.toLowerCase() === status.toLowerCase();
    });
  };

  // Función para buscar items por nombre
  const searchItems = (query: string): InventarioRecord[] => {
    if (!data?.records) return [];

    const searchTerm = query.toLowerCase();
    return data.records.filter(record => {
      const name = getItemName(record).toLowerCase();
      const category = getItemCategory(record).toLowerCase();
      return name.includes(searchTerm) || category.includes(searchTerm);
    });
  };

  // Función para refrescar los datos
  const refreshInventario = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/inventario/list');
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error?.includes('AIRTABLE_INVENTARIO_TABLE_ID')) {
          throw new Error('Tabla de inventario no configurada. Configura AIRTABLE_INVENTARIO_TABLE_ID en .env.local');
        }
        if (response.status === 403 && result.error?.type === 'INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND') {
          throw new Error('Tabla de inventario no encontrada. Verifica que la tabla existe en Airtable y que el ID es correcto');
        }
        throw new Error(result.error || 'Error al obtener datos del inventario');
      }

      setData(result);
    } catch (err: any) {
      console.error('❌ Error al refrescar inventario:', err);
      setError(err.message || 'Error desconocido al refrescar inventario');
    } finally {
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    error,
    refreshInventario,
    getTotalItems,
    getItemsByCategory,
    getLowStockItems,
    getItemsByStatus,
    searchItems,
    getItemName,
    getItemCategory,
    getItemQuantity,
    getItemUnit,
    getItemDescription,
    getMinStock
  };
}
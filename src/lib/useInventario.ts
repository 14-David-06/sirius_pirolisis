"use client";

import { useState, useEffect } from 'react';
import { config } from './config';
import type {
  InventarioRecord,
  InventarioData,
  InventarioFilters,
  PaqueteLonasData,
} from '@/types/inventario';

// ✅ BUENA PRÁCTICA: Field IDs obtenidos de variables de entorno
// Los valores reales se configuran en .env.local para evitar hardcodear
// IDs sensibles en el código fuente
const FIELD_IDS = config.airtable.inventarioFields;

/**
 * Helper genérico para obtener valores de campos con fallbacks
 * Reduce duplicación de código y centraliza la lógica de acceso a campos
 */
function getFieldValue<T = string>(
  record: InventarioRecord,
  fieldNames: Array<string | undefined | null>,
  defaultValue: T
): T {
  for (const fieldName of fieldNames) {
    if (!fieldName) continue;
    const value = record.fields[fieldName];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return defaultValue;
}

export function useInventario(filters?: InventarioFilters) {
  const [data, setData] = useState<InventarioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInventario = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters?.categoria) params.set('categoria', filters.categoria);
      if (filters?.estado) params.set('estado', filters.estado);
      const qs = params.toString();
      const url = `/api/inventario/list${qs ? `?${qs}` : ''}`;

      const response = await fetch(url);
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

  useEffect(() => {
    fetchInventario();
  }, [filters?.categoria, filters?.estado]);

  // ============================================================================
  // GETTERS SIMPLIFICADOS - Usan función genérica con fallbacks
  // ============================================================================

  const getItemName = (record: InventarioRecord): string => {
    return getFieldValue(
      record,
      ['Insumo', FIELD_IDS.insumo || '', 'Nombre del Insumo', 'Nombre', 'Name'],
      'Sin nombre'
    );
  };

  const getItemCategory = (record: InventarioRecord): string => {
    return getFieldValue(
      record,
      ['Categoría', FIELD_IDS.categoria || '', 'Categoria', 'Category'],
      'General'
    );
  };

  const getItemQuantity = (record: InventarioRecord): number => {
    return getFieldValue(
      record,
      ['Cantidad Presentacion Insumo', FIELD_IDS.cantidadPresentacionInsumo || '', 'Cantidad Actual', 'Cantidad', 'Stock'],
      0
    );
  };

  const getItemUnit = (record: InventarioRecord): string => {
    return getFieldValue(
      record,
      ['Presentacion Insumo', FIELD_IDS.presentacionInsumo || '', 'Unidad', 'Unit'],
      'unidades'
    );
  };

  const getItemDescription = (record: InventarioRecord): string => {
    return getFieldValue(
      record,
      ['Realiza Registro', FIELD_IDS.realizaRegistro || '', 'Descripción', 'Notas', 'Notes'],
      ''
    );
  };

  const getItemEntradas = (record: InventarioRecord): string[] => {
    return getFieldValue(record, ['Entrada Insumos Pirolisis'], []);
  };

  const getItemSalidas = (record: InventarioRecord): string[] => {
    return getFieldValue(record, ['Salida Insumos Pirolisis'], []);
  };

  const getItemPresentacion = (record: InventarioRecord): string => {
    return getFieldValue(record, ['Presentacion Insumo'], '');
  };

  const getItemCantidadPresentacion = (record: InventarioRecord): number => {
    return getFieldValue(
      record,
      ['Cantidad Presentacion Insumo', FIELD_IDS.cantidadPresentacionInsumo || ''],
      0
    );
  };

  const getItemStockTotal = (record: InventarioRecord): number => {
    return getFieldValue(
      record,
      ['Total Cantidad Stock', FIELD_IDS.totalCantidadStock || ''],
      0
    );
  };

  const getMinStock = (record: InventarioRecord): number => {
    const minStock = getFieldValue(record, ['Stock Minimo', 'Min Stock'], 0);
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
      const itemStatus = getItemEstado(record);
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
  const refreshInventario = () => fetchInventario();

  // --- Nuevos getters para trazabilidad productiva ---

  const getItemCategoriaInsumo = (record: InventarioRecord): string => {
    return getFieldValue(
      record,
      ['Categoria Insumo', FIELD_IDS.categoriaInsumo],
      ''
    );
  };

  const getItemEstado = (record: InventarioRecord): string => {
    return getFieldValue(
      record,
      ['Estado', FIELD_IDS.estado],
      'disponible'
    );
  };

  const getItemFechaVencimiento = (record: InventarioRecord): string | null => {
    return getFieldValue<string | null>(
      record,
      ['Fecha Vencimiento', FIELD_IDS.fechaVencimiento],
      null
    );
  };

  // Función para filtrar items por Categoria Insumo (campo nuevo)
  const getItemsByCategoriaInsumo = (categoria: string): InventarioRecord[] => {
    if (!data?.records) return [];
    return data.records.filter(record => {
      const cat = getItemCategoriaInsumo(record);
      return cat.toLowerCase() === categoria.toLowerCase();
    });
  };

  // Función para obtener items con fecha de vencimiento próxima
  const getVencimientosProximos = (dias: number): InventarioRecord[] => {
    if (!data?.records) return [];
    const hoy = new Date();
    const limite = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);

    return data.records.filter(record => {
      const fechaStr = getItemFechaVencimiento(record);
      if (!fechaStr) return false;
      const fecha = new Date(fechaStr);
      return fecha >= hoy && fecha <= limite;
    });
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
    getItemEntradas,
    getItemSalidas,
    getItemPresentacion,
    getItemCantidadPresentacion,
    getItemStockTotal,
    getMinStock,
    // Nuevos getters — trazabilidad productiva
    getItemCategoriaInsumo,
    getItemEstado,
    getItemFechaVencimiento,
    getItemsByCategoriaInsumo,
    getVencimientosProximos,
    // Paquete de lonas activo
    getPaqueteLonasActivo: async () => {
      try {
        const res = await fetch('/api/inventario/lonas/paquete-activo');
        if (!res.ok) return null;
        const json = await res.json();
        return json.data || null;
      } catch {
        return null;
      }
    },
  };
}
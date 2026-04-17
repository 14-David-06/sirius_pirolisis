"use client";

import { useState, useEffect } from 'react';
import { config } from './config';

// ✅ BUENA PRÁCTICA: Field IDs obtenidos de variables de entorno
// Los valores reales se configuran en .env.local para evitar hardcodear
// IDs sensibles en el código fuente
const FIELD_IDS = config.airtable.inventarioFields;

interface InventarioRecord {
  id: string;
  fields: {
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
    return record.fields['Insumo'] || // Campo principal según documentación
           (FIELD_IDS.insumo ? record.fields[FIELD_IDS.insumo] : undefined) || // Field ID si está configurado
           record.fields['Nombre del Insumo'] ||
           record.fields['Nombre'] ||
           record.fields['Name'] ||
           'Sin nombre';
  };

  // Función helper para obtener la categoría del item
  const getItemCategory = (record: InventarioRecord): string => {
    return record.fields['Categoría'] || // Campo principal según documentación
           (FIELD_IDS.categoria ? record.fields[FIELD_IDS.categoria] : undefined) || // Field ID si está configurado
           record.fields['Categoria'] ||
           record.fields['Category'] ||
           'General';
  };

  // Función helper para obtener la cantidad/stock del item
  const getItemQuantity = (record: InventarioRecord): number => {
    return record.fields['Cantidad Presentacion Insumo'] ??
           (FIELD_IDS.cantidadPresentacionInsumo ? record.fields[FIELD_IDS.cantidadPresentacionInsumo] : undefined) ??
           record.fields['Cantidad Actual'] ??
           record.fields['Cantidad'] ??
           record.fields['Stock'] ??
           0;
  };

  // Función helper para obtener la unidad del item
  const getItemUnit = (record: InventarioRecord): string => {
    return record.fields['Presentacion Insumo'] ||
           (FIELD_IDS.presentacionInsumo ? record.fields[FIELD_IDS.presentacionInsumo] : undefined) ||
           record.fields['Unidad'] ||
           record.fields['Unit'] ||
           'unidades';
  };

  // Función helper para obtener la descripción del item
  const getItemDescription = (record: InventarioRecord): string => {
    return record.fields['Realiza Registro'] || // Campo principal según documentación
           (FIELD_IDS.realizaRegistro ? record.fields[FIELD_IDS.realizaRegistro] : undefined) || // Field ID si está configurado
           record.fields['Descripción'] ||
           record.fields['Notas'] ||
           record.fields['Notes'] ||
           '';
  };

  // Función helper para obtener las entradas del item
  const getItemEntradas = (record: InventarioRecord): string[] => {
    return record.fields['Entrada Insumos Pirolisis'] || [];
  };

  // Función helper para obtener las salidas del item
  const getItemSalidas = (record: InventarioRecord): string[] => {
    return record.fields['Salida Insumos Pirolisis'] || [];
  };

  // Función helper para obtener la presentación del item
  const getItemPresentacion = (record: InventarioRecord): string => {
    return record.fields['Presentacion Insumo'] || '';
  };

  // Función helper para obtener la cantidad de presentación del item
  const getItemCantidadPresentacion = (record: InventarioRecord): number => {
    return record.fields['Cantidad Presentacion Insumo'] ??
           (FIELD_IDS.cantidadPresentacionInsumo ? record.fields[FIELD_IDS.cantidadPresentacionInsumo] : undefined) ??
           0;
  };

  // Función helper para obtener el stock total del item
  const getItemStockTotal = (record: InventarioRecord): number => {
    return record.fields['Total Cantidad Stock'] ??
           (FIELD_IDS.totalCantidadStock ? record.fields[FIELD_IDS.totalCantidadStock] : undefined) ??
           0;
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

  // --- Nuevos getters para trazabilidad productiva ---

  // Función helper para obtener la categoría de insumo (campo nuevo)
  const getItemCategoriaInsumo = (record: InventarioRecord): string => {
    return record.fields['Categoria Insumo'] ||
           (FIELD_IDS.categoriaInsumo ? record.fields[FIELD_IDS.categoriaInsumo] : undefined) ||
           '';
  };

  // Función helper para obtener el estado del item (campo nuevo)
  const getItemEstado = (record: InventarioRecord): string => {
    return record.fields['Estado'] ||
           (FIELD_IDS.estado ? record.fields[FIELD_IDS.estado] : undefined) ||
           'disponible';
  };

  // Función helper para obtener la fecha de vencimiento
  const getItemFechaVencimiento = (record: InventarioRecord): string | null => {
    return record.fields['Fecha Vencimiento'] ||
           (FIELD_IDS.fechaVencimiento ? record.fields[FIELD_IDS.fechaVencimiento] : undefined) ||
           null;
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
"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { config } from './config';
import { STOCK_MINIMO_DEFAULT } from './inventario.constants';
import { normalizeEstado, type EstadoStock } from './inventario.format';
import type {
  InventarioRecord,
  InventarioData,
  InventarioFilters,
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

/** Normaliza texto para búsquedas: minúsculas y sin tildes. */
function normalizarTexto(valor: string): string {
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // marcas diacríticas combinantes
}

export function useInventario(filters?: InventarioFilters) {
  const [data, setData] = useState<InventarioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // El endpoint devuelve los ~26 insumos del área en una sola llamada; los
  // filtros se aplican en memoria para que cambiarlos sea instantáneo y no
  // dispare una consulta a Airtable por cada pulsación.
  const fetchInventario = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/inventario/list');
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 400 && result.error?.includes('AIRTABLE_INSUMOS_CORE_BASE_ID')) {
          throw new Error('Inventario Core no configurado. Revisa AIRTABLE_INSUMOS_CORE_BASE_ID en .env.local');
        }
        if (response.status === 403) {
          throw new Error('Sin permisos sobre Sirius Insumos Core. Verifica el token de Airtable.');
        }
        throw new Error(result.error || 'Error al obtener datos del inventario');
      }

      setData(result);

      if (result.records && result.records.length === 0) {
        console.info('📦 Sirius Insumos Core respondió sin insumos para el área');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('❌ Error al cargar inventario:', message);
      setError(message || 'Error desconocido al cargar inventario');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventario();
  }, [fetchInventario]);

  // ============================================================================
  // GETTERS — leen los campos normalizados que expone /api/inventario/list
  // ============================================================================

  const getItemName = (record: InventarioRecord): string =>
    getFieldValue(record, ['Nombre', 'Insumo', FIELD_IDS.insumo || '', 'Nombre del Insumo', 'Name'], 'Sin nombre');

  const getItemCodigo = (record: InventarioRecord): string =>
    getFieldValue(record, ['codigo', 'Código SIRIUS-INS'], '');

  // NOTA (2026-07-28): los consumibles de Pirólisis ya no se clasifican por
  // categoría, así que este hook no expone getters de categoría. Ver
  // src/lib/inventario.constants.ts.

  /** Símbolo de la unidad base del insumo: "und", "kg", "L". */
  const getItemUnit = (record: InventarioRecord): string => {
    const unidad = record.fields?.unidad ?? record.fields?.['Unidad Base'];
    if (typeof unidad === 'string' && unidad) return unidad;
    if (Array.isArray(unidad) && unidad.length > 0) {
      const primera = unidad[0];
      if (typeof primera === 'string') return primera;
      if (primera && typeof primera === 'object' && 'name' in primera) {
        return String((primera as { name: unknown }).name);
      }
    }
    return getFieldValue(record, ['Unidad Medida', 'Unidad', 'Unit'], 'und');
  };

  const getItemUnitNombre = (record: InventarioRecord): string =>
    getFieldValue(record, ['unidad_nombre', 'Unidad Medida'], getItemUnit(record));

  /** Stock real, calculado por el Core a partir de los movimientos. */
  const getItemStockTotal = (record: InventarioRecord): number => {
    const stock = getFieldValue<unknown>(record, ['stock_actual', 'Total Cantidad Stock', FIELD_IDS.totalCantidadStock || ''], 0);
    const n = Number(stock);
    return Number.isFinite(n) ? n : 0;
  };

  /** Alias: en el Core el stock del insumo ES la cantidad disponible. */
  const getItemQuantity = getItemStockTotal;

  /**
   * Umbral de reposición. Si el Core no tiene uno definido se asume el default
   * del área (2 und), igual que hace /api/inventario/list.
   */
  const getMinStock = (record: InventarioRecord): number => {
    const min = getFieldValue<unknown>(record, ['stock_minimo', 'Stock Minimo', 'Min Stock'], 0);
    const n = Number(min);
    return Number.isFinite(n) && n > 0 ? n : STOCK_MINIMO_DEFAULT;
  };

  /** Estado derivado del stock: 'disponible' | 'por_agotarse' | 'agotado'. */
  const getItemEstado = (record: InventarioRecord): EstadoStock =>
    normalizeEstado(getFieldValue<string>(record, ['estado_calculado'], 'disponible'));

  const getItemDescription = (record: InventarioRecord): string =>
    getFieldValue(record, ['Referencia Comercial Texto', 'Descripción', 'Notas', 'Notes'], '');

  /** Movimientos (entradas + salidas) vinculados al insumo en el Core. */
  const getItemMovimientos = (record: InventarioRecord): string[] =>
    getFieldValue<string[]>(record, ['Movimientos Insumos'], []);

  const getItemFechaVencimiento = (record: InventarioRecord): string | null =>
    getFieldValue<string | null>(record, ['Fecha Vencimiento', FIELD_IDS.fechaVencimiento], null);

  // ============================================================================
  // DERIVADOS — filtrado, agrupación y métricas en memoria
  // ============================================================================

  const registros = useMemo(() => data?.records ?? [], [data]);

  /** Registros que pasan los filtros activos (estado, búsqueda). */
  const registrosFiltrados = useMemo(() => {
    const busqueda = filters?.busqueda ? normalizarTexto(filters.busqueda) : '';

    return registros.filter((record) => {
      if (filters?.estado && getItemEstado(record) !== filters.estado) {
        return false;
      }
      if (busqueda) {
        const heno = normalizarTexto(`${getItemName(record)} ${getItemCodigo(record)}`);
        if (!heno.includes(busqueda)) return false;
      }
      return true;
    });
  }, [registros, filters?.estado, filters?.busqueda]);

  const getTotalItems = (): number => registros.length;

  /** Insumos filtrados, en orden alfabético. Sin agrupación por categoría. */
  const getItemsOrdenados = (): InventarioRecord[] =>
    [...registrosFiltrados].sort((a, b) => getItemName(a).localeCompare(getItemName(b), 'es'));

  /**
   * Insumos por agotarse: stock por debajo (o en) su mínimo definido.
   * Requiere `Stock Minimo > 0`; sin umbral no hay alerta posible.
   */
  const getLowStockItems = (): InventarioRecord[] =>
    registros.filter((record) => {
      const minimo = getMinStock(record);
      const stock = getItemStockTotal(record);
      return minimo > 0 && stock > 0 && stock <= minimo;
    });

  /** Insumos agotados (stock ≤ 0). */
  const getSinStockItems = (): InventarioRecord[] =>
    registros.filter((record) => getItemStockTotal(record) <= 0);

  const getItemsByStatus = (status: EstadoStock): InventarioRecord[] =>
    registros.filter((record) => getItemEstado(record) === status);

  const searchItems = (query: string): InventarioRecord[] => {
    const busqueda = normalizarTexto(query);
    if (!busqueda) return registros;
    return registros.filter((record) =>
      normalizarTexto(`${getItemName(record)} ${getItemCodigo(record)}`).includes(busqueda)
    );
  };

  const getVencimientosProximos = (dias: number): InventarioRecord[] => {
    const hoy = new Date();
    const limite = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);

    return registros.filter((record) => {
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
    refreshInventario: fetchInventario,

    // Datos derivados
    registros,
    registrosFiltrados,

    // Conteos
    getTotalItems,
    getItemsOrdenados,
    getLowStockItems,
    getSinStockItems,
    getItemsByStatus,
    searchItems,
    getVencimientosProximos,

    // Getters por registro
    getItemName,
    getItemCodigo,
    getItemQuantity,
    getItemUnit,
    getItemUnitNombre,
    getItemDescription,
    getItemMovimientos,
    getItemStockTotal,
    getMinStock,
    getItemEstado,
    getItemFechaVencimiento,

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

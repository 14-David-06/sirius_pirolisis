/**
 * Componente InventarioTable
 * Tabla de inventario con filtros y tarjetas de items agrupados por categoría
 */

"use client";

import { useState } from 'react';
import ItemCard from './ItemCard';
import { CATEGORIAS_FILTRO, ESTADOS_INSUMO } from '@/lib/inventario.constants';
import type { InventarioRecord } from '@/types/inventario';

interface InventarioTableProps {
  categories: Record<string, InventarioRecord[]>;
  getItemName: (record: InventarioRecord) => string;
  getItemCategory: (record: InventarioRecord) => string;
  getItemCategoriaInsumo: (record: InventarioRecord) => string;
  getItemEstado: (record: InventarioRecord) => string;
  getItemPresentacion: (record: InventarioRecord) => string;
  getItemCantidadPresentacion: (record: InventarioRecord) => number;
  getItemStockTotal: (record: InventarioRecord) => number;
  getItemDescription: (record: InventarioRecord) => string;
  getItemEntradas: (record: InventarioRecord) => string[];
  getItemSalidas: (record: InventarioRecord) => string[];
  onFilterChange?: (categoria: string, estado: string) => void;
}

export default function InventarioTable({
  categories,
  getItemName,
  getItemCategory,
  getItemCategoriaInsumo,
  getItemEstado,
  getItemPresentacion,
  getItemCantidadPresentacion,
  getItemStockTotal,
  getItemDescription,
  getItemEntradas,
  getItemSalidas,
  onFilterChange,
}: InventarioTableProps) {
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  const handleCategoriaChange = (value: string) => {
    setFiltroCategoria(value);
    onFilterChange?.(value, filtroEstado);
  };

  const handleEstadoChange = (value: string) => {
    setFiltroEstado(value);
    onFilterChange?.(filtroCategoria, value);
  };

  const limpiarFiltros = () => {
    setFiltroCategoria('');
    setFiltroEstado('');
    onFilterChange?.('', '');
  };

  return (
    <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
      <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">
        Inventario por Categorías
      </h2>

      {/* Filtros de categoría y estado */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-white/80 mb-1 drop-shadow">
            Categoría
          </label>
          <select
            value={filtroCategoria}
            onChange={(e) => handleCategoriaChange(e.target.value)}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="" className="bg-gray-800">Todas las categorías</option>
            {CATEGORIAS_FILTRO.map(cat => (
              <option key={cat.value} value={cat.value} className="bg-gray-800">
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-white/80 mb-1 drop-shadow">
            Estado
          </label>
          <select
            value={filtroEstado}
            onChange={(e) => handleEstadoChange(e.target.value)}
            className="w-full p-2 bg-white/10 border border-white/20 rounded-lg text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="" className="bg-gray-800">Todos los estados</option>
            {ESTADOS_INSUMO.map(est => (
              <option key={est.value} value={est.value} className="bg-gray-800">
                {est.label}
              </option>
            ))}
          </select>
        </div>

        {(filtroCategoria || filtroEstado) && (
          <div className="flex items-end">
            <button
              onClick={limpiarFiltros}
              className="p-2 px-4 bg-white/10 border border-white/20 rounded-lg text-white/80 hover:bg-white/20 transition-colors text-sm"
            >
              ✕ Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Items agrupados por categoría */}
      <div className="space-y-4">
        {Object.entries(categories).map(([categoria, items]) => {
          const itemsArray = items as InventarioRecord[];
          return (
            <div key={categoria} className="bg-white/10 p-4 rounded">
              <h3 className="text-lg font-semibold text-white mb-2 drop-shadow">
                {categoria || 'Sin Categoría'} ({itemsArray.length} items)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {itemsArray.map((item, index) => (
                  <ItemCard
                    key={index}
                    item={item}
                    getItemName={getItemName}
                    getItemCategory={getItemCategory}
                    getItemCategoriaInsumo={getItemCategoriaInsumo}
                    getItemEstado={getItemEstado}
                    getItemPresentacion={getItemPresentacion}
                    getItemCantidadPresentacion={getItemCantidadPresentacion}
                    getItemStockTotal={getItemStockTotal}
                    getItemDescription={getItemDescription}
                    getItemEntradas={getItemEntradas}
                    getItemSalidas={getItemSalidas}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

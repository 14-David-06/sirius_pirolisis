/**
 * Componente ItemCard
 * Muestra información detallada de un item de inventario
 */

import type { ItemCardProps } from '@/types/inventario';

export default function ItemCard({
  item,
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
}: ItemCardProps) {
  const estado = getItemEstado(item);
  const entradas = getItemEntradas(item);
  const salidas = getItemSalidas(item);

  return (
    <div className="bg-white/10 p-4 rounded-lg border border-white/20 hover:bg-white/15 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="font-semibold text-white text-lg">{getItemName(item)}</div>
          <div className="text-sm text-white/70">Categoría: {getItemCategory(item)}</div>

          {getItemCategoriaInsumo(item) && (
            <span className="inline-block mt-1 mr-1 px-2 py-0.5 text-xs rounded-full bg-blue-500/30 text-blue-200 border border-blue-500/20">
              {getItemCategoriaInsumo(item)}
            </span>
          )}

          {estado && estado !== 'disponible' && (
            <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-yellow-500/30 text-yellow-200 border border-yellow-500/20">
              {estado}
            </span>
          )}

          {getItemPresentacion(item) && (
            <div className="text-sm text-white/70">
              Presentación: {getItemCantidadPresentacion(item)} {getItemPresentacion(item)}
            </div>
          )}

          <div className="text-base text-white font-semibold">
            Stock Disponible: {getItemStockTotal(item)} {getItemPresentacion(item) || 'unidades'}
          </div>
        </div>
      </div>

      {getItemDescription(item) && (
        <div className="text-sm text-white/80 mt-2 p-2 bg-white/10 rounded">
          <strong>Registro:</strong> {getItemDescription(item)}
        </div>
      )}

      {(entradas.length > 0 || salidas.length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-green-500/20 p-2 rounded">
            <div className="text-green-300 font-semibold">Entradas</div>
            <div className="text-white">{entradas.length} registros</div>
          </div>
          <div className="bg-red-500/20 p-2 rounded">
            <div className="text-red-300 font-semibold">Salidas</div>
            <div className="text-white">{salidas.length} registros</div>
          </div>
        </div>
      )}
    </div>
  );
}

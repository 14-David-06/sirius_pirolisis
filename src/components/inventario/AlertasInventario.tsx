/**
 * Componente de Alertas de Inventario
 * Muestra items con stock bajo que requieren atención
 */

import type { InventarioRecord } from '@/types/inventario';

interface AlertasInventarioProps {
  items: InventarioRecord[];
  getItemName: (record: InventarioRecord) => string;
  getItemCategory: (record: InventarioRecord) => string;
  getItemDescription: (record: InventarioRecord) => string;
  getItemQuantity: (record: InventarioRecord) => number;
  getItemUnit: (record: InventarioRecord) => string;
}

export default function AlertasInventario({
  items,
  getItemName,
  getItemCategory,
  getItemDescription,
  getItemQuantity,
  getItemUnit,
}: AlertasInventarioProps) {
  if (items.length === 0) return null;

  return (
    <div className="bg-red-500/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-red-500/30 mb-6">
      <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">
        ⚠️ Alertas de Inventario
      </h2>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex justify-between items-center bg-white/10 p-4 rounded-lg border border-red-500/20"
          >
            <div className="flex-1">
              <span className="text-white font-semibold text-lg">{getItemName(item)}</span>
              <div className="text-sm text-white/70">Categoría: {getItemCategory(item)}</div>
              {getItemDescription(item) && (
                <div className="text-sm text-white/60 mt-1">{getItemDescription(item)}</div>
              )}
            </div>
            <div className="text-right">
              <span className="text-red-300 font-bold text-xl">
                {getItemQuantity(item)} {getItemUnit(item)}
              </span>
              <div className="text-xs text-red-200 mt-1">Stock bajo</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

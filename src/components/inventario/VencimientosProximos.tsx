/**
 * Componente de Vencimientos Próximos
 * Muestra items que vencerán en los próximos N días
 */

import type { InventarioRecord } from '@/types/inventario';

interface VencimientosProximosProps {
  items: InventarioRecord[];
  diasAlerta: number;
  getItemName: (record: InventarioRecord) => string;
  getItemCategoriaInsumo: (record: InventarioRecord) => string;
  getItemCategory: (record: InventarioRecord) => string;
  getItemFechaVencimiento: (record: InventarioRecord) => string | null;
}

export default function VencimientosProximos({
  items,
  diasAlerta,
  getItemName,
  getItemCategoriaInsumo,
  getItemCategory,
  getItemFechaVencimiento,
}: VencimientosProximosProps) {
  if (items.length === 0) return null;

  return (
    <div className="bg-orange-500/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-orange-500/30 mb-6">
      <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">
        📅 Vencimientos Próximos ({diasAlerta} días)
      </h2>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex justify-between items-center bg-white/10 p-4 rounded-lg border border-orange-500/20"
          >
            <div className="flex-1">
              <span className="text-white font-semibold">{getItemName(item)}</span>
              <div className="text-sm text-white/70">
                {getItemCategoriaInsumo(item) || getItemCategory(item)}
              </div>
            </div>
            <div className="text-right">
              <span className="text-orange-300 font-bold">
                {getItemFechaVencimiento(item)
                  ? new Date(getItemFechaVencimiento(item)!).toLocaleDateString('es-CO')
                  : 'N/A'}
              </span>
              <div className="text-xs text-orange-200 mt-1">Fecha vencimiento</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

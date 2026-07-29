/**
 * Insumos que requieren reposición: agotados primero, luego los que están en o
 * por debajo de su stock mínimo.
 */

import { IconAlert } from './Icons';
import { ESTADO_STOCK_UI, formatCantidad, formatStock } from '@/lib/inventario.format';
import type { InventarioRecord } from '@/types/inventario';

interface AlertasInventarioProps {
  /** Insumos en o bajo el stock mínimo. */
  itemsStockBajo: InventarioRecord[];
  /** Insumos con stock ≤ 0. */
  itemsSinStock: InventarioRecord[];
  getItemName: (record: InventarioRecord) => string;
  getItemCodigo: (record: InventarioRecord) => string;
  getItemStockTotal: (record: InventarioRecord) => number;
  getMinStock: (record: InventarioRecord) => number;
  getItemUnit: (record: InventarioRecord) => string;
}

export default function AlertasInventario({
  itemsStockBajo,
  itemsSinStock,
  getItemName,
  getItemCodigo,
  getItemStockTotal,
  getMinStock,
  getItemUnit,
}: AlertasInventarioProps) {
  // Los agotados van primero: son los que bloquean la operación.
  const items = [
    ...itemsSinStock.map((item) => ({ item, estado: 'agotado' as const })),
    ...itemsStockBajo.map((item) => ({ item, estado: 'por_agotarse' as const })),
  ];

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="alertas-inventario"
      className="rounded-xl bg-amber-500/10 ring-1 ring-amber-400/25 p-4 sm:p-5"
    >
      <h2 id="alertas-inventario" className="flex items-center gap-2 text-base font-semibold text-white">
        <IconAlert className="w-5 h-5 text-amber-300" />
        Requieren reposición
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-normal text-amber-100 tabular-nums">
          {formatCantidad(items.length)}
        </span>
      </h2>

      <ul className="mt-3 divide-y divide-white/10">
        {items.map(({ item, estado }) => {
          const ui = ESTADO_STOCK_UI[estado];
          const minimo = getMinStock(item);
          const unidad = getItemUnit(item);

          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0">
                <p className="text-white font-medium leading-snug">{getItemName(item)}</p>
                <p className="text-xs text-white/50 tabular-nums">{getItemCodigo(item)}</p>
              </div>
              <div className="text-right">
                <p className={`font-semibold tabular-nums ${ui.texto}`}>
                  {formatStock(getItemStockTotal(item), unidad)}
                </p>
                <p className="text-xs text-white/50 tabular-nums">
                  {minimo > 0 ? `Mínimo ${formatStock(minimo, unidad)}` : ui.label}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

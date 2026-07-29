/**
 * Tarjeta de un insumo. Se usa en la vista móvil del inventario, donde una
 * tabla de 6 columnas no cabe.
 */

import { ESTADO_STOCK_UI, formatCantidad } from '@/lib/inventario.format';
import type { ItemCardProps } from '@/types/inventario';

export default function ItemCard({
  item,
  getItemName,
  getItemCodigo,
  getItemStockTotal,
  getMinStock,
  getItemUnit,
  getItemEstado,
  getItemMovimientos,
}: ItemCardProps) {
  const estado = getItemEstado(item);
  const ui = ESTADO_STOCK_UI[estado];
  const codigo = getItemCodigo(item);
  const minimo = getMinStock(item);
  const movimientos = getItemMovimientos(item).length;

  return (
    <article className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium text-white leading-snug">{getItemName(item)}</h4>
          {codigo && (
            <p className="mt-0.5 text-xs text-white/45 tabular-nums">{codigo}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ui.badge}`}>
          {ui.label}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/45">Stock</p>
          <p className={`text-xl font-semibold tabular-nums ${ui.texto}`}>
            {formatCantidad(getItemStockTotal(item))}
            <span className="ml-1 text-sm font-normal text-white/50">{getItemUnit(item)}</span>
          </p>
        </div>
        <dl className="text-right text-xs text-white/50 space-y-0.5">
          {minimo > 0 && (
            <div>
              <dt className="inline">Mínimo: </dt>
              <dd className="inline tabular-nums">{formatCantidad(minimo)} {getItemUnit(item)}</dd>
            </div>
          )}
          <div>
            <dt className="inline">Movimientos: </dt>
            <dd className="inline tabular-nums">{formatCantidad(movimientos)}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

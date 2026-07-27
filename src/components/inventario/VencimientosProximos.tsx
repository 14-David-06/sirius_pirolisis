/**
 * Insumos que vencen en los próximos N días.
 *
 * NOTA: la tabla `Insumo` de Sirius Insumos Core no tiene fecha de vencimiento,
 * así que hoy esta sección no se renderiza. Se conserva para cuando el Core
 * incorpore el campo (el resto del flujo ya lo soporta).
 */

import { IconCalendar } from './Icons';
import { formatCantidad, formatFecha } from '@/lib/inventario.format';
import type { InventarioRecord } from '@/types/inventario';

interface VencimientosProximosProps {
  items: InventarioRecord[];
  diasAlerta: number;
  getItemName: (record: InventarioRecord) => string;
  getItemCategories: (record: InventarioRecord) => string[];
  getItemFechaVencimiento: (record: InventarioRecord) => string | null;
}

/** Días completos entre hoy y la fecha dada (negativo si ya pasó). */
function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return Math.ceil((fecha.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default function VencimientosProximos({
  items,
  diasAlerta,
  getItemName,
  getItemCategories,
  getItemFechaVencimiento,
}: VencimientosProximosProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="vencimientos-proximos"
      className="rounded-xl bg-orange-500/10 ring-1 ring-orange-400/25 p-4 sm:p-5"
    >
      <h2
        id="vencimientos-proximos"
        className="flex items-center gap-2 text-base font-semibold text-white"
      >
        <IconCalendar className="w-5 h-5 text-orange-300" />
        Vencen en {formatCantidad(diasAlerta)} días
        <span className="rounded-full bg-orange-400/20 px-2 py-0.5 text-xs font-normal text-orange-100 tabular-nums">
          {formatCantidad(items.length)}
        </span>
      </h2>

      <ul className="mt-3 divide-y divide-white/10">
        {items.map((item) => {
          const fecha = getItemFechaVencimiento(item);
          const dias = diasHasta(fecha);

          return (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <div className="min-w-0">
                <p className="text-white font-medium leading-snug">{getItemName(item)}</p>
                <p className="text-xs text-white/50">
                  {getItemCategories(item).join(' · ') || 'Sin categoría'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-orange-200 tabular-nums">{formatFecha(fecha)}</p>
                {dias !== null && (
                  <p className="text-xs text-white/50 tabular-nums">
                    {dias <= 0 ? 'Vencido' : `en ${formatCantidad(dias)} días`}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

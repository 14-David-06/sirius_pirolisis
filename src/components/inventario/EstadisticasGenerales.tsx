/**
 * Fila de indicadores del inventario.
 *
 * ⚠️ No existe un "total de unidades": el inventario mezcla unidades (und, kg,
 * L) y sumarlas daría un número sin significado. En su lugar se muestran
 * conteos de insumos, que sí son comparables.
 */

import { IconAlert, IconCheck, IconInbox, IconPackage } from './Icons';
import { formatCantidad } from '@/lib/inventario.format';

interface EstadisticasGeneralesProps {
  totalItems: number;
  /** Insumos con stock por encima de su mínimo. */
  itemsDisponibles: number;
  itemsStockBajo: number;
  itemsSinStock: number;
}

interface KpiProps {
  label: string;
  valor: number;
  icono: React.ReactNode;
  /** Clases del acento (icono + valor) cuando el indicador requiere atención. */
  acento: string;
  nota?: string;
}

function Kpi({ label, valor, icono, acento, nota }: KpiProps) {
  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className={acento}>{icono}</span>
        <span className="text-xs font-medium uppercase tracking-wider text-white/60">
          {label}
        </span>
      </div>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${acento}`}>
        {formatCantidad(valor)}
      </p>
      {nota && <p className="mt-0.5 text-xs text-white/50">{nota}</p>}
    </div>
  );
}

export default function EstadisticasGenerales({
  totalItems,
  itemsDisponibles,
  itemsStockBajo,
  itemsSinStock,
}: EstadisticasGeneralesProps) {
  return (
    <section aria-labelledby="resumen-inventario">
      <h2
        id="resumen-inventario"
        className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-3"
      >
        Resumen
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Insumos"
          valor={totalItems}
          icono={<IconPackage className="w-4 h-4" />}
          acento="text-white"
        />
        <Kpi
          label="Disponibles"
          valor={itemsDisponibles}
          icono={<IconCheck className="w-4 h-4" />}
          acento="text-white"
          nota="Sobre el stock mínimo"
        />
        <Kpi
          label="Por agotarse"
          valor={itemsStockBajo}
          icono={<IconAlert className="w-4 h-4" />}
          acento={itemsStockBajo > 0 ? 'text-amber-300' : 'text-white/70'}
          nota="Bajo el stock mínimo"
        />
        <Kpi
          label="Agotados"
          valor={itemsSinStock}
          icono={<IconInbox className="w-4 h-4" />}
          acento={itemsSinStock > 0 ? 'text-rose-300' : 'text-white/70'}
          nota="Sin stock disponible"
        />
      </div>
    </section>
  );
}

/**
 * Tarjeta de una materia prima del Blend: stock, umbral y cuánto Blend alcanza.
 */

"use client";

import { ESTADO_STOCK_UI, formatCantidad, formatStock } from '@/lib/inventario.format';
import { IconBiochar, IconBioabono, IconBiologicos } from './Icons';
import type { MateriaPrima } from '@/types/bodega';
import type { MateriaPrimaKey } from '@/lib/bodega.constants';

const ICONOS: Record<MateriaPrimaKey, (props: { className?: string }) => React.ReactElement> = {
  biochar: IconBiochar,
  bioabono: IconBioabono,
  biologicos: IconBiologicos,
};

interface MateriaPrimaCardProps {
  material: MateriaPrima;
  /** Materia prima que limita la producción de Blend. */
  esLimitante: boolean;
}

export default function MateriaPrimaCard({ material, esLimitante }: MateriaPrimaCardProps) {
  const Icono = ICONOS[material.key];
  const estadoUi = ESTADO_STOCK_UI[material.estado];

  // Barra de suficiencia: stock respecto a su umbral de reposición. Se corta en
  // 100% porque lo relevante es "¿llegué al mínimo?", no cuánto lo superé.
  const porcentajeUmbral = material.stockMinimo > 0
    ? Math.min(100, (material.stock / material.stockMinimo) * 100)
    : 100;

  return (
    <article className="rounded-xl bg-white/5 ring-1 ring-white/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 rounded-lg bg-white/10 p-2 text-white/80">
            <Icono className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">{material.nombre}</h3>
            <p className="text-xs text-white/50">
              {material.codigo
                ? `${material.codigo}${material.nombreCore ? ` · ${material.nombreCore}` : ''}`
                : 'Trazabilidad por bache'}
            </p>
          </div>
        </div>

        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${estadoUi.badge}`}>
          {estadoUi.label}
        </span>
      </div>

      <p className="mt-4 text-2xl font-semibold tracking-tight text-white">
        {formatStock(material.stock, material.unidad)}
      </p>
      <p className="mt-0.5 text-xs text-white/50">
        Mínimo sugerido: {formatStock(material.stockMinimo, material.unidad)}
      </p>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="img"
        aria-label={`Stock al ${formatCantidad(Math.round(porcentajeUmbral))} % del mínimo sugerido`}
      >
        <div
          className={`h-full rounded-full ${
            material.estado === 'agotado'
              ? 'bg-rose-400'
              : material.estado === 'por_agotarse'
                ? 'bg-amber-400'
                : 'bg-emerald-400'
          }`}
          style={{ width: `${porcentajeUmbral}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs">
        <div>
          <dt className="text-white/50">En la fórmula</dt>
          <dd className="mt-0.5 font-medium text-white/90">
            {formatCantidad(Number((material.pctBlend * 100).toFixed(2)))} %
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Alcanza para</dt>
          <dd className="mt-0.5 font-medium text-white/90">
            {formatCantidad(material.kgBlendPosibles)} kg de Blend
          </dd>
        </div>
      </dl>

      {esLimitante && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 ring-1 ring-amber-400/25">
          Es la materia prima que limita la producción ahora mismo.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-white/45">{material.descripcion}</p>
    </article>
  );
}

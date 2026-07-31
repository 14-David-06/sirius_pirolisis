/**
 * Lo que YA se produjo de Biochar Blend, contra lo que está comprometido.
 *
 * La agenda sola responde "qué hay que entregar y si alcanza la materia prima";
 * esta tarjeta cierra el ciclo con "y cuánto se produjo ya". Sin ella la página
 * mostraba pedidos y stock de insumos como si nunca se hubiera mezclado nada.
 *
 * Cada lote es un movimiento de Entrada en Sirius Inventario Production Core y su
 * código (BLEND-AAAA-MM-DD) es la llave que amarra las tres bases: las Salidas de
 * insumo en Sirius Insumos Core lo llevan en `ID Produccion Destino`, y las filas
 * de detalle por bache en PiroliApp en `ID Produccion Blend`.
 */

"use client";

import { formatCantidad, formatFecha, formatStock } from '@/lib/inventario.format';
import type { ProduccionBlend } from '@/types/agenda-blend';

interface ProduccionCardProps {
  produccion: ProduccionBlend;
}

export default function ProduccionCard({ produccion }: ProduccionCardProps) {
  const { kgEnInventario, kgProducidos, lotes } = produccion;
  const kgDespachados = Math.round((kgProducidos - kgEnInventario) * 100) / 100;

  if (!lotes.length) {
    return (
      <section className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
          Blend producido
        </p>
        <p className="mt-2 text-sm text-white/60">
          No hay producciones registradas en Sirius Inventario Production Core.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Blend producido
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {formatCantidad(kgProducidos)}{' '}
            <span className="text-lg font-normal text-white/60">kg en total</span>
          </p>
          <p className="mt-1 text-sm text-white/60">
            {lotes.length} {lotes.length === 1 ? 'lote' : 'lotes'} registrados
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <div>
            <dt className="text-white/50">En inventario</dt>
            <dd className="mt-0.5 text-sm font-semibold text-emerald-200">
              {formatStock(kgEnInventario, 'kg')}
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Ya despachado</dt>
            <dd className="mt-0.5 text-sm font-semibold text-white/70">
              {formatStock(kgDespachados, 'kg')}
            </dd>
          </div>
        </dl>
      </div>

      <ul className="mt-5 divide-y divide-white/5 border-t border-white/10">
        {lotes.map((lote) => (
          <li
            key={lote.lote || lote.fecha}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
          >
            <span className="font-mono text-xs text-sky-200">{lote.lote || 'sin código'}</span>
            <span className="text-xs text-white/50">
              {lote.fecha ? formatFecha(lote.fecha) : 'sin fecha'}
            </span>
            <span className="ml-auto text-sm font-medium text-white/90">
              {formatStock(lote.kg, 'kg')}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-white/45">
        Cada lote lleva su trazabilidad completa: en Sirius Insumos Core hay una Salida de biochar
        por cada bache consumido, con el bache de origen y este código de lote como destino.
      </p>
    </section>
  );
}

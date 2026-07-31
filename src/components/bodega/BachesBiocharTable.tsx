/**
 * Detalle del biochar disponible en bodega, bache por bache.
 *
 * El stock de biochar no es un número suelto: la producción de Blend consume kg
 * de baches concretos (es lo que sostiene la trazabilidad del carbono), así que
 * la bodega muestra de dónde saldría ese biochar.
 */

"use client";

import Link from 'next/link';
import { formatCantidad, formatStock } from '@/lib/inventario.format';
import { IconInbox } from '@/components/inventario/Icons';
import { IconLayers } from './Icons';
import type { BacheBiochar } from '@/types/bodega';

/** Baches que se listan antes de plegar el resto en una fila de resumen. */
const MAX_VISIBLES = 8;

interface BachesBiocharTableProps {
  baches: BacheBiochar[];
}

export default function BachesBiocharTable({ baches }: BachesBiocharTableProps) {
  const total = baches.reduce((suma, bache) => suma + bache.kg, 0);
  const parciales = baches.filter((bache) => bache.estado === 'Parcialmente consumido').length;
  const visibles = baches.slice(0, MAX_VISIBLES);
  const restantes = baches.slice(MAX_VISIBLES);
  const kgRestantes = restantes.reduce((suma, bache) => suma + bache.kg, 0);

  return (
    <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <IconLayers className="h-4 w-4 text-white/60" />
          Biochar por bache
        </h2>
        <p className="text-xs text-white/50">
          {baches.length} {baches.length === 1 ? 'bache' : 'baches'} · {formatStock(total, 'kg')}
          {/* Los parcialmente consumidos se distinguen: un bache abierto no es lo
              mismo que uno completo a la hora de despachar. */}
          {parciales > 0 && (
            <span className="text-white/40"> · {parciales} abierto{parciales === 1 ? '' : 's'}</span>
          )}
        </p>
      </header>

      {baches.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <IconInbox className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-3 text-sm text-white/60">No hay baches con biochar seco disponible.</p>
          <Link
            href="/sistema-baches"
            className="mt-4 inline-flex items-center rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            Ir al sistema de baches
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                <th scope="col" className="px-5 py-3 font-medium">Bache</th>
                <th scope="col" className="px-5 py-3 font-medium">Estado</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Biochar seco</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">% del total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visibles.map((bache) => (
                <tr key={bache.id}>
                  <td className="px-5 py-3 font-medium text-white/90">{bache.codigo}</td>
                  <td className="px-5 py-3 text-white/60">{bache.estado || '—'}</td>
                  <td className="px-5 py-3 text-right text-white/90">{formatStock(bache.kg, 'kg')}</td>
                  <td className="px-5 py-3 text-right text-white/50">
                    {total > 0 ? `${formatCantidad(Number(((bache.kg / total) * 100).toFixed(1)))} %` : '—'}
                  </td>
                </tr>
              ))}
              {restantes.length > 0 && (
                <tr>
                  <td colSpan={2} className="px-5 py-3 text-white/50">
                    + {restantes.length} {restantes.length === 1 ? 'bache más' : 'baches más'}
                  </td>
                  <td className="px-5 py-3 text-right text-white/70">{formatStock(kgRestantes, 'kg')}</td>
                  <td className="px-5 py-3 text-right text-white/50">
                    {total > 0 ? `${formatCantidad(Number(((kgRestantes / total) * 100).toFixed(1)))} %` : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

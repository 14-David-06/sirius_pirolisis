/**
 * Últimos movimientos de bioabono y biológicos en la bodega.
 *
 * Incluye tanto lo registrado a mano como lo que descontó la producción de
 * Blend: ambos son el mismo tipo de registro en Sirius Insumos Core, y verlos
 * juntos es lo que permite cuadrar la bodega.
 */

"use client";

import { formatFecha, formatStock } from '@/lib/inventario.format';
import { IconInbox } from '@/components/inventario/Icons';
import type { MovimientoBodega } from '@/types/bodega';

interface MovimientosTableProps {
  movimientos: MovimientoBodega[];
  error?: string | null;
}

export default function MovimientosTable({ movimientos, error }: MovimientosTableProps) {
  return (
    <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Movimientos recientes</h2>
        <p className="text-xs text-white/50">
          Las tres materias primas · Sirius Insumos Core
        </p>
      </header>

      {error ? (
        <p className="px-5 py-6 text-sm text-amber-200">
          No se pudieron cargar los movimientos: {error}
        </p>
      ) : movimientos.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <IconInbox className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-3 text-sm text-white/60">Todavía no hay movimientos registrados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                <th scope="col" className="px-5 py-3 font-medium">Movimiento</th>
                <th scope="col" className="px-5 py-3 font-medium">Materia prima</th>
                <th scope="col" className="px-5 py-3 font-medium">Tipo</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Cantidad</th>
                <th scope="col" className="px-5 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {movimientos.map((movimiento) => {
                const esEntrada = movimiento.tipo === 'Entrada';
                return (
                  <tr key={movimiento.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-medium text-white/90">{movimiento.codigo}</p>
                      {movimiento.notas && (
                        <p className="mt-0.5 max-w-sm whitespace-pre-line text-xs text-white/45">
                          {movimiento.notas}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-white/80">{movimiento.materiaNombre}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          esEntrada
                            ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30'
                            : 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30'
                        }`}
                      >
                        {movimiento.tipo || '—'}
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-right font-medium ${esEntrada ? 'text-emerald-200' : 'text-rose-200'}`}>
                      {esEntrada ? '+' : '−'}
                      {formatStock(movimiento.cantidad, movimiento.unidad)}
                    </td>
                    <td className="px-5 py-3 text-white/60">{formatFecha(movimiento.fecha)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Lista de pedidos agendados, en orden de entrega, con la materia prima que
 * compromete cada uno.
 *
 * Es la vista que responde "qué tengo que producir y en qué orden", que la
 * rejilla del mes no puede dar cuando los pedidos caen en meses distintos.
 */

"use client";

import { formatCantidad, formatFecha } from '@/lib/inventario.format';
import { IconInbox } from '@/components/inventario/Icons';
import CoberturaBadge from './CoberturaBadge';
import type { EventoAgenda } from '@/types/agenda-blend';

interface TablaAgendaProps {
  eventos: EventoAgenda[];
  onSeleccionarPedido?: (evento: EventoAgenda) => void;
}

export default function TablaAgenda({ eventos, onSeleccionarPedido }: TablaAgendaProps) {
  return (
    <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Pedidos en orden de entrega</h2>
        <p className="text-xs text-white/50">
          La cobertura es acumulada: los pedidos próximos consumen primero
        </p>
      </header>

      {eventos.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <IconInbox className="mx-auto h-8 w-8 text-white/30" />
          <p className="mt-3 text-sm text-white/60">No hay pedidos de Biochar Blend agendados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                <th scope="col" className="px-5 py-3 font-medium">Entrega</th>
                <th scope="col" className="px-5 py-3 font-medium">Pedido</th>
                <th scope="col" className="px-5 py-3 font-medium">Cliente</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Blend</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Biochar</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Bioabono</th>
                <th scope="col" className="px-5 py-3 font-medium text-right">Biológicos</th>
                <th scope="col" className="px-5 py-3 font-medium">Estado</th>
                <th scope="col" className="px-5 py-3 font-medium">Cobertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {eventos.map((evento) => (
                <tr
                  key={evento.pedidoRecordId}
                  onClick={() => onSeleccionarPedido?.(evento)}
                  className={onSeleccionarPedido ? 'cursor-pointer transition-colors duration-200 hover:bg-white/5' : ''}
                >
                  <td className="px-5 py-3 whitespace-nowrap text-white/80">
                    {evento.fecha ? formatFecha(evento.fecha) : <span className="text-amber-200">sin fecha</span>}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className="font-medium text-white/90">{evento.idPedidoCore || '—'}</span>
                    {evento.kgFuente === 'notas' && (
                      <span
                        title="Los KG se leyeron de las notas: el detalle en Sirius Pedidos Core está desvinculado"
                        className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-200 ring-1 ring-rose-400/25"
                      >
                        sin detalle
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-white/80">
                    {evento.cliente || '—'}
                    {evento.empaque && (
                      <span className="block text-xs text-white/40">{evento.empaque}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-white/90">
                    {formatCantidad(evento.kg)} kg
                  </td>
                  <td className="px-5 py-3 text-right text-white/60">
                    {formatCantidad(evento.requerido.biochar)} kg
                  </td>
                  <td className="px-5 py-3 text-right text-white/60">
                    {formatCantidad(evento.requerido.abono)} kg
                  </td>
                  <td className="px-5 py-3 text-right text-white/60">
                    {formatCantidad(evento.requerido.biologicos)} L
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-white/70">{evento.estado}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <CoberturaBadge cobertura={evento.cobertura} limitante={evento.limitante} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

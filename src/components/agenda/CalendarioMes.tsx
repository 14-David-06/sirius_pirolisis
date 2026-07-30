/**
 * Rejilla mensual de entregas comprometidas de Biochar Blend.
 *
 * Cada día muestra los pedidos que vencen ese día con su semáforo de cobertura.
 * El color del día es el del peor pedido: lo que importa al planear es si ese
 * día hay algo que no se va a poder cumplir.
 */

"use client";

import { formatCantidad } from '@/lib/inventario.format';
import CoberturaBadge from './CoberturaBadge';
import type { Cobertura, EventoAgenda } from '@/types/agenda-blend';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Prioridad para elegir el peor estado del día. */
const GRAVEDAD: Record<Cobertura, number> = {
  sin_stock: 3,
  parcial: 2,
  cubierto: 1,
  no_aplica: 0,
};

const BORDE_DIA: Record<Cobertura, string> = {
  sin_stock: 'ring-rose-400/40 bg-rose-500/10',
  parcial: 'ring-amber-400/40 bg-amber-500/10',
  cubierto: 'ring-emerald-400/30 bg-emerald-500/10',
  no_aplica: 'ring-white/10 bg-white/5',
};

/** Clave YYYY-MM-DD en hora local, sin pasar por UTC. */
function claveLocal(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

interface CalendarioMesProps {
  /** Año y mes (0-11) que se muestran. */
  anio: number;
  mes: number;
  eventosPorDia: Map<string, EventoAgenda[]>;
  onMesAnterior: () => void;
  onMesSiguiente: () => void;
  onHoy: () => void;
  onSeleccionarPedido?: (evento: EventoAgenda) => void;
}

export default function CalendarioMes({
  anio,
  mes,
  eventosPorDia,
  onMesAnterior,
  onMesSiguiente,
  onHoy,
  onSeleccionarPedido,
}: CalendarioMesProps) {
  const primerDia = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  // getDay() devuelve 0=domingo; la rejilla arranca en lunes.
  const desplazamiento = (primerDia.getDay() + 6) % 7;

  const hoy = new Date();
  const claveHoy = claveLocal(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  const celdas: Array<{ dia: number; clave: string } | null> = [
    ...Array.from({ length: desplazamiento }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => ({
      dia: i + 1,
      clave: claveLocal(anio, mes, i + 1),
    })),
  ];

  return (
    <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold capitalize text-white">
          {MESES[mes]} {anio}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMesAnterior}
            aria-label="Mes anterior"
            className="rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-1.5 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onHoy}
            className="rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-1.5 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={onMesSiguiente}
            aria-label="Mes siguiente"
            className="rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-1.5 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            ›
          </button>
        </div>
      </header>

      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-white/40">
              {dia}
            </div>
          ))}

          {celdas.map((celda, indice) => {
            if (!celda) return <div key={`vacio-${indice}`} />;

            const eventos = eventosPorDia.get(celda.clave) ?? [];
            const peor = eventos.reduce<Cobertura>(
              (acc, e) => (GRAVEDAD[e.cobertura] > GRAVEDAD[acc] ? e.cobertura : acc),
              'no_aplica'
            );
            const esHoy = celda.clave === claveHoy;

            return (
              <div
                key={celda.clave}
                className={`min-h-[5.5rem] rounded-lg p-2 ring-1 ${
                  eventos.length ? BORDE_DIA[peor] : 'bg-white/[0.02] ring-white/5'
                }`}
              >
                <p
                  className={`text-xs font-medium ${
                    esHoy
                      ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white'
                      : 'text-white/50'
                  }`}
                >
                  {celda.dia}
                </p>

                <ul className="mt-1 space-y-1">
                  {eventos.map((evento) => (
                    <li key={evento.pedidoRecordId}>
                      <button
                        type="button"
                        onClick={() => onSeleccionarPedido?.(evento)}
                        title={`${evento.cliente} · ${formatCantidad(evento.kg)} kg · ${evento.estado}`}
                        className="w-full truncate rounded bg-white/10 px-1.5 py-1 text-left text-[11px] text-white/90 transition-colors duration-200 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
                      >
                        {formatCantidad(evento.kg)} kg · {evento.cliente || evento.idPedidoCore}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Leyenda */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <span className="text-[11px] text-white/40">Cobertura de bodega:</span>
          <CoberturaBadge cobertura="cubierto" />
          <CoberturaBadge cobertura="parcial" />
          <CoberturaBadge cobertura="sin_stock" />
        </div>
      </div>
    </section>
  );
}

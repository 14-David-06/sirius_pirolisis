/**
 * Resumen de la agenda: qué hay comprometido y hasta dónde alcanza la bodega.
 *
 * Es la lectura que la bodega sola no puede dar: el stock por sí mismo no dice
 * nada si no se compara contra lo que ya está prometido a clientes.
 */

"use client";

import { formatCantidad, formatFecha, formatStock } from '@/lib/inventario.format';
import {
  mensajeDivergenciaBiochar,
  mensajeFuenteBiocharDegradada,
} from '@/lib/biochar-divergencia';
import { ETIQUETA_LIMITANTE } from '@/lib/materias-primas.labels';
import type { CapacidadBlend } from '@/lib/bodega.constants';
import type { FuenteBiochar, MateriaPrimaTerna, ResumenAgenda } from '@/types/agenda-blend';

interface ResumenAgendaCardProps {
  resumen: ResumenAgenda;
  disponible: MateriaPrimaTerna;
  /** Capacidad de producción de la bodega; la misma que muestra /bodega. */
  capacidad?: CapacidadBlend | null;
  fuenteBiochar?: FuenteBiochar | null;
}

export default function ResumenAgendaCard({
  resumen,
  disponible,
  capacidad,
  fuenteBiochar,
}: ResumenAgendaCardProps) {
  const todoCubierto = resumen.kgSinCobertura <= 0 && resumen.kgComprometidos > 0;

  // El umbral y el texto son los mismos que usa la bodega: con los mismos dos
  // números, las dos pantallas tienen que decir lo mismo.
  const avisoDivergencia = mensajeDivergenciaBiochar(fuenteBiochar);
  const avisoFuente = mensajeFuenteBiocharDegradada(fuenteBiochar);

  const limitante = capacidad?.limitante ? ETIQUETA_LIMITANTE[capacidad.limitante] : null;

  return (
    <section className="rounded-xl bg-gradient-to-br from-sky-500/10 to-emerald-500/10 ring-1 ring-white/15 p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Comprometido con clientes
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {formatCantidad(resumen.kgComprometidos)}{' '}
            <span className="text-lg font-normal text-white/60">kg de Blend</span>
          </p>
          <p className="mt-1 text-sm text-white/60">
            {resumen.pedidosAbiertos}{' '}
            {resumen.pedidosAbiertos === 1 ? 'pedido abierto' : 'pedidos abiertos'} de{' '}
            {resumen.pedidosTotales} en total
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-white/50">Cubierto</dt>
            <dd className="mt-0.5 text-sm font-semibold text-emerald-200">
              {formatCantidad(resumen.kgCubiertos)} kg
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Sin cobertura</dt>
            <dd
              className={`mt-0.5 text-sm font-semibold ${
                resumen.kgSinCobertura > 0 ? 'text-rose-200' : 'text-white/70'
              }`}
            >
              {formatCantidad(resumen.kgSinCobertura)} kg
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Primera fecha en riesgo</dt>
            <dd className="mt-0.5 text-sm font-semibold text-white/90">
              {resumen.primeraFechaSinCobertura
                ? formatFecha(resumen.primeraFechaSinCobertura)
                : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-white/10 pt-4 text-xs">
        <div>
          <dt className="text-white/50">
            Biochar en stock
            {fuenteBiochar?.origen === 'insumos-core' && (
              <span className="ml-1.5 text-white/30" title="Fuente: Sirius Insumos Core">
                · Core
              </span>
            )}
          </dt>
          <dd className="mt-0.5 font-medium text-white/90">{formatStock(disponible.biochar, 'kg')}</dd>
        </div>
        <div>
          <dt className="text-white/50">Bioabono en stock</dt>
          <dd className="mt-0.5 font-medium text-white/90">{formatStock(disponible.abono, 'kg')}</dd>
        </div>
        <div>
          <dt className="text-white/50">Biológicos en stock</dt>
          <dd className="mt-0.5 font-medium text-white/90">{formatStock(disponible.biologicos, 'L')}</dd>
        </div>
      </dl>

      {/*
        La misma conclusión que encabeza /bodega. Sin ella, esta pantalla mostraba
        tres stocks sueltos y el operador podía leer "hay 48 t de biochar" sin
        enterarse de que no se puede producir un solo kg porque faltan biológicos.
      */}
      {capacidad && (
        <p className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70 ring-1 ring-white/10">
          Con este stock se pueden producir{' '}
          <strong className="font-semibold text-white">
            {formatCantidad(capacidad.kgBlend)} kg de Blend
          </strong>
          {limitante && <> · limita {limitante}</>}
        </p>
      )}

      {resumen.kgComprometidos === 0 ? (
        <p className="mt-4 text-[11px] leading-relaxed text-white/45">
          No hay pedidos abiertos de Biochar Blend, así que no hay nada comprometido todavía.
        </p>
      ) : todoCubierto ? (
        <p className="mt-4 text-[11px] leading-relaxed text-emerald-200/80">
          La bodega alcanza para todo lo comprometido.
        </p>
      ) : (
        <p className="mt-4 text-[11px] leading-relaxed text-amber-200/80">
          Faltan {formatCantidad(resumen.kgSinCobertura)} kg por cubrir. La cobertura se calcula en
          orden de fecha de entrega: los pedidos más próximos consumen primero.
        </p>
      )}

      {[avisoFuente, avisoDivergencia].map(
        (aviso) =>
          aviso && (
            <p
              key={aviso}
              className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 ring-1 ring-amber-400/25"
            >
              {aviso}
            </p>
          )
      )}

      {resumen.pedidosSinDetalle > 0 && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200 ring-1 ring-rose-400/25">
          {resumen.pedidosSinDetalle}{' '}
          {resumen.pedidosSinDetalle === 1 ? 'pedido tiene' : 'pedidos tienen'} el detalle
          desvinculado en Sirius Pedidos Core: los KG se leyeron de las notas y no podrán iniciar
          producción hasta que se corrija el vínculo.
        </p>
      )}
    </section>
  );
}

/**
 * Capacidad de producción de Biochar Blend con el stock actual de bodega.
 *
 * Es la lectura que le da sentido a la bodega: no importa tanto "cuánto hay de
 * cada cosa" como "cuántos kg de Blend puedo producir sin comprar nada". La
 * limita la materia prima más escasa respecto a su proporción en la fórmula.
 */

"use client";

import { formatCantidad, formatFecha } from '@/lib/inventario.format';
import { ETIQUETA_LIMITANTE } from '@/lib/materias-primas.labels';
import { IconBlend } from './Icons';
import type { CapacidadProduccion } from '@/types/bodega';
import type { ResumenAgenda } from '@/types/agenda-blend';

interface CapacidadProduccionCardProps {
  capacidad: CapacidadProduccion;
  formula: { pctBiochar: number; pctAbono: number; pctBiologicos: number; pctAgua: number };
  /**
   * Lo comprometido con clientes, de la agenda de pedidos. Opcional: la agenda se
   * carga aparte y la bodega no debe esperarla.
   */
  resumenAgenda?: ResumenAgenda | null;
}

export default function CapacidadProduccionCard({
  capacidad,
  formula,
  resumenAgenda,
}: CapacidadProduccionCardProps) {
  const limitante = capacidad.limitante ? ETIQUETA_LIMITANTE[capacidad.limitante] : null;
  const lotes = capacidad.loteReferenciaKg > 0
    ? Math.floor(capacidad.kgBlend / capacidad.loteReferenciaKg)
    : 0;

  const composicion = [
    { label: 'Bioabono', pct: formula.pctAbono },
    { label: 'Biochar', pct: formula.pctBiochar },
    { label: 'Agua', pct: formula.pctAgua },
    { label: 'Biológicos', pct: formula.pctBiologicos },
  ];

  return (
    <section className="rounded-xl bg-gradient-to-br from-sky-500/10 to-emerald-500/10 ring-1 ring-white/15 p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
            <IconBlend className="w-4 h-4" />
            Capacidad de producción
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
            {formatCantidad(capacidad.kgBlend)} <span className="text-lg font-normal text-white/60">kg de Blend</span>
          </p>
          <p className="mt-1 text-sm text-white/60">
            {capacidad.kgBlend <= 0 ? (
              <>
                Sin stock suficiente para producir.
                {limitante && <> Limita {limitante}.</>}
              </>
            ) : (
              <>
                Equivale a {formatCantidad(lotes)}{' '}
                {lotes === 1 ? 'lote' : 'lotes'} de {formatCantidad(capacidad.loteReferenciaKg)} kg
                {limitante && <> · limita {limitante}</>}
              </>
            )}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
          {composicion.map(({ label, pct }) => (
            <div key={label}>
              <dt className="text-white/50">{label}</dt>
              <dd className="mt-0.5 font-semibold text-white/90">
                {formatCantidad(Number((pct * 100).toFixed(2)))} %
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/*
        La capacidad sola no dice si alcanza: alcanza CONTRA algo. El dato viene de
        la agenda de pedidos —la misma fuente y el mismo cálculo de cobertura que
        /calendario-blend— para que las dos pantallas no puedan contradecirse.
      */}
      {resumenAgenda && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-white/50">Comprometido con clientes</dt>
            <dd className="mt-0.5 font-semibold text-white/90">
              {formatCantidad(resumenAgenda.kgComprometidos)} kg
              <span className="ml-1 font-normal text-white/50">
                ({resumenAgenda.pedidosAbiertos}{' '}
                {resumenAgenda.pedidosAbiertos === 1 ? 'pedido' : 'pedidos'})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Sin cobertura</dt>
            <dd
              className={`mt-0.5 font-semibold ${
                resumenAgenda.kgSinCobertura > 0 ? 'text-rose-200' : 'text-emerald-200'
              }`}
            >
              {formatCantidad(resumenAgenda.kgSinCobertura)} kg
            </dd>
          </div>
          <div>
            <dt className="text-white/50">Primera fecha en riesgo</dt>
            <dd className="mt-0.5 font-semibold text-white/90">
              {resumenAgenda.primeraFechaSinCobertura
                ? formatFecha(resumenAgenda.primeraFechaSinCobertura)
                : '—'}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/45">
        El agua no se inventaría: se registra en el turno. Los porcentajes son la fórmula oficial
        del Blend y son los mismos que usa la deducción automática al confirmar una producción.
      </p>
    </section>
  );
}

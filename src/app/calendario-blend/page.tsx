/**
 * Agendamiento de pedidos de Biochar Blend.
 *
 * Responde dos preguntas que ni la bodega ni la lista de pedidos contestan por
 * separado: qué hay que entregar y en qué fecha, y hasta dónde alcanza la materia
 * prima que hay en bodega para cumplirlo.
 *
 * La orquestación vive aquí; el cálculo de cobertura, en el servidor
 * (/api/pirolisis/blend/agenda).
 */

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { CalendarioMes, ResumenAgendaCard, TablaAgenda } from '@/components/agenda';
import { IconAlert, IconCalendar, IconPackage } from '@/components/inventario/Icons';
import { IconWarehouse } from '@/components/bodega/Icons';
import { useAgendaBlend } from '@/lib/useAgendaBlend';
import type { EventoAgenda } from '@/types/agenda-blend';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

export default function CalendarioBlend() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <CalendarioBlendContent />
    </TurnoProtection>
  );
}

/** Envoltorio de página: fondo, navbar y footer compartidos por todos los estados. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative"
      style={{ backgroundImage: FONDO }}
    >
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

function CalendarioBlendContent() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [incluirCerrados, setIncluirCerrados] = useState(false);
  const [seleccionado, setSeleccionado] = useState<EventoAgenda | null>(null);

  const { eventos, porDia, sinFecha, disponible, resumen, loading, error, refresh } =
    useAgendaBlend(incluirCerrados);

  const irMesAnterior = () => {
    if (mes === 0) {
      setMes(11);
      setAnio((a) => a - 1);
    } else {
      setMes((m) => m - 1);
    }
  };

  const irMesSiguiente = () => {
    if (mes === 11) {
      setMes(0);
      setAnio((a) => a + 1);
    } else {
      setMes((m) => m + 1);
    }
  };

  const irHoy = () => {
    const ahora = new Date();
    setAnio(ahora.getFullYear());
    setMes(ahora.getMonth());
  };

  if (loading) {
    return (
      <PageShell>
        <div aria-busy="true" aria-label="Cargando agenda" className="space-y-6">
          <div className="h-8 w-80 rounded bg-white/10 animate-pulse motion-reduce:animate-none" />
          <div className="h-40 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none" />
          <div className="h-96 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none" />
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="mx-auto max-w-lg rounded-xl bg-rose-500/10 ring-1 ring-rose-400/25 p-6 text-center">
          <IconAlert className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="mt-3 text-lg font-semibold text-white">No se pudo cargar la agenda</h1>
          <p className="mt-2 text-sm text-white/70">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-5 rounded-lg bg-white/10 ring-1 ring-white/20 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {/* Encabezado */}
      <header className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              <IconCalendar className="w-4 h-4" />
              Ventas
            </p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Agendamiento de pedidos
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-white/60">
              Entregas comprometidas de Biochar Blend y hasta dónde alcanza la materia prima de
              bodega para cumplirlas.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/pirolisis/blend/admin-pedidos"
              className="inline-flex items-center gap-2 rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
            >
              <IconPackage className="w-4 h-4" />
              Administrar pedidos
            </Link>
            <Link
              href="/bodega"
              className="inline-flex items-center gap-2 rounded-lg bg-white/5 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
            >
              <IconWarehouse className="w-4 h-4" />
              Bodega
            </Link>
          </div>
        </div>

        <label className="mt-5 inline-flex cursor-pointer items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={incluirCerrados}
            onChange={(event) => setIncluirCerrados(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/10 accent-sky-500"
          />
          Mostrar despachados y cancelados
        </label>
      </header>

      <div className="mt-6 space-y-6">
        {resumen && disponible && <ResumenAgendaCard resumen={resumen} disponible={disponible} />}

        <CalendarioMes
          anio={anio}
          mes={mes}
          eventosPorDia={porDia}
          onMesAnterior={irMesAnterior}
          onMesSiguiente={irMesSiguiente}
          onHoy={irHoy}
          onSeleccionarPedido={setSeleccionado}
        />

        {sinFecha.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-400/25 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
              <IconAlert className="w-4 h-4" />
              {sinFecha.length} {sinFecha.length === 1 ? 'pedido sin' : 'pedidos sin'} fecha de
              entrega
            </p>
            <p className="mt-1 text-xs text-amber-100/80">
              No aparecen en el calendario porque no hay día al que agendarlos. Sí están en la lista
              de abajo y sí comprometen materia prima.
            </p>
          </div>
        )}

        <TablaAgenda eventos={eventos} onSeleccionarPedido={setSeleccionado} />
      </div>

      {/* Detalle del pedido seleccionado */}
      {seleccionado && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detalle-pedido-titulo"
        >
          <div className="my-auto w-full max-w-lg overflow-hidden rounded-xl bg-slate-900/95 ring-1 ring-white/15 shadow-2xl">
            <div className="border-b border-white/10 px-6 py-5">
              <h2 id="detalle-pedido-titulo" className="text-lg font-semibold text-white">
                {seleccionado.idPedidoCore || 'Pedido'}
              </h2>
              <p className="mt-1 text-sm text-white/60">
                {seleccionado.cliente}
                {seleccionado.nit && ` · NIT ${seleccionado.nit}`}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-4 px-6 py-5 text-sm">
              <div>
                <dt className="text-xs text-white/50">Blend pedido</dt>
                <dd className="mt-0.5 font-medium text-white">{seleccionado.kg} kg</dd>
              </div>
              <div>
                <dt className="text-xs text-white/50">Estado</dt>
                <dd className="mt-0.5 font-medium text-white">{seleccionado.estado}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/50">Biochar</dt>
                <dd className="mt-0.5 text-white/80">{seleccionado.requerido.biochar} kg</dd>
              </div>
              <div>
                <dt className="text-xs text-white/50">Bioabono</dt>
                <dd className="mt-0.5 text-white/80">{seleccionado.requerido.abono} kg</dd>
              </div>
              <div>
                <dt className="text-xs text-white/50">Biológicos</dt>
                <dd className="mt-0.5 text-white/80">{seleccionado.requerido.biologicos} L</dd>
              </div>
              <div>
                <dt className="text-xs text-white/50">Empaque</dt>
                <dd className="mt-0.5 text-white/80">{seleccionado.empaque || '—'}</dd>
              </div>
              {seleccionado.observaciones && (
                <div className="col-span-2">
                  <dt className="text-xs text-white/50">Observaciones</dt>
                  <dd className="mt-0.5 text-white/80">{seleccionado.observaciones}</dd>
                </div>
              )}
            </dl>

            <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="rounded-lg bg-white/5 ring-1 ring-white/15 px-4 py-2 text-sm font-medium text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
              >
                Cerrar
              </button>
              <Link
                href="/pirolisis/blend/admin-pedidos"
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                Ir a administrar
              </Link>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

/**
 * Actas de Entrega de Biochar — entregas SIN contraprestación comercial.
 *
 * Investigación, ensayo de campo, piloto demostrativo o donación. NO genera
 * remisión ni pedido: no es facturable. El acta es la evidencia del uso previsto
 * declarado que exige la Puro Biochar Methodology, y al generarla se descuenta el
 * inventario del libro mayor que corresponda. Ver `src/lib/actas-biochar.ts`.
 */

"use client";

import { useCallback, useEffect, useState } from 'react';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ActaEntregaForm from '@/components/actas/ActaEntregaForm';
import { IconAlert, IconPlus, IconX } from '@/components/inventario/Icons';
import { formatStock } from '@/lib/inventario.format';
import { ESTADO_ACTA } from '@/lib/actas-biochar.constants';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

interface ActaResumen {
  id: string;
  codigo: string;
  fecha: string;
  estado: string;
  tipoBiochar: string;
  lote: string;
  kgSeca: number;
  proyecto: string;
  co2: number;
  urlDocumento: string;
}

/** Mismo criterio de sesión que el resto de los módulos. */
const getCurrentUserName = (): string => {
  try {
    const sesion = localStorage.getItem('userSession');
    if (sesion) {
      const data = JSON.parse(sesion);
      return data.user?.Nombre || data.user?.name || 'Usuario Desconocido';
    }
  } catch (error) {
    console.error('Error obteniendo nombre de usuario:', error);
  }
  return 'Usuario Desconocido';
};

const getCurrentUserIdCore = (): string => {
  try {
    const sesion = localStorage.getItem('userSession');
    if (sesion) {
      const data = JSON.parse(sesion);
      return data.user?.idPersonalCore || data.user?.['ID Empleado'] || 'SIRIUS-PER-0000';
    }
  } catch (error) {
    console.error('Error obteniendo ID Core de usuario:', error);
  }
  return 'SIRIUS-PER-0000';
};

const COLOR_ESTADO: Record<string, string> = {
  [ESTADO_ACTA.borrador]: 'bg-amber-500/15 text-amber-200 ring-amber-400/25',
  [ESTADO_ACTA.generada]: 'bg-sky-500/15 text-sky-200 ring-sky-400/25',
  [ESTADO_ACTA.firmada]: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/25',
  [ESTADO_ACTA.atestada]: 'bg-emerald-500/25 text-emerald-100 ring-emerald-400/40',
  [ESTADO_ACTA.anulada]: 'bg-white/5 text-white/40 ring-white/15',
};

export default function ActasBiocharPage() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <Contenido />
    </TurnoProtection>
  );
}

function Contenido() {
  const [actas, setActas] = useState<ActaResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/actas-biochar');
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'Error al cargar las actas');
      setActas(data.actas ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alCrear = async (mensaje: string) => {
    setFormAbierto(false);
    await cargar();
    alert(mensaje);
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat bg-fixed relative"
      style={{ backgroundImage: FONDO }}
    >
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">
          <header className="border-b border-white/10 pb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Recursos</p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Actas de entrega de biochar
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-white/60">
              Entregas de biochar puro o Blend para investigación, ensayo de campo, piloto
              demostrativo o donación, <strong className="text-white/80">sin contraprestación
              comercial</strong>. No generan remisión ni pedido; al generar el acta se descuenta el
              inventario.
            </p>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => setFormAbierto(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 cursor-pointer"
              >
                <IconPlus className="w-4 h-4" />
                Nueva acta de entrega
              </button>
            </div>
          </header>

          <div className="mt-6">
            {error && (
              <div className="rounded-xl bg-rose-500/10 ring-1 ring-rose-400/25 p-4 text-sm text-rose-200">
                <p className="flex items-center gap-2 font-semibold">
                  <IconAlert className="w-4 h-4" />
                  {error}
                </p>
              </div>
            )}

            {cargando ? (
              <div
                aria-busy="true"
                aria-label="Cargando actas"
                className="h-48 rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
              />
            ) : (
              <section className="rounded-xl bg-white/5 ring-1 ring-white/10">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-4">
                  <h2 className="text-sm font-semibold text-white">Actas registradas</h2>
                  <p className="text-xs text-white/50">{actas.length}</p>
                </header>

                {actas.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-white/60">
                    Todavía no hay actas registradas.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[46rem] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-white/45">
                          <th scope="col" className="px-5 py-3 font-medium">Acta</th>
                          <th scope="col" className="px-5 py-3 font-medium">Fecha</th>
                          <th scope="col" className="px-5 py-3 font-medium">Tipo</th>
                          <th scope="col" className="px-5 py-3 font-medium">Lote</th>
                          <th scope="col" className="px-5 py-3 font-medium">Proyecto</th>
                          <th scope="col" className="px-5 py-3 font-medium text-right">Entregado</th>
                          <th scope="col" className="px-5 py-3 font-medium text-right">CO₂</th>
                          <th scope="col" className="px-5 py-3 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {actas.map((acta) => (
                          <tr key={acta.id}>
                            <td className="px-5 py-3 font-medium text-white/90">{acta.codigo}</td>
                            <td className="px-5 py-3 text-white/60">{acta.fecha || '—'}</td>
                            <td className="px-5 py-3 text-white/60">{acta.tipoBiochar}</td>
                            <td className="px-5 py-3 text-white/60">{acta.lote}</td>
                            <td className="px-5 py-3 text-white/60">{acta.proyecto}</td>
                            <td className="px-5 py-3 text-right text-white/90">
                              {formatStock(acta.kgSeca, 'kg')}
                            </td>
                            <td className="px-5 py-3 text-right text-white/50">
                              {acta.co2 ? `${acta.co2} kg` : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ${
                                  COLOR_ESTADO[acta.estado] ?? 'bg-white/5 text-white/60 ring-white/15'
                                }`}
                              >
                                {acta.estado || '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        </main>
        <Footer />
      </div>

      {formAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-acta-titulo"
        >
          <div className="my-auto w-full max-w-3xl overflow-hidden rounded-xl bg-slate-900/95 ring-1 ring-white/15 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <h2 id="modal-acta-titulo" className="text-lg font-semibold text-white">
                  Nueva acta de entrega
                </h2>
                <p className="mt-1 text-sm text-white/60">
                  Al generarla se descuenta el inventario. Usa &ldquo;Ver ensayo&rdquo; para revisar
                  antes de comprometerlo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormAbierto(false)}
                aria-label="Cerrar"
                className="shrink-0 rounded-lg p-1.5 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <ActaEntregaForm
              getCurrentUserName={getCurrentUserName}
              getCurrentUserIdCore={getCurrentUserIdCore}
              onSuccess={alCrear}
              onCancel={() => setFormAbierto(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

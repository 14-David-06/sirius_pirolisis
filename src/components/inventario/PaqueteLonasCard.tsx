/**
 * Paquete de lonas actualmente en uso.
 * Se retira automáticamente al registrar la próxima salida de lonas para producción.
 */

"use client";

import { useEffect, useState } from 'react';
import { IconPackage } from './Icons';
import { config } from '@/lib/config';
import { formatCantidad, formatFecha } from '@/lib/inventario.format';
import type { PaqueteLonasData } from '@/types/inventario';

const DIAS_ALERTA = config.airtable.lonasAlertaDias;
const VIDA_ESTIMADA = config.airtable.lonasVidaEstimadaDias;

export default function PaqueteLonasCard() {
  const [paquete, setPaquete] = useState<PaqueteLonasData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/inventario/lonas/paquete-activo')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setPaquete(json?.data || null))
      .catch(() => setPaquete(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !paquete) return null;

  const dias = paquete.dias_en_uso;
  const porVencer = DIAS_ALERTA > 0 && dias >= DIAS_ALERTA;
  const progreso = VIDA_ESTIMADA > 0 ? Math.min((dias / VIDA_ESTIMADA) * 100, 100) : 0;

  const datos: { label: string; valor: string }[] = [
    { label: 'Días en uso', valor: formatCantidad(dias) },
    { label: 'Lonas', valor: formatCantidad(paquete.cantidad_lonas) },
    { label: 'Balances vinculados', valor: formatCantidad(paquete.total_balances_vinculados) },
    { label: 'Activado', valor: formatFecha(paquete.fecha_activacion) },
  ];

  return (
    <section
      aria-labelledby="paquete-lonas"
      className={`rounded-xl p-4 sm:p-5 ring-1 ${
        porVencer ? 'bg-amber-500/10 ring-amber-400/25' : 'bg-white/5 ring-white/10'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="paquete-lonas" className="flex items-center gap-2 text-base font-semibold text-white">
          <IconPackage className={`w-5 h-5 ${porVencer ? 'text-amber-300' : 'text-white/60'}`} />
          Paquete de lonas activo
        </h2>
        {porVencer && (
          <span className="rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs text-amber-100">
            Supera los {formatCantidad(DIAS_ALERTA)} días de alerta
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {datos.map(({ label, valor }) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wider text-white/55">{label}</dt>
            <dd className="mt-1 text-xl font-semibold text-white tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>

      {VIDA_ESTIMADA > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs text-white/50">
            <span>Vida estimada</span>
            <span className="tabular-nums">
              {formatCantidad(dias)} / {formatCantidad(VIDA_ESTIMADA)} días
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={Math.round(progreso)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Vida consumida del paquete de lonas"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
                porVencer ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-white/40">
        Se retirará automáticamente al registrar la próxima salida de lonas para producción.
      </p>
    </section>
  );
}

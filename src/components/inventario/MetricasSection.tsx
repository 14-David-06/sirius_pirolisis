/**
 * Métricas de uso de insumos: qué proporción del consumo fue productivo
 * (balance de masa) frente a operativo (mantenimiento, limpieza, ajustes).
 *
 * ⚠️ Las cantidades acumuladas suman insumos con unidades distintas (und, kg,
 * L), así que el total NO tiene una unidad única y se muestra sin ella. El
 * porcentaje de eficiencia sí es comparable, porque es una proporción.
 */

"use client";

import { useEffect, useState } from 'react';
import { IconChart } from './Icons';
import { formatCantidad, formatPorcentaje } from '@/lib/inventario.format';
import { TIPO_USO_LABELS } from '@/domain/entities/Inventario';
import type { MetricasInventario } from '@/types/inventario';

function Metrica({
  label,
  valor,
  acento = 'text-white',
}: {
  label: string;
  valor: string;
  acento?: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-white/55">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${acento}`}>{valor}</p>
    </div>
  );
}

export default function MetricasSection() {
  const [metricas, setMetricas] = useState<MetricasInventario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/inventario/metricas')
      .then((r) => r.json())
      .then((d) => { if (d.success) setMetricas(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Reserva el espacio mientras carga para que el resto de la página no salte.
  if (loading) {
    return (
      <section aria-busy="true" aria-label="Cargando métricas de consumo">
        <div className="h-4 w-28 rounded bg-white/10 animate-pulse motion-reduce:animate-none mb-3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[86px] rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!metricas) return null;

  const desglose = Object.entries(metricas.desglose_por_tipo ?? {})
    .sort(([, a], [, b]) => b - a);

  return (
    <section aria-labelledby="metricas-consumo">
      <h2
        id="metricas-consumo"
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50 mb-3"
      >
        <IconChart className="w-4 h-4" />
        Consumo de insumos
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metrica label="Cantidad total" valor={formatCantidad(metricas.total_salidas)} />
        <Metrica
          label="Productiva"
          valor={formatCantidad(metricas.total_productivas)}
          acento="text-emerald-300"
        />
        <Metrica
          label="Operativa"
          valor={formatCantidad(metricas.total_operativas)}
          acento="text-amber-300"
        />
        <Metrica
          label="Eficiencia"
          valor={formatPorcentaje(metricas.eficiencia_pct)}
          acento="text-sky-300"
        />
      </div>

      <p className="mt-2 text-xs text-white/40">
        Cantidades acumuladas sobre insumos con unidades distintas (und, kg, L); el total no
        expresa una sola unidad. Eficiencia = consumo productivo / consumo total.
      </p>

      {desglose.length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-2">
          {desglose.map(([tipo, cantidad]) => (
            <div
              key={tipo}
              className="flex items-baseline gap-1.5 rounded-lg bg-white/5 ring-1 ring-white/10 px-2.5 py-1.5 text-xs"
            >
              <dt className="text-white/60">
                {TIPO_USO_LABELS[tipo as keyof typeof TIPO_USO_LABELS] ?? tipo}
              </dt>
              <dd className="font-medium text-white tabular-nums">{formatCantidad(cantidad)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

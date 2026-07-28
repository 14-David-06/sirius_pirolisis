/**
 * Fila de indicadores del parque de activos.
 *
 * Los seis contadores anteriores se solapaban (un activo operativo y sin dueño
 * se contaba en "Operativos", en "Disponibles" y en el total), así que la fila
 * no sumaba a nada interpretable. Aquí cada indicador responde una pregunta
 * distinta: cuántos hay, cuántos están en uso, cuántos se pueden entregar y
 * cuántos requieren atención.
 */

import { formatCantidad, formatMoneda, formatMonedaCompacta } from '@/lib/activos.format';
import { IconAlert, IconCoins, IconUser, IconWrench } from './Icons';

interface EstadisticasActivosProps {
  totalActivos: number;
  asignados: number;
  disponibles: number;
  /** En reparación + fuera de servicio + vencidos + por vencer. */
  requierenAtencion: number;
  valorTotal: number;
  /** Activos sin tipo o sin ubicación. */
  incompletos: number;
  dadosDeBaja: number;
}

interface KpiProps {
  label: string;
  valor: string;
  icono: React.ReactNode;
  /** Clases del acento (icono + valor) cuando el indicador requiere atención. */
  acento: string;
  nota?: string;
}

function Kpi({ label, valor, icono, acento, nota }: KpiProps) {
  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className={acento}>{icono}</span>
        <span className="text-xs font-medium uppercase tracking-wider text-white/60">{label}</span>
      </div>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${acento}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-white/50">{nota}</p>}
    </div>
  );
}

export default function EstadisticasActivos({
  totalActivos,
  asignados,
  disponibles,
  requierenAtencion,
  valorTotal,
  incompletos,
  dadosDeBaja,
}: EstadisticasActivosProps) {
  const notaTotal = [
    incompletos > 0 ? `${formatCantidad(incompletos)} sin clasificar` : null,
    dadosDeBaja > 0 ? `${formatCantidad(dadosDeBaja)} de baja` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section aria-labelledby="resumen-activos">
      <h2
        id="resumen-activos"
        className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-3"
      >
        Resumen
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Activos"
          valor={formatCantidad(totalActivos)}
          icono={<IconWrench className="w-4 h-4" />}
          acento="text-white"
          nota={notaTotal || undefined}
        />
        <Kpi
          label="En uso"
          valor={formatCantidad(asignados)}
          icono={<IconUser className="w-4 h-4" />}
          acento="text-sky-200"
          nota="Con responsable asignado"
        />
        <Kpi
          label="Disponibles"
          valor={formatCantidad(disponibles)}
          icono={<IconWrench className="w-4 h-4" />}
          acento="text-emerald-200"
          nota="Listos para entregar"
        />
        <Kpi
          label="Requieren atención"
          valor={formatCantidad(requierenAtencion)}
          icono={<IconAlert className="w-4 h-4" />}
          acento={requierenAtencion > 0 ? 'text-amber-300' : 'text-white/70'}
          nota="Fallas o vencimientos"
        />
      </div>

      {valorTotal > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-white/5 ring-1 ring-white/10 px-4 sm:px-5 py-3">
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/60">
            <IconCoins className="w-4 h-4" />
            Valor de adquisición
          </span>
          <span
            className="text-lg font-semibold text-white tabular-nums"
            title={formatMoneda(valorTotal)}
          >
            {formatMonedaCompacta(valorTotal)}
          </span>
          <span className="w-full text-xs text-white/45 sm:w-auto">
            Excluye activos dados de baja
          </span>
        </div>
      )}
    </section>
  );
}

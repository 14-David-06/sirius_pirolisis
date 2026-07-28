/**
 * Activos que requieren atención, en una sola lista priorizada.
 *
 * Antes eran dos tarjetas independientes con scroll propio ("por vencer" y "en
 * reparación"), lo que obligaba a mirar en dos sitios y escondía el resto de
 * motivos. Aquí el orden es el de urgencia operativa: lo vencido primero, lo
 * roto después, y al final lo que solo hay que programar.
 */

import {
  clasificarVencimiento,
  formatDias,
  formatFecha,
  VENCIMIENTO_UI,
  estiloEstado,
} from '@/lib/activos.format';
import type { ActivoFijoRecord } from '@/types/activos';
import { IconAlert, IconChevron } from './Icons';

type MotivoAlerta = 'vencido' | 'critico' | 'proximo' | 'no_operable' | 'mantenimiento';

interface AlertasActivosProps {
  vencidos: ActivoFijoRecord[];
  porVencer: ActivoFijoRecord[];
  /** En reparación o fuera de servicio. */
  noOperables: ActivoFijoRecord[];
  mantenimientosProximos: ActivoFijoRecord[];
  diasAlerta: number;
  getActivoNombre: (record: ActivoFijoRecord) => string;
  getActivoCodigo: (record: ActivoFijoRecord) => string;
  getActivoEstado: (record: ActivoFijoRecord) => string;
  getActivoDiasVencimiento: (record: ActivoFijoRecord) => number | null;
  getActivoProximoMantenimiento: (record: ActivoFijoRecord) => string | null;
  onVerDetalle: (activo: ActivoFijoRecord) => void;
}

const PRIORIDAD: Record<MotivoAlerta, number> = {
  vencido: 0,
  critico: 1,
  no_operable: 2,
  proximo: 3,
  mantenimiento: 4,
};

export default function AlertasActivos({
  vencidos,
  porVencer,
  noOperables,
  mantenimientosProximos,
  diasAlerta,
  getActivoNombre,
  getActivoCodigo,
  getActivoEstado,
  getActivoDiasVencimiento,
  getActivoProximoMantenimiento,
  onVerDetalle,
}: AlertasActivosProps) {
  // Un mismo activo puede caer en varias listas (vencido y en reparación); se
  // queda con el motivo más urgente para no aparecer repetido.
  const porActivo = new Map<string, { activo: ActivoFijoRecord; motivo: MotivoAlerta }>();

  const registrar = (activo: ActivoFijoRecord, motivo: MotivoAlerta) => {
    const previo = porActivo.get(activo.id);
    if (!previo || PRIORIDAD[motivo] < PRIORIDAD[previo.motivo]) {
      porActivo.set(activo.id, { activo, motivo });
    }
  };

  vencidos.forEach((activo) => registrar(activo, 'vencido'));
  porVencer.forEach((activo) => {
    const nivel = clasificarVencimiento(getActivoDiasVencimiento(activo), diasAlerta);
    registrar(activo, nivel === 'critico' ? 'critico' : 'proximo');
  });
  noOperables.forEach((activo) => registrar(activo, 'no_operable'));
  mantenimientosProximos.forEach((activo) => registrar(activo, 'mantenimiento'));

  const items = [...porActivo.values()].sort(
    (a, b) => PRIORIDAD[a.motivo] - PRIORIDAD[b.motivo]
  );

  if (items.length === 0) return null;

  const detalle = (activo: ActivoFijoRecord, motivo: MotivoAlerta) => {
    if (motivo === 'no_operable') {
      const ui = estiloEstado(getActivoEstado(activo));
      return { valor: ui.label, nota: 'Fuera de operación', clase: ui.texto };
    }
    if (motivo === 'mantenimiento') {
      return {
        valor: formatFecha(getActivoProximoMantenimiento(activo)),
        nota: 'Mantenimiento programado',
        clase: 'text-amber-200',
      };
    }
    const dias = getActivoDiasVencimiento(activo);
    const ui = VENCIMIENTO_UI[motivo === 'vencido' ? 'vencido' : motivo];
    return {
      valor: motivo === 'vencido' ? `Venció ${formatDias(dias)}` : `Vence en ${formatDias(dias)}`,
      nota: formatFecha(activo.fields.fechaVencimiento as string | null),
      clase: ui.texto,
    };
  };

  return (
    <section
      aria-labelledby="alertas-activos"
      className="rounded-xl bg-amber-500/10 ring-1 ring-amber-400/25 p-4 sm:p-5"
    >
      <h2
        id="alertas-activos"
        className="flex items-center gap-2 text-base font-semibold text-white"
      >
        <IconAlert className="w-5 h-5 text-amber-300" />
        Requieren atención
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-normal text-amber-100 tabular-nums">
          {items.length}
        </span>
      </h2>

      <ul className="mt-3 divide-y divide-white/10">
        {items.map(({ activo, motivo }) => {
          const info = detalle(activo, motivo);

          return (
            <li key={activo.id}>
              <button
                type="button"
                onClick={() => onVerDetalle(activo)}
                className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-left transition-colors duration-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/70 cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block font-medium leading-snug text-white">
                    {getActivoNombre(activo)}
                  </span>
                  <span className="block text-xs text-white/50 tabular-nums">
                    {getActivoCodigo(activo) || 'Sin código'}
                  </span>
                </span>

                <span className="flex items-center gap-2 text-right">
                  <span>
                    <span className={`block font-semibold tabular-nums ${info.clase}`}>
                      {info.valor}
                    </span>
                    <span className="block text-xs text-white/50">{info.nota}</span>
                  </span>
                  <IconChevron className="w-4 h-4 shrink-0 text-white/30" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

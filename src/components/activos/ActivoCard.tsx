/**
 * Tarjeta de un activo. Se usa en la vista móvil del listado, donde una tabla de
 * seis columnas no cabe.
 *
 * La versión anterior estaba pintada para fondo claro (`bg-white`,
 * `text-gray-900`) sobre una página oscura, y construía clases dinámicas
 * (`bg-${color}-100`) que Tailwind nunca genera: los colores de estado
 * simplemente no se aplicaban.
 */

import { ASIGNACION_UI, estiloEstado } from '@/lib/activos.format';
import type { ActivoFijoRecord, ActivoGetters } from '@/types/activos';
import { IconChevron, IconMapPin, IconUser } from './Icons';

interface ActivoCardProps extends ActivoGetters {
  activo: ActivoFijoRecord;
  onVerDetalle: (activo: ActivoFijoRecord) => void;
}

export default function ActivoCard({
  activo,
  onVerDetalle,
  getActivoNombre,
  getActivoCodigo,
  getActivoCategorias,
  getActivoEstado,
  getActivoUbicacion,
  getActivoResponsable,
  getActivoEstaAsignado,
  getActivoEstaCompleto,
}: ActivoCardProps) {
  const estado = estiloEstado(getActivoEstado(activo));
  const asignado = getActivoEstaAsignado(activo);
  const asignacion = asignado ? ASIGNACION_UI.asignado : ASIGNACION_UI.disponible;
  const codigo = getActivoCodigo(activo);
  const ubicacion = getActivoUbicacion(activo);
  const categorias = getActivoCategorias(activo);

  return (
    <article className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <button
        type="button"
        onClick={() => onVerDetalle(activo)}
        className="flex w-full flex-col gap-3 p-4 text-left transition-colors duration-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/70 cursor-pointer"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-medium leading-snug text-white">{getActivoNombre(activo)}</h4>
            {codigo && <p className="mt-0.5 text-xs text-white/45 tabular-nums">{codigo}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${estado.badge}`}>
            {estado.label}
          </span>
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Asignación</dt>
            <dd className={`flex items-center gap-1.5 ${asignacion.texto}`}>
              <IconUser className="w-4 h-4 shrink-0" />
              {asignado ? getActivoResponsable(activo) : 'Disponible'}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Ubicación</dt>
            <dd className="flex items-center gap-1.5 text-white/60">
              <IconMapPin className="w-4 h-4 shrink-0" />
              {ubicacion || 'Sin ubicación'}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <p className="text-xs text-white/45">
            {categorias.length > 0 ? categorias.join(' · ') : 'Sin clasificar'}
          </p>
          <span className="flex items-center gap-1 text-xs text-white/60">
            Ver detalle
            <IconChevron className="w-3.5 h-3.5" />
          </span>
        </div>

        {!getActivoEstaCompleto(activo) && (
          <p className="rounded-lg bg-orange-500/10 ring-1 ring-orange-400/25 px-2.5 py-1.5 text-xs text-orange-100">
            Falta tipo o ubicación
          </p>
        )}
      </button>
    </article>
  );
}

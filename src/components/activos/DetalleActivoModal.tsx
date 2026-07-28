/**
 * Detalle de un activo, con cambio rápido de estado y accesos a las acciones.
 *
 * Dos cosas que la versión anterior hacía mal:
 *  - mutaba las props (`fields['Estado Operativo'] = …`) para "refrescar" la
 *    vista, lo que dejaba la UI y Airtable desincronizados si el PATCH fallaba
 *    a medias. Ahora se recarga el listado y el estado se muestra optimista solo
 *    tras confirmar la respuesta.
 *  - se cerraba únicamente con el botón: no respondía a Escape ni marcaba el
 *    contenido como diálogo.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { cambiarEstadoActivo, reactivarActivo } from '@/lib/activos.client';
import { ESTADOS_OPERATIVO, MENSAJES } from '@/lib/activos.constants';
import {
  ASIGNACION_UI,
  clasificarVencimiento,
  estiloEstado,
  formatDias,
  formatFecha,
  formatMoneda,
  VENCIMIENTO_UI,
} from '@/lib/activos.format';
import { DIAS_ALERTA_VENCIMIENTO } from '@/lib/activos.constants';
import type { AccionActivo, ActivoFijoRecord, EstadoOperativo } from '@/types/activos';
import { Select } from './FormFields';
import {
  IconArchive,
  IconCheck,
  IconHistory,
  IconPencil,
  IconRotate,
  IconUndo,
  IconUserPlus,
  IconX,
} from './Icons';

interface DetalleActivoModalProps {
  activo: ActivoFijoRecord;
  onClose: () => void;
  /** Recarga el listado tras una mutación. */
  onRefresh: () => Promise<void> | void;
  onAccion: (activo: ActivoFijoRecord, accion: AccionActivo) => void;
  onMensaje: (mensaje: string) => void;
}

function Dato({
  etiqueta,
  children,
  className = '',
}: {
  etiqueta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-white/45">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm text-white">{children}</dd>
    </div>
  );
}

export default function DetalleActivoModal({
  activo,
  onClose,
  onRefresh,
  onAccion,
  onMensaje,
}: DetalleActivoModalProps) {
  const f = activo.fields;
  const estadoActual = (f.estado as EstadoOperativo) || 'Operativo';

  const [editandoEstado, setEditandoEstado] = useState(false);
  const [estadoNuevo, setEstadoNuevo] = useState<EstadoOperativo>(estadoActual);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  // Escape cierra el diálogo; el foco entra en el botón de cierre.
  useEffect(() => {
    cerrarRef.current?.focus();

    const alPulsar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  const asignado = Boolean(f.asignado);
  const deBaja = estadoActual === 'Dado de Baja';
  const estado = estiloEstado(estadoActual);
  const asignacion = asignado ? ASIGNACION_UI.asignado : ASIGNACION_UI.disponible;
  const nivelVencimiento = clasificarVencimiento(
    f.diasVencimiento as number | null,
    DIAS_ALERTA_VENCIMIENTO
  );

  const guardarEstado = async () => {
    if (estadoNuevo === estadoActual) {
      setEditandoEstado(false);
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      await cambiarEstadoActivo(activo.id, estadoNuevo);
      setEditandoEstado(false);
      await onRefresh();
      onMensaje(MENSAJES.EXITO.ESTADO_ACTUALIZADO);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el estado');
    } finally {
      setGuardando(false);
    }
  };

  const reactivar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await reactivarActivo(activo.id);
      await onRefresh();
      onMensaje(MENSAJES.EXITO.ACTIVO_REACTIVADO);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al reactivar el activo');
    } finally {
      setGuardando(false);
    }
  };

  const acciones: Array<{ etiqueta: string; icono: React.ReactNode; onClick: () => void }> = [
    {
      etiqueta: 'Editar',
      icono: <IconPencil className="w-4 h-4" />,
      onClick: () => onAccion(activo, 'editar'),
    },
  ];

  if (!deBaja) {
    acciones.push(
      asignado
        ? {
            etiqueta: 'Registrar devolución',
            icono: <IconUndo className="w-4 h-4" />,
            onClick: () => onAccion(activo, 'devolver'),
          }
        : {
            etiqueta: 'Asignar',
            icono: <IconUserPlus className="w-4 h-4" />,
            onClick: () => onAccion(activo, 'asignar'),
          }
    );
    acciones.push({
      etiqueta: 'Dar de baja',
      icono: <IconArchive className="w-4 h-4" />,
      onClick: () => onAccion(activo, 'baja'),
    });
  } else {
    acciones.push({
      etiqueta: 'Reactivar',
      icono: <IconRotate className="w-4 h-4" />,
      onClick: reactivar,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detalle-activo-titulo"
    >
      <div className="my-auto w-full max-w-2xl overflow-hidden rounded-xl bg-slate-900/95 ring-1 ring-white/15 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/50 tabular-nums">
              {String(f.codigo || 'Sin código')}
            </p>
            <h2 id="detalle-activo-titulo" className="mt-1 text-lg font-semibold text-white">
              {String(f.nombre || 'Sin nombre')}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs ${estado.badge}`}>
                {estado.label}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${asignacion.badge}`}>
                {asignado ? `Asignado a ${String(f.responsable)}` : 'Disponible'}
              </span>
              {nivelVencimiento !== 'sin_fecha' && nivelVencimiento !== 'vigente' && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${VENCIMIENTO_UI[nivelVencimiento].badge}`}
                >
                  {VENCIMIENTO_UI[nivelVencimiento].label}
                </span>
              )}
            </div>
          </div>

          <button
            ref={cerrarRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1.5 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-rose-500/10 ring-1 ring-rose-400/25 px-4 py-3 text-sm text-rose-100"
            >
              {error}
            </div>
          )}

          {!f.completo && (
            <div className="rounded-lg bg-orange-500/10 ring-1 ring-orange-400/25 px-4 py-3 text-sm text-orange-100">
              Faltan datos de clasificación ({!f.tipoIds || (f.tipoIds as string[]).length === 0 ? 'tipo' : ''}
              {(!f.tipoIds || (f.tipoIds as string[]).length === 0) && !f.ubicacionId ? ' y ' : ''}
              {!f.ubicacionId ? 'ubicación' : ''}). Complétalos con «Editar» para que el activo entre
              en las categorías y los reportes.
            </div>
          )}

          {/* Cambio rápido de estado */}
          <section className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/50">
                Estado operativo
              </h3>
              {!editandoEstado && !deBaja && (
                <button
                  type="button"
                  onClick={() => {
                    setEstadoNuevo(estadoActual);
                    setEditandoEstado(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-xs text-white/80 transition-colors duration-200 hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
                >
                  <IconPencil className="w-3.5 h-3.5" />
                  Cambiar
                </button>
              )}
            </div>

            {editandoEstado ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1">
                  <label
                    htmlFor="detalle-estado"
                    className="block text-xs font-medium text-white/60 mb-1"
                  >
                    Nuevo estado
                  </label>
                  <Select
                    id="detalle-estado"
                    value={estadoNuevo}
                    disabled={guardando}
                    onChange={(event) => setEstadoNuevo(event.target.value as EstadoOperativo)}
                  >
                    {ESTADOS_OPERATIVO.filter((opcion) => opcion !== 'Dado de Baja').map((opcion) => (
                      <option key={opcion} value={opcion} className="bg-slate-800">
                        {estiloEstado(opcion).label}
                      </option>
                    ))}
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={guardarEstado}
                  disabled={guardando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  <IconCheck className="w-4 h-4" />
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditandoEstado(false)}
                  disabled={guardando}
                  className="rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:opacity-60 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <p className={`mt-2 text-sm ${estado.texto}`}>
                {estado.label}
                {deBaja && (
                  <span className="ml-2 text-white/50">
                    · usa «Reactivar» para devolverlo al parque
                  </span>
                )}
              </p>
            )}
          </section>

          {/* Clasificación y ubicación */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              Clasificación y ubicación
            </h3>
            <dl className="grid gap-3 rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:grid-cols-2">
              <Dato etiqueta="Tipo">
                {(f.tipos as string[])?.join(' · ') || <span className="text-white/40">—</span>}
              </Dato>
              <Dato etiqueta="Categoría">
                {(f.categorias as string[])?.join(' · ') || <span className="text-white/40">—</span>}
              </Dato>
              <Dato etiqueta="Ubicación">
                {String(f.ubicacion || '') || <span className="text-white/40">—</span>}
              </Dato>
              <Dato etiqueta="Área responsable">
                {String(f.area || '') || <span className="text-white/40">—</span>}
              </Dato>
              {Boolean(f.descripcion) && (
                <Dato etiqueta="Descripción" className="sm:col-span-2">
                  {String(f.descripcion)}
                </Dato>
              )}
            </dl>
          </section>

          {/* Identificación */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              Identificación
            </h3>
            <dl className="grid gap-3 rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:grid-cols-3">
              <Dato etiqueta="Número de serie">
                <span className="tabular-nums">
                  {String(f.numeroSerie || '') || <span className="text-white/40">—</span>}
                </span>
              </Dato>
              <Dato etiqueta="Marca">
                {String(f.marca || '') || <span className="text-white/40">—</span>}
              </Dato>
              <Dato etiqueta="Modelo">
                {String(f.modelo || '') || <span className="text-white/40">—</span>}
              </Dato>
            </dl>
          </section>

          {/* Adquisición */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              Adquisición
            </h3>
            <dl className="grid gap-3 rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:grid-cols-3">
              <Dato etiqueta="Fecha">{formatFecha(f.fechaAdquisicion as string | null)}</Dato>
              <Dato etiqueta="Valor">
                <span className="tabular-nums">
                  {f.valorAdquisicion ? formatMoneda(Number(f.valorAdquisicion)) : '—'}
                </span>
              </Dato>
              <Dato etiqueta="Proveedor">
                {String(f.proveedor || '') || <span className="text-white/40">—</span>}
              </Dato>
              {Boolean(f.vidaUtil) && (
                <Dato etiqueta="Vida útil">{`${f.vidaUtil} años`}</Dato>
              )}
              {Boolean(f.anioBaja) && <Dato etiqueta="Baja estimada">{String(f.anioBaja)}</Dato>}
            </dl>
          </section>

          {/* Control */}
          {(f.fechaVencimiento || f.proximoMantenimiento) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
                Control
              </h3>
              <dl className="grid gap-3 rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:grid-cols-2">
                {Boolean(f.fechaVencimiento) && (
                  <Dato etiqueta="Vencimiento">
                    <span className={VENCIMIENTO_UI[nivelVencimiento].texto}>
                      {formatFecha(f.fechaVencimiento as string)}
                      {typeof f.diasVencimiento === 'number' && (
                        <span className="ml-1 text-xs">
                          (
                          {(f.diasVencimiento as number) < 0 ? 'venció ' : 'en '}
                          {formatDias(f.diasVencimiento as number)})
                        </span>
                      )}
                    </span>
                  </Dato>
                )}
                {Boolean(f.proximoMantenimiento) && (
                  <Dato etiqueta="Próximo mantenimiento">
                    {formatFecha(f.proximoMantenimiento as string)}
                  </Dato>
                )}
              </dl>
            </section>
          )}

          {/* Trazabilidad */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              <IconHistory className="w-4 h-4" />
              Trazabilidad
            </h3>
            <dl className="grid gap-3 rounded-xl bg-white/5 ring-1 ring-white/10 p-4 sm:grid-cols-2">
              <Dato etiqueta="Asignaciones registradas">
                <span className="tabular-nums">{Number(f.totalAsignaciones || 0)}</span>
              </Dato>
              <Dato etiqueta="Eventos en hoja de vida">
                <span className="tabular-nums">{Number(f.totalEventos || 0)}</span>
              </Dato>
              <Dato etiqueta="Última asignación">
                {formatFecha(f.ultimaAsignacion as string | null)}
              </Dato>
              <Dato etiqueta="Última devolución">
                {formatFecha(f.ultimaDevolucion as string | null)}
              </Dato>
            </dl>
          </section>

          {Boolean(f.notas) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
                Notas
              </h3>
              <p className="whitespace-pre-wrap rounded-xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-white/80">
                {String(f.notas)}
              </p>
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          {acciones.map(({ etiqueta, icono, onClick }) => (
            <button
              key={etiqueta}
              type="button"
              onClick={onClick}
              disabled={guardando}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white/85 transition-colors duration-200 hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {icono}
              {etiqueta}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

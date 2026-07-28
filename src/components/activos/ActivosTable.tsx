/**
 * Listado de activos: buscador, filtros y activos agrupados por categoría.
 *
 * Presentación por ancho de pantalla:
 *  - ≥ md: tabla (comparar estado, ubicación y responsable de un vistazo)
 *  - < md: tarjetas (una tabla de 6 columnas no cabe en un móvil)
 *
 * Los filtros son controlados por la página (fuente única de verdad). Antes este
 * componente tenía su propio estado de filtros ADEMÁS del de la página: la
 * búsqueda filtraba localmente y categoría/estado provocaban una consulta nueva
 * a Airtable, así que ambos criterios no se combinaban.
 */

'use client';

import { useState } from 'react';
import { ASIGNACION_UI, estiloEstado, formatCantidad } from '@/lib/activos.format';
import { ESTADOS_OPERATIVO } from '@/lib/activos.constants';
import type {
  AccionActivo,
  ActivoFijoRecord,
  ActivoGetters,
  EstadoOperativo,
  FiltroAsignacion,
} from '@/types/activos';
import ActivoCard from './ActivoCard';
import {
  IconArchive,
  IconChevron,
  IconInbox,
  IconPencil,
  IconRotate,
  IconSearch,
  IconUndo,
  IconUserPlus,
  IconX,
} from './Icons';

interface ActivosTableProps extends ActivoGetters {
  /** Activos ya filtrados y agrupados por categoría. */
  categorias: Record<string, ActivoFijoRecord[]>;
  categoriasDisponibles: string[];
  ubicacionesDisponibles: string[];
  filtroCategoria: string;
  filtroEstado: EstadoOperativo | '';
  filtroUbicacion: string;
  filtroAsignacion: FiltroAsignacion;
  busqueda: string;
  onFiltroCategoriaChange: (categoria: string) => void;
  onFiltroEstadoChange: (estado: EstadoOperativo | '') => void;
  onFiltroUbicacionChange: (ubicacion: string) => void;
  onFiltroAsignacionChange: (asignacion: FiltroAsignacion) => void;
  onBusquedaChange: (texto: string) => void;
  /** Total de activos sin filtrar, para el contador "X de Y". */
  totalSinFiltrar: number;
  onAccion: (activo: ActivoFijoRecord, accion: AccionActivo) => void;
}

const selectClass =
  'w-full rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white ' +
  'transition-colors duration-200 hover:bg-white/15 ' +
  'focus:outline-none focus:ring-2 focus:ring-sky-400/70 cursor-pointer';

const botonAccion =
  'rounded-lg p-1.5 text-white/50 transition-colors duration-200 hover:bg-white/10 ' +
  'hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer';

export default function ActivosTable({
  categorias,
  categoriasDisponibles,
  ubicacionesDisponibles,
  filtroCategoria,
  filtroEstado,
  filtroUbicacion,
  filtroAsignacion,
  busqueda,
  onFiltroCategoriaChange,
  onFiltroEstadoChange,
  onFiltroUbicacionChange,
  onFiltroAsignacionChange,
  onBusquedaChange,
  totalSinFiltrar,
  onAccion,
  ...getters
}: ActivosTableProps) {
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());

  const {
    getActivoNombre,
    getActivoCodigo,
    getActivoTipos,
    getActivoEstado,
    getActivoUbicacion,
    getActivoResponsable,
    getActivoEstaAsignado,
  } = getters;

  const hayFiltros = Boolean(
    filtroCategoria || filtroEstado || filtroUbicacion || filtroAsignacion || busqueda
  );
  const grupos = Object.entries(categorias);
  const totalVisible = grupos.reduce((suma, [, activos]) => suma + activos.length, 0);

  const toggleCategoria = (categoria: string) => {
    setColapsadas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(categoria)) siguiente.delete(categoria);
      else siguiente.add(categoria);
      return siguiente;
    });
  };

  const limpiarFiltros = () => {
    onFiltroCategoriaChange('');
    onFiltroEstadoChange('');
    onFiltroUbicacionChange('');
    onFiltroAsignacionChange('');
    onBusquedaChange('');
  };

  /** Acciones disponibles según el estado del activo. */
  const accionesDe = (activo: ActivoFijoRecord) => {
    const estado = getActivoEstado(activo);
    const asignado = getActivoEstaAsignado(activo);
    const deBaja = estado === 'Dado de Baja';
    const nombre = getActivoNombre(activo);

    const acciones: Array<{ accion: AccionActivo; etiqueta: string; icono: React.ReactNode }> = [
      { accion: 'editar', etiqueta: `Editar ${nombre}`, icono: <IconPencil className="w-4 h-4" /> },
    ];

    if (!deBaja) {
      acciones.push(
        asignado
          ? {
              accion: 'devolver',
              etiqueta: `Registrar devolución de ${nombre}`,
              icono: <IconUndo className="w-4 h-4" />,
            }
          : {
              accion: 'asignar',
              etiqueta: `Asignar ${nombre}`,
              icono: <IconUserPlus className="w-4 h-4" />,
            }
      );
    }

    acciones.push(
      deBaja
        ? {
            accion: 'editar',
            etiqueta: `Reactivar ${nombre}`,
            icono: <IconRotate className="w-4 h-4" />,
          }
        : {
            accion: 'baja',
            etiqueta: `Dar de baja ${nombre}`,
            icono: <IconArchive className="w-4 h-4" />,
          }
    );

    return acciones;
  };

  return (
    <section aria-labelledby="listado-activos" className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 sm:px-5 pt-5 pb-4">
        <h2 id="listado-activos" className="text-base font-semibold text-white">
          Activos por categoría
        </h2>
        <p className="text-sm text-white/50 tabular-nums">
          {hayFiltros
            ? `${formatCantidad(totalVisible)} de ${formatCantidad(totalSinFiltrar)} activos`
            : `${formatCantidad(totalVisible)} activos`}
        </p>
      </header>

      {/* Buscador y filtros */}
      <div className="grid gap-3 px-4 sm:px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:items-end">
        <div className="xl:col-span-1">
          <label htmlFor="act-busqueda" className="block text-xs font-medium text-white/60 mb-1">
            Buscar
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
              <IconSearch className="w-4 h-4" />
            </span>
            <input
              id="act-busqueda"
              type="search"
              value={busqueda}
              onChange={(event) => onBusquedaChange(event.target.value)}
              placeholder="Nombre, código, serie, responsable…"
              className="w-full rounded-lg bg-white/10 ring-1 ring-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder-white/40 transition-colors duration-200 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-sky-400/70"
            />
          </div>
        </div>

        <div>
          <label htmlFor="act-categoria" className="block text-xs font-medium text-white/60 mb-1">
            Categoría
          </label>
          <select
            id="act-categoria"
            value={filtroCategoria}
            onChange={(event) => onFiltroCategoriaChange(event.target.value)}
            className={selectClass}
          >
            <option value="" className="bg-slate-800">
              Todas
            </option>
            {categoriasDisponibles.map((categoria) => (
              <option key={categoria} value={categoria} className="bg-slate-800">
                {categoria}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="act-estado" className="block text-xs font-medium text-white/60 mb-1">
            Estado
          </label>
          <select
            id="act-estado"
            value={filtroEstado}
            onChange={(event) => onFiltroEstadoChange(event.target.value as EstadoOperativo | '')}
            className={selectClass}
          >
            <option value="" className="bg-slate-800">
              Todos
            </option>
            {ESTADOS_OPERATIVO.map((estado) => (
              <option key={estado} value={estado} className="bg-slate-800">
                {estiloEstado(estado).label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="act-ubicacion" className="block text-xs font-medium text-white/60 mb-1">
            Ubicación
          </label>
          <select
            id="act-ubicacion"
            value={filtroUbicacion}
            onChange={(event) => onFiltroUbicacionChange(event.target.value)}
            className={selectClass}
          >
            <option value="" className="bg-slate-800">
              Todas
            </option>
            {ubicacionesDisponibles.map((ubicacion) => (
              <option key={ubicacion} value={ubicacion} className="bg-slate-800">
                {ubicacion}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="act-asignacion" className="block text-xs font-medium text-white/60 mb-1">
            Asignación
          </label>
          <select
            id="act-asignacion"
            value={filtroAsignacion}
            onChange={(event) => onFiltroAsignacionChange(event.target.value as FiltroAsignacion)}
            className={selectClass}
          >
            <option value="" className="bg-slate-800">
              Todos
            </option>
            <option value="asignados" className="bg-slate-800">
              En uso
            </option>
            <option value="disponibles" className="bg-slate-800">
              Sin responsable
            </option>
          </select>
        </div>

        {hayFiltros && (
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-5">
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/70 cursor-pointer"
            >
              <IconX className="w-4 h-4" />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Resultados */}
      {grupos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
          <IconInbox className="w-10 h-10 text-white/30" />
          <div>
            <p className="font-medium text-white/80">Sin resultados</p>
            <p className="mt-1 text-sm text-white/50">
              {hayFiltros
                ? 'Ningún activo coincide con los filtros aplicados.'
                : 'Todavía no hay activos registrados.'}
            </p>
          </div>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="mt-1 rounded-lg bg-white/10 ring-1 ring-white/15 px-4 py-2 text-sm text-white transition-colors duration-200 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/70 cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-white/10 border-t border-white/10">
          {grupos.map(([categoria, activos]) => {
            const colapsada = colapsadas.has(categoria);
            const idPanel = `grupo-activos-${categoria.replace(/\s+/g, '-').toLowerCase()}`;

            return (
              <div key={categoria}>
                <h3>
                  <button
                    type="button"
                    onClick={() => toggleCategoria(categoria)}
                    aria-expanded={!colapsada}
                    aria-controls={idPanel}
                    className="flex w-full items-center gap-2 px-4 sm:px-5 py-3 text-left transition-colors duration-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/70 cursor-pointer"
                  >
                    <IconChevron
                      className={`w-4 h-4 shrink-0 text-white/50 transition-transform duration-200 motion-reduce:transition-none ${
                        colapsada ? '' : 'rotate-90'
                      }`}
                    />
                    <span className="font-medium text-white">{categoria}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60 tabular-nums">
                      {formatCantidad(activos.length)}
                    </span>
                  </button>
                </h3>

                {!colapsada && (
                  <div id={idPanel}>
                    {/* Tabla — desde md */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <caption className="sr-only">Activos de la categoría {categoria}</caption>
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wider text-white/45">
                            <th scope="col" className="py-2 pl-11 pr-3 font-medium">
                              Activo
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Código
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Estado
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Ubicación
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Responsable
                            </th>
                            <th scope="col" className="pl-3 pr-5 py-2 font-medium text-right">
                              Acciones
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {activos.map((activo) => {
                            const estado = estiloEstado(getActivoEstado(activo));
                            const asignado = getActivoEstaAsignado(activo);
                            const asignacion = asignado
                              ? ASIGNACION_UI.asignado
                              : ASIGNACION_UI.disponible;
                            const tipos = getActivoTipos(activo);
                            const ubicacion = getActivoUbicacion(activo);

                            return (
                              <tr
                                key={activo.id}
                                className="border-t border-white/5 transition-colors duration-200 hover:bg-white/5"
                              >
                                <th scope="row" className="py-2.5 pl-11 pr-3 text-left font-normal">
                                  <button
                                    type="button"
                                    onClick={() => onAccion(activo, 'detalle')}
                                    className="text-left text-white transition-colors duration-200 hover:text-sky-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 rounded cursor-pointer"
                                  >
                                    {getActivoNombre(activo)}
                                  </button>
                                  {tipos.length > 0 ? (
                                    <span className="ml-2 text-xs text-white/40">
                                      · {tipos.join(' · ')}
                                    </span>
                                  ) : (
                                    <span className="ml-2 text-xs text-orange-200/80">
                                      · sin tipo
                                    </span>
                                  )}
                                </th>
                                <td className="px-3 py-2.5 whitespace-nowrap text-white/50 tabular-nums">
                                  {getActivoCodigo(activo) || '—'}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span
                                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${estado.badge}`}
                                  >
                                    {estado.label}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-white/60">
                                  {ubicacion || (
                                    <span className="text-orange-200/80">Sin ubicación</span>
                                  )}
                                </td>
                                <td className={`px-3 py-2.5 ${asignacion.texto}`}>
                                  {asignado ? getActivoResponsable(activo) : 'Disponible'}
                                </td>
                                <td className="pl-3 pr-5 py-2.5">
                                  <div className="flex items-center justify-end gap-0.5">
                                    {accionesDe(activo).map(({ accion, etiqueta, icono }) => (
                                      <button
                                        key={etiqueta}
                                        type="button"
                                        onClick={() => onAccion(activo, accion)}
                                        title={etiqueta}
                                        aria-label={etiqueta}
                                        className={botonAccion}
                                      >
                                        {icono}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Tarjetas — hasta md */}
                    <ul className="md:hidden grid grid-cols-1 gap-3 px-4 pb-4">
                      {activos.map((activo) => (
                        <li key={activo.id}>
                          <ActivoCard
                            activo={activo}
                            onVerDetalle={(seleccionado) => onAccion(seleccionado, 'detalle')}
                            {...getters}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Listado de inventario: buscador, filtro de estado e insumos en una sola lista.
 *
 * SIN CATEGORÍAS (2026-07-28): antes los insumos se agrupaban en acordeones por
 * categoría. Con ~26 consumibles ese nivel de navegación solo escondía datos, así
 * que ahora es una lista plana en orden alfabético.
 *
 * Presentación por ancho de pantalla:
 *  - ≥ md: tabla (alineación por columnas, cifras comparables de un vistazo)
 *  - < md: tarjetas (una tabla de 5 columnas no cabe en un móvil)
 */

"use client";

import ItemCard from './ItemCard';
import { IconInbox, IconSearch, IconX } from './Icons';
import { ESTADOS_INSUMO } from '@/lib/inventario.constants';
import { ESTADO_STOCK_UI, formatCantidad } from '@/lib/inventario.format';
import type { EstadoInsumo, InventarioItemGetters, InventarioRecord } from '@/types/inventario';

interface InventarioTableProps extends InventarioItemGetters {
  /** Insumos ya filtrados y ordenados alfabéticamente. */
  items: InventarioRecord[];
  filtroEstado: EstadoInsumo | '';
  busqueda: string;
  onFiltroEstadoChange: (estado: EstadoInsumo | '') => void;
  onBusquedaChange: (texto: string) => void;
  /** Total de insumos sin filtrar, para el contador "X de Y". */
  totalSinFiltrar: number;
}

const selectClass =
  'w-full rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white ' +
  'transition-colors duration-200 hover:bg-white/15 ' +
  'focus:outline-none focus:ring-2 focus:ring-sky-400/70 cursor-pointer';

export default function InventarioTable({
  items,
  filtroEstado,
  busqueda,
  onFiltroEstadoChange,
  onBusquedaChange,
  totalSinFiltrar,
  getItemName,
  getItemCodigo,
  getItemStockTotal,
  getMinStock,
  getItemUnit,
  getItemEstado,
  getItemMovimientos,
}: InventarioTableProps) {
  const hayFiltros = Boolean(filtroEstado || busqueda);

  const limpiarFiltros = () => {
    onFiltroEstadoChange('');
    onBusquedaChange('');
  };

  const getterProps: InventarioItemGetters = {
    getItemName,
    getItemCodigo,
    getItemStockTotal,
    getMinStock,
    getItemUnit,
    getItemEstado,
    getItemMovimientos,
  };

  return (
    <section aria-labelledby="listado-inventario" className="rounded-xl bg-white/5 ring-1 ring-white/10">
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 sm:px-5 pt-5 pb-4">
        <h2 id="listado-inventario" className="text-base font-semibold text-white">
          Insumos
        </h2>
        <p className="text-sm text-white/50 tabular-nums">
          {hayFiltros
            ? `${formatCantidad(items.length)} de ${formatCantidad(totalSinFiltrar)} insumos`
            : `${formatCantidad(items.length)} insumos`}
        </p>
      </header>

      {/* Buscador y filtros */}
      <div className="grid gap-3 px-4 sm:px-5 pb-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label htmlFor="inv-busqueda" className="block text-xs font-medium text-white/60 mb-1">
            Buscar
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
              <IconSearch className="w-4 h-4" />
            </span>
            <input
              id="inv-busqueda"
              type="search"
              value={busqueda}
              onChange={(e) => onBusquedaChange(e.target.value)}
              placeholder="Nombre o código…"
              className="w-full rounded-lg bg-white/10 ring-1 ring-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder-white/40 transition-colors duration-200 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-sky-400/70"
            />
          </div>
        </div>

        <div>
          <label htmlFor="inv-estado" className="block text-xs font-medium text-white/60 mb-1">
            Estado
          </label>
          <select
            id="inv-estado"
            value={filtroEstado}
            onChange={(e) => onFiltroEstadoChange(e.target.value as EstadoInsumo | '')}
            className={selectClass}
          >
            <option value="" className="bg-slate-800">Todos</option>
            {ESTADOS_INSUMO.map((estado) => (
              <option key={estado.value} value={estado.value} className="bg-slate-800">
                {estado.label}
              </option>
            ))}
          </select>
        </div>

        {hayFiltros && (
          <button
            type="button"
            onClick={limpiarFiltros}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 ring-1 ring-white/15 px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/20 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/70 cursor-pointer"
          >
            <IconX className="w-4 h-4" />
            Limpiar
          </button>
        )}
      </div>

      {/* Resultados */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
          <IconInbox className="w-10 h-10 text-white/30" />
          <div>
            <p className="text-white/80 font-medium">Sin resultados</p>
            <p className="text-sm text-white/50 mt-1">
              {hayFiltros
                ? 'Ningún insumo coincide con los filtros aplicados.'
                : 'Todavía no hay insumos registrados para el área de Pirólisis.'}
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
        <div className="border-t border-white/10">
          {/* Tabla — desde md */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Insumos consumibles del área de Pirólisis</caption>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-white/45">
                  <th scope="col" className="py-2 pl-5 pr-3 font-medium">Insumo</th>
                  <th scope="col" className="px-3 py-2 font-medium">Código</th>
                  <th scope="col" className="px-3 py-2 font-medium text-right">Stock</th>
                  <th scope="col" className="px-3 py-2 font-medium text-right">Mínimo</th>
                  <th scope="col" className="px-3 py-2 font-medium">Estado</th>
                  <th scope="col" className="pl-3 pr-5 py-2 font-medium text-right">Movs.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const estado = getItemEstado(item);
                  const ui = ESTADO_STOCK_UI[estado];
                  const minimo = getMinStock(item);

                  return (
                    <tr
                      key={item.id}
                      className="border-t border-white/5 transition-colors duration-200 hover:bg-white/5"
                    >
                      <th scope="row" className="py-2.5 pl-5 pr-3 font-normal text-left">
                        <span className="text-white">{getItemName(item)}</span>
                      </th>
                      <td className="px-3 py-2.5 text-white/50 tabular-nums whitespace-nowrap">
                        {getItemCodigo(item) || '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums whitespace-nowrap ${ui.texto}`}>
                        {formatCantidad(getItemStockTotal(item))}
                        <span className="ml-1 text-xs font-normal text-white/50">
                          {getItemUnit(item)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-white/50 tabular-nums">
                        {minimo > 0 ? formatCantidad(minimo) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${ui.badge}`}>
                          {ui.label}
                        </span>
                      </td>
                      <td className="pl-3 pr-5 py-2.5 text-right text-white/50 tabular-nums">
                        {formatCantidad(getItemMovimientos(item).length)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tarjetas — hasta md */}
          <ul className="md:hidden grid grid-cols-1 gap-3 px-4 py-4">
            {items.map((item) => (
              <li key={item.id}>
                <ItemCard item={item} {...getterProps} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * ActivosTable - Tabla principal de activos con filtros
 */

import React, { useState } from 'react';
import type { ActivoFijoRecord } from '@/types/activos';
import ActivoCard from './ActivoCard';
import {
  CATEGORIAS_ACTIVO,
  ESTADOS_OPERATIVO,
} from '@/lib/activos.constants';

interface ActivosTableProps {
  activos: ActivoFijoRecord[];
  getActivoNombre: (record: ActivoFijoRecord) => string;
  getActivoCodigo: (record: ActivoFijoRecord) => string;
  getActivoCategoria: (record: ActivoFijoRecord) => string;
  getActivoEstado: (record: ActivoFijoRecord) => string;
  getActivoUbicacion: (record: ActivoFijoRecord) => string;
  getActivoArea: (record: ActivoFijoRecord) => string;
  getActivoResponsable: (record: ActivoFijoRecord) => string;
  getActivoEstaAsignado: (record: ActivoFijoRecord) => boolean;
  getActivoDiasVencimiento: (record: ActivoFijoRecord) => number | null;
  onVerDetalle?: (activo: ActivoFijoRecord) => void;
  onFilterChange?: (categoria: string, estado: string) => void;
}

export default function ActivosTable({
  activos,
  getActivoNombre,
  getActivoCodigo,
  getActivoCategoria,
  getActivoEstado,
  getActivoUbicacion,
  getActivoArea,
  getActivoResponsable,
  getActivoEstaAsignado,
  getActivoDiasVencimiento,
  onVerDetalle,
  onFilterChange,
}: ActivosTableProps) {
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [vistaActual, setVistaActual] = useState<'grid' | 'list'>('grid');

  // Aplicar filtros locales
  const activosFiltrados = activos.filter((activo) => {
    const nombre = getActivoNombre(activo).toLowerCase();
    const codigo = getActivoCodigo(activo).toLowerCase();
    const categoria = getActivoCategoria(activo).toLowerCase();
    const area = getActivoArea(activo).toLowerCase();

    const coincideBusqueda = busqueda === '' ||
      nombre.includes(busqueda.toLowerCase()) ||
      codigo.includes(busqueda.toLowerCase()) ||
      categoria.includes(busqueda.toLowerCase()) ||
      area.includes(busqueda.toLowerCase());

    return coincideBusqueda;
  });

  const handleCategoriaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFiltroCategoria(value);
    onFilterChange?.(value, filtroEstado);
  };

  const handleEstadoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setFiltroEstado(value);
    onFilterChange?.(filtroCategoria, value);
  };

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
        <span>📋</span>
        <span>Listado de Activos ({activosFiltrados.length})</span>
      </h2>

      {/* Barra de filtros y búsqueda */}
      <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Búsqueda */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              🔍 Buscar
            </label>
            <input
              type="text"
              placeholder="Nombre, código, categoría..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white/20 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filtro por Categoría */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              📂 Categoría
            </label>
            <select
              value={filtroCategoria}
              onChange={handleCategoriaChange}
              className="w-full px-3 py-2 rounded bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {CATEGORIAS_ACTIVO.map((cat) => (
                <option key={cat} value={cat} className="text-gray-900">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Estado */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              🔄 Estado
            </label>
            <select
              value={filtroEstado}
              onChange={handleEstadoChange}
              className="w-full px-3 py-2 rounded bg-white/20 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {ESTADOS_OPERATIVO.map((estado) => (
                <option key={estado} value={estado} className="text-gray-900">
                  {estado}
                </option>
              ))}
            </select>
          </div>

          {/* Vista (Grid / Lista) */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              👁️ Vista
            </label>
            <div className="flex space-x-2">
              <button
                onClick={() => setVistaActual('grid')}
                className={`flex-1 px-3 py-2 rounded font-semibold transition-colors ${
                  vistaActual === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                ⊞ Grid
              </button>
              <button
                onClick={() => setVistaActual('list')}
                className={`flex-1 px-3 py-2 rounded font-semibold transition-colors ${
                  vistaActual === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                ☰ Lista
              </button>
            </div>
          </div>
        </div>

        {/* Botón limpiar filtros */}
        {(busqueda || filtroCategoria || filtroEstado) && (
          <div className="mt-4">
            <button
              onClick={() => {
                setBusqueda('');
                setFiltroCategoria('');
                setFiltroEstado('');
                onFilterChange?.('', '');
              }}
              className="text-sm bg-red-500/20 hover:bg-red-500/30 text-white px-4 py-2 rounded border border-red-500/50 transition-colors"
            >
              ✖ Limpiar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Resultados */}
      {activosFiltrados.length === 0 ? (
        <div className="bg-yellow-500/20 backdrop-blur-md rounded-lg p-8 border border-yellow-500/30 text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-bold text-white mb-2">
            No se encontraron activos
          </h3>
          <p className="text-white/80">
            {busqueda || filtroCategoria || filtroEstado
              ? 'Intenta ajustar los filtros de búsqueda'
              : 'No hay activos registrados en el sistema'}
          </p>
        </div>
      ) : vistaActual === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activosFiltrados.map((activo) => (
            <ActivoCard
              key={activo.id}
              activo={activo}
              getActivoNombre={getActivoNombre}
              getActivoCodigo={getActivoCodigo}
              getActivoCategoria={getActivoCategoria}
              getActivoEstado={getActivoEstado}
              getActivoUbicacion={getActivoUbicacion}
              getActivoResponsable={getActivoResponsable}
              getActivoEstaAsignado={getActivoEstaAsignado}
              getActivoDiasVencimiento={getActivoDiasVencimiento}
              onVerDetalle={onVerDetalle}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white/10 backdrop-blur-md rounded-lg border border-white/20 overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/20">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-bold text-white">Código</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-white">Nombre</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-white">Categoría</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-white">Estado</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-white">Ubicación</th>
                <th className="px-4 py-3 text-left text-sm font-bold text-white">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {activosFiltrados.map((activo, index) => (
                <tr
                  key={activo.id}
                  className={`border-t border-white/10 hover:bg-white/10 cursor-pointer transition-colors ${
                    index % 2 === 0 ? 'bg-white/5' : ''
                  }`}
                  onClick={() => onVerDetalle?.(activo)}
                >
                  <td className="px-4 py-3 text-sm font-mono text-white/90">
                    {getActivoCodigo(activo)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-white">
                    {getActivoNombre(activo)}
                  </td>
                  <td className="px-4 py-3 text-sm text-white/80">
                    {getActivoCategoria(activo)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 rounded bg-white/20 text-white text-xs">
                      {getActivoEstado(activo)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/80">
                    {getActivoUbicacion(activo)}
                  </td>
                  <td className="px-4 py-3 text-sm text-white/80">
                    {getActivoEstaAsignado(activo) ? (
                      <span className="text-blue-300">👤 {getActivoResponsable(activo)}</span>
                    ) : (
                      <span className="text-green-300">✅ Disponible</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

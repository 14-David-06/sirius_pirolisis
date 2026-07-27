/**
 * ActivoCard - Tarjeta individual para mostrar información de un activo
 */

import React from 'react';
import type { ActivoFijoRecord } from '@/types/activos';
import {
  ESTADOS_OPERATIVO_ICONS,
  ESTADOS_OPERATIVO_COLOR,
  CATEGORIAS_ACTIVO_ICONS,
} from '@/lib/activos.constants';

interface ActivoCardProps {
  activo: ActivoFijoRecord;
  getActivoNombre: (record: ActivoFijoRecord) => string;
  getActivoCodigo: (record: ActivoFijoRecord) => string;
  getActivoCategoria: (record: ActivoFijoRecord) => string;
  getActivoEstado: (record: ActivoFijoRecord) => string;
  getActivoUbicacion: (record: ActivoFijoRecord) => string;
  getActivoResponsable: (record: ActivoFijoRecord) => string;
  getActivoEstaAsignado: (record: ActivoFijoRecord) => boolean;
  getActivoDiasVencimiento: (record: ActivoFijoRecord) => number | null;
  onVerDetalle?: (activo: ActivoFijoRecord) => void;
}

export default function ActivoCard({
  activo,
  getActivoNombre,
  getActivoCodigo,
  getActivoCategoria,
  getActivoEstado,
  getActivoUbicacion,
  getActivoResponsable,
  getActivoEstaAsignado,
  getActivoDiasVencimiento,
  onVerDetalle,
}: ActivoCardProps) {
  const nombre = getActivoNombre(activo);
  const codigo = getActivoCodigo(activo);
  const categoria = getActivoCategoria(activo);
  const estado = getActivoEstado(activo);
  const ubicacion = getActivoUbicacion(activo);
  const responsable = getActivoResponsable(activo);
  const estaAsignado = getActivoEstaAsignado(activo);
  const diasVencimiento = getActivoDiasVencimiento(activo);

  const estadoIcon = ESTADOS_OPERATIVO_ICONS[estado as keyof typeof ESTADOS_OPERATIVO_ICONS] || '⚪';
  const estadoColor = ESTADOS_OPERATIVO_COLOR[estado as keyof typeof ESTADOS_OPERATIVO_COLOR] || 'gray';

  // Obtener primer categoría para el icono
  const primeraCategoria = categoria.split(',')[0].trim();
  const categoriaIcon = CATEGORIAS_ACTIVO_ICONS[primeraCategoria as keyof typeof CATEGORIAS_ACTIVO_ICONS] || '📦';

  // Determinar color de fondo según estado
  const bgColorClass = estaAsignado
    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    : estado === 'Operativo'
    ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    : estado === 'En Reparación'
    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    : 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600';

  // Alertas de vencimiento
  const alertaVencimiento = diasVencimiento !== null && diasVencimiento > 0 && diasVencimiento <= 30;
  const vencido = diasVencimiento !== null && diasVencimiento <= 0;

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all hover:shadow-lg ${bgColorClass} ${
        onVerDetalle ? 'cursor-pointer' : ''
      }`}
      onClick={() => onVerDetalle?.(activo)}
    >
      {/* Header con código y categoría */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">{categoriaIcon}</span>
          <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
            {codigo}
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="text-lg">{estadoIcon}</span>
          <span className={`text-xs font-semibold px-2 py-1 rounded bg-${estadoColor}-100 text-${estadoColor}-800 dark:bg-${estadoColor}-900 dark:text-${estadoColor}-200`}>
            {estado}
          </span>
        </div>
      </div>

      {/* Nombre del activo */}
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
        {nombre}
      </h3>

      {/* Categoría */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {categoria}
      </p>

      {/* Ubicación */}
      <div className="flex items-center space-x-2 mb-2">
        <span className="text-sm">📍</span>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {ubicacion || 'Sin ubicación'}
        </span>
      </div>

      {/* Responsable asignado */}
      {estaAsignado ? (
        <div className="flex items-center space-x-2 mb-2 bg-blue-100 dark:bg-blue-900/30 p-2 rounded">
          <span className="text-sm">👤</span>
          <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
            Asignado a: {responsable}
          </span>
        </div>
      ) : (
        <div className="flex items-center space-x-2 mb-2 bg-green-100 dark:bg-green-900/30 p-2 rounded">
          <span className="text-sm">✅</span>
          <span className="text-sm font-semibold text-green-900 dark:text-green-200">
            Disponible
          </span>
        </div>
      )}

      {/* Alerta de vencimiento */}
      {alertaVencimiento && (
        <div className="flex items-center space-x-2 mt-2 bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded">
          <span className="text-sm">⚠️</span>
          <span className="text-xs font-semibold text-yellow-900 dark:text-yellow-200">
            Vence en {diasVencimiento} día{diasVencimiento !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {vencido && (
        <div className="flex items-center space-x-2 mt-2 bg-red-100 dark:bg-red-900/30 p-2 rounded">
          <span className="text-sm">❌</span>
          <span className="text-xs font-semibold text-red-900 dark:text-red-200">
            VENCIDO
          </span>
        </div>
      )}

      {/* Botón de ver detalle */}
      {onVerDetalle && (
        <button
          className="mt-3 w-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white py-2 px-4 rounded text-sm font-semibold transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onVerDetalle(activo);
          }}
        >
          Ver Detalle →
        </button>
      )}
    </div>
  );
}

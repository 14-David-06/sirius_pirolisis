/**
 * EstadisticasActivos - Métricas generales del módulo de activos
 */

import React from 'react';

interface EstadisticasActivosProps {
  totalActivos: number;
  operativos: number;
  enReparacion: number;
  asignados: number;
  disponibles: number;
  porVencer: number;
  valorTotal?: number;
}

export default function EstadisticasActivos({
  totalActivos,
  operativos,
  enReparacion,
  asignados,
  disponibles,
  porVencer,
  valorTotal,
}: EstadisticasActivosProps) {
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const stats = [
    {
      label: 'Total Activos',
      value: totalActivos,
      icon: '📊',
      color: 'blue',
      description: 'Activos registrados',
    },
    {
      label: 'Operativos',
      value: operativos,
      icon: '🟢',
      color: 'green',
      description: 'Funcionando correctamente',
    },
    {
      label: 'En Reparación',
      value: enReparacion,
      icon: '🔴',
      color: 'red',
      description: 'Requieren atención',
    },
    {
      label: 'Asignados',
      value: asignados,
      icon: '👤',
      color: 'blue',
      description: 'Con responsable',
    },
    {
      label: 'Disponibles',
      value: disponibles,
      icon: '✅',
      color: 'green',
      description: 'Listos para usar',
    },
    {
      label: 'Por Vencer',
      value: porVencer,
      icon: '⚠️',
      color: 'yellow',
      description: '< 30 días',
      alert: porVencer > 0,
    },
  ];

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
        <span>📈</span>
        <span>Estadísticas Generales</span>
      </h2>

      {/* Grid de estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className={`bg-white/10 backdrop-blur-md rounded-lg p-4 border ${
              stat.alert
                ? 'border-yellow-500 animate-pulse'
                : 'border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{stat.icon}</span>
              {stat.alert && (
                <span className="text-xs bg-yellow-500 text-white px-2 py-1 rounded font-bold">
                  ALERTA
                </span>
              )}
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {stat.value}
            </div>
            <div className="text-sm font-semibold text-white/90">
              {stat.label}
            </div>
            <div className="text-xs text-white/70 mt-1">
              {stat.description}
            </div>
          </div>
        ))}
      </div>

      {/* Valor total de activos */}
      {valorTotal !== undefined && valorTotal > 0 && (
        <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur-md rounded-lg p-4 border border-white/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">💰</span>
              <div>
                <div className="text-sm text-white/80">Valor Total del Inventario</div>
                <div className="text-2xl font-bold text-white">
                  {formatCurrency(valorTotal)}
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-white/70">
              Valor de adquisición<br />de todos los activos
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

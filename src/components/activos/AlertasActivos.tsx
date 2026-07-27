/**
 * AlertasActivos - Muestra alertas de activos que requieren atención
 */

import React from 'react';
import type { ActivoFijoRecord } from '@/types/activos';

interface AlertasActivosProps {
  porVencer: ActivoFijoRecord[];
  enReparacion: ActivoFijoRecord[];
  getActivoNombre: (record: ActivoFijoRecord) => string;
  getActivoCodigo: (record: ActivoFijoRecord) => string;
  getActivoDiasVencimiento: (record: ActivoFijoRecord) => number | null;
}

export default function AlertasActivos({
  porVencer,
  enReparacion,
  getActivoNombre,
  getActivoCodigo,
  getActivoDiasVencimiento,
}: AlertasActivosProps) {
  const tieneAlertas = porVencer.length > 0 || enReparacion.length > 0;

  if (!tieneAlertas) {
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
        <span>⚠️</span>
        <span>Alertas y Notificaciones</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Activos próximos a vencer */}
        {porVencer.length > 0 && (
          <div className="bg-yellow-500/20 backdrop-blur-md rounded-lg p-4 border border-yellow-500/50">
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-2xl">⏰</span>
              <h3 className="text-lg font-bold text-white">
                Próximos a Vencer ({porVencer.length})
              </h3>
            </div>
            <p className="text-sm text-white/80 mb-3">
              Activos que vencen en los próximos 30 días
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {porVencer.map((activo) => {
                const dias = getActivoDiasVencimiento(activo);
                return (
                  <div
                    key={activo.id}
                    className="bg-white/10 rounded p-3 border border-yellow-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {getActivoNombre(activo)}
                        </div>
                        <div className="text-xs text-white/70 font-mono">
                          {getActivoCodigo(activo)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-yellow-300">
                          {dias} día{dias !== 1 ? 's' : ''}
                        </div>
                        <div className="text-xs text-white/70">restantes</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Activos en reparación */}
        {enReparacion.length > 0 && (
          <div className="bg-red-500/20 backdrop-blur-md rounded-lg p-4 border border-red-500/50">
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-2xl">🔧</span>
              <h3 className="text-lg font-bold text-white">
                En Reparación ({enReparacion.length})
              </h3>
            </div>
            <p className="text-sm text-white/80 mb-3">
              Activos que requieren reparación o mantenimiento
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {enReparacion.map((activo) => (
                <div
                  key={activo.id}
                  className="bg-white/10 rounded p-3 border border-red-500/30"
                >
                  <div className="font-semibold text-white">
                    {getActivoNombre(activo)}
                  </div>
                  <div className="text-xs text-white/70 font-mono">
                    {getActivoCodigo(activo)}
                  </div>
                  <div className="mt-2 text-xs bg-red-500/20 text-red-200 px-2 py-1 rounded inline-block">
                    🔴 Fuera de servicio
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

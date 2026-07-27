/**
 * DetalleActivoModal - Modal para mostrar información detallada de un activo
 */

'use client';

import { useState } from 'react';
import type { ActivoFijoRecord } from '@/types/activos';
import { ESTADOS_OPERATIVO_ICONS, ESTADOS_OPERATIVO } from '@/lib/activos.constants';

interface DetalleActivoModalProps {
  activo: ActivoFijoRecord | null;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function DetalleActivoModal({ activo, onClose, onUpdate }: DetalleActivoModalProps) {
  const [estadoEditado, setEstadoEditado] = useState<string>('');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!activo) return null;

  const fields = activo.fields;
  const estadoActual = estadoEditado || fields['Estado Operativo'] || '';

  const handleEditarEstado = () => {
    setEstadoEditado(fields['Estado Operativo'] || '');
    setModoEdicion(true);
    setError(null);
  };

  const handleCancelarEdicion = () => {
    setModoEdicion(false);
    setEstadoEditado('');
    setError(null);
  };

  const handleGuardarEstado = async () => {
    if (!estadoEditado || estadoEditado === fields['Estado Operativo']) {
      setModoEdicion(false);
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const response = await fetch(`/api/activos/update/${activo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'Estado Operativo': estadoEditado,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al actualizar el estado');
      }

      // Actualizar el campo localmente
      fields['Estado Operativo'] = estadoEditado as any;
      setModoEdicion(false);
      onUpdate?.();

      // Mostrar mensaje de éxito
      alert('✅ Estado actualizado exitosamente');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setError(message);
      console.error('❌ Error al actualizar estado:', message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl w-full max-w-4xl mx-auto border border-white/20 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-6 rounded-t-xl border-b border-white/10 sticky top-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                📋 Detalle del Activo
              </h2>
              <p className="text-white/80 text-sm mt-1">
                {fields['Código Activo'] || 'Sin código'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-6">
          {/* Información Básica */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <span>📋</span>
              <span>Información Básica</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-white/60 text-sm">Nombre</p>
                <p className="text-white font-semibold">
                  {fields['Nombre del Activo'] || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Código</p>
                <p className="text-white font-mono font-semibold">
                  {fields['Código Activo'] || 'N/A'}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-white/60 text-sm">Descripción</p>
                <p className="text-white">
                  {fields['Descripción'] || 'Sin descripción'}
                </p>
              </div>
            </div>
          </div>

          {/* Estado y Ubicación */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <span>📍</span>
                <span>Estado y Ubicación</span>
              </h3>
              {!modoEdicion && (
                <button
                  onClick={handleEditarEstado}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
                >
                  ✏️ Editar Estado
                </button>
              )}
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-white text-sm">⚠️ {error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-white/60 text-sm mb-2">Estado Operativo</p>
                {modoEdicion ? (
                  <div className="space-y-2">
                    <select
                      value={estadoEditado}
                      onChange={(e) => setEstadoEditado(e.target.value)}
                      disabled={guardando}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ESTADOS_OPERATIVO.map((estado) => (
                        <option key={estado} value={estado} className="bg-gray-800">
                          {ESTADOS_OPERATIVO_ICONS[estado]} {estado}
                        </option>
                      ))}
                    </select>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleGuardarEstado}
                        disabled={guardando}
                        className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white px-3 py-1 rounded text-sm transition-colors"
                      >
                        {guardando ? '⏳ Guardando...' : '✅ Guardar'}
                      </button>
                      <button
                        onClick={handleCancelarEdicion}
                        disabled={guardando}
                        className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white px-3 py-1 rounded text-sm transition-colors"
                      >
                        ✖ Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-white font-semibold flex items-center space-x-2">
                    <span>
                      {ESTADOS_OPERATIVO_ICONS[estadoActual as keyof typeof ESTADOS_OPERATIVO_ICONS] || '⚪'}
                    </span>
                    <span>{estadoActual || 'N/A'}</span>
                  </p>
                )}
              </div>
              <div>
                <p className="text-white/60 text-sm">Ubicación Actual</p>
                <p className="text-white">
                  {Array.isArray(fields['Ubicación Actual'])
                    ? fields['Ubicación Actual'].join(', ')
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Área Responsable</p>
                <p className="text-white">
                  {fields['Área Responsable'] || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Responsable Asignado</p>
                <p className="text-white">
                  {fields['Responsable Asignado'] ? (
                    <span className="text-blue-300">👤 {fields['Responsable Asignado']}</span>
                  ) : (
                    <span className="text-green-300">✅ Disponible</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Identificación */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <span>🔖</span>
              <span>Identificación</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-white/60 text-sm">Número de Serie</p>
                <p className="text-white font-mono">
                  {fields['Número de Serie'] || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Marca</p>
                <p className="text-white">
                  {fields['Marca'] || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Modelo</p>
                <p className="text-white">
                  {fields['Modelo'] || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Categoría</p>
                <p className="text-white">
                  {Array.isArray(fields['Categoría'])
                    ? fields['Categoría'].join(', ')
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Información Financiera */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <span>💰</span>
              <span>Información Financiera</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-white/60 text-sm">Fecha de Adquisición</p>
                <p className="text-white">
                  {fields['Fecha de Adquisición']
                    ? new Date(fields['Fecha de Adquisición']).toLocaleDateString('es-CO')
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-white/60 text-sm">Valor de Adquisición</p>
                <p className="text-white font-semibold">
                  {fields['Valor de Adquisición']
                    ? `$${fields['Valor de Adquisición'].toLocaleString('es-CO')}`
                    : 'N/A'}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-white/60 text-sm">Proveedor</p>
                <p className="text-white">
                  {fields['Proveedor'] || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Fechas de Control */}
          {(fields['Fecha de Vencimiento'] || fields['Próximo Mantenimiento']) && (
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                <span>📅</span>
                <span>Fechas de Control</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fields['Fecha de Vencimiento'] && (
                  <div>
                    <p className="text-white/60 text-sm">Fecha de Vencimiento</p>
                    <p className="text-white">
                      {new Date(fields['Fecha de Vencimiento']).toLocaleDateString('es-CO')}
                      {fields['Días para Vencimiento'] !== undefined && (
                        <span className={`ml-2 text-sm ${
                          fields['Días para Vencimiento'] < 30 ? 'text-red-300' : 'text-green-300'
                        }`}>
                          ({fields['Días para Vencimiento']} días)
                        </span>
                      )}
                    </p>
                  </div>
                )}
                {fields['Próximo Mantenimiento'] && (
                  <div>
                    <p className="text-white/60 text-sm">Próximo Mantenimiento</p>
                    <p className="text-white">
                      {new Date(fields['Próximo Mantenimiento']).toLocaleDateString('es-CO')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notas */}
          {fields['Notas'] && (
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                <span>📝</span>
                <span>Notas</span>
              </h3>
              <p className="text-white whitespace-pre-wrap">
                {fields['Notas']}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

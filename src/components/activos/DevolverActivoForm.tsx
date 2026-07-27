/**
 * DevolverActivoForm - Formulario para registrar devolución de un activo asignado
 */

'use client';

import { useState, useEffect } from 'react';

interface DevolverActivoFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
}

interface ActivoAsignado {
  id: string;
  codigo: string;
  nombre: string;
  responsable: string;
  fechaAsignacion: string;
}

export default function DevolverActivoForm({
  onSuccess,
  onCancel,
  getCurrentUserName,
}: DevolverActivoFormProps) {
  const [loading, setLoading] = useState(false);
  const [loadingActivos, setLoadingActivos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activos, setActivos] = useState<ActivoAsignado[]>([]);

  const [activoId, setActivoId] = useState('');
  const [condicion, setCondicion] = useState('Bueno');
  const [observaciones, setObservaciones] = useState('');
  const [requiereMantenimiento, setRequiereMantenimiento] = useState(false);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Cargar activos asignados
    fetch('/api/activos/list?asignados=true')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          // Filtrar solo los que tienen responsable asignado
          const asignados = result.data.filter((a: any) => a.responsableAsignado);
          setActivos(asignados.map((a: any) => ({
            id: a.id,
            codigo: a.codigoActivo || 'N/A',
            nombre: a.nombreActivo || 'Sin nombre',
            responsable: a.responsableAsignado,
            fechaAsignacion: a.fechaAsignacion || 'N/A',
          })));
        }
        setLoadingActivos(false);
      })
      .catch(() => {
        setLoadingActivos(false);
      });
  }, []);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!activoId) {
      errors.activoId = 'Debes seleccionar un activo';
    }

    if (!condicion) {
      errors.condicion = 'Debes indicar la condición del activo';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      setError('Por favor completa todos los campos requeridos');
      return;
    }

    setLoading(true);

    try {
      const body = {
        activoId,
        condicion,
        observaciones: observaciones.trim() || undefined,
        requiereMantenimiento,
        usuarioRecibe: getCurrentUserName(),
      };

      const response = await fetch('/api/activos/devolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al registrar la devolución');
      }

      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al devolver activo:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingActivos) {
    return (
      <div className="p-6 text-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p>Cargando activos asignados...</p>
      </div>
    );
  }

  if (activos.length === 0) {
    return (
      <div className="p-6 text-center text-white">
        <div className="text-6xl mb-4">✅</div>
        <p className="text-lg mb-4">No hay activos asignados para devolver</p>
        <p className="text-sm text-white/70 mb-6">
          Todos los activos están disponibles o no asignados.
        </p>
        <button
          onClick={onCancel}
          className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-white">
          <p className="font-semibold">⚠️ Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Seleccionar Activo */}
      <div>
        <label className="block text-white/90 text-sm font-medium mb-2">
          Activo a Devolver <span className="text-red-400">*</span>
        </label>
        <select
          value={activoId}
          onChange={(e) => {
            setActivoId(e.target.value);
            if (validationErrors.activoId) {
              setValidationErrors((prev) => ({ ...prev, activoId: '' }));
            }
          }}
          className={`w-full bg-white/10 backdrop-blur-sm border ${
            validationErrors.activoId ? 'border-red-500' : 'border-white/20'
          } rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
        >
          <option value="" className="bg-gray-800">Selecciona un activo</option>
          {activos.map((activo) => (
            <option key={activo.id} value={activo.id} className="bg-gray-800">
              {activo.codigo} - {activo.nombre} (Asignado a: {activo.responsable})
            </option>
          ))}
        </select>
        {validationErrors.activoId && (
          <p className="text-red-300 text-xs mt-1">{validationErrors.activoId}</p>
        )}
      </div>

      {/* Condición al Devolver */}
      <div>
        <label className="block text-white/90 text-sm font-medium mb-2">
          Condición al Devolver <span className="text-red-400">*</span>
        </label>
        <select
          value={condicion}
          onChange={(e) => {
            setCondicion(e.target.value);
            if (validationErrors.condicion) {
              setValidationErrors((prev) => ({ ...prev, condicion: '' }));
            }
          }}
          className={`w-full bg-white/10 backdrop-blur-sm border ${
            validationErrors.condicion ? 'border-red-500' : 'border-white/20'
          } rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
        >
          <option value="Excelente" className="bg-gray-800">Excelente - Como nuevo</option>
          <option value="Bueno" className="bg-gray-800">Bueno - Funcionando correctamente</option>
          <option value="Regular" className="bg-gray-800">Regular - Muestra desgaste normal</option>
          <option value="Malo" className="bg-gray-800">Malo - Requiere reparación</option>
          <option value="Dañado" className="bg-gray-800">Dañado - No funcional</option>
        </select>
        {validationErrors.condicion && (
          <p className="text-red-300 text-xs mt-1">{validationErrors.condicion}</p>
        )}
      </div>

      {/* Requiere Mantenimiento */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={requiereMantenimiento}
            onChange={(e) => setRequiereMantenimiento(e.target.checked)}
            className="w-5 h-5 rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <span className="text-white/90 font-medium">
              Requiere Mantenimiento Post-Devolución
            </span>
            <p className="text-white/60 text-xs mt-1">
              Marca esta opción si el activo necesita mantenimiento, reparación o revisión antes de ser reasignado
            </p>
          </div>
        </label>
      </div>

      {/* Observaciones */}
      <div>
        <label className="block text-white/90 text-sm font-medium mb-2">
          Observaciones de Devolución
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Describe el estado del activo, problemas encontrados, etc."
          rows={3}
          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Botones */}
      <div className="flex justify-end space-x-4 pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors duration-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Registrando...</span>
            </>
          ) : (
            <>
              <span>↩️</span>
              <span>Registrar Devolución</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

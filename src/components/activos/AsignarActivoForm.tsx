/**
 * AsignarActivoForm - Formulario para asignar un activo a un responsable
 */

'use client';

import { useState, useEffect } from 'react';
import { AREAS_EMPRESA } from '@/lib/activos.constants';

interface AsignarActivoFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
}

interface Activo {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
}

export default function AsignarActivoForm({
  onSuccess,
  onCancel,
  getCurrentUserName,
}: AsignarActivoFormProps) {
  const [loading, setLoading] = useState(false);
  const [loadingActivos, setLoadingActivos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activos, setActivos] = useState<Activo[]>([]);

  const [activoId, setActivoId] = useState('');
  const [responsable, setResponsable] = useState('');
  const [area, setArea] = useState('');
  const [proposito, setProposito] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Cargar activos disponibles
    fetch('/api/activos/disponibles')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          setActivos(result.data);
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

    if (!responsable.trim()) {
      errors.responsable = 'El responsable es requerido';
    }

    if (!proposito.trim()) {
      errors.proposito = 'El propósito de uso es requerido';
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
        responsable: responsable.trim(),
        area: area.trim() || undefined,
        proposito: proposito.trim(),
        observaciones: observaciones.trim() || undefined,
        usuarioAsigna: getCurrentUserName(),
      };

      const response = await fetch('/api/activos/asignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al asignar el activo');
      }

      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al asignar activo:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingActivos) {
    return (
      <div className="p-6 text-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p>Cargando activos disponibles...</p>
      </div>
    );
  }

  if (activos.length === 0) {
    return (
      <div className="p-6 text-center text-white">
        <div className="text-6xl mb-4">📦</div>
        <p className="text-lg mb-4">No hay activos disponibles para asignar</p>
        <p className="text-sm text-white/70 mb-6">
          Todos los activos están asignados o no están en estado disponible.
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
          Activo a Asignar <span className="text-red-400">*</span>
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
              {activo.codigo} - {activo.nombre}
            </option>
          ))}
        </select>
        {validationErrors.activoId && (
          <p className="text-red-300 text-xs mt-1">{validationErrors.activoId}</p>
        )}
      </div>

      {/* Responsable */}
      <div>
        <label className="block text-white/90 text-sm font-medium mb-2">
          Responsable <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={responsable}
          onChange={(e) => {
            setResponsable(e.target.value);
            if (validationErrors.responsable) {
              setValidationErrors((prev) => ({ ...prev, responsable: '' }));
            }
          }}
          placeholder="Nombre de la persona responsable"
          className={`w-full bg-white/10 backdrop-blur-sm border ${
            validationErrors.responsable ? 'border-red-500' : 'border-white/20'
          } rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {validationErrors.responsable && (
          <p className="text-red-300 text-xs mt-1">{validationErrors.responsable}</p>
        )}
      </div>

      {/* Área */}
      <div>
        <label className="block text-white/90 text-sm font-medium mb-2">
          Área / Departamento
        </label>
        <input
          type="text"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          list="areas-empresa"
          placeholder="ej: Pirólisis, Mantenimiento..."
          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id="areas-empresa">
          {AREAS_EMPRESA.map((areaOption) => (
            <option key={areaOption} value={areaOption} />
          ))}
        </datalist>
      </div>

      {/* Propósito */}
      <div>
        <label className="block text-white/90 text-sm font-medium mb-2">
          Propósito de Uso <span className="text-red-400">*</span>
        </label>
        <textarea
          value={proposito}
          onChange={(e) => {
            setProposito(e.target.value);
            if (validationErrors.proposito) {
              setValidationErrors((prev) => ({ ...prev, proposito: '' }));
            }
          }}
          placeholder="¿Para qué se usará este activo?"
          rows={3}
          className={`w-full bg-white/10 backdrop-blur-sm border ${
            validationErrors.proposito ? 'border-red-500' : 'border-white/20'
          } rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
        />
        {validationErrors.proposito && (
          <p className="text-red-300 text-xs mt-1">{validationErrors.proposito}</p>
        )}
      </div>

      {/* Observaciones */}
      <div>
        <label className="block text-white/90 text-sm font-medium mb-2">
          Observaciones
        </label>
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Notas adicionales..."
          rows={2}
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
          className="bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Asignando...</span>
            </>
          ) : (
            <>
              <span>👤</span>
              <span>Asignar Activo</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

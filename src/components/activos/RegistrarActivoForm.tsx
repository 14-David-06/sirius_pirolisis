/**
 * RegistrarActivoForm - Formulario completo para registrar un nuevo activo
 */

'use client';

import { useState } from 'react';
import {
  ESTADOS_OPERATIVO,
  MENSAJES,
  AREAS_EMPRESA,
} from '@/lib/activos.constants';
import SimpleTipoActivoSelector from './SimpleTipoActivoSelector';
import SimpleUbicacionSelector from './SimpleUbicacionSelector';

interface RegistrarActivoFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
}

export default function RegistrarActivoForm({
  onSuccess,
  onCancel,
  getCurrentUserName,
}: RegistrarActivoFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombreActivo, setNombreActivo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipoActivo, setTipoActivo] = useState<string[]>([]);
  const [estadoOperativo, setEstadoOperativo] = useState('Operativo');
  const [ubicacionActual, setUbicacionActual] = useState('');
  const [areaResponsable, setAreaResponsable] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [fechaAdquisicion, setFechaAdquisicion] = useState('');
  const [valorAdquisicion, setValorAdquisicion] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [proximoMantenimiento, setProximoMantenimiento] = useState('');
  const [notas, setNotas] = useState('');

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    // Actualizar el estado correspondiente
    switch (name) {
      case 'nombreActivo': setNombreActivo(value); break;
      case 'descripcion': setDescripcion(value); break;
      case 'estadoOperativo': setEstadoOperativo(value); break;
      case 'areaResponsable': setAreaResponsable(value); break;
      case 'numeroSerie': setNumeroSerie(value); break;
      case 'fechaAdquisicion': setFechaAdquisicion(value); break;
      case 'valorAdquisicion': setValorAdquisicion(value); break;
      case 'proveedor': setProveedor(value); break;
      case 'marca': setMarca(value); break;
      case 'modelo': setModelo(value); break;
      case 'fechaVencimiento': setFechaVencimiento(value); break;
      case 'proximoMantenimiento': setProximoMantenimiento(value); break;
      case 'notas': setNotas(value); break;
    }

    // Limpiar error de validación al editar
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleTiposChange = (ids: string[]) => {
    setTipoActivo(ids);
    if (validationErrors.tipoActivo) {
      setValidationErrors((prev) => ({ ...prev, tipoActivo: '' }));
    }
  };

  const handleUbicacionChange = (id: string) => {
    setUbicacionActual(id);
    if (validationErrors.ubicacionActual) {
      setValidationErrors((prev) => ({ ...prev, ubicacionActual: '' }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!nombreActivo.trim()) {
      errors.nombreActivo = 'El nombre del activo es requerido';
    }

    if (tipoActivo.length === 0) {
      errors.tipoActivo = 'Debes seleccionar al menos un tipo de activo';
    }

    if (!ubicacionActual) {
      errors.ubicacionActual = 'Debes seleccionar una ubicación';
    }

    if (!estadoOperativo) {
      errors.estadoOperativo = 'El estado operativo es requerido';
    }

    if (valorAdquisicion && parseFloat(valorAdquisicion) < 0) {
      errors.valorAdquisicion = 'El valor no puede ser negativo';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validar
    if (!validateForm()) {
      setError(MENSAJES.ERROR.CAMPOS_REQUERIDOS);
      return;
    }

    setLoading(true);

    try {
      const body = {
        'Nombre del Activo': nombreActivo.trim(),
        'Descripción': descripcion.trim(),
        'Tipo de Activo': tipoActivo, // Array de IDs
        'Estado Operativo': estadoOperativo,
        'Ubicación Actual': [ubicacionActual], // Airtable espera array para linked record
        'Área Responsable': areaResponsable.trim() || undefined,
        'Número de Serie': numeroSerie.trim() || undefined,
        'Fecha de Adquisición': fechaAdquisicion || undefined,
        'Valor de Adquisición': valorAdquisicion
          ? parseFloat(valorAdquisicion)
          : undefined,
        'Proveedor': proveedor.trim() || undefined,
        'Marca': marca.trim() || undefined,
        'Modelo': modelo.trim() || undefined,
        'Fecha de Vencimiento': fechaVencimiento || undefined,
        'Próximo Mantenimiento': proximoMantenimiento || undefined,
        'Notas': notas.trim() || undefined,
      };

      const response = await fetch('/api/activos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al registrar el activo');
      }

      console.log('✅ Activo registrado:', result.data);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('❌ Error al registrar activo:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Error global */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 text-white">
          <p className="font-semibold">⚠️ Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Sección 1: Información Básica */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4">📋 Información Básica</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nombre del Activo */}
          <div className="md:col-span-2">
            <label className="block text-white/90 text-sm font-medium mb-2">
              Nombre del Activo <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="nombreActivo"
              value={nombreActivo}
              onChange={handleChange}
              placeholder="ej: Taladro Industrial Bosch"
              className={`w-full bg-white/10 backdrop-blur-sm border ${
                validationErrors.nombreActivo ? 'border-red-500' : 'border-white/20'
              } rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {validationErrors.nombreActivo && (
              <p className="text-red-300 text-xs mt-1">{validationErrors.nombreActivo}</p>
            )}
          </div>

          {/* Tipo de Activo */}
          <div className="md:col-span-2">
            <label className="block text-white/90 text-sm font-medium mb-2">
              Tipo de Activo <span className="text-red-400">*</span>
            </label>
            <SimpleTipoActivoSelector
              selectedIds={tipoActivo}
              onChange={handleTiposChange}
              error={validationErrors.tipoActivo}
            />
          </div>

          {/* Descripción */}
          <div className="md:col-span-2">
            <label className="block text-white/90 text-sm font-medium mb-2">
              Descripción
            </label>
            <textarea
              name="descripcion"
              value={descripcion}
              onChange={handleChange}
              placeholder="Descripción detallada del activo..."
              rows={3}
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Sección 2: Estado y Ubicación */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4">📍 Estado y Ubicación</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Estado Operativo */}
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Estado Operativo <span className="text-red-400">*</span>
            </label>
            <select
              name="estadoOperativo"
              value={estadoOperativo}
              onChange={handleChange}
              className={`w-full bg-white/10 backdrop-blur-sm border ${
                validationErrors.estadoOperativo ? 'border-red-500' : 'border-white/20'
              } rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              {ESTADOS_OPERATIVO.map((estado) => (
                <option key={estado} value={estado} className="bg-gray-800">
                  {estado}
                </option>
              ))}
            </select>
            {validationErrors.estadoOperativo && (
              <p className="text-red-300 text-xs mt-1">{validationErrors.estadoOperativo}</p>
            )}
          </div>

          {/* Ubicación Actual */}
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Ubicación Actual <span className="text-red-400">*</span>
            </label>
            <SimpleUbicacionSelector
              selectedId={ubicacionActual}
              onChange={handleUbicacionChange}
              error={validationErrors.ubicacionActual}
            />
          </div>

          {/* Área Responsable */}
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Área Responsable
            </label>
            <input
              type="text"
              name="areaResponsable"
              value={areaResponsable}
              onChange={handleChange}
              list="areas-empresa"
              placeholder="ej: Pirólisis, Mantenimiento..."
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="areas-empresa">
              {AREAS_EMPRESA.map((area) => (
                <option key={area} value={area} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {/* Sección 3: Identificación */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4">🔖 Identificación</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Número de Serie
            </label>
            <input
              type="text"
              name="numeroSerie"
              value={numeroSerie}
              onChange={handleChange}
              placeholder="Número de serie del fabricante"
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-white/60 text-xs mt-1">
              💡 El código interno (ACT-XXX) se genera automáticamente
            </p>
          </div>

          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Marca
            </label>
            <input
              type="text"
              name="marca"
              value={marca}
              onChange={handleChange}
              placeholder="ej: Bosch, DeWalt..."
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Modelo
            </label>
            <input
              type="text"
              name="modelo"
              value={modelo}
              onChange={handleChange}
              placeholder="Modelo específico"
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Sección 4: Información de Compra */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4">💰 Información de Compra</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Fecha de Adquisición
            </label>
            <input
              type="date"
              name="fechaAdquisicion"
              value={fechaAdquisicion}
              onChange={handleChange}
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Valor de Adquisición (COP)
            </label>
            <input
              type="number"
              name="valorAdquisicion"
              value={valorAdquisicion}
              onChange={handleChange}
              placeholder="0"
              min="0"
              step="1000"
              className={`w-full bg-white/10 backdrop-blur-sm border ${
                validationErrors.valorAdquisicion ? 'border-red-500' : 'border-white/20'
              } rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {validationErrors.valorAdquisicion && (
              <p className="text-red-300 text-xs mt-1">{validationErrors.valorAdquisicion}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-white/90 text-sm font-medium mb-2">
              Proveedor
            </label>
            <input
              type="text"
              name="proveedor"
              value={proveedor}
              onChange={handleChange}
              placeholder="Nombre del proveedor"
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Sección 5: Fechas de Control */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4">📅 Fechas de Control</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Fecha de Vencimiento
            </label>
            <input
              type="date"
              name="fechaVencimiento"
              value={fechaVencimiento}
              onChange={handleChange}
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-white/60 text-xs mt-1">
              Solo si aplica (ej: extintores, calibraciones)
            </p>
          </div>

          <div>
            <label className="block text-white/90 text-sm font-medium mb-2">
              Próximo Mantenimiento
            </label>
            <input
              type="date"
              name="proximoMantenimiento"
              value={proximoMantenimiento}
              onChange={handleChange}
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-white/60 text-xs mt-1">
              Fecha programada del siguiente mantenimiento
            </p>
          </div>
        </div>
      </div>

      {/* Sección 6: Notas */}
      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4">📝 Notas Adicionales</h3>
        <textarea
          name="notas"
          value={notas}
          onChange={handleChange}
          placeholder="Observaciones generales, instrucciones especiales, etc."
          rows={3}
          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Botones de acción */}
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
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center space-x-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Registrando...</span>
            </>
          ) : (
            <>
              <span>💾</span>
              <span>Registrar Activo</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

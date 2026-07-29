/**
 * Formulario de Registro de Nuevo Insumo
 * Permite registrar nuevos insumos en el sistema de inventario
 */

"use client";

import { useState, useEffect } from 'react';
import { PRESENTACIONES_INSUMO } from '@/lib/inventario.constants';
import type { RegistroInsumoFormData, S3UploadResult } from '@/types/inventario';

interface RegistrarInsumoFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
}

export default function RegistrarInsumoForm({
  onSuccess,
  onCancel,
  getCurrentUserName,
}: RegistrarInsumoFormProps) {
  const [formData, setFormData] = useState<RegistroInsumoFormData>({
    'Nombre del Insumo': '',
    'Presentación': '',
    'Cantidad Presentacion Insumo': '',
    'Presentación Personalizada': '',
    'Ficha Seguridad URL': '',
    'Ficha Seguridad S3 Path': ''
  });
  // El insumo ya no tiene categoría, así que la ficha de seguridad se pide con
  // una marca explícita en vez de derivarla de "Categoría = Químicos".
  const [esQuimico, setEsQuimico] = useState(false);
  const [safetySheetFile, setSafetySheetFile] = useState<File | null>(null);
  const [uploadingSafetySheet, setUploadingSafetySheet] = useState(false);
  const [creating, setCreating] = useState(false);

  // Limpiar campo personalizado cuando se cambia la presentación
  useEffect(() => {
    if (formData['Presentación'] !== 'Otro') {
      setFormData(prev => ({ ...prev, 'Presentación Personalizada': '' }));
    }
  }, [formData['Presentación']]);

  const uploadSafetySheet = async (file: File): Promise<S3UploadResult> => {
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    const response = await fetch('/api/s3/upload', {
      method: 'POST',
      body: uploadFormData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || 'Error al subir archivo');
    }

    const data = await response.json();
    return {
      fileUrl: data.fileUrl,
      s3Path: data.s3Path
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData['Nombre del Insumo']) {
      alert('Por favor completa el campo requerido: Nombre del Insumo');
      return;
    }

    setCreating(true);

    try {
      const itemData = {
        ...formData,
        'Realiza Registro': getCurrentUserName()
      };

      // Si se seleccionó "Otro", usar el valor personalizado
      if (itemData['Presentación'] === 'Otro') {
        itemData['Presentación'] = itemData['Presentación Personalizada'] || 'Otro';
      }

      // Subir ficha de seguridad si es un químico y se seleccionó un archivo
      if (esQuimico && safetySheetFile) {
        setUploadingSafetySheet(true);
        try {
          const uploadResult = await uploadSafetySheet(safetySheetFile);
          itemData['Ficha Seguridad URL'] = uploadResult.fileUrl;
          itemData['Ficha Seguridad S3 Path'] = uploadResult.s3Path;
        } catch (uploadError: unknown) {
          const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
          throw new Error(`Error al subir ficha de seguridad: ${message}`);
        } finally {
          setUploadingSafetySheet(false);
        }
      }

      const response = await fetch('/api/inventario/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(itemData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al registrar el insumo');
      }

      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Error al registrar el insumo: ${message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <div className="space-y-6">
        {/* Nombre del Insumo */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
            Nombre del Insumo *
          </label>
          <input
            type="text"
            value={formData['Nombre del Insumo']}
            onChange={(e) => setFormData({...formData, 'Nombre del Insumo': e.target.value})}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
            placeholder="Ej: Hidróxido de Sodio"
            required
          />
        </div>

        {/* ¿Es un químico? — reemplaza la categoría como disparador de la ficha */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={esQuimico}
              onChange={(e) => {
                setEsQuimico(e.target.checked);
                if (!e.target.checked) setSafetySheetFile(null);
              }}
              className="mt-0.5 h-4 w-4 rounded border-white/30 bg-white/10 accent-purple-500"
            />
            <span>
              <span className="block text-sm font-semibold text-white drop-shadow">
                Es un químico
              </span>
              <span className="block text-xs text-white/60 mt-0.5">
                Marca esta opción para adjuntar la ficha de seguridad del producto.
              </span>
            </span>
          </label>
        </div>

        {/* Ficha de Seguridad (solo para químicos) */}
        {esQuimico && (
          <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-lg p-4 border border-yellow-500/20">
            <label className="block text-sm font-semibold mb-2 text-yellow-200 drop-shadow">
              📋 Ficha de Seguridad (PDF) *
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setSafetySheetFile(e.target.files?.[0] || null)}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-yellow-600 file:text-white hover:file:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent backdrop-blur-sm"
              required={esQuimico}
            />
            <p className="text-xs text-yellow-200 mt-2 drop-shadow">
              Archivo PDF con ficha de seguridad del químico (mínimo 100KB)
            </p>
            {safetySheetFile && (
              <div className="mt-2 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                <p className="text-green-200 text-sm drop-shadow">
                  ✅ Archivo seleccionado: {safetySheetFile.name}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Presentación y Cantidad */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
              Presentación
            </label>
            <select
              value={formData['Presentación']}
              onChange={(e) => setFormData({...formData, 'Presentación': e.target.value})}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
            >
              <option value="" className="bg-gray-800">Seleccionar presentación</option>
              {PRESENTACIONES_INSUMO.map(pres => (
                <option key={pres.value} value={pres.value} className="bg-gray-800">
                  {pres.icon} {pres.label}
                </option>
              ))}
            </select>
          </div>

          {formData['Presentación'] === 'Otro' && (
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
                Especificar Presentación
              </label>
              <input
                type="text"
                value={formData['Presentación Personalizada']}
                onChange={(e) => setFormData({...formData, 'Presentación Personalizada': e.target.value})}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
                placeholder="Ej: Toneladas, Barriles..."
              />
            </div>
          )}

          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
              Cantidad por Presentación
            </label>
            <input
              type="number"
              value={formData['Cantidad Presentacion Insumo']}
              onChange={(e) => setFormData({...formData, 'Cantidad Presentacion Insumo': e.target.value})}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
              placeholder="Ej: 25"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        {/* Registrado por */}
        <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg p-4 border border-purple-500/20">
          <label className="block text-sm font-semibold mb-2 text-purple-200 drop-shadow">
            Registrado por:
          </label>
          <p className="text-white font-medium drop-shadow">{getCurrentUserName()}</p>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end space-x-4 mt-8 pt-6 border-t border-white/10">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-all duration-200 backdrop-blur-sm font-medium"
        >
          ❌ Cancelar
        </button>
        <button
          type="submit"
          disabled={creating || uploadingSafetySheet}
          className="px-6 py-3 rounded-lg font-semibold transition-all duration-200 backdrop-blur-sm bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploadingSafetySheet
            ? '⏳ Subiendo ficha de seguridad...'
            : creating
            ? '📝 Registrando...'
            : '📝 Registrar Insumo'
          }
        </button>
      </div>
    </form>
  );
}

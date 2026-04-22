"use client";

import { useState, useEffect } from 'react';
import VoiceToText from '@/components/VoiceToText';
import {
  TIPO_USO_VALUES,
  TIPO_USO_LABELS,
  TIPO_USO_ICONS,
  TIPO_USO_PRODUCTIVO,
  type TipoUso,
} from '@/domain/entities/Inventario';

interface InventarioRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface SalidaInsumoFormProps {
  records: InventarioRecord[];
  getItemName: (record: InventarioRecord) => string;
  getItemCategory: (record: InventarioRecord) => string;
  getItemQuantity: (record: InventarioRecord) => number;
  getItemPresentacion: (record: InventarioRecord) => string;
  getItemStockTotal: (record: InventarioRecord) => number;
  getCurrentUserName: () => string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface BalanceMasa {
  id: string;
  fields: Record<string, unknown>;
}

export default function SalidaInsumoForm({
  records,
  getItemName,
  getItemCategory,
  getItemQuantity,
  getItemPresentacion,
  getItemStockTotal,
  getCurrentUserName,
  onSuccess,
  onCancel,
}: SalidaInsumoFormProps) {
  const [formData, setFormData] = useState({
    selectedItemId: '',
    cantidad: '',
    tipo_uso: 'balance_de_masa' as TipoUso,
    balance_masa_id: '',
    observaciones: '',
    documentoSoporte: null as File | null,
  });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [balancesActivos, setBalancesActivos] = useState<BalanceMasa[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [paqueteLonasInfo, setPaqueteLonasInfo] = useState<{
    nuevo_id: string | null;
    anterior_id: string | null;
    anterior_dias_uso: number | null;
  } | null>(null);

  // Cargar balances activos del turno cuando tipo_uso = balance_de_masa
  useEffect(() => {
    if (formData.tipo_uso === 'balance_de_masa') {
      loadBalancesActivos();
    }
  }, [formData.tipo_uso]);

  const loadBalancesActivos = async () => {
    setLoadingBalances(true);
    try {
      const response = await fetch('/api/balance-masa/list?maxRecords=20');
      if (response.ok) {
        const data = await response.json();
        setBalancesActivos(data.data || []);
      } else {
        const errorText = await response.text();
        console.error('Error cargando balances (status):', response.status, errorText);
      }
    } catch (err) {
      console.error('Error cargando balances:', err);
    } finally {
      setLoadingBalances(false);
    }
  };

  const esProductivo = TIPO_USO_PRODUCTIVO[formData.tipo_uso];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.selectedItemId || !formData.cantidad) {
      setError('Por favor selecciona un insumo y especifica la cantidad a remover');
      return;
    }

    // Validar stock disponible en cliente
    const selectedItem = records.find(item => item.id === formData.selectedItemId);
    if (selectedItem) {
      const stockDisponible = getItemStockTotal(selectedItem);
      const cantidadARemover = parseFloat(formData.cantidad);
      if (cantidadARemover > stockDisponible) {
        setError(`No puedes remover ${cantidadARemover} unidades. Solo hay ${stockDisponible} unidades disponibles en stock.`);
        return;
      }
    }

    // Validar observaciones obligatorias para tipo "otro"
    if (formData.tipo_uso === 'otro' && (!formData.observaciones || !formData.observaciones.trim())) {
      setError('Las observaciones son obligatorias cuando el tipo de uso es "Otro"');
      return;
    }

    setError('');
    setCreating(true);

    try {
      let documentoSoporteUrl = '';

      // Subir documento si existe
      if (formData.documentoSoporte) {
        const uploadFormData = new FormData();
        uploadFormData.append('file', formData.documentoSoporte);
        uploadFormData.append('folder', 'inventario-salidas');

        const uploadResponse = await fetch('/api/s3/upload', {
          method: 'POST',
          body: uploadFormData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Error al subir el documento de soporte');
        }

        const uploadData = await uploadResponse.json();
        documentoSoporteUrl = uploadData.fileUrl;
      }

      const requestBody = {
        itemId: formData.selectedItemId,
        cantidad: parseFloat(formData.cantidad),
        tipo_uso: formData.tipo_uso,
        balance_masa_id: formData.tipo_uso === 'balance_de_masa' && formData.balance_masa_id
          ? formData.balance_masa_id
          : null,
        observaciones: formData.observaciones,
        documentoSoporteUrl,
        'Realiza Registro': getCurrentUserName(),
      };

      const response = await fetch('/api/inventario/remove-quantity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al registrar salida de insumo');
      }

      const responseData = await response.json();

      // Mostrar info de rotación del paquete de lonas
      if (responseData.paquete_lonas) {
        setPaqueteLonasInfo({
          nuevo_id: responseData.paquete_lonas.nuevo_id ?? null,
          anterior_id: responseData.paquete_lonas.anterior_id ?? null,
          anterior_dias_uso: responseData.paquete_lonas.anterior_dias_uso ?? null,
        });
        // Esperar 4s para que el usuario vea el mensaje antes de cerrar
        await new Promise(resolve => setTimeout(resolve, 4000));
      }

      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleVoiceText = (text: string) => {
    setFormData(prev => ({
      ...prev,
      observaciones: prev.observaciones ? `${prev.observaciones} ${text}` : text,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <div className="space-y-6">
        {/* Seleccionar Insumo */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Seleccionar Insumo *</label>
          <select
            value={formData.selectedItemId}
            onChange={(e) => {
              setFormData({ ...formData, selectedItemId: e.target.value });
              setError('');
            }}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm"
            required
          >
            <option value="" className="bg-gray-800">Seleccionar insumo existente</option>
            {records.map((item) => (
              <option key={item.id} value={item.id} className="bg-gray-800">
                {getItemName(item)} - {getItemCategory(item)} - Presentación: {getItemQuantity(item)} {getItemPresentacion(item)}
              </option>
            ))}
          </select>
          {formData.selectedItemId && (
            <p className="text-sm text-blue-200 mt-2 drop-shadow">
              📊 Stock disponible: <span className="font-semibold">
                {(() => {
                  const selectedItem = records.find(item => item.id === formData.selectedItemId);
                  return selectedItem ? getItemStockTotal(selectedItem) : 0;
                })()} {(() => {
                  const selectedItem = records.find(item => item.id === formData.selectedItemId);
                  return selectedItem ? getItemPresentacion(selectedItem) || 'unidades' : 'unidades';
                })()}
              </span>
            </p>
          )}
        </div>

        {/* Cantidad */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Cantidad a Remover *</label>
          <input
            type="number"
            value={formData.cantidad}
            onChange={(e) => {
              setFormData({ ...formData, cantidad: e.target.value });
              setError('');
            }}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm"
            placeholder="Ej: 5"
            min="0"
            step="0.01"
            required
          />
        </div>

        {/* Tipo de Uso (ENUM) */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Tipo de Uso *</label>
          <select
            value={formData.tipo_uso}
            onChange={(e) => setFormData({ ...formData, tipo_uso: e.target.value as TipoUso, balance_masa_id: '' })}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm"
            required
          >
            {TIPO_USO_VALUES.map((tipo) => (
              <option key={tipo} value={tipo} className="bg-gray-800">
                {TIPO_USO_ICONS[tipo]} {TIPO_USO_LABELS[tipo]}
              </option>
            ))}
          </select>

          {/* Badge es_productivo */}
          <div className="mt-2">
            {esProductivo ? (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-500/30 text-green-200 border border-green-500/30">
                ✅ Productivo — Se vinculará a producción
              </span>
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/30 text-yellow-200 border border-yellow-500/30">
                ⚙️ Operativo — Uso no productivo
              </span>
            )}
          </div>
        </div>

        {/* Selector de Balance de Masa (solo si tipo_uso = balance_de_masa) */}
        {formData.tipo_uso === 'balance_de_masa' && (
          <div className="bg-white/5 rounded-lg p-4 border border-green-500/20">
            <label className="block text-sm font-semibold mb-2 text-green-200 drop-shadow">
              ⚖️ Vincular a Balance de Masa (Opcional)
            </label>
            {loadingBalances ? (
              <p className="text-white/60 text-sm">Cargando balances...</p>
            ) : (
              <select
                value={formData.balance_masa_id}
                onChange={(e) => setFormData({ ...formData, balance_masa_id: e.target.value })}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent backdrop-blur-sm"
              >
                <option value="" className="bg-gray-800">Sin vincular (opcional)</option>
                {balancesActivos.map((balance) => (
                  <option key={balance.id} value={balance.id} className="bg-gray-800">
                    Balance {balance.id.slice(-6)} — {String(balance.fields?.['Peso Biochar (KG)'] ?? 0)} KG
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-green-200/70 mt-1 drop-shadow">
              Puedes vincular esta salida directamente a un balance de masa del turno actual.
            </p>
          </div>
        )}

        {/* Observaciones */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
            Observaciones {formData.tipo_uso === 'otro' && <span className="text-red-300">*</span>}
          </label>
          <div className="relative">
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm resize-none pr-12"
              placeholder={formData.tipo_uso === 'otro' ? 'Describe el motivo de la salida (obligatorio)...' : 'Detalles adicionales sobre la salida...'}
              rows={3}
              required={formData.tipo_uso === 'otro'}
            />
            <VoiceToText
              onTextExtracted={handleVoiceText}
              isLoading={creating}
            />
          </div>
        </div>

        {/* Documento Soporte */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">📎 Documento de Soporte (Opcional)</label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFormData({ ...formData, documentoSoporte: e.target.files?.[0] || null })}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
          />
          <p className="text-xs text-white/60 mt-2 drop-shadow">
            PDF, JPG, PNG (máximo 10MB)
          </p>
          {formData.documentoSoporte && (
            <div className="mt-2 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
              <p className="text-green-200 text-sm drop-shadow">
                ✅ Archivo seleccionado: {formData.documentoSoporte.name}
              </p>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
            <p className="text-red-200 text-sm drop-shadow">⚠️ {error}</p>
          </div>
        )}

        {/* Info de rotación del paquete de lonas */}
        {paqueteLonasInfo && (
          <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
            <p className="text-green-100 text-sm font-semibold drop-shadow">
              📦 Nuevo paquete de lonas activado.
              {paqueteLonasInfo.anterior_id && paqueteLonasInfo.anterior_dias_uso !== null && (
                <> El paquete anterior fue retirado tras {paqueteLonasInfo.anterior_dias_uso} días de uso.</>
              )}
            </p>
          </div>
        )}

        {/* Registrado por */}
        <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-lg p-4 border border-red-500/20">
          <label className="block text-sm font-semibold mb-2 text-red-200 drop-shadow">Registrado por:</label>
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
          disabled={creating}
          className="px-6 py-3 rounded-lg font-semibold transition-all duration-200 backdrop-blur-sm bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? '📤 Registrando Salida...' : '📤 Registrar Salida'}
        </button>
      </div>
    </form>
  );
}

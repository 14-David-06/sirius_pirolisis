/**
 * Formulario de Ingreso de Insumo
 * Permite agregar cantidades a insumos existentes en el inventario
 */

"use client";

import { useState } from 'react';
import type { InventarioRecord, IngresoInsumoFormData } from '@/types/inventario';

interface IngresoInsumoFormProps {
  records: InventarioRecord[];
  onSuccess: () => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
  getItemName: (record: InventarioRecord) => string;
  getItemCategory: (record: InventarioRecord) => string;
  getItemStockTotal: (record: InventarioRecord) => number;
}

export default function IngresoInsumoForm({
  records,
  onSuccess,
  onCancel,
  getCurrentUserName,
  getItemName,
  getItemCategory,
  getItemStockTotal,
}: IngresoInsumoFormProps) {
  const [formData, setFormData] = useState<IngresoInsumoFormData>({
    selectedItemId: '',
    cantidad: '',
    notas: ''
  });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.selectedItemId || !formData.cantidad) {
      alert('Por favor selecciona un insumo y especifica la cantidad a agregar');
      return;
    }

    setCreating(true);

    try {
      const quantityData = {
        itemId: formData.selectedItemId,
        cantidad: parseFloat(formData.cantidad),
        notas: formData.notas,
        'Realiza Registro': getCurrentUserName(),
        tipo: 'entrada' // Para diferenciar de salidas
      };

      const response = await fetch('/api/inventario/add-quantity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quantityData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al agregar cantidad');
      }

      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Error al agregar cantidad: ${message}`);
    } finally {
      setCreating(false);
    }
  };

  const selectedItem = records.find(r => r.id === formData.selectedItemId);

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <div className="space-y-6">
        {/* Seleccionar Insumo */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
            Seleccionar Insumo *
          </label>
          <select
            value={formData.selectedItemId}
            onChange={(e) => setFormData({...formData, selectedItemId: e.target.value})}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
            required
          >
            <option value="" className="bg-gray-800">Seleccionar insumo existente</option>
            {records.map((item) => (
              <option key={item.id} value={item.id} className="bg-gray-800">
                {getItemName(item)} — {getItemCategory(item)} (Stock: {getItemStockTotal(item)} kg)
              </option>
            ))}
          </select>
          {selectedItem && (
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg">
              <p className="text-sm text-blue-200 font-semibold">{getItemName(selectedItem)}</p>
              <p className="text-xs text-white/60 mt-1">Categoría: {getItemCategory(selectedItem)}</p>
              <p className="text-xs text-blue-300 mt-1">
                📊 Stock actual: <span className="font-bold">{getItemStockTotal(selectedItem)} kg</span>
              </p>
            </div>
          )}
        </div>

        {/* Cantidad a Agregar */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
            Cantidad a Agregar <span className="text-blue-300 font-bold">(kg)</span> *
          </label>
          <div className="relative">
            <input
              type="number"
              value={formData.cantidad}
              onChange={(e) => setFormData({...formData, cantidad: e.target.value})}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full p-3 pr-14 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
              placeholder="Ej: 25.5"
              min="0"
              step="0.01"
              required
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 font-bold text-sm pointer-events-none">
              kg
            </span>
          </div>
          <p className="text-xs text-white/50 mt-1">Ingresa siempre en kilogramos (kg)</p>
        </div>

        {/* Registrado por */}
        <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-lg p-4 border border-green-500/20">
          <label className="block text-sm font-semibold mb-2 text-green-200 drop-shadow">
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
          disabled={creating}
          className="px-6 py-3 rounded-lg font-semibold transition-all duration-200 backdrop-blur-sm bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-green-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? '📦 Ingresando...' : '✅ Ingresar Cantidad'}
        </button>
      </div>
    </form>
  );
}

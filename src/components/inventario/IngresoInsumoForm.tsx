/**
 * Formulario de Ingreso de Insumo
 * Permite agregar cantidades a insumos existentes en el inventario
 */

"use client";

import { useState, useRef, useEffect } from 'react';
import EditarInsumoPanel from './EditarInsumoPanel';
import { IconPencil } from './Icons';
import type { InventarioRecord, IngresoInsumoFormData } from '@/types/inventario';

interface IngresoInsumoFormProps {
  records: InventarioRecord[];
  onSuccess: () => void;
  onCancel: () => void;
  getCurrentUserName: () => string;
  getCurrentUserIdCore?: () => string;
  getItemName: (record: InventarioRecord) => string;
  getItemStockTotal: (record: InventarioRecord) => number;
  getMinStock: (record: InventarioRecord) => number;
  getItemUnit: (record: InventarioRecord) => string;
  /** Recarga el inventario tras editar un insumo desde este formulario. */
  onInsumoActualizado?: () => void;
}

export default function IngresoInsumoForm({
  records,
  onSuccess,
  onCancel,
  getCurrentUserName,
  getCurrentUserIdCore,
  getItemName,
  getItemStockTotal,
  getMinStock,
  getItemUnit,
  onInsumoActualizado,
}: IngresoInsumoFormProps) {
  const [formData, setFormData] = useState<IngresoInsumoFormData>({
    selectedItemId: '',
    cantidad: '',
    notas: ''
  });
  const [creating, setCreating] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editando, setEditando] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar insumos por nombre
  const filteredRecords = records.filter(item => {
    const name = String(getItemName(item) || '').toLowerCase();
    return name.includes(searchText.toLowerCase());
  });

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
        'ID Responsable Core': getCurrentUserIdCore?.() || getCurrentUserName(),
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

  const handleSelectItem = (item: InventarioRecord) => {
    setFormData({...formData, selectedItemId: item.id});
    setSearchText(getItemName(item));
    setShowSuggestions(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    setShowSuggestions(true);
    // Limpiar selección si el usuario está escribiendo
    if (formData.selectedItemId) {
      setFormData({...formData, selectedItemId: ''});
    }
  };

  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const itemId = e.target.value;
    setFormData({...formData, selectedItemId: itemId});
    if (itemId) {
      const item = records.find(r => r.id === itemId);
      if (item) {
        setSearchText(getItemName(item));
      }
    } else {
      setSearchText('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <div className="space-y-6">
        {/* Seleccionar Insumo con búsqueda */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10 relative">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
            Seleccionar Insumo *
          </label>
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchText}
              onChange={handleSearchChange}
              onFocus={() => setShowSuggestions(true)}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
              placeholder="🔍 Buscar insumo por nombre..."
              required={!formData.selectedItemId}
            />

            {/* Lista de sugerencias */}
            {showSuggestions && searchText && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 w-full mt-1 bg-gray-900 border border-white/20 rounded-lg shadow-xl max-h-60 overflow-y-auto backdrop-blur-md"
              >
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className="w-full text-left p-3 hover:bg-blue-600/30 transition-colors border-b border-white/10 last:border-b-0"
                    >
                      <p className="text-sm text-white font-semibold">{getItemName(item)}</p>
                      <p className="text-xs text-white/60">
                        Stock: {getItemStockTotal(item)} {getItemUnit(item)}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-white/60 text-sm">
                    No se encontraron insumos
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dropdown tradicional (alternativa al campo de búsqueda) */}
          <div className="mt-3">
            <label className="block text-xs text-white/60 mb-1">O selecciona de la lista completa:</label>
            <select
              value={formData.selectedItemId}
              onChange={handleDropdownChange}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
            >
              <option value="" className="bg-gray-800">-- Seleccionar de la lista --</option>
              {records.map((item) => (
                <option key={item.id} value={item.id} className="bg-gray-800">
                  {getItemName(item)} (Stock: {getItemStockTotal(item)} {getItemUnit(item)})
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <>
              {/* Click en el insumo seleccionado → editarlo (nombre y mínimo). */}
              <button
                type="button"
                onClick={() => setEditando((previo) => !previo)}
                aria-expanded={editando}
                className="mt-3 w-full text-left p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg hover:bg-blue-500/20 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-blue-200 font-semibold">{getItemName(selectedItem)}</p>
                  <span className="shrink-0 inline-flex items-center gap-1 text-xs text-white/70">
                    <IconPencil className="w-3.5 h-3.5" />
                    {editando ? 'Cerrar' : 'Editar'}
                  </span>
                </div>
                <p className="text-xs text-blue-300 mt-1">
                  📊 Stock actual: <span className="font-bold">{getItemStockTotal(selectedItem)} {getItemUnit(selectedItem)}</span>
                  <span className="text-white/50"> · Mínimo: {getMinStock(selectedItem)} {getItemUnit(selectedItem)}</span>
                </p>
              </button>

              {editando && (
                <EditarInsumoPanel
                  item={selectedItem}
                  getItemName={getItemName}
                  getMinStock={getMinStock}
                  getItemUnit={getItemUnit}
                  onCancel={() => setEditando(false)}
                  onSaved={(nombre) => {
                    setEditando(false);
                    setSearchText(nombre);
                    onInsumoActualizado?.();
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Cantidad a Agregar */}
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <label className="block text-sm font-semibold mb-2 text-white drop-shadow">
            Cantidad a Agregar {selectedItem && <span className="text-blue-300 font-bold">({getItemUnit(selectedItem)})</span>} *
          </label>
          <div className="relative">
            <input
              type="number"
              value={formData.cantidad}
              onChange={(e) => setFormData({...formData, cantidad: e.target.value})}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full p-3 pr-20 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
              placeholder="Ej: 25.5"
              min="0"
              step="0.01"
              required
            />
            {selectedItem && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 font-bold text-sm pointer-events-none">
                {getItemUnit(selectedItem)}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-1">
            {selectedItem
              ? `Ingresa la cantidad en ${getItemUnit(selectedItem)}`
              : 'Selecciona un insumo para ver su unidad de medida'
            }
          </p>
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

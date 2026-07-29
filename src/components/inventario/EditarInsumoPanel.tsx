/**
 * Edición rápida de un insumo desde los formularios de Ingreso y Salida.
 *
 * El operario que está registrando un movimiento es quien detecta que el nombre
 * está mal escrito o que el mínimo de reposición no corresponde, así que se
 * corrige ahí mismo en vez de pedir un cambio en Airtable.
 *
 * Solo nombre y stock mínimo: la unidad base reinterpretaría el stock histórico
 * ya registrado, y la categoría no la usa este módulo.
 *
 * El aislamiento por área lo garantiza el servidor
 * (PATCH /api/inventario/update/[id] valida `ID Area Origen`), no este panel.
 */

"use client";

import { useState } from 'react';
import { STOCK_MINIMO_DEFAULT } from '@/lib/inventario.constants';
import type { InventarioRecord } from '@/types/inventario';

interface EditarInsumoPanelProps {
  item: InventarioRecord;
  getItemName: (record: InventarioRecord) => string;
  getMinStock: (record: InventarioRecord) => number;
  getItemUnit: (record: InventarioRecord) => string;
  /**
   * Se llama tras guardar, para que el contenedor recargue el inventario.
   * Recibe el nombre ya guardado, útil para refrescar el buscador del formulario.
   */
  onSaved: (nombre: string) => void;
  onCancel: () => void;
}

export default function EditarInsumoPanel({
  item,
  getItemName,
  getMinStock,
  getItemUnit,
  onSaved,
  onCancel,
}: EditarInsumoPanelProps) {
  const [nombre, setNombre] = useState(getItemName(item));
  const [stockMinimo, setStockMinimo] = useState(String(getMinStock(item) || STOCK_MINIMO_DEFAULT));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const unidad = getItemUnit(item);

  const guardar = async () => {
    const nombreLimpio = nombre.trim();
    const minimo = Number(stockMinimo);

    if (!nombreLimpio) {
      setError('El nombre no puede quedar vacío');
      return;
    }
    if (!Number.isFinite(minimo) || minimo < 0) {
      setError('El stock mínimo debe ser un número mayor o igual a 0');
      return;
    }

    setError('');
    setGuardando(true);

    try {
      const response = await fetch(`/api/inventario/update/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreLimpio, stockMinimo: minimo }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.details || data?.error || 'No se pudo actualizar el insumo');
      }

      onSaved(String(data?.data?.nombre || nombreLimpio));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-white/5 border border-white/15 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
        Editar insumo
      </p>

      <div>
        <label htmlFor="editar-insumo-nombre" className="block text-xs text-white/60 mb-1">
          Nombre
        </label>
        <input
          id="editar-insumo-nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full p-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          placeholder="Nombre del insumo"
        />
      </div>

      <div>
        <label htmlFor="editar-insumo-minimo" className="block text-xs text-white/60 mb-1">
          Stock mínimo ({unidad})
        </label>
        <input
          id="editar-insumo-minimo"
          type="number"
          value={stockMinimo}
          onChange={(e) => setStockMinimo(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          min="0"
          step="0.01"
          className="w-full p-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        />
        <p className="text-xs text-white/45 mt-1">
          Por debajo de este valor el insumo aparece en “Requieren reposición”.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-200 bg-rose-500/15 border border-rose-400/25 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={guardando}
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-sm text-white/85 hover:bg-white/20 transition-colors duration-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-semibold text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

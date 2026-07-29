/**
 * Registro de entradas de materia prima a la bodega (bioabono y biológicos).
 *
 * Reutiliza los endpoints que ya alimentan la producción de Blend en lugar de
 * crear otros: así una entrada hecha desde la bodega es indistinguible de una
 * hecha desde cualquier otro punto del sistema, y el stock que verifica la
 * producción es el mismo.
 *
 * El biochar no aparece aquí: no se digita, entra al inventario al registrar la
 * producción de un bache.
 */

"use client";

import { useState } from 'react';
import { formatStock } from '@/lib/inventario.format';
import { MENSAJES_BODEGA } from '@/lib/bodega.constants';
import type { MateriaPrima } from '@/types/bodega';
import type { MateriaPrimaKey } from '@/lib/bodega.constants';

/** Endpoint de entrada por materia prima (ya existentes, migrados al Core). */
const ENDPOINT_ENTRADA: Partial<Record<MateriaPrimaKey, string>> = {
  bioabono: '/api/pirolisis/inventario/entrada-abono4g',
  biologicos: '/api/pirolisis/inventario/entrada-biologicos',
};

interface EntradaMateriaPrimaFormProps {
  /** Materias primas con entrada manual (las que viven en Insumos Core). */
  materiales: MateriaPrima[];
  /** Materia prima preseleccionada al abrir el formulario. */
  materialInicial?: MateriaPrimaKey | null;
  getCurrentUserName: () => string;
  getCurrentUserIdCore: () => string;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
}

export default function EntradaMateriaPrimaForm({
  materiales,
  materialInicial,
  getCurrentUserName,
  getCurrentUserIdCore,
  onSuccess,
  onCancel,
}: EntradaMateriaPrimaFormProps) {
  const [materialKey, setMaterialKey] = useState<string>(
    materialInicial && ENDPOINT_ENTRADA[materialInicial] ? materialInicial : ''
  );
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const material = materiales.find((item) => item.key === materialKey);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!material) {
      setError(MENSAJES_BODEGA.ERROR.SELECCIONAR_MATERIAL);
      return;
    }

    const cantidadNumerica = parseFloat(cantidad);
    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      setError(MENSAJES_BODEGA.ERROR.CANTIDAD_INVALIDA);
      return;
    }

    const endpoint = ENDPOINT_ENTRADA[material.key];
    if (!endpoint) {
      setError(MENSAJES_BODEGA.ERROR.BIOCHAR_NO_MANUAL);
      return;
    }

    setEnviando(true);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cantidad: cantidadNumerica,
          notas: notas.trim() || undefined,
          realizaRegistro: getCurrentUserName(),
          idResponsableCore: getCurrentUserIdCore(),
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Error al registrar la entrada');
      }

      onSuccess(
        `${MENSAJES_BODEGA.EXITO.ENTRADA}: ${formatStock(cantidadNumerica, material.unidad)} de ${material.nombre.toLowerCase()}`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <div className="space-y-5">
        <div>
          <label htmlFor="entrada-material" className="block text-sm font-medium text-white">
            Materia prima *
          </label>
          <select
            id="entrada-material"
            value={materialKey}
            onChange={(event) => setMaterialKey(event.target.value)}
            required
            className="mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            <option value="" className="bg-slate-800">
              Selecciona una materia prima
            </option>
            {materiales.map((item) => (
              <option key={item.key} value={item.key} className="bg-slate-800">
                {item.nombre} — stock {formatStock(item.stock, item.unidad)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="entrada-cantidad" className="block text-sm font-medium text-white">
            Cantidad que entra {material && <span className="text-sky-300">({material.unidad})</span>} *
          </label>
          <div className="relative mt-1.5">
            <input
              id="entrada-cantidad"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cantidad}
              onChange={(event) => setCantidad(event.target.value)}
              onWheel={(event) => event.currentTarget.blur()}
              required
              placeholder="Ej: 740"
              className="w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 pr-14 text-sm text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
            />
            {material && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-sky-300">
                {material.unidad}
              </span>
            )}
          </div>
          {material && (
            <p className="mt-1.5 text-xs text-white/50">
              Stock actual: {formatStock(material.stock, material.unidad)} → quedará en{' '}
              {formatStock(material.stock + (parseFloat(cantidad) || 0), material.unidad)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="entrada-notas" className="block text-sm font-medium text-white">
            Observaciones
          </label>
          <textarea
            id="entrada-notas"
            rows={3}
            value={notas}
            onChange={(event) => setNotas(event.target.value)}
            placeholder="Remisión, proveedor, lote…"
            className="mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          />
        </div>

        <div className="rounded-lg bg-white/5 ring-1 ring-white/10 px-4 py-3">
          <p className="text-xs text-white/50">Registra</p>
          <p className="mt-0.5 text-sm font-medium text-white">{getCurrentUserName()}</p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-500/10 ring-1 ring-rose-400/25 px-4 py-3 text-sm text-rose-200"
          >
            {error}
          </p>
        )}
      </div>

      <div className="mt-7 flex justify-end gap-3 border-t border-white/10 pt-5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white/5 ring-1 ring-white/15 px-4 py-2.5 text-sm font-medium text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {enviando ? 'Registrando…' : 'Registrar entrada'}
        </button>
      </div>
    </form>
  );
}

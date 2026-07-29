/**
 * Salida manual de materia prima de la bodega (bioabono y biológicos).
 *
 * ⚠️ El consumo por producción de Blend NO se registra aquí: al confirmar una
 * producción, la auto-deducción descuenta bioabono, biológicos y biochar según
 * la fórmula. Este formulario existe para lo que la fórmula no explica —una
 * pérdida, un derrame, un ajuste de conteo— y por eso no ofrece el tipo de uso
 * "balance de masa": registrarlo a mano duplicaría el descuento.
 */

"use client";

import { useState } from 'react';
import { formatStock } from '@/lib/inventario.format';
import { MENSAJES_BODEGA, TIPOS_SALIDA_BODEGA } from '@/lib/bodega.constants';
import type { MateriaPrima } from '@/types/bodega';
import type { MateriaPrimaKey } from '@/lib/bodega.constants';

interface SalidaMateriaPrimaFormProps {
  /** Materias primas gestionables (las que viven en Insumos Core). */
  materiales: MateriaPrima[];
  materialInicial?: MateriaPrimaKey | null;
  getCurrentUserName: () => string;
  getCurrentUserIdCore: () => string;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
}

export default function SalidaMateriaPrimaForm({
  materiales,
  materialInicial,
  getCurrentUserName,
  getCurrentUserIdCore,
  onSuccess,
  onCancel,
}: SalidaMateriaPrimaFormProps) {
  const [materialKey, setMaterialKey] = useState<string>(materialInicial ?? '');
  const [cantidad, setCantidad] = useState('');
  const [tipoUso, setTipoUso] = useState<string>(TIPOS_SALIDA_BODEGA[0].value);
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const material = materiales.find((item) => item.key === materialKey);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!material || !material.insumoId) {
      setError(MENSAJES_BODEGA.ERROR.SELECCIONAR_MATERIAL);
      return;
    }

    const cantidadNumerica = parseFloat(cantidad);
    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      setError(MENSAJES_BODEGA.ERROR.CANTIDAD_INVALIDA);
      return;
    }

    if (cantidadNumerica > material.stock) {
      setError(
        MENSAJES_BODEGA.ERROR.STOCK_INSUFICIENTE(cantidadNumerica, material.stock, material.unidad)
      );
      return;
    }

    if (tipoUso === 'otro' && !observaciones.trim()) {
      setError(MENSAJES_BODEGA.ERROR.OBSERVACIONES_REQUERIDAS);
      return;
    }

    setEnviando(true);

    try {
      const response = await fetch('/api/inventario/remove-quantity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: material.insumoId,
          cantidad: cantidadNumerica,
          tipo_uso: tipoUso,
          observaciones: observaciones.trim() || undefined,
          'Realiza Registro': getCurrentUserName(),
          'ID Responsable Core': getCurrentUserIdCore(),
        }),
      });

      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(result.error || 'Error al registrar la salida');
      }

      onSuccess(
        `${MENSAJES_BODEGA.EXITO.SALIDA}: ${formatStock(cantidadNumerica, material.unidad)} de ${material.nombre.toLowerCase()}`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <p className="rounded-lg bg-amber-500/10 ring-1 ring-amber-400/25 px-4 py-3 text-xs leading-relaxed text-amber-200">
        El consumo por producción de Blend se descuenta automáticamente al confirmar la producción.
        Usa esta salida solo para pérdidas, daños o ajustes de conteo.
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <label htmlFor="salida-material" className="block text-sm font-medium text-white">
            Materia prima *
          </label>
          <select
            id="salida-material"
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
          <label htmlFor="salida-cantidad" className="block text-sm font-medium text-white">
            Cantidad que sale {material && <span className="text-sky-300">({material.unidad})</span>} *
          </label>
          <div className="relative mt-1.5">
            <input
              id="salida-cantidad"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max={material ? material.stock : undefined}
              value={cantidad}
              onChange={(event) => setCantidad(event.target.value)}
              onWheel={(event) => event.currentTarget.blur()}
              required
              placeholder="Ej: 12,5"
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
              Disponible: {formatStock(material.stock, material.unidad)} → quedará en{' '}
              {formatStock(
                Math.max(0, material.stock - (parseFloat(cantidad) || 0)),
                material.unidad
              )}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="salida-tipo" className="block text-sm font-medium text-white">
            Motivo *
          </label>
          <select
            id="salida-tipo"
            value={tipoUso}
            onChange={(event) => setTipoUso(event.target.value)}
            required
            className="mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            {TIPOS_SALIDA_BODEGA.map((tipo) => (
              <option key={tipo.value} value={tipo.value} className="bg-slate-800">
                {tipo.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="salida-observaciones" className="block text-sm font-medium text-white">
            Observaciones {tipoUso === 'otro' && <span className="text-rose-300">*</span>}
          </label>
          <textarea
            id="salida-observaciones"
            rows={3}
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            required={tipoUso === 'otro'}
            placeholder="Qué pasó y por qué sale de bodega"
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
          className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {enviando ? 'Registrando…' : 'Registrar salida'}
        </button>
      </div>
    </form>
  );
}

/**
 * Salida de un bache por un motivo que no es producción de Blend.
 *
 * La bodega no digita salidas de bioabono ni de biológicos —esas las descuenta la
 * auto-deducción al producir—, pero el biochar sí sale por otras puertas: un bigbag
 * que va al laboratorio, una muestra para un cliente, un derrame. Antes eso se
 * registraba como una remisión de baches, que descontaba la fórmula del bache pero
 * no el libro mayor del Core ni el `Estado Bache`. Este formulario llama al
 * endpoint que escribe las tres cosas.
 */

"use client";

import { useState } from 'react';
import { formatStock } from '@/lib/inventario.format';
import { MOTIVOS_SALIDA } from '@/lib/salida-bache.constants';
import type { MotivoSalida } from '@/lib/salida-bache.constants';
import type { BacheBiochar } from '@/types/bodega';

const MOTIVOS = Object.entries(MOTIVOS_SALIDA) as [
  MotivoSalida,
  (typeof MOTIVOS_SALIDA)[MotivoSalida],
][];

const INPUT_CLASS =
  'mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70';

interface SalidaBacheFormProps {
  bache: BacheBiochar;
  getCurrentUserName: () => string;
  getCurrentUserIdCore: () => string;
  onSuccess: (mensaje: string) => void;
  onCancel: () => void;
}

export default function SalidaBacheForm({
  bache,
  getCurrentUserName,
  getCurrentUserIdCore,
  onSuccess,
  onCancel,
}: SalidaBacheFormProps) {
  const [motivo, setMotivo] = useState<MotivoSalida>('laboratorio');
  const [completo, setCompleto] = useState(true);
  const [kg, setKg] = useState(String(bache.kg));
  const [destino, setDestino] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  const kgNumerico = completo ? bache.kg : parseFloat(kg);
  const restante = bache.kg - (Number.isFinite(kgNumerico) ? kgNumerico : 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setAvisos([]);

    if (!completo && (!Number.isFinite(kgNumerico) || kgNumerico <= 0)) {
      setError('Ingresa los KG que salen, o marca que el bache sale completo.');
      return;
    }
    if (!completo && kgNumerico > bache.kg) {
      setError(`El bache ${bache.codigo} solo tiene ${formatStock(bache.kg, 'kg')} disponibles.`);
      return;
    }
    if (!destino.trim()) {
      setError('Indica a dónde o a quién fue: sin destino la salida no queda trazable.');
      return;
    }

    setEnviando(true);

    try {
      const response = await fetch('/api/baches/salida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bache: bache.codigo,
          motivo,
          // Omitido = el bache completo. Lo resuelve el servidor contra el
          // disponible real, no contra el número que esta pantalla alcanzó a leer.
          kg: completo ? undefined : kgNumerico,
          destino: destino.trim(),
          observaciones: observaciones.trim() || undefined,
          fecha,
          realizaRegistro: getCurrentUserName(),
          idResponsableCore: getCurrentUserIdCore(),
        }),
      });

      const result = await response.json();

      if (!response.ok && response.status !== 207) {
        throw new Error(result.error || 'Error al registrar la salida');
      }

      // 207: el bache quedó descontado pero un paso de trazabilidad falló. No es un
      // error que deba borrar el formulario, pero tampoco se puede callar: el
      // operador tiene que saber qué quedó a medias.
      if (response.status === 207) {
        const fallidos: string[] = (result.steps ?? [])
          .filter((paso: { ok: boolean }) => !paso.ok)
          .map((paso: { step: string; error?: string }) => `${paso.step}: ${paso.error ?? 'falló'}`);
        setAvisos(fallidos);
        setEnviando(false);
        return;
      }

      onSuccess(result.message ?? 'Salida registrada');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <div className="space-y-5">
        <div className="rounded-lg bg-white/5 ring-1 ring-white/10 px-4 py-3">
          <p className="text-xs text-white/50">Bache</p>
          <p className="mt-0.5 text-sm font-medium text-white">
            {bache.codigo} — {formatStock(bache.kg, 'kg')} de biochar seco
          </p>
        </div>

        <div>
          <label htmlFor="salida-motivo" className="block text-sm font-medium text-white">
            Motivo de la salida *
          </label>
          <select
            id="salida-motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value as MotivoSalida)}
            required
            className={INPUT_CLASS}
          >
            {MOTIVOS.map(([key, info]) => (
              <option key={key} value={key} className="bg-slate-800">
                {info.etiqueta}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-white/50">{MOTIVOS_SALIDA[motivo].descripcion}</p>
        </div>

        <div>
          <label htmlFor="salida-destino" className="block text-sm font-medium text-white">
            Destino *
          </label>
          <input
            id="salida-destino"
            type="text"
            value={destino}
            onChange={(event) => setDestino(event.target.value)}
            required
            maxLength={120}
            placeholder="Laboratorio, área o quien recibe"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <span className="block text-sm font-medium text-white">Cantidad que sale *</span>
          <label className="mt-2 flex items-center gap-2.5 text-sm text-white/80">
            <input
              type="checkbox"
              checked={completo}
              onChange={(event) => setCompleto(event.target.checked)}
              className="h-4 w-4 rounded border-white/25 bg-white/10 text-emerald-500 focus:ring-2 focus:ring-sky-400/70"
            />
            El bache sale completo ({formatStock(bache.kg, 'kg')})
          </label>

          {!completo && (
            <div className="relative mt-2">
              <input
                id="salida-kg"
                type="number"
                inputMode="decimal"
                min="0"
                max={bache.kg}
                step="0.01"
                value={kg}
                onChange={(event) => setKg(event.target.value)}
                onWheel={(event) => event.currentTarget.blur()}
                required
                className={`${INPUT_CLASS} pr-14`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-sky-300">
                kg
              </span>
            </div>
          )}

          {/* El estado al que va el bache es consecuencia del saldo, no una opción:
              conviene que el operador lo vea antes de confirmar. */}
          <p className="mt-1.5 text-xs text-white/50">
            Quedará {formatStock(Math.max(restante, 0), 'kg')} → el bache pasa a{' '}
            <span className="text-white/70">
              {restante <= 0.01 ? 'Bache Agotado' : 'Bache Incompleto'}
            </span>
          </p>
        </div>

        <div>
          <label htmlFor="salida-fecha" className="block text-sm font-medium text-white">
            Fecha de la salida *
          </label>
          <input
            id="salida-fecha"
            type="date"
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
            required
            className={INPUT_CLASS}
          />
          <p className="mt-1.5 text-xs text-white/50">
            Si el bache salió otro día, corrige la fecha: es parte de la referencia de la salida.
          </p>
        </div>

        <div>
          <label htmlFor="salida-observaciones" className="block text-sm font-medium text-white">
            Observaciones
          </label>
          <textarea
            id="salida-observaciones"
            rows={3}
            value={observaciones}
            onChange={(event) => setObservaciones(event.target.value)}
            placeholder="Análisis solicitado, quién autorizó, número de guía…"
            className={INPUT_CLASS}
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

        {avisos.length > 0 && (
          <div role="alert" className="rounded-lg bg-amber-500/10 ring-1 ring-amber-400/25 px-4 py-3">
            <p className="text-sm font-semibold text-amber-200">
              El bache se descontó, pero quedaron pasos sin completar
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
              {avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-100/70">
              Volver a enviar la misma salida completa lo que falta; no descuenta dos veces.
            </p>
          </div>
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
          className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {enviando ? 'Registrando…' : 'Registrar salida'}
        </button>
      </div>
    </form>
  );
}

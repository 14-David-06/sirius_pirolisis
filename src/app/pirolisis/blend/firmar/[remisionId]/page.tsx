'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

interface RemisionData {
  id: string;
  id_legible: string | null;
  cliente: string | null;
  fecha_evento: string | null;
  kg_total_despachados: number | null;
  co2_secuestrado_kg: number | null;
  responsable_recibe: string | null;
  num_doc_recibe: string | null;
  email_recibe: string | null;
  estado: string | null;
  compromiso_aceptado: boolean;
  firma_timestamp: string | null;
  documento_url: string | null;
}

const COMPROMISO_TEXT = `COMPROMISO DE USO RESPONSABLE — BIOCHAR BLEND SIRIUS PIRÓLISIS

El receptor del presente producto declara conocer y aceptar:

1. El Biochar Blend Sirius es un producto con carbono estabilizado certificado.

2. QUEDA ESTRICTAMENTE PROHIBIDA la quema o incineración de este producto bajo cualquier circunstancia, dado que revertiría el carbono secuestrado a la atmósfera e invalidaría la certificación de carbono asociada.

3. El uso del producto debe ser exclusivamente agrícola: enmienda de suelos, compostaje o mejora de estructura edáfica.

4. El incumplimiento puede generar responsabilidades legales y anular la certificación de carbono de esta entrega.

Al firmar digitalmente, el receptor acepta estos términos de forma vinculante.

⚠️ TODO: Este texto debe ser revisado y aprobado por la dirección de Sirius antes del despliegue en producción.`;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Pantallas de estado ──────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Cargando remisión...</p>
      </div>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">No disponible</h1>
        <p className="text-gray-500 text-sm mb-6">{message}</p>
        <button
          onClick={onRetry}
          className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold text-sm"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}

function AlreadySignedScreen({
  remision,
  timestamp,
}: {
  remision: RemisionData | null;
  timestamp: string | null;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Firma registrada</h1>
        {timestamp && (
          <p className="text-gray-500 text-sm mb-3">{formatTimestamp(timestamp)}</p>
        )}
        {remision?.responsable_recibe && (
          <p className="text-gray-700 font-medium">{remision.responsable_recibe}</p>
        )}
        <p className="text-green-700 font-semibold text-sm mt-4">
          {remision?.id_legible ?? remision?.id ?? ''}
        </p>
      </div>
    </div>
  );
}

function CancelledScreen({ idLegible }: { idLegible: string | null }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Remisión cancelada</h1>
        <p className="text-gray-500 text-sm">{idLegible ?? ''}</p>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FirmarRemisionPage() {
  const { remisionId } = useParams<{ remisionId: string }>();

  const [remision, setRemision] = useState<RemisionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [compromisoAceptado, setCompromisoAceptado] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successTimestamp, setSuccessTimestamp] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const loadRemision = () => {
    if (!remisionId) return;
    setLoading(true);
    setFetchError(null);
    fetch(`/api/pirolisis/blend/firmar/${remisionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setFetchError(data.error);
        else setRemision(data as RemisionData);
      })
      .catch(() => setFetchError('Error de red. Intenta de nuevo.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRemision(); }, [remisionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas helpers ────────────────────────────────────────────────────────

  function getCanvasPos(
    e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current = getCanvasPos(e, canvas);
  }

  function draw(e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasSignature(true);
  }

  function endDraw() {
    isDrawing.current = false;
    lastPos.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!compromisoAceptado || !hasSignature || !canvasRef.current) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const firmaBase64 = canvasRef.current.toDataURL('image/png');
      const res = await fetch(`/api/pirolisis/blend/firmar/${remisionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaBase64, compromiso_aceptado: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          // Ya firmada — mostrar confirmación de todas formas
          setSuccessTimestamp(data.timestamp ?? new Date().toISOString());
        } else {
          setSubmitError(data.error ?? 'Error al registrar firma');
        }
      } else {
        setSuccessTimestamp(data.timestamp);
      }
    } catch {
      setSubmitError('Error de red. Por favor intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (fetchError && !remision) return <ErrorScreen message={fetchError} onRetry={loadRemision} />;
  if (!remision) return null;

  if (successTimestamp || remision.compromiso_aceptado) {
    return (
      <AlreadySignedScreen
        remision={remision}
        timestamp={successTimestamp ?? remision.firma_timestamp}
      />
    );
  }

  if (remision.estado === 'Cancelada') {
    return <CancelledScreen idLegible={remision.id_legible} />;
  }

  const canSign = compromisoAceptado && hasSignature && !submitting;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* ── Encabezado ── */}
        <div className="bg-white rounded-2xl shadow-sm p-5 flex items-center space-x-4">
          <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xl">🌿</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 leading-tight">
              Confirmación de Recepción
            </h1>
            <p className="text-sm text-green-700 font-medium">Biochar Blend — Sirius Pirólisis</p>
          </div>
        </div>

        {/* ── Resumen ── */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Resumen de la Remisión
          </h2>
          <div className="space-y-2">
            <Row label="ID" value={remision.id_legible ?? remision.id} bold />
            <Row label="Fecha" value={formatDate(remision.fecha_evento)} />
            <Row label="Cliente" value={remision.cliente} />
            <Row
              label="KG despachados"
              value={remision.kg_total_despachados != null ? `${remision.kg_total_despachados} kg` : null}
              bold
            />
            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <span className="text-gray-400 text-sm">CO₂ secuestrado</span>
              <span className="font-bold text-green-700 text-sm">
                {remision.co2_secuestrado_kg != null
                  ? `${remision.co2_secuestrado_kg} kg`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* ── PDF ── */}
        {remision.documento_url && (
          <a
            href={remision.documento_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-2 bg-blue-50 border border-blue-200 rounded-2xl p-4 text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Ver documento PDF</span>
          </a>
        )}

        {/* ── Compromiso ── */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Compromiso de Uso Responsable
          </h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-h-52 overflow-y-auto">
            <pre className="text-xs text-amber-900 whitespace-pre-wrap font-sans leading-relaxed">
              {COMPROMISO_TEXT}
            </pre>
          </div>
        </div>

        {/* ── Checkbox ── */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={compromisoAceptado}
              onChange={e => setCompromisoAceptado(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
            />
            <span className="text-sm text-gray-700 leading-snug">
              He leído y acepto el compromiso de uso agrícola exclusivo y no quema del Biochar Blend Sirius
            </span>
          </label>
        </div>

        {/* ── Canvas firma ── */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Firma del Receptor
            </h2>
            <button
              type="button"
              onClick={clearCanvas}
              className="text-xs text-red-500 font-medium hover:text-red-700 px-2 py-1 rounded transition-colors"
            >
              Limpiar
            </button>
          </div>
          <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-gray-50 relative">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full touch-none block"
              style={{ cursor: 'crosshair' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasSignature && (
              <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 pointer-events-none select-none">
                Dibuja tu firma aquí
              </p>
            )}
          </div>
        </div>

        {/* ── Error de submit ── */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
            <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-red-700 text-sm font-medium">{submitError}</p>
              <button
                onClick={() => setSubmitError(null)}
                className="text-red-400 text-xs mt-1 underline"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* ── Botón principal ── */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSign}
          className="w-full py-4 rounded-2xl font-bold text-base transition-all shadow-lg
            bg-green-600 text-white hover:bg-green-700
            disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {submitting ? 'Enviando...' : 'Firmar y Confirmar'}
        </button>

        <p className="text-xs text-center text-gray-400 pb-6">
          Al firmar confirmas la recepción del producto y aceptas los términos del compromiso.
        </p>
      </div>
    </div>
  );
}

// ── Componente auxiliar ────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string | null | undefined;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-gray-800' : 'font-medium text-gray-700'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

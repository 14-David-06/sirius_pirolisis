/**
 * Firma del Acta de Entrega de Biochar: las dos partes, en vivo, en el mismo
 * dispositivo.
 *
 * ═══ POR QUÉ LAS DOS EN LA MISMA PANTALLA ═════════════════════════════════════
 * La entrega ocurre en un sitio y en un momento: quien entrega por Sirius y quien
 * recibe están frente a frente. Mandarle un enlace al receptor —como sí hace la
 * firma de remisiones de Blend, que es pública porque el cliente firma desde su
 * celular en la finca— convertiría un acto presencial en un trámite asincrónico, y
 * el acta perdería justamente lo que acredita: que las dos partes estuvieron ahí.
 *
 * Cada firma se envía por separado, con su propio timestamp e IP, y el acta pasa a
 * `Firmada` solo cuando entra la segunda. Una firma registrada NO se puede
 * reemplazar desde aquí (el servicio responde 409): el trazo de una persona no es
 * un campo editable.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import CanvasFirma from '@/components/firma/CanvasFirma';
import { formatStock } from '@/lib/inventario.format';

const FONDO =
  "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

const CAMPO =
  'mt-1.5 w-full rounded-lg bg-white/10 ring-1 ring-white/20 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A7836]';

interface ActaFirma {
  id: string;
  codigo: string;
  estado: string;
  fechaEntrega: string;
  tipoBiochar: string;
  loteEntregado: string;
  kgSeca: number;
  co2SecuestradoKg: number;
  receptorNombre: string;
  receptorContacto: string;
  nombreProyecto: string;
  ubicacionAplicacion: string;
  categoriaUso: string;
  elaboradoPor: string;
  firmoSirius: boolean;
  firmoReceptor: boolean;
  nombreFirmaSirius: string;
  nombreFirmaReceptor: string;
  documentoUrl: string;
}

/** Mismo criterio de sesión que el resto de los módulos. */
function nombreUsuario(): string {
  try {
    const sesion = localStorage.getItem('userSession');
    if (!sesion) return '';
    const datos = JSON.parse(sesion);
    return datos.user?.Nombre || datos.user?.name || '';
  } catch {
    return '';
  }
}

export default function FirmarActaPage() {
  const params = useParams();
  const router = useRouter();
  const actaId = String(params?.actaId ?? '');

  const [acta, setActa] = useState<ActaFirma | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/actas-biochar/${actaId}/firmar`);
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? `Error ${res.status}`);
      setActa(json.acta as ActaFirma);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  }, [actaId]);

  useEffect(() => {
    if (actaId) void cargar();
  }, [actaId, cargar]);

  return (
    <div className="min-h-screen bg-slate-950 bg-cover bg-center bg-fixed" style={{ backgroundImage: FONDO }}>
      <div className="min-h-screen bg-slate-950/80 backdrop-blur-sm flex flex-col">
        <Navbar />
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <header>
              <button
                type="button"
                onClick={() => router.push('/actas-biochar')}
                className="text-xs text-white/60 underline"
              >
                ← Volver a las actas
              </button>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Firmar acta de entrega {acta?.codigo ? `· ${acta.codigo}` : ''}
              </h1>
              <p className="mt-1 text-sm text-white/60">
                Firman las dos partes, aquí y ahora: quien entrega por Sirius y quien recibe. El
                acta queda firmada cuando entra la segunda.
              </p>
            </header>

            {error && (
              <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-400/25">
                {error}
              </p>
            )}
            {aviso && (
              <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-400/25">
                {aviso}
              </p>
            )}

            {cargando && !acta ? (
              <div className="h-40 animate-pulse rounded-xl bg-white/5 ring-1 ring-white/10 motion-reduce:animate-none" />
            ) : acta ? (
              <>
                <section className="grid grid-cols-2 gap-4 rounded-xl bg-white/5 p-5 text-sm ring-1 ring-white/10 sm:grid-cols-3">
                  <Dato titulo="Entregado" valor={`${formatStock(acta.kgSeca, 'kg')} de ${acta.tipoBiochar}`} />
                  <Dato titulo="Lote / baches" valor={acta.loteEntregado} />
                  <Dato titulo="CO₂ secuestrado" valor={acta.co2SecuestradoKg ? `${acta.co2SecuestradoKg} kg` : '—'} />
                  <Dato titulo="Receptor" valor={acta.receptorNombre} />
                  <Dato titulo="Proyecto" valor={acta.nombreProyecto} />
                  <Dato titulo="Ubicación de aplicación" valor={acta.ubicacionAplicacion} />
                  <Dato titulo="Fecha de entrega" valor={acta.fechaEntrega || '—'} />
                  <Dato titulo="Estado" valor={acta.estado} />
                  <Dato titulo="Elaborada por" valor={acta.elaboradoPor} />
                </section>

                <FormFirma
                  acta={acta}
                  parte="sirius"
                  titulo="Por Sirius — quien entrega"
                  descripcion="La persona de Sirius que hace la entrega firma aquí, en el momento. No hay firma guardada: lo que se acredita es que estuvo presente."
                  nombreSugerido={nombreUsuario()}
                  onListo={async (mensaje) => {
                    setAviso(mensaje);
                    await cargar();
                  }}
                />

                <FormFirma
                  acta={acta}
                  parte="receptor"
                  titulo="Por el receptor — quien recibe"
                  descripcion="Quien recibe firma en este mismo dispositivo, después de leer el acta. Su cédula queda en el documento."
                  nombreSugerido={acta.receptorContacto || acta.receptorNombre}
                  onListo={async (mensaje) => {
                    setAviso(mensaje);
                    await cargar();
                  }}
                />

                {acta.documentoUrl && (
                  <a
                    href={acta.documentoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429]"
                  >
                    Ver el acta en PDF
                  </a>
                )}
              </>
            ) : null}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/45">{titulo}</p>
      <p className="mt-0.5 text-white/90">{valor || '—'}</p>
    </div>
  );
}

function FormFirma({
  acta,
  parte,
  titulo,
  descripcion,
  nombreSugerido,
  onListo,
}: {
  acta: ActaFirma;
  parte: 'sirius' | 'receptor';
  titulo: string;
  descripcion: string;
  nombreSugerido: string;
  onListo: (mensaje: string) => void | Promise<void>;
}) {
  const yaFirmo = parte === 'sirius' ? acta.firmoSirius : acta.firmoReceptor;
  const nombreFirmado = parte === 'sirius' ? acta.nombreFirmaSirius : acta.nombreFirmaReceptor;

  const [nombre, setNombre] = useState(nombreSugerido);
  const [cargo, setCargo] = useState('');
  const [documento, setDocumento] = useState('');
  const [firma, setFirma] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (yaFirmo) {
    return (
      <section className="rounded-xl bg-emerald-500/5 p-5 ring-1 ring-emerald-400/20">
        <h2 className="text-sm font-semibold text-white">{titulo}</h2>
        <p className="mt-1 text-sm text-emerald-200">
          Ya firmó{nombreFirmado ? `: ${nombreFirmado}` : ''}. Una firma no se reemplaza desde la
          app; si quedó mal, hay que anular el acta.
        </p>
      </section>
    );
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firma) {
      setError('Falta el trazo de la firma.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/actas-biochar/${acta.id}/firmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parte,
          firmaBase64: firma,
          nombre: nombre.trim(),
          cargo: cargo.trim() || undefined,
          documento: documento.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error ?? `Error ${res.status}`);
      await onListo(json.message as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-xl bg-white/5 p-5 ring-1 ring-white/10">
      <div>
        <h2 className="text-sm font-semibold text-white">{titulo}</h2>
        <p className="mt-1 text-xs text-white/55">{descripcion}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-white/70">Nombre completo</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={CAMPO} />
        </label>
        <label className="block text-sm">
          <span className="text-white/70">Cargo</span>
          <input value={cargo} onChange={(e) => setCargo(e.target.value)} className={CAMPO} />
        </label>
        <label className="block text-sm">
          <span className="text-white/70">Cédula</span>
          <input value={documento} onChange={(e) => setDocumento(e.target.value)} className={CAMPO} />
        </label>
      </div>

      <CanvasFirma onCambio={setFirma} etiqueta="Firma con el dedo dentro del recuadro" />

      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        type="submit"
        disabled={enviando || !firma || !nombre.trim()}
        className="rounded-lg bg-[#5A7836] px-4 py-2 text-sm font-medium text-white hover:bg-[#4a6429] disabled:opacity-50"
      >
        {enviando ? 'Registrando firma…' : 'Registrar esta firma'}
      </button>
    </form>
  );
}

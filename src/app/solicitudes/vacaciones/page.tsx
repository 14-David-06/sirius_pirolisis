"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const BG = "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

type Me = { nombre: string; cedula: string; idCore: string; cargo: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/70 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-400/60 focus:ring-1 focus:ring-blue-400/30 transition-all [color-scheme:dark]";
const readonlyCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/50 cursor-default";

function calcDias(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0;
  const d1 = new Date(inicio + "T12:00:00");
  const d2 = new Date(fin + "T12:00:00");
  if (d2 < d1) return 0;
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
}

export default function VacacionesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [fechaReintegro, setFechaReintegro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) return;
        const u = data.user ?? {};
        setMe({
          nombre: (u.Nombre || u.nombre || "").trim(),
          cedula: String(u.Cedula || u.cedula || ""),
          idCore: u.idPersonalCore ?? "",
          cargo: (u.Cargo || u.cargo || ""),
        });
      });
  }, []);

  const dias = calcDias(fechaInicio, fechaFin);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fechaInicio || !fechaFin) { setError("Selecciona las fechas de inicio y fin."); return; }
    if (dias <= 0) { setError("La fecha de fin debe ser posterior a la de inicio."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/solicitudes/vacaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaInicio, fechaFin,
          fechaReintegro: fechaReintegro || undefined,
          dias, motivo, cargo: me?.cargo,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al enviar"); return; }
      setSuccess(true);
    } catch { setError("Error de conexión. Intenta de nuevo."); }
    finally { setLoading(false); }
  }

  const resetForm = () => {
    setSuccess(false); setFechaInicio(""); setFechaFin(""); setFechaReintegro(""); setMotivo("");
  };

  if (success) return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat relative text-white" style={{ backgroundImage: BG }}>
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 pt-20 pb-16 flex items-center justify-center">
          <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-10 flex flex-col items-center text-center gap-4 w-full shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white drop-shadow">Solicitud enviada</h2>
            <p className="text-white/60 text-sm">Tu solicitud de vacaciones fue registrada. RRHH la revisará y te notificará.</p>
            <div className="flex gap-3 mt-2">
              <button onClick={resetForm} className="px-5 py-2 rounded-xl text-sm border border-white/20 text-white/60 hover:bg-white/10 cursor-pointer transition-colors">
                Nueva solicitud
              </button>
              <Link href="/solicitudes" className="px-5 py-2 rounded-xl text-sm text-white font-medium bg-blue-600 hover:bg-blue-700 transition-colors">
                Ver mis solicitudes
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat relative text-white" style={{ backgroundImage: BG }}>
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10">
        <Navbar />

        <div className="max-w-2xl mx-auto px-6 pt-10 pb-16">
          <div className="bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-2xl p-8">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <Link href="/solicitudes" className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/20 hover:bg-white/10 cursor-pointer transition-colors">
                <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white drop-shadow">Solicitud de Vacaciones</h1>
                <p className="text-sm text-white/50">Los campos con * son obligatorios</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">

              {/* Datos del empleado */}
              <div className="pb-4 border-b border-white/15">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Tus datos</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre completo">
                    <div className={readonlyCls}>{me?.nombre ?? "Cargando..."}</div>
                  </Field>
                  <Field label="Cédula">
                    <div className={readonlyCls}>{me?.cedula ?? "—"}</div>
                  </Field>
                  <Field label="Cargo">
                    <div className={readonlyCls}>{me?.cargo ?? "—"}</div>
                  </Field>
                  <Field label="ID empleado">
                    <div className={readonlyCls}>{me?.idCore ?? "—"}</div>
                  </Field>
                </div>
              </div>

              {/* Período */}
              <div className="flex flex-col gap-4">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Período de vacaciones</p>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha de inicio *">
                    <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required className={inputCls} />
                  </Field>
                  <Field label="Fecha de fin *">
                    <input type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} required className={inputCls} />
                  </Field>
                </div>

                {dias > 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-blue-500/10 border border-blue-400/20 text-blue-300">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
                    </svg>
                    {dias} día{dias !== 1 ? "s" : ""} calendario
                  </div>
                )}

                <Field label="Fecha de reintegro">
                  <input type="date" value={fechaReintegro} min={fechaFin} onChange={(e) => setFechaReintegro(e.target.value)} className={inputCls} />
                </Field>

                <Field label="Motivo o comentario">
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Opcional — agrega contexto si lo consideras necesario." className={inputCls + " resize-none"} />
                </Field>
              </div>

              {error && (
                <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Link href="/solicitudes" className="flex-1 py-3 rounded-xl border border-white/20 text-white/50 text-sm font-semibold hover:bg-white/10 transition-colors text-center cursor-pointer">
                  Cancelar
                </Link>
                <button type="submit" disabled={loading || !me} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Enviando..." : "Enviar solicitud"}
                </button>
              </div>

            </form>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

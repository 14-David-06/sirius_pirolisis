"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const BG = "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

const TIPOS_NOVEDAD = [
  "Horas Extra",
  "Incapacidad médica",
  "Cambio de horario",
  "Trabajo remoto",
  "Registro biométrico incompleto",
  "Licencia de maternidad / paternidad",
  "Otra",
];
const TIPO_HORAS_EXTRA = "Horas Extra";

type Me = { nombre: string; cedula: string; idCore: string; cargo: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/70 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/30 transition-all [color-scheme:dark]";
const readonlyCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/50 cursor-default";

export default function NovedadesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [horasExtra, setHorasExtra] = useState("");
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tipo || !descripcion) { setError("Selecciona el tipo y agrega una descripción."); return; }
    if (tipo === TIPO_HORAS_EXTRA && !horasExtra) { setError("Indica la cantidad de horas extra."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/solicitudes/novedades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo, descripcion,
          horasExtra: tipo === TIPO_HORAS_EXTRA ? horasExtra : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al enviar"); return; }
      setSuccess(true);
    } catch { setError("Error de conexión. Intenta de nuevo."); }
    finally { setLoading(false); }
  }

  const resetForm = () => {
    setSuccess(false); setTipo(""); setDescripcion(""); setHorasExtra("");
  };

  if (success) return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat relative text-white" style={{ backgroundImage: BG }}>
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 pt-20 pb-16 flex items-center justify-center">
          <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-10 flex flex-col items-center text-center gap-4 w-full shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#fb923c" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white drop-shadow">Novedad reportada</h2>
            <p className="text-white/60 text-sm">Tu novedad fue registrada. El área de nómina la revisará.</p>
            <div className="flex gap-3 mt-2">
              <button onClick={resetForm} className="px-5 py-2 rounded-xl text-sm border border-white/20 text-white/60 hover:bg-white/10 cursor-pointer transition-colors">
                Reportar otra
              </button>
              <Link href="/solicitudes" className="px-5 py-2 rounded-xl text-sm text-white font-medium bg-orange-600 hover:bg-orange-700 transition-colors">
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
                <h1 className="text-xl font-bold text-white drop-shadow">Reportar Novedad de Nómina</h1>
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
                  <Field label="ID empleado">
                    <div className={readonlyCls}>{me?.idCore ?? "—"}</div>
                  </Field>
                </div>
              </div>

              {/* Detalle */}
              <div className="flex flex-col gap-4">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Detalle de la novedad</p>

                <Field label="Tipo de novedad *">
                  <select value={tipo} onChange={(e) => setTipo(e.target.value)} required className={inputCls} style={{ background: "rgba(255,255,255,0.08)" }}>
                    <option value="" className="bg-[#1a1a0e]">Selecciona un tipo...</option>
                    {TIPOS_NOVEDAD.map((t) => <option key={t} value={t} className="bg-[#1a1a0e]">{t}</option>)}
                  </select>
                </Field>

                {tipo === TIPO_HORAS_EXTRA && (
                  <Field label="Número de horas extra *">
                    <input type="number" min="0.5" step="0.5" value={horasExtra} onChange={(e) => setHorasExtra(e.target.value)} required placeholder="Ej: 2.5" className={inputCls} />
                  </Field>
                )}

                <Field label="Descripción *">
                  <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required rows={4} placeholder="Describe con detalle la novedad que deseas reportar..." className={inputCls + " resize-none"} />
                </Field>
              </div>

              {error && (
                <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Link href="/solicitudes" className="flex-1 py-3 rounded-xl border border-white/20 text-white/50 text-sm font-semibold hover:bg-white/10 transition-colors text-center cursor-pointer">
                  Cancelar
                </Link>
                <button type="submit" disabled={loading || !me} className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? "Enviando..." : "Reportar novedad"}
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

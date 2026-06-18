"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { TIPOS_NOVEDAD, TIPO_HORAS_EXTRA } from "../lib/constants";

interface Props {
  apiBasePath?: string;
  basePath?: string;
}

type Me = { nombre: string; cedula: string; idCore: string; cargo: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#e07b39] focus:ring-1 focus:ring-[#e07b39] transition-all";
const readonlyCls = "w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-500 bg-gray-50 cursor-default";

export function NovedadesForm({ apiBasePath = "", basePath = "/dashboard/solicitudes" }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [horasExtra, setHorasExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetch(`${apiBasePath}/api/me`).then((r) => r.json()).then(setMe); }, [apiBasePath]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tipo || !descripcion) { setError("Selecciona el tipo y agrega una descripción."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}/api/solicitudes/novedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, descripcion, horasExtra: tipo === TIPO_HORAS_EXTRA ? horasExtra : undefined }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setSuccess(true);
    } catch { setError("Error de conexión. Intenta de nuevo."); }
    finally { setLoading(false); }
  }

  if (success) return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "#ffedd5" }}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#c2410c" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800">Novedad reportada</h2>
        <p className="text-gray-500 text-sm">Tu novedad fue registrada. El área de nómina la revisará.</p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => { setSuccess(false); setTipo(""); setDescripcion(""); setHorasExtra(""); }} className="px-5 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">Reportar otra</button>
          <Link href={basePath} className="px-5 py-2 rounded-xl text-sm text-white font-medium" style={{ background: "#e07b39" }}>Ver mis solicitudes</Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={basePath} className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Reportar Novedad de Nómina</h1>
          <p className="text-sm text-gray-500">Los campos con * son obligatorios</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">
        <div className="pb-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tus datos</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre completo"><div className={readonlyCls}>{me?.nombre ?? "Cargando..."}</div></Field>
            <Field label="ID empleado"><div className={readonlyCls}>{me?.idCore ?? "—"}</div></Field>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Detalle de la novedad</p>

          <Field label="Tipo de novedad *">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} required className={inputCls} style={{ background: "white" }}>
              <option value="">Selecciona un tipo...</option>
              {TIPOS_NOVEDAD.map((t) => <option key={t} value={t}>{t}</option>)}
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

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <button type="submit" disabled={loading || !me} className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: "#e07b39" }}>
          {loading ? "Enviando..." : "Reportar novedad"}
        </button>
      </form>
    </div>
  );
}

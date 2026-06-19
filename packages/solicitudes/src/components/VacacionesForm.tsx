"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";

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

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#6bb543] focus:ring-1 focus:ring-[#6bb543] transition-all";
const readonlyCls = "w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-500 bg-gray-50 cursor-default";

function calcDias(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0;
  const d1 = new Date(inicio + "T12:00:00");
  const d2 = new Date(fin + "T12:00:00");
  if (d2 < d1) return 0;
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1);
}

export function VacacionesForm({ apiBasePath = "", basePath = "/dashboard/solicitudes" }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [fechaReintegro, setFechaReintegro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { fetch(`${apiBasePath}/api/me`).then((r) => r.json()).then(setMe); }, [apiBasePath]);

  const dias = calcDias(fechaInicio, fechaFin);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fechaInicio || !fechaFin) { setError("Selecciona las fechas de inicio y fin."); return; }
    if (dias <= 0) { setError("La fecha de fin debe ser posterior a la de inicio."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}/api/solicitudes/vacaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaInicio, fechaFin, fechaReintegro: fechaReintegro || undefined, dias, motivo, cargo: me?.cargo }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setSuccess(true);
    } catch { setError("Error de conexión. Intenta de nuevo."); }
    finally { setLoading(false); }
  }

  if (success) return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "#dcfce7" }}>
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#16a34a" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800">Solicitud enviada</h2>
        <p className="text-gray-500 text-sm">Tu solicitud de vacaciones fue registrada. RRHH la revisará y te notificará.</p>
        <Link href={basePath} className="px-6 py-2.5 rounded-xl text-sm text-white font-medium mt-2" style={{ background: "#6bb543" }}>Ver mis solicitudes</Link>
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
          <h1 className="text-xl font-bold text-gray-800">Solicitud de Vacaciones</h1>
          <p className="text-sm text-gray-500">Los campos con * son obligatorios</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">
        <div className="pb-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tus datos</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre completo"><div className={readonlyCls}>{me?.nombre ?? "Cargando..."}</div></Field>
            <Field label="Cédula"><div className={readonlyCls}>{me?.cedula ?? "—"}</div></Field>
            <Field label="Cargo"><div className={readonlyCls}>{me?.cargo || "—"}</div></Field>
            <Field label="ID empleado"><div className={readonlyCls}>{me?.idCore ?? "—"}</div></Field>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Período de vacaciones</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de inicio *"><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required className={inputCls} /></Field>
            <Field label="Fecha de fin *"><input type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} required className={inputCls} /></Field>
          </div>

          {dias > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "#f0fdf4", color: "#15803d" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" /></svg>
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

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <button type="submit" disabled={loading || !me} className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: "#6bb543" }}>
          {loading ? "Enviando..." : "Enviar solicitud"}
        </button>
      </form>
    </div>
  );
}

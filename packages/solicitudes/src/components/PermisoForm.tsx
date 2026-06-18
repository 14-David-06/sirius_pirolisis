"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import { TIPOS_PERMISO } from "../lib/constants";

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

const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-[#1a51a8] focus:ring-1 focus:ring-[#1a51a8] transition-all";
const readonlyCls = "w-full border border-gray-100 rounded-xl px-4 py-2.5 text-sm text-gray-500 bg-gray-50 cursor-default";

export function PermisoForm({ apiBasePath = "", basePath = "/dashboard/solicitudes" }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [tipo, setTipo] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horas, setHoras] = useState("");
  const [motivo, setMotivo] = useState("");
  const [remunerado, setRemunerado] = useState(false);
  const [compensado, setCompensado] = useState(false);
  const [fechaComp, setFechaComp] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBasePath}/api/me`).then((r) => r.json()).then(setMe);
  }, [apiBasePath]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tipo || !fechaInicio || !motivo) { setError("Completa los campos obligatorios."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}/api/solicitudes/permiso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, fechaInicio, fechaFin: fechaFin || undefined, horas: horas || undefined, motivo, remunerado, compensado, fechaCompensatorio: compensado ? fechaComp : undefined, cargo: me?.cargo }),
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
        <p className="text-gray-500 text-sm">Tu solicitud de permiso fue registrada exitosamente. RRHH la revisará pronto.</p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => { setSuccess(false); setTipo(""); setFechaInicio(""); setFechaFin(""); setHoras(""); setMotivo(""); }} className="px-5 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">Nueva solicitud</button>
          <Link href={basePath} className="px-5 py-2 rounded-xl text-sm text-white font-medium transition-colors" style={{ background: "#1a51a8" }}>Ver mis solicitudes</Link>
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
          <h1 className="text-xl font-bold text-gray-800">Solicitud de Permiso</h1>
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
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Detalle del permiso</p>

          <Field label="Tipo de permiso *">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} required className={inputCls} style={{ background: "white" }}>
              <option value="">Selecciona un tipo...</option>
              {TIPOS_PERMISO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de permiso *"><input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} required className={inputCls} /></Field>
            <Field label="Fecha fin (opcional)"><input type="date" value={fechaFin} min={fechaInicio} onChange={(e) => setFechaFin(e.target.value)} className={inputCls} /></Field>
          </div>

          <Field label="Horas de permiso">
            <input type="number" min="0" step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="Ej: 4" className={inputCls} />
          </Field>

          <Field label="Motivo *">
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required rows={3} placeholder="Describe brevemente el motivo del permiso..." className={inputCls + " resize-none"} />
          </Field>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={remunerado} onChange={(e) => setRemunerado(e.target.checked)} className="w-4 h-4 rounded" />
              Remunerado
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox" checked={compensado} onChange={(e) => setCompensado(e.target.checked)} className="w-4 h-4 rounded" />
              Se compensará
            </label>
          </div>

          {compensado && (
            <Field label="Fecha de compensatorio">
              <input type="date" value={fechaComp} onChange={(e) => setFechaComp(e.target.value)} className={inputCls} />
            </Field>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <button type="submit" disabled={loading || !me} className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed" style={{ background: "#1a51a8" }}>
          {loading ? "Enviando..." : "Enviar solicitud"}
        </button>
      </form>
    </div>
  );
}

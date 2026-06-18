"use client";

import { useState, useEffect, FormEvent } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const BG = "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

const TIPOS_PERMISO = [
  "Médico / Cita médica",
  "Personal",
  "Calamidad doméstica",
  "Capacitación / Formación",
  "Trámite legal o personal",
  "Jurado de votación",
  "Lactancia",
  "Otro",
];

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_SEMANA = ["Lu","Ma","Mi","Ju","Vi","Sa","Do"];

type Me = { nombre: string; cedula: string; idCore: string; cargo: string };
type Modalidad = "horas" | "dias";

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function fmtDisplay(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Selector de días individuales ─────────────────────────────────────────────
function DayPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (days: string[]) => void;
}) {
  const now = new Date();
  const [viewYear, setViewYear]   = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const today = toISO(now);

  function firstWeekday(y: number, m: number) {
    const day = new Date(y, m, 1).getDay();
    return day === 0 ? 6 : day - 1; // Lu=0 … Do=6
  }
  function daysInMonth(y: number, m: number) {
    return new Date(y, m + 1, 0).getDate();
  }
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function toggleDay(iso: string) {
    const set = new Set(selected);
    if (set.has(iso)) set.delete(iso); else set.add(iso);
    onChange([...set].sort());
  }

  const offset = firstWeekday(viewYear, viewMonth);
  const total  = daysInMonth(viewYear, viewMonth);
  const cells  = Array.from({ length: offset + total }, (_, i) => i < offset ? null : i - offset + 1);
  const selSet = new Set(selected);

  return (
    <div className="bg-white/5 border border-white/15 rounded-2xl p-4 select-none">
      {/* Navegación mes */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-white">{MESES[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Encabezado días semana */}
      <div className="grid grid-cols-7 mb-1">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-white/30 py-1">{d}</div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const iso   = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isSel = selSet.has(iso);
          const isTd  = iso === today;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => toggleDay(iso)}
              className={[
                "h-8 w-full text-xs font-medium transition-all cursor-pointer rounded-lg relative",
                isSel
                  ? "bg-[#5A7836] text-white font-bold shadow-md ring-1 ring-[#7ab349]/40"
                  : isTd
                    ? "border border-[#5A7836]/50 text-white/80 hover:bg-[#5A7836]/20"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              {day}
              {isSel && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#a3d96b]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Días seleccionados como chips */}
      <div className="mt-3 pt-3 border-t border-white/10 min-h-[28px]">
        {selected.length === 0 ? (
          <p className="text-xs text-white/30 text-center">Toca cada día que necesitas permiso</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 items-center">
            {selected.map(iso => (
              <button
                key={iso}
                type="button"
                onClick={() => toggleDay(iso)}
                title="Clic para quitar"
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#5A7836]/30 text-[#7ab349] text-xs font-medium border border-[#5A7836]/40 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-colors cursor-pointer"
              >
                {fmtDisplay(iso)}
                <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
            <span className="ml-auto text-xs font-semibold text-[#7ab349]">
              {selected.length} día{selected.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers UI ────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/70 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#5A7836]/80 focus:ring-1 focus:ring-[#5A7836]/40 transition-all [color-scheme:dark]";
const readonlyCls = "w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/50 cursor-default";

// ── Página principal ──────────────────────────────────────────────────────────
export default function PermisoPage() {
  const [me, setMe]               = useState<Me | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>("horas");
  const [tipo, setTipo]           = useState("");
  const [fecha, setFecha]         = useState("");         // solo "por horas"
  const [horas, setHoras]         = useState("");         // solo "por horas"
  const [diasSel, setDiasSel]     = useState<string[]>([]); // solo "por dias"
  const [motivo, setMotivo]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    fetch("/api/session")
      .then(r => r.json())
      .then(data => {
        if (!data.authenticated) return;
        const u = data.user ?? {};
        setMe({
          nombre: (u.Nombre || u.nombre || "").trim(),
          cedula: String(u.Cedula || u.cedula || ""),
          idCore: u.idPersonalCore ?? "",
          cargo:  u.Cargo || u.cargo || "",
        });
      });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tipo || !motivo) { setError("Selecciona el tipo y escribe el motivo."); return; }
    if (modalidad === "horas") {
      if (!fecha) { setError("Indica la fecha del permiso."); return; }
      if (!horas) { setError("Indica la cantidad de horas."); return; }
    } else {
      if (diasSel.length === 0) { setError("Selecciona al menos un día en el calendario."); return; }
    }
    setError(""); setLoading(true);
    try {
      const body =
        modalidad === "horas"
          ? { tipo, motivo, cargo: me?.cargo, fechaInicio: fecha, horas }
          : {
              tipo, motivo, cargo: me?.cargo,
              fechaInicio:      diasSel[0],
              fechaFin:         diasSel[diasSel.length - 1],
              diasSeleccionados: diasSel,
              dias:             diasSel.length,
            };
      const res = await fetch("/api/solicitudes/permiso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al enviar"); return; }
      setSuccess(true);
    } catch { setError("Error de conexión. Intenta de nuevo."); }
    finally { setLoading(false); }
  }

  function resetForm() {
    setSuccess(false); setTipo(""); setFecha(""); setHoras("");
    setDiasSel([]); setMotivo(""); setModalidad("horas");
  }

  const wrapperCls = "min-h-screen bg-cover bg-center bg-no-repeat relative text-white";

  if (success) return (
    <div className={wrapperCls} style={{ backgroundImage: BG }}>
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 pt-20 pb-16">
          <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl p-10 flex flex-col items-center text-center gap-4 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white drop-shadow">Solicitud enviada</h2>
            <p className="text-white/60 text-sm">Tu solicitud fue registrada. RRHH la revisará pronto.</p>
            <div className="flex gap-3 mt-2">
              <button onClick={resetForm} className="px-5 py-2 rounded-xl text-sm border border-white/20 text-white/60 hover:bg-white/10 cursor-pointer transition-colors">
                Nueva solicitud
              </button>
              <Link href="/solicitudes" className="px-5 py-2 rounded-xl text-sm text-white font-medium bg-[#5A7836] hover:bg-[#4a6429] transition-colors">
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
    <div className={wrapperCls} style={{ backgroundImage: BG }}>
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
                <h1 className="text-xl font-bold text-white drop-shadow">Solicitud de Permiso</h1>
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

              {/* Tipo */}
              <Field label="Tipo de permiso *">
                <select value={tipo} onChange={e => setTipo(e.target.value)} required className={inputCls} style={{ background: "rgba(255,255,255,0.08)" }}>
                  <option value="" className="bg-[#1a2e0e]">Selecciona un tipo...</option>
                  {TIPOS_PERMISO.map(t => <option key={t} value={t} className="bg-[#1a2e0e]">{t}</option>)}
                </select>
              </Field>

              {/* Modalidad */}
              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Modalidad *</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["horas", "dias"] as Modalidad[]).map(m => (
                    <button
                      key={m} type="button"
                      onClick={() => { setModalidad(m); setHoras(""); setFecha(""); setDiasSel([]); }}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                        modalidad === m
                          ? "bg-[#5A7836] border-[#5A7836] text-white shadow-lg shadow-[#5A7836]/20"
                          : "border-white/20 text-white/50 hover:border-white/40 hover:text-white/80"
                      }`}
                    >
                      {m === "horas" ? "Por horas" : "Por días"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Por horas */}
              {modalidad === "horas" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fecha del permiso *">
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required className={inputCls} />
                  </Field>
                  <Field label="Número de horas *">
                    <input type="number" min="0.5" step="0.5" value={horas} onChange={e => setHoras(e.target.value)} required placeholder="Ej: 4" className={inputCls} />
                  </Field>
                </div>
              )}

              {/* Por días — selector individual */}
              {modalidad === "dias" && (
                <div>
                  <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
                    Selecciona los días *
                  </p>
                  <DayPicker selected={diasSel} onChange={setDiasSel} />
                </div>
              )}

              {/* Motivo */}
              <Field label="Motivo *">
                <textarea
                  value={motivo} onChange={e => setMotivo(e.target.value)}
                  required rows={3}
                  placeholder="Describe brevemente el motivo del permiso..."
                  className={inputCls + " resize-none"}
                />
              </Field>

              <p className="text-xs text-white/30 -mt-2">
                Remuneración y compensación las determina RRHH al revisar la solicitud.
              </p>

              {error && (
                <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <Link href="/solicitudes" className="flex-1 py-3 rounded-xl border border-white/20 text-white/50 text-sm font-semibold hover:bg-white/10 transition-colors text-center cursor-pointer">
                  Cancelar
                </Link>
                <button type="submit" disabled={loading || !me} className="flex-1 py-3 rounded-xl bg-[#5A7836] hover:bg-[#4a6429] text-white font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
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

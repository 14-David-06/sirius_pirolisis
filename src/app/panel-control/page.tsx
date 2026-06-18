"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { tieneAccesoPanel } from "@/lib/panel-access";

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Novedad {
  id: string;
  empleado: string;
  idPersonalCore?: string;
  tipoNovedad: string;
  descripcion: string;
  numeroHorasExtras?: number | null;
  estadoRegistro: string;
  fechaCreacion: string;
}

// Usuarios con acceso al panel de control
function fmtFecha(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" });
}

const ESTADO_COLORS: Record<string, string> = {
  Pendiente: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  Autorizado: "bg-green-500/20 text-green-300 border-green-500/40",
  "No autorizado": "bg-red-500/20 text-red-300 border-red-500/40",
};

export default function PanelControlPage() {
  const [cedula, setCedula] = useState<string>("");
  const [sesionLista, setSesionLista] = useState(false);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [procesando, setProcesando] = useState<string | null>(null);

  const esAdmin = tieneAccesoPanel(cedula);

  function toast(m: string) {
    setMensaje(m);
    setTimeout(() => setMensaje(""), 3000);
  }

  // ── Cargar usuario autenticado ──────────────────────────────────────────
  useEffect(() => {
    async function cargarUsuario() {
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setCedula(data.user.Cedula || data.user.cedula || "");
            setSesionLista(true);
            return;
          }
        }
      } catch { /* fallback */ }
      try {
        const raw = localStorage.getItem("userSession");
        if (raw) {
          const s = JSON.parse(raw);
          setCedula(s?.user?.Cedula || "");
        }
      } catch { /* noop */ }
      setSesionLista(true);
    }
    cargarUsuario();
  }, []);

  // ── Cargar novedades (horas extras) ─────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/nomina/novedades");
      const data = await res.json();
      setNovedades(data.novedades ?? []);
    } catch {
      toast("❌ Error al cargar las horas extras");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (esAdmin) cargarDatos();
  }, [esAdmin, cargarDatos]);

  const horasExtras = useMemo(
    () => novedades.filter(n => n.tipoNovedad === "Horas Extras"),
    [novedades]
  );
  const pendientes = horasExtras.filter(n => n.estadoRegistro === "Pendiente");
  const historial = horasExtras.filter(n => n.estadoRegistro !== "Pendiente");

  const totalHorasPend = pendientes.reduce((s, n) => s + (Number(n.numeroHorasExtras) || 0), 0);
  const totalHorasAprob = historial
    .filter(n => n.estadoRegistro === "Autorizado")
    .reduce((s, n) => s + (Number(n.numeroHorasExtras) || 0), 0);

  // ── Autorizar / Rechazar ─────────────────────────────────────────────────
  async function decidir(id: string, estado: "Autorizado" | "No autorizado") {
    setProcesando(id);
    const previo = novedades;
    setNovedades(prev => prev.map(n => (n.id === id ? { ...n, estadoRegistro: estado } : n)));
    try {
      const res = await fetch(`/api/nomina/novedades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estadoRegistro: estado }),
      });
      if (!res.ok) throw new Error();
      toast(estado === "Autorizado" ? "✅ Horas extras autorizadas" : "🚫 Horas extras rechazadas");
    } catch {
      setNovedades(previo);
      toast("❌ Error al actualizar el registro");
    } finally {
      setProcesando(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative text-white"
      style={{ backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/55"></div>

      <div className="relative z-10">
        <Navbar />

        <div className="max-w-6xl mx-auto px-6 pt-10 pb-16">
          {!sesionLista ? (
            <div className="bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-2xl p-10 text-center text-white/70">
              Verificando sesión…
            </div>
          ) : !esAdmin ? (
            <div className="bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-2xl p-10 text-center">
              <div className="text-5xl mb-4">🔒</div>
              <h1 className="text-2xl font-bold text-white drop-shadow-lg">Acceso restringido</h1>
              <p className="text-white/70 mt-2 text-sm">
                Este panel de control solo está disponible para personal autorizado.
              </p>
            </div>
          ) : (
            <div className="bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-2xl p-8">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-white drop-shadow-lg">Panel de Control</h1>
                  <p className="text-white/70 mt-1 text-sm drop-shadow">
                    Autorización de horas extras del equipo
                  </p>
                </div>
                <button
                  onClick={cargarDatos}
                  className="self-start sm:self-auto bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 cursor-pointer text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Actualizar
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                <StatCard label="Pendientes" value={pendientes.length} accent="text-yellow-300" />
                <StatCard label="Horas por autorizar" value={`${totalHorasPend}h`} accent="text-orange-300" />
                <StatCard label="Horas autorizadas" value={`${totalHorasAprob}h`} accent="text-green-300" />
              </div>

              {/* Pendientes */}
              <h2 className="text-lg font-bold text-white mb-3 drop-shadow">Solicitudes pendientes</h2>
              {cargando ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white/10 border border-white/20 rounded-2xl h-24 animate-pulse" />
                  ))}
                </div>
              ) : pendientes.length === 0 ? (
                <div className="text-center py-10 text-white/40 bg-white/5 border border-white/10 rounded-2xl">
                  No hay horas extras pendientes de autorización 🎉
                </div>
              ) : (
                <div className="space-y-3">
                  {pendientes.map(n => (
                    <div key={n.id} className="bg-white/10 border border-white/20 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">{n.empleado || "—"}</span>
                          <span className="text-2xl font-extrabold text-orange-300">
                            {n.numeroHorasExtras != null ? `${n.numeroHorasExtras}h` : "—"}
                          </span>
                        </div>
                        <p className="text-white/60 text-sm mt-1">{n.descripcion || "—"}</p>
                        <p className="text-white/40 text-xs mt-1">Reportado: {fmtFecha(n.fechaCreacion)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          disabled={procesando === n.id}
                          onClick={() => decidir(n.id, "Autorizado")}
                          className="px-4 py-2.5 rounded-xl bg-green-600/80 hover:bg-green-600 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Autorizar
                        </button>
                        <button
                          disabled={procesando === n.id}
                          onClick={() => decidir(n.id, "No autorizado")}
                          className="px-4 py-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Historial */}
              <h2 className="text-lg font-bold text-white mt-10 mb-3 drop-shadow">Historial</h2>
              {historial.length === 0 ? (
                <div className="text-center py-8 text-white/40 bg-white/5 border border-white/10 rounded-2xl text-sm">
                  Sin registros autorizados o rechazados aún.
                </div>
              ) : (
                <div className="hidden md:block rounded-xl border border-white/20 overflow-hidden bg-white/5">
                  <table className="w-full text-sm">
                    <thead className="bg-white/10 text-white/60 uppercase text-xs tracking-wide">
                      <tr>
                        <th className="text-left px-5 py-3">Empleado</th>
                        <th className="text-left px-4 py-3">Horas</th>
                        <th className="text-left px-4 py-3">Detalle</th>
                        <th className="text-left px-4 py-3">Reportado</th>
                        <th className="text-left px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historial.map(n => (
                        <tr key={n.id} className="border-t border-white/10">
                          <td className="px-5 py-3 font-semibold text-white">{n.empleado || "—"}</td>
                          <td className="px-4 py-3 text-orange-300 font-bold">
                            {n.numeroHorasExtras != null ? `${n.numeroHorasExtras}h` : "—"}
                          </td>
                          <td className="px-4 py-3 text-white/60 max-w-xs truncate">{n.descripcion || "—"}</td>
                          <td className="px-4 py-3 text-white/50">{fmtFecha(n.fechaCreacion)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ESTADO_COLORS[n.estadoRegistro] ?? "bg-white/10 text-white/60 border-white/20"}`}>
                              {n.estadoRegistro}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Historial móvil */}
              {historial.length > 0 && (
                <div className="md:hidden space-y-3 mt-3">
                  {historial.map(n => (
                    <div key={n.id} className="bg-white/10 border border-white/20 rounded-2xl p-4">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-white">{n.empleado || "—"}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ESTADO_COLORS[n.estadoRegistro] ?? "bg-white/10 text-white/60 border-white/20"}`}>
                          {n.estadoRegistro}
                        </span>
                      </div>
                      <p className="text-orange-300 font-bold mt-1">
                        {n.numeroHorasExtras != null ? `${n.numeroHorasExtras}h` : "—"}
                      </p>
                      <p className="text-white/60 text-sm mt-1">{n.descripcion || "—"}</p>
                      <p className="text-white/40 text-xs mt-1">{fmtFecha(n.fechaCreacion)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Footer />
      </div>

      {/* Toast */}
      {mensaje && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-white/20 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold">
          {mensaje}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white/10 border border-white/20 rounded-2xl p-5">
      <div className={`text-3xl font-extrabold ${accent}`}>{value}</div>
      <div className="text-white/60 text-xs mt-1 uppercase tracking-wide">{label}</div>
    </div>
  );
}

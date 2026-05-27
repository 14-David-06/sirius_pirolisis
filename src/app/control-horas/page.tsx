"use client";

import { useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// ─── Tipos (mapean 1:1 con campos Airtable) ────────────────────────────────────

interface NominaSirius {
  id: string;              // RECORD_ID
  nombre: string;          // Nombre
  cedula: number;          // Cedula
  cargo: string;           // Cargo
  area: string;            // Area
  salarioMensual: number;  // Salario Mensual
  valorHora: number;       // Valor Hora Trabajo (calculado: salario/230)
  horasDia: number;        // Total Horas Trabajo Dia (= 7.67)
  auxilioDia: number;      // Auxilio Transporte Dia (= 6669.57)
}

interface SolicitudPermiso {
  id: string;
  nombre: string;           // Nombre
  cedula: string;           // Cedula
  cargo: string;            // Cargo
  fechaSolicitud: string;   // Fecha de solicitud
  fechaPermiso: string;     // Fecha de permiso
  fechaFinPermiso?: string; // Fecha fin de permiso
  horasPermiso: string;     // Horas Permiso (texto libre: "3", "8", "23 horas")
  tipoPermiso: string;      // Tipo_Permiso
  motivoPermiso: string;    // Motivo_Permiso
  estadoPermiso: "Pendiente" | "Concedido" | "Rechazado";
  remunerado: boolean;      // Remunerado
  compensado: boolean;      // Compensado
  fechaCompensatorio?: string;
  archivoGenerado?: string;
}

interface ReporteNovedad {
  id: string;
  empleado: string;              // Empleado/Responsable
  tipoNovedad: string;           // Tipo de Novedad
  descripcion: string;           // Descripción de la Novedad
  transcripcionAudio?: string;   // Transcripcion Audio Colaborador
  estadoRegistro: "Pendiente" | "Revisado" | "Resuelto" | "En seguimiento";
  fechaCreacion: string;
}

interface SolicitudVacaciones {
  id: string;
  nombre: string;              // Nombre
  cedula: string;              // Cedula
  cargo: string;               // Cargo
  fechaPresentacion: string;   // Fecha de Presentacion
  fechaInicio: string;         // Fecha Inicio
  fechaFin: string;            // Fecha Fin
  fechaReintegro: string;      // Fecha Reintegro
  diasVacaciones: number;      // Dias Vacaciones
  motivo: string;              // Motivo
  estadoSolicitud: "Aprobado" | "Rechazado" | "";
  archivo?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERMISO_ESTADO_COLORS: Record<string, string> = {
  Pendiente: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  Concedido: "bg-green-500/20  text-green-300  border-green-500/40",
  Rechazado: "bg-red-500/20    text-red-300    border-red-500/40",
};

const NOVEDAD_ESTADO_COLORS: Record<string, string> = {
  Pendiente:       "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  Revisado:        "bg-blue-500/20   text-blue-300   border-blue-500/40",
  Resuelto:        "bg-green-500/20  text-green-300  border-green-500/40",
  "En seguimiento":"bg-purple-500/20 text-purple-300 border-purple-500/40",
};

const VACACION_ESTADO_COLORS: Record<string, string> = {
  Aprobado:  "bg-green-500/20 text-green-300 border-green-500/40",
  Rechazado: "bg-red-500/20   text-red-300   border-red-500/40",
  "":        "bg-gray-500/20  text-gray-300  border-gray-500/40",
};

const AREA_COLORS: Record<string, string> = {
  "Pirolisis":     "bg-orange-500/20 text-orange-300 border-orange-500/40",
  "Laboratorio":   "bg-blue-500/20   text-blue-300   border-blue-500/40",
  "Administrativo":"bg-purple-500/20 text-purple-300 border-purple-500/40",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function parseHoras(h: string): number {
  const n = parseFloat(h.replace(/[^\d.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// ─── Componente principal ─────────────────────────────────────────────────────

type TabKey = "resumen" | "permisos" | "novedades" | "vacaciones";

export default function ControlHoras() {
  const [tab, setTab] = useState<TabKey>("resumen");
  const [filtroEmpleado, setFiltroEmpleado] = useState("todos");
  const [filtroArea, setFiltroArea] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  // Permisos
  const [permisos, setPermisos] = useState<SolicitudPermiso[]>(PERMISOS_MOCK);
  const [novedades, setNovedades] = useState<ReporteNovedad[]>(NOVEDADES_MOCK);
  const [vacaciones, setVacaciones] = useState<SolicitudVacaciones[]>(VACACIONES_MOCK);

  const [modalPermiso, setModalPermiso] = useState(false);
  const [detalle, setDetalle] = useState<SolicitudPermiso | ReporteNovedad | SolicitudVacaciones | null>(null);
  const [tipoDetalle, setTipoDetalle] = useState<"permiso" | "novedad" | "vacacion" | null>(null);
  const [mensaje, setMensaje] = useState("");

  const [formPermiso, setFormPermiso] = useState({
    nombre: "", cedula: "", cargo: "", fechaSolicitud: new Date().toISOString().split("T")[0],
    fechaPermiso: "", horasPermiso: "", tipoPermiso: "personal", motivoPermiso: "",
    remunerado: false, compensado: false,
  });

  function toast(msg: string) {
    setMensaje(msg);
    setTimeout(() => setMensaje(""), 3000);
  }

  // ── Estadísticas globales ────────────────────────────────────────────────

  const stats = useMemo(() => {
    const permPendientes = permisos.filter(p => p.estadoPermiso === "Pendiente").length;
    const novPendientes  = novedades.filter(n => n.estadoRegistro === "Pendiente").length;
    const vacPendientes  = vacaciones.filter(v => v.estadoSolicitud === "").length;
    const totalHorasPerm = permisos.filter(p => p.estadoPermiso === "Concedido")
      .reduce((s, p) => s + parseHoras(p.horasPermiso), 0);
    return { permPendientes, novPendientes, vacPendientes, totalHorasPerm };
  }, [permisos, novedades, vacaciones]);

  // ── Resumen por empleado ─────────────────────────────────────────────────

  const resumenEmpleados = useMemo(() =>
    EMPLEADOS.map(e => {
      const perm = permisos.filter(p => p.nombre === e.nombre);
      const novs = novedades.filter(n => n.empleado === e.nombre);
      const vacs = vacaciones.filter(v => v.nombre === e.nombre);
      const horasPerm = perm.filter(p => p.estadoPermiso === "Concedido")
        .reduce((s, p) => s + parseHoras(p.horasPermiso), 0);
      const diasVac = vacs.filter(v => v.estadoSolicitud === "Aprobado")
        .reduce((s, v) => s + v.diasVacaciones, 0);
      const pendientes = perm.filter(p => p.estadoPermiso === "Pendiente").length +
        novs.filter(n => n.estadoRegistro === "Pendiente").length;
      return { ...e, horasPerm, diasVac, totalNovedades: novs.length, pendientes };
    }), [permisos, novedades, vacaciones]);

  // ── Filtros permisos ─────────────────────────────────────────────────────

  const permisosFiltrados = useMemo(() => {
    return permisos.filter(p => {
      if (filtroEmpleado !== "todos" && p.nombre !== filtroEmpleado) return false;
      if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
          !p.motivoPermiso.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.fechaSolicitud.localeCompare(a.fechaSolicitud));
  }, [permisos, filtroEmpleado, busqueda]);

  // ── Filtros novedades ────────────────────────────────────────────────────

  const novedadesFiltradas = useMemo(() => {
    return novedades.filter(n => {
      if (filtroEmpleado !== "todos" && n.empleado !== filtroEmpleado) return false;
      if (busqueda && !n.empleado.toLowerCase().includes(busqueda.toLowerCase()) &&
          !n.tipoNovedad.toLowerCase().includes(busqueda.toLowerCase()) &&
          !n.descripcion.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion));
  }, [novedades, filtroEmpleado, busqueda]);

  // ── Acciones ─────────────────────────────────────────────────────────────

  function actualizarEstadoPermiso(id: string, estado: "Concedido" | "Rechazado") {
    setPermisos(prev => prev.map(p => p.id === id ? { ...p, estadoPermiso: estado } : p));
    toast(`✅ Permiso ${estado.toLowerCase()}`);
  }

  function actualizarEstadoNovedad(id: string, estado: ReporteNovedad["estadoRegistro"]) {
    setNovedades(prev => prev.map(n => n.id === id ? { ...n, estadoRegistro: estado } : n));
    toast(`✅ Estado actualizado a "${estado}"`);
  }

  function actualizarEstadoVacacion(id: string, estado: "Aprobado" | "Rechazado") {
    setVacaciones(prev => prev.map(v => v.id === id ? { ...v, estadoSolicitud: estado } : v));
    toast(`✅ Vacación ${estado.toLowerCase()}`);
  }

  function guardarPermiso() {
    if (!formPermiso.nombre || !formPermiso.fechaPermiso || !formPermiso.horasPermiso) {
      toast("❌ Completa todos los campos obligatorios");
      return;
    }
    const nuevo: SolicitudPermiso = {
      id: `rec${Date.now()}`,
      ...formPermiso,
      estadoPermiso: "Pendiente",
    };
    setPermisos(prev => [nuevo, ...prev]);
    setModalPermiso(false);
    toast("✅ Solicitud de permiso registrada");
    setFormPermiso({ nombre: "", cedula: "", cargo: "", fechaSolicitud: new Date().toISOString().split("T")[0], fechaPermiso: "", horasPermiso: "", tipoPermiso: "personal", motivoPermiso: "", remunerado: false, compensado: false });
  }

  function abrirDetalle(item: SolicitudPermiso | ReporteNovedad | SolicitudVacaciones, tipo: typeof tipoDetalle) {
    setDetalle(item);
    setTipoDetalle(tipo);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <Navbar />

      {/* Header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#5A7836]/20 via-transparent to-[#3d5422]/10 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 pt-10 pb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white">Novedades Nómina</h1>
              <p className="text-gray-400 mt-1 text-sm">Permisos, novedades y vacaciones — Base Airtable: Novedades Nomina</p>
            </div>
            <button
              onClick={() => setModalPermiso(true)}
              className="self-start sm:self-auto bg-[#5A7836] hover:bg-[#4a6429] text-white px-5 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-[#5A7836]/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Solicitar Permiso
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Permisos pendientes"  value={String(stats.permPendientes)} color="text-yellow-400" />
            <StatCard label="Novedades pendientes"  value={String(stats.novPendientes)}  color="text-orange-400" />
            <StatCard label="Vacaciones sin revisar" value={String(stats.vacPendientes)} color="text-blue-400" />
            <StatCard label="Horas permiso (concedidas)" value={`${stats.totalHorasPerm.toFixed(0)}h`} color="text-green-400" />
          </div>
        </div>
      </div>

      {/* Toast */}
      {mensaje && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a1a] border border-[#5A7836]/40 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-medium">
          {mensaje}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/10 mb-6">
          {([
            { key: "resumen",    label: "Empleados" },
            { key: "permisos",   label: `Permisos (${permisos.length})` },
            { key: "novedades",  label: `Novedades (${novedades.length})` },
            { key: "vacaciones", label: `Vacaciones (${vacaciones.length})` },
          ] as { key: TabKey; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setFiltroEmpleado("todos"); setBusqueda(""); }}
              className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
                tab === t.key ? "border-[#5A7836] text-[#7ab349]" : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros comunes para tabs con datos */}
        {tab !== "resumen" && (
          <div className="flex flex-wrap gap-3 mb-5">
            <input
              type="text"
              placeholder="Buscar..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="flex-1 min-w-[180px] bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#5A7836]/60"
            />
            <select
              value={filtroEmpleado}
              onChange={e => setFiltroEmpleado(e.target.value)}
              className="bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5A7836]/60"
            >
              <option value="todos" className="bg-[#1a2412]">Todos los empleados</option>
              {EMPLEADOS.map(e => (
                <option key={e.id} value={e.nombre} className="bg-[#1a2412]">{e.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── TAB: RESUMEN ────────────────────────────────────────────────── */}
        {tab === "resumen" && (
          <div className="pb-16">
            <div className="flex flex-wrap gap-2 mb-5">
              {["todos", "Pirolisis", "Laboratorio", "Administrativo"].map(a => (
                <button
                  key={a}
                  onClick={() => setFiltroArea(a)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    filtroArea === a ? "bg-[#5A7836] border-[#5A7836] text-white" : "border-white/20 text-gray-400 hover:border-white/40 hover:text-white"
                  }`}
                >
                  {a === "todos" ? "Todas las áreas" : a}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {resumenEmpleados
                .filter(e => filtroArea === "todos" || e.area === filtroArea)
                .map(e => (
                  <EmpleadoCard
                    key={e.id}
                    empleado={e}
                    onVerPermisos={() => { setTab("permisos");   setFiltroEmpleado(e.nombre); }}
                    onVerNovedades={() => { setTab("novedades");  setFiltroEmpleado(e.nombre); }}
                  />
                ))}
            </div>
          </div>
        )}

        {/* ── TAB: PERMISOS ───────────────────────────────────────────────── */}
        {tab === "permisos" && (
          <div className="pb-16">
            <div className="text-xs text-gray-500 mb-3">{permisosFiltrados.length} registros</div>
            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-gray-400 uppercase text-xs tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3">Empleado</th>
                    <th className="text-left px-4 py-3">Fecha Permiso</th>
                    <th className="text-left px-4 py-3">Horas</th>
                    <th className="text-left px-4 py-3">Tipo</th>
                    <th className="text-left px-4 py-3">Motivo</th>
                    <th className="text-left px-4 py-3">Remunerado</th>
                    <th className="text-left px-4 py-3">Estado</th>
                    <th className="text-left px-4 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {permisosFiltrados.length === 0
                    ? <tr><td colSpan={8} className="text-center py-12 text-gray-500">Sin resultados</td></tr>
                    : permisosFiltrados.map(p => (
                      <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-semibold text-white">{p.nombre}</div>
                          <div className="text-xs text-gray-500">{p.cargo}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{fmtDate(p.fechaPermiso)}</td>
                        <td className="px-4 py-3">
                          <span className="text-yellow-400 font-bold">{p.horasPermiso}h</span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 capitalize">{p.tipoPermiso}</td>
                        <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate" title={p.motivoPermiso}>{p.motivoPermiso}</td>
                        <td className="px-4 py-3">
                          {p.remunerado
                            ? <span className="text-green-400 text-xs font-semibold">Sí</span>
                            : <span className="text-gray-600 text-xs">No</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${PERMISO_ESTADO_COLORS[p.estadoPermiso]}`}>
                            {p.estadoPermiso}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {p.estadoPermiso === "Pendiente" && (
                              <>
                                <Btn color="green" title="Conceder" onClick={() => actualizarEstadoPermiso(p.id, "Concedido")}>✓</Btn>
                                <Btn color="red"   title="Rechazar" onClick={() => actualizarEstadoPermiso(p.id, "Rechazado")}>✕</Btn>
                              </>
                            )}
                            <Btn color="gray" title="Ver detalle" onClick={() => abrirDetalle(p, "permiso")}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {permisosFiltrados.map(p => (
                <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-white">{p.nombre}</div>
                      <div className="text-xs text-gray-400">{p.cargo} · {fmtDate(p.fechaPermiso)}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${PERMISO_ESTADO_COLORS[p.estadoPermiso]}`}>{p.estadoPermiso}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <MiniStat label="Horas"    value={`${p.horasPermiso}h`} />
                    <MiniStat label="Tipo"     value={p.tipoPermiso} />
                    <MiniStat label="Remun."   value={p.remunerado ? "Sí" : "No"} />
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{p.motivoPermiso}</p>
                  {p.estadoPermiso === "Pendiente" && (
                    <div className="flex gap-2">
                      <button onClick={() => actualizarEstadoPermiso(p.id, "Concedido")} className="flex-1 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-semibold">Conceder</button>
                      <button onClick={() => actualizarEstadoPermiso(p.id, "Rechazado")} className="flex-1 py-1.5 rounded-lg bg-red-500/20   text-red-400   text-xs font-semibold">Rechazar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: NOVEDADES ──────────────────────────────────────────────── */}
        {tab === "novedades" && (
          <div className="pb-16">
            <div className="text-xs text-gray-500 mb-3">{novedadesFiltradas.length} registros</div>
            <div className="hidden md:block rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-gray-400 uppercase text-xs tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-3">Empleado</th>
                    <th className="text-left px-4 py-3">Fecha</th>
                    <th className="text-left px-4 py-3">Tipo de Novedad</th>
                    <th className="text-left px-4 py-3">Descripción</th>
                    <th className="text-left px-4 py-3">Estado</th>
                    <th className="text-left px-4 py-3">Actualizar Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {novedadesFiltradas.length === 0
                    ? <tr><td colSpan={6} className="text-center py-12 text-gray-500">Sin resultados</td></tr>
                    : novedadesFiltradas.map(n => {
                      const emp = EMPLEADOS.find(e => e.nombre === n.empleado);
                      return (
                        <tr key={n.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-semibold text-white">{n.empleado}</div>
                            <div className="text-xs text-gray-500">{emp?.cargo ?? ""}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-300 text-xs">{new Date(n.fechaCreacion).toLocaleDateString("es-CO")}</td>
                          <td className="px-4 py-3">
                            <span className="text-[#7ab349] font-medium">{n.tipoNovedad}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 max-w-[240px] truncate" title={n.descripcion}>{n.descripcion}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${NOVEDAD_ESTADO_COLORS[n.estadoRegistro]}`}>
                              {n.estadoRegistro}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={n.estadoRegistro}
                              onChange={e => actualizarEstadoNovedad(n.id, e.target.value as ReporteNovedad["estadoRegistro"])}
                              className="bg-white/5 border border-white/20 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#5A7836]/60"
                            >
                              {["Pendiente", "Revisado", "En seguimiento", "Resuelto"].map(s => (
                                <option key={s} value={s} className="bg-[#1a2412]">{s}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="md:hidden space-y-3">
              {novedadesFiltradas.map(n => (
                <div key={n.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-white">{n.empleado}</div>
                      <div className="text-xs text-gray-400">{new Date(n.fechaCreacion).toLocaleDateString("es-CO")}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${NOVEDAD_ESTADO_COLORS[n.estadoRegistro]}`}>{n.estadoRegistro}</span>
                  </div>
                  <div className="text-xs text-[#7ab349] font-medium mb-1">{n.tipoNovedad}</div>
                  <p className="text-xs text-gray-500 mb-3">{n.descripcion}</p>
                  <select
                    value={n.estadoRegistro}
                    onChange={e => actualizarEstadoNovedad(n.id, e.target.value as ReporteNovedad["estadoRegistro"])}
                    className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {["Pendiente", "Revisado", "En seguimiento", "Resuelto"].map(s => (
                      <option key={s} value={s} className="bg-[#1a2412]">{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TAB: VACACIONES ─────────────────────────────────────────────── */}
        {tab === "vacaciones" && (
          <div className="pb-16">
            <div className="text-xs text-gray-500 mb-3">{vacaciones.length} registros</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {vacaciones
                .filter(v => filtroEmpleado === "todos" || v.nombre === filtroEmpleado)
                .sort((a, b) => b.fechaPresentacion.localeCompare(a.fechaPresentacion))
                .map(v => {
                  const estadoLabel = v.estadoSolicitud === "" ? "Sin revisar" : v.estadoSolicitud;
                  const estadoCls   = v.estadoSolicitud === "" ? VACACION_ESTADO_COLORS[""] : VACACION_ESTADO_COLORS[v.estadoSolicitud];
                  return (
                    <div key={v.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-[#5A7836]/30 transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-bold text-white">{v.nombre}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{v.cargo}</div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${estadoCls}`}>{estadoLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <MiniStat label="Inicio"     value={fmtDate(v.fechaInicio)} />
                        <MiniStat label="Fin"        value={fmtDate(v.fechaFin)} />
                        <MiniStat label="Reintegro"  value={fmtDate(v.fechaReintegro)} />
                        <MiniStat label="Días"       value={`${v.diasVacaciones}d`} />
                      </div>
                      <p className="text-xs text-gray-500 mb-4 line-clamp-2">{v.motivo}</p>
                      {v.estadoSolicitud === "" && (
                        <div className="flex gap-2">
                          <button onClick={() => actualizarEstadoVacacion(v.id, "Aprobado")}  className="flex-1 py-2 rounded-xl bg-green-500/20 text-green-400 text-xs font-semibold hover:bg-green-500/30 transition-colors">Aprobar</button>
                          <button onClick={() => actualizarEstadoVacacion(v.id, "Rechazado")} className="flex-1 py-2 rounded-xl bg-red-500/20   text-red-400   text-xs font-semibold hover:bg-red-500/30   transition-colors">Rechazar</button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL SOLICITAR PERMISO ──────────────────────────────────────────── */}
      {modalPermiso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111a0e] border border-white/15 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="font-bold text-lg text-white">Nueva Solicitud de Permiso</h2>
              <button onClick={() => setModalPermiso(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <FormField label="Empleado *">
                <select
                  value={formPermiso.nombre}
                  onChange={e => {
                    const emp = EMPLEADOS.find(x => x.nombre === e.target.value);
                    setFormPermiso(p => ({ ...p, nombre: e.target.value, cedula: String(emp?.cedula ?? ""), cargo: emp?.cargo ?? "" }));
                  }}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#5A7836]/60"
                >
                  <option value="" className="bg-[#111a0e]">Seleccionar empleado...</option>
                  {EMPLEADOS.map(e => (
                    <option key={e.id} value={e.nombre} className="bg-[#111a0e]">{e.nombre} — {e.cargo}</option>
                  ))}
                </select>
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Fecha Solicitud">
                  <input type="date" value={formPermiso.fechaSolicitud} onChange={e => setFormPermiso(p => ({ ...p, fechaSolicitud: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                </FormField>
                <FormField label="Fecha Permiso *">
                  <input type="date" value={formPermiso.fechaPermiso} onChange={e => setFormPermiso(p => ({ ...p, fechaPermiso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Horas Permiso *">
                  <input type="text" placeholder="Ej: 3, 8, 23 horas" value={formPermiso.horasPermiso} onChange={e => setFormPermiso(p => ({ ...p, horasPermiso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#5A7836]/60" />
                </FormField>
                <FormField label="Tipo Permiso">
                  <select value={formPermiso.tipoPermiso} onChange={e => setFormPermiso(p => ({ ...p, tipoPermiso: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none">
                    {["personal", "médico", "calamidad", "académico", "otro"].map(t => (
                      <option key={t} value={t} className="bg-[#111a0e] capitalize">{t}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField label="Motivo">
                <textarea rows={2} value={formPermiso.motivoPermiso} onChange={e => setFormPermiso(p => ({ ...p, motivoPermiso: e.target.value }))}
                  placeholder="Describe el motivo del permiso..."
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#5A7836]/60 resize-none" />
              </FormField>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={formPermiso.remunerado} onChange={e => setFormPermiso(p => ({ ...p, remunerado: e.target.checked }))}
                    className="w-4 h-4 accent-[#5A7836]" />
                  Remunerado
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={formPermiso.compensado} onChange={e => setFormPermiso(p => ({ ...p, compensado: e.target.checked }))}
                    className="w-4 h-4 accent-[#5A7836]" />
                  Compensado
                </label>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setModalPermiso(false)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-gray-400 text-sm font-semibold hover:bg-white/5">Cancelar</button>
              <button onClick={guardarPermiso} className="flex-1 py-2.5 rounded-xl bg-[#5A7836] hover:bg-[#4a6429] text-white text-sm font-semibold">Registrar</button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function EmpleadoCard({ empleado, onVerPermisos, onVerNovedades }: {
  empleado: NominaSirius & { horasPerm: number; diasVac: number; totalNovedades: number; pendientes: number };
  onVerPermisos: () => void;
  onVerNovedades: () => void;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-[#5A7836]/40 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-bold text-white">{empleado.nombre}</div>
          <div className="text-xs text-gray-400 mt-0.5">{empleado.cargo}</div>
          <div className="text-xs text-gray-600 mt-0.5">Cédula: {empleado.cedula.toLocaleString()}</div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${AREA_COLORS[empleado.area] ?? "bg-gray-500/20 text-gray-300 border-gray-500/40"}`}>
          {empleado.area}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center bg-white/5 rounded-xl py-2">
          <div className="text-yellow-400 font-bold text-lg">{empleado.horasPerm}<span className="text-sm font-normal">h</span></div>
          <div className="text-xs text-gray-500">Horas perm.</div>
        </div>
        <div className="text-center bg-white/5 rounded-xl py-2">
          <div className="text-blue-400 font-bold text-lg">{empleado.diasVac}<span className="text-sm font-normal">d</span></div>
          <div className="text-xs text-gray-500">Días vac.</div>
        </div>
        <div className="text-center bg-white/5 rounded-xl py-2">
          <div className="text-purple-400 font-bold text-lg">{empleado.totalNovedades}</div>
          <div className="text-xs text-gray-500">Novedades</div>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-4">
        Valor hora: <span className="text-[#7ab349] font-semibold">{fmtCOP(empleado.valorHora)}</span>
        <span className="mx-2">·</span>
        Jornada: <span className="text-gray-300">{empleado.horasDia}h/día</span>
      </div>
      {empleado.pendientes > 0 && (
        <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5 mb-3">
          {empleado.pendientes} novedad{empleado.pendientes > 1 ? "es" : ""} pendiente{empleado.pendientes > 1 ? "s" : ""}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onVerPermisos} className="flex-1 py-2 rounded-xl border border-white/20 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-colors">Permisos</button>
        <button onClick={onVerNovedades} className="flex-1 py-2 rounded-xl bg-[#5A7836]/70 hover:bg-[#5A7836] text-white text-xs font-semibold transition-colors">Novedades</button>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Btn({ color, title, onClick, children }: { color: "green" | "red" | "gray"; title: string; onClick: () => void; children: React.ReactNode }) {
  const cls = { green: "bg-green-500/15 text-green-400 hover:bg-green-500/30", red: "bg-red-500/15 text-red-400 hover:bg-red-500/30", gray: "bg-white/10 text-gray-400 hover:bg-white/20" }[color];
  return (
    <button onClick={onClick} title={title} className={`p-1.5 rounded-lg transition-colors text-xs font-bold ${cls}`}>{children}</button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
      <div className="text-white font-semibold text-sm truncate">{value}</div>
      <div className="text-gray-500 text-[10px]">{label}</div>
    </div>
  );
}

"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VoiceToText from "@/components/VoiceToText";

// ─── Tipos (mapean 1:1 con campos Airtable) ────────────────────────────────────

interface NominaSirius {
  id: string;
  nombre: string;
  cedula: number;
  cargo: string;
  area: string;
  salarioMensual: number;
  valorHora: number;
  horasDia: number;
  auxilioDia: number;
}

interface SolicitudPermiso {
  id: string;
  nombre: string;
  idPersonalCore?: string;
  cedula: string;
  cargo: string;
  fechaSolicitud: string;
  fechaPermiso: string;
  fechaFinPermiso?: string;
  horasPermiso: string;
  tipoPermiso: string;
  motivoPermiso: string;
  estadoPermiso: "Pendiente" | "Concedido" | "Rechazado";
  remunerado: boolean;
  compensado: boolean;
  fechaCompensatorio?: string;
  archivoGenerado?: string;
}

interface ReporteNovedad {
  id: string;
  empleado: string;
  idPersonalCore?: string;
  tipoNovedad: string;
  descripcion: string;
  transcripcionAudio?: string;
  numeroHorasExtras?: number | null;
  estadoRegistro: "Pendiente" | "Revisado" | "Resuelto" | "En seguimiento" | "Autorizado" | "No autorizado";
  fechaCreacion: string;
}

interface SolicitudVacaciones {
  id: string;
  nombre: string;
  idPersonalCore?: string;
  cedula: string;
  cargo: string;
  fechaPresentacion: string;
  fechaInicio: string;
  fechaFin: string;
  fechaReintegro: string;
  diasVacaciones: number;
  motivo: string;
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
  Pendiente:        "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  Revisado:         "bg-blue-500/20   text-blue-300   border-blue-500/40",
  Resuelto:         "bg-green-500/20  text-green-300  border-green-500/40",
  "En seguimiento": "bg-purple-500/20 text-purple-300 border-purple-500/40",
};

const VACACION_ESTADO_COLORS: Record<string, string> = {
  Aprobado:  "bg-green-500/20 text-green-300 border-green-500/40",
  Rechazado: "bg-red-500/20   text-red-300   border-red-500/40",
  "":        "bg-gray-500/20  text-gray-300  border-gray-500/40",
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

function contarDias(inicio?: string, fin?: string): number {
  if (!inicio || !fin) return 0;
  const ini = new Date(inicio);
  const f = new Date(fin);
  if (isNaN(ini.getTime()) || isNaN(f.getTime())) return 0;
  const dias = Math.floor((f.getTime() - ini.getTime()) / 86400000) + 1;
  return dias > 0 ? dias : 0;
}

function duracionPermiso(p: SolicitudPermiso): string {
  if (p.horasPermiso && parseHoras(p.horasPermiso) > 0) return `${parseHoras(p.horasPermiso)}h`;
  const dias = contarDias(p.fechaPermiso, p.fechaFinPermiso);
  if (dias > 0) return `${dias} día${dias > 1 ? "s" : ""}`;
  return "—";
}

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ControlHoras() {
  const [empleados, setEmpleados] = useState<NominaSirius[]>([]);
  const [permisos, setPermisos] = useState<SolicitudPermiso[]>([]);
  const [novedades, setNovedades] = useState<ReporteNovedad[]>([]);
  const [vacaciones, setVacaciones] = useState<SolicitudVacaciones[]>([]);

  const [cargando, setCargando] = useState(true);
  const [modalPermiso, setModalPermiso] = useState(false);
  const [modalVacaciones, setModalVacaciones] = useState(false);
  const [modalReporteNomina, setModalReporteNomina] = useState(false);
  const [modalHorasExtras, setModalHorasExtras] = useState(false);
  const [modalMisSolicitudes, setModalMisSolicitudes] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const [formPermiso, setFormPermiso] = useState({
    nombre: "", cedula: "", cargo: "", idPersonalCore: "", fechaSolicitud: new Date().toISOString().split("T")[0],
    modalidad: "horas" as "horas" | "dias",
    fechaPermiso: "", fechaFinPermiso: "", horasPermiso: "", tipoPermiso: "personal", motivoPermiso: "",
  });

  const [formVacaciones, setFormVacaciones] = useState({
    nombre: "", cedula: "", cargo: "", idPersonalCore: "", fechaPresentacion: new Date().toISOString().split("T")[0],
    fechaInicio: "", fechaFin: "", fechaReintegro: "", diasVacaciones: 1, motivo: "",
  });

  const [formReporte, setFormReporte] = useState({
    empleado: "", idPersonalCore: "", tipoNovedad: "", descripcion: "",
  });

  const [formHorasExtras, setFormHorasExtras] = useState({
    fecha: new Date().toISOString().split("T")[0], cantidadHoras: "", motivo: "",
  });

  // Usuario autenticado (sesión real)
  const [usuario, setUsuario] = useState<{ nombre: string; cedula: string; cargo: string; idPersonalCore: string }>({
    nombre: "", cedula: "", cargo: "", idPersonalCore: "",
  });
  const usuarioActual = usuario.nombre || "Usuario";

  // ── Cargar usuario autenticado ────────────────────────────────────────────
  useEffect(() => {
    async function cargarUsuario() {
      // 1) Intentar sesión segura vía API
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            const u = data.user;
            setUsuario({
              nombre: u.Nombre || u.nombre || "",
              cedula: String(u.Cedula || u.cedula || ""),
              cargo: u.Cargo || u.cargo || "",
              idPersonalCore: u.idPersonalCore || "",
            });
            return;
          }
        }
      } catch { /* fallback a localStorage */ }

      // 2) Fallback a sesión legacy en localStorage
      try {
        const raw = localStorage.getItem("userSession");
        if (raw) {
          const s = JSON.parse(raw);
          const u = s?.user ?? {};
          setUsuario({
            nombre: u.Nombre || "",
            cedula: String(u.Cedula || ""),
            cargo: u.Cargo || "",
            idPersonalCore: u.idPersonalCore || "",
          });
        }
      } catch { /* noop */ }
    }
    cargarUsuario();
  }, []);

  // ── Carga de datos ───────────────────────────────────────────────────────

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const [empRes, permRes, novRes, vacRes] = await Promise.all([
        fetch("/api/nomina/empleados"),
        fetch("/api/nomina/permisos"),
        fetch("/api/nomina/novedades"),
        fetch("/api/nomina/vacaciones"),
      ]);

      const [empData, permData, novData, vacData] = await Promise.all([
        empRes.json(), permRes.json(), novRes.json(), vacRes.json(),
      ]);

      setEmpleados(empData.empleados ?? []);
      setPermisos(permData.permisos ?? []);
      setNovedades(novData.novedades ?? []);
      setVacaciones(vacData.vacaciones ?? []);
    } catch (e) {
      console.error("Error cargando datos nomina:", e);
      toast("❌ Error al cargar datos");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ── Auto-llenar datos del empleado actual ─────────────────────────────────

  const datosEmpleado = useCallback(() => {
    const emp = empleados.find(e => e.nombre === usuarioActual);
    return {
      nombre: usuario.nombre || emp?.nombre || "",
      cedula: usuario.cedula || (emp ? String(emp.cedula) : ""),
      cargo: usuario.cargo || emp?.cargo || "",
      idPersonalCore: usuario.idPersonalCore || "",
    };
  }, [empleados, usuario, usuarioActual]);

  useEffect(() => {
    if (modalPermiso) {
      const d = datosEmpleado();
      setFormPermiso(prev => ({ ...prev, ...d }));
    }
  }, [modalPermiso, datosEmpleado]);

  useEffect(() => {
    if (modalVacaciones) {
      const d = datosEmpleado();
      setFormVacaciones(prev => ({ ...prev, ...d }));
    }
  }, [modalVacaciones, datosEmpleado]);

  useEffect(() => {
    if (modalReporteNomina) {
      const d = datosEmpleado();
      setFormReporte(prev => ({ ...prev, empleado: d.nombre, idPersonalCore: d.idPersonalCore }));
    }
  }, [modalReporteNomina, datosEmpleado]);

  function toast(msg: string) {
    setMensaje(msg);
    setTimeout(() => setMensaje(""), 3500);
  }

  // ── Datos del usuario actual (vista personal) ─────────────────────────────

  const mios = useMemo(() => {
    const coincide = (nombre: string, idpc?: string) =>
      nombre === usuarioActual || (!!usuario.idPersonalCore && idpc === usuario.idPersonalCore);
    const misPermisos = permisos.filter(p => coincide(p.nombre, p.idPersonalCore));
    const misNovedades = novedades.filter(n => coincide(n.empleado, n.idPersonalCore));
    const misVacaciones = vacaciones.filter(v => coincide(v.nombre, v.idPersonalCore));
    const horasExtras = misNovedades.filter(n => n.tipoNovedad === "Horas Extras");
    const reportes = misNovedades.filter(n => n.tipoNovedad !== "Horas Extras");
    return {
      misPermisos, misNovedades, misVacaciones, horasExtras, reportes,
      permPendientes: misPermisos.filter(p => p.estadoPermiso === "Pendiente").length,
      vacPendientes: misVacaciones.filter(v => v.estadoSolicitud === "").length,
      horasExtrasPend: horasExtras.filter(n => n.estadoRegistro === "Pendiente").length,
    };
  }, [permisos, novedades, vacaciones, usuarioActual, usuario.idPersonalCore]);

  async function guardarPermiso() {
    if (!formPermiso.nombre || !formPermiso.fechaPermiso || !formPermiso.fechaFinPermiso) {
      toast("❌ Indica la fecha de inicio y de fin del permiso");
      return;
    }
    if (formPermiso.modalidad === "horas" && !formPermiso.horasPermiso) {
      toast("❌ Indica la cantidad de horas del permiso");
      return;
    }
    // En modalidad por días no se reportan horas
    const horasPermiso = formPermiso.modalidad === "horas" ? formPermiso.horasPermiso : "";
    try {
      const res = await fetch("/api/nomina/permisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: formPermiso.nombre,
          cedula: formPermiso.cedula,
          cargo: formPermiso.cargo,
          idPersonalCore: formPermiso.idPersonalCore,
          fechaSolicitud: formPermiso.fechaSolicitud,
          fechaPermiso: formPermiso.fechaPermiso,
          fechaFinPermiso: formPermiso.fechaFinPermiso,
          horasPermiso,
          tipoPermiso: formPermiso.tipoPermiso,
          motivoPermiso: formPermiso.motivoPermiso,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const nuevo: SolicitudPermiso = {
        id: data.id,
        nombre: formPermiso.nombre,
        idPersonalCore: formPermiso.idPersonalCore,
        cedula: formPermiso.cedula,
        cargo: formPermiso.cargo,
        fechaSolicitud: formPermiso.fechaSolicitud,
        fechaPermiso: formPermiso.fechaPermiso,
        fechaFinPermiso: formPermiso.fechaFinPermiso,
        horasPermiso,
        tipoPermiso: formPermiso.tipoPermiso,
        motivoPermiso: formPermiso.motivoPermiso,
        estadoPermiso: "Pendiente",
        remunerado: false,
        compensado: false,
      };
      setPermisos(prev => [nuevo, ...prev]);
      setModalPermiso(false);
      toast("✅ Solicitud de permiso registrada");
      setFormPermiso({
        nombre: "", cedula: "", cargo: "", idPersonalCore: "",
        fechaSolicitud: new Date().toISOString().split("T")[0],
        modalidad: "horas",
        fechaPermiso: "", fechaFinPermiso: "", horasPermiso: "", tipoPermiso: "personal",
        motivoPermiso: "",
      });
    } catch {
      toast("❌ Error al registrar permiso");
    }
  }

  async function guardarVacaciones() {
    if (!formVacaciones.nombre || !formVacaciones.fechaInicio || !formVacaciones.fechaFin) {
      toast("❌ Completa todos los campos obligatorios");
      return;
    }
    try {
      const res = await fetch("/api/nomina/vacaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formVacaciones),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const nueva: SolicitudVacaciones = {
        id: data.id,
        ...formVacaciones,
        estadoSolicitud: "",
      };
      setVacaciones(prev => [nueva, ...prev]);
      setModalVacaciones(false);
      toast("✅ Solicitud de vacaciones registrada");
      setFormVacaciones({
        nombre: "", cedula: "", cargo: "", idPersonalCore: "", fechaPresentacion: new Date().toISOString().split("T")[0],
        fechaInicio: "", fechaFin: "", fechaReintegro: "", diasVacaciones: 1, motivo: "",
      });
    } catch {
      toast("❌ Error al registrar vacaciones");
    }
  }

  async function guardarReporteNomina() {
    if (!formReporte.empleado || !formReporte.tipoNovedad) {
      toast("❌ Completa todos los campos obligatorios");
      return;
    }
    try {
      const res = await fetch("/api/nomina/novedades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formReporte),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const nuevo: ReporteNovedad = {
        id: data.id,
        ...formReporte,
        estadoRegistro: "Pendiente",
        fechaCreacion: new Date().toISOString(),
      };
      setNovedades(prev => [nuevo, ...prev]);
      setModalReporteNomina(false);
      toast("✅ Reporte de nómina registrado");
      setFormReporte({ empleado: "", idPersonalCore: "", tipoNovedad: "", descripcion: "" });
    } catch {
      toast("❌ Error al registrar reporte");
    }
  }

  async function guardarHorasExtras() {
    if (!formHorasExtras.fecha || !formHorasExtras.cantidadHoras) {
      toast("❌ Indica la fecha y la cantidad de horas extras");
      return;
    }
    const d = datosEmpleado();
    if (!d.nombre) {
      toast("❌ No se pudo identificar tu usuario");
      return;
    }
    const descripcion =
      `Horas extras: ${formHorasExtras.cantidadHoras}h trabajadas el ${fmtDate(formHorasExtras.fecha)}.` +
      (formHorasExtras.motivo ? ` Motivo: ${formHorasExtras.motivo}` : "");
    try {
      const res = await fetch("/api/nomina/novedades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empleado: d.nombre,
          idPersonalCore: d.idPersonalCore,
          tipoNovedad: "Horas Extras",
          numeroHorasExtras: Number(formHorasExtras.cantidadHoras),
          descripcion,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const nuevo: ReporteNovedad = {
        id: data.id,
        empleado: d.nombre,
        idPersonalCore: d.idPersonalCore,
        tipoNovedad: "Horas Extras",
        numeroHorasExtras: Number(formHorasExtras.cantidadHoras),
        descripcion,
        estadoRegistro: "Pendiente",
        fechaCreacion: new Date().toISOString(),
      };
      setNovedades(prev => [nuevo, ...prev]);
      setModalHorasExtras(false);
      toast("✅ Horas extras reportadas");
      setFormHorasExtras({ fecha: new Date().toISOString().split("T")[0], cantidadHoras: "", motivo: "" });
    } catch {
      toast("❌ Error al reportar horas extras");
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative text-white"
      style={{ backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/55"></div>

      <div className="relative z-10">
        <Navbar />

        <div className="max-w-7xl mx-auto px-6 pt-10 pb-16">
          <div className="bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-2xl p-8">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-white drop-shadow-lg">Novedades Nómina</h1>
                <p className="text-white/70 mt-1 text-sm drop-shadow">Permisos, novedades y vacaciones — Base Airtable: Novedades Nomina</p>
              </div>
              <div className="flex gap-2 self-start sm:self-auto flex-wrap">
                <button
                  onClick={cargarDatos}
                  disabled={cargando}
                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-semibold transition-all flex items-center gap-2 border border-white/20 cursor-pointer disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {cargando ? "Cargando…" : "Actualizar"}
                </button>
                <button
                  onClick={() => setModalPermiso(true)}
                  className="bg-[#5A7836] hover:bg-[#4a6429] text-white px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-[#5A7836]/20 cursor-pointer text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Permiso
                </button>
                <button
                  onClick={() => setModalVacaciones(true)}
                  className="bg-blue-600/80 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Vacaciones
                </button>
                <button
                  onClick={() => setModalHorasExtras(true)}
                  className="bg-orange-600/80 hover:bg-orange-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-orange-600/20 cursor-pointer text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Horas Extras
                </button>
                <button
                  onClick={() => setModalReporteNomina(true)}
                  className="bg-purple-600/80 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-purple-600/20 cursor-pointer text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Reporte
                </button>
                <button
                  onClick={() => setModalMisSolicitudes(true)}
                  className="bg-amber-600/80 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-all hover:scale-105 flex items-center gap-2 shadow-lg shadow-amber-600/20 cursor-pointer text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Mis Solicitudes
                </button>
              </div>
            </div>

            {/* Stats */}
            {cargando ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-5 py-4 animate-pulse">
                    <div className="h-3 bg-white/20 rounded mb-2 w-2/3"></div>
                    <div className="h-8 bg-white/20 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Mis permisos"        value={String(mios.misPermisos.length)}   color="text-[#7ab349]" />
                <StatCard label="Mis vacaciones"      value={String(mios.misVacaciones.length)} color="text-blue-400" />
                <StatCard label="Horas extras (reg.)" value={String(mios.horasExtras.length)}   color="text-orange-400" />
                <StatCard label="Mis reportes"        value={String(mios.reportes.length)}      color="text-purple-400" />
              </div>
            )}

            {/* Toast */}
            {mensaje && (
              <div className="mt-6 p-4 bg-[#5A7836]/30 backdrop-blur-sm border border-[#5A7836]/40 rounded-xl text-white text-sm font-semibold drop-shadow">
                {mensaje}
              </div>
            )}

            {/* ── MI ESPACIO ────────────────────────────────────────────────── */}
            <div className="mt-8">
              <div className="pb-16">
                {/* Saludo + acciones rápidas */}
                <div className="bg-white/5 border border-white/15 rounded-2xl p-5 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-white/60 text-xs">Bienvenido(a)</p>
                      <h2 className="text-xl font-bold text-white drop-shadow">{usuarioActual}</h2>
                      <p className="text-white/40 text-xs mt-0.5">
                        {usuario.cargo || "—"}{usuario.cedula ? ` · CC ${usuario.cedula}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <QuickAction color="#5A7836" label="Permiso" onClick={() => setModalPermiso(true)} />
                      <QuickAction color="#2563eb" label="Vacaciones" onClick={() => setModalVacaciones(true)} />
                      <QuickAction color="#ea580c" label="Horas Extras" onClick={() => setModalHorasExtras(true)} />
                      <QuickAction color="#9333ea" label="Reporte" onClick={() => setModalReporteNomina(true)} />
                    </div>
                  </div>
                </div>

                {cargando ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="bg-white/10 border border-white/20 rounded-2xl p-5 animate-pulse h-40"></div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Mis Permisos */}
                    <SeccionMios titulo="Mis Permisos" count={mios.misPermisos.length}>
                      {mios.misPermisos.length === 0
                        ? <VacioMios texto="No has solicitado permisos" />
                        : mios.misPermisos
                            .slice()
                            .sort((a, b) => (b.fechaSolicitud || "").localeCompare(a.fechaSolicitud || ""))
                            .map(p => (
                          <div key={p.id} className="bg-white/5 border border-white/15 rounded-xl p-3 text-xs">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-semibold text-white capitalize">{p.tipoPermiso || "Permiso"}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${PERMISO_ESTADO_COLORS[p.estadoPermiso]}`}>{p.estadoPermiso}</span>
                            </div>
                            <p className="text-white/60">{p.motivoPermiso || "—"}</p>
                            <p className="text-white/40 mt-1">{fmtDate(p.fechaPermiso)} · {duracionPermiso(p)}{p.remunerado ? " · Remunerado" : ""}</p>
                          </div>
                        ))}
                    </SeccionMios>

                    {/* Mis Vacaciones */}
                    <SeccionMios titulo="Mis Vacaciones" count={mios.misVacaciones.length}>
                      {mios.misVacaciones.length === 0
                        ? <VacioMios texto="No has solicitado vacaciones" />
                        : mios.misVacaciones
                            .slice()
                            .sort((a, b) => (b.fechaPresentacion || "").localeCompare(a.fechaPresentacion || ""))
                            .map(v => (
                          <div key={v.id} className="bg-white/5 border border-white/15 rounded-xl p-3 text-xs">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-semibold text-white">{v.diasVacaciones} día(s)</span>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${VACACION_ESTADO_COLORS[v.estadoSolicitud]}`}>{v.estadoSolicitud || "Sin revisar"}</span>
                            </div>
                            <p className="text-white/60">{v.motivo || "—"}</p>
                            <p className="text-white/40 mt-1">{fmtDate(v.fechaInicio)} al {fmtDate(v.fechaFin)}</p>
                          </div>
                        ))}
                    </SeccionMios>

                    {/* Mis Horas Extras */}
                    <SeccionMios titulo="Mis Horas Extras" count={mios.horasExtras.length}>
                      {mios.horasExtras.length === 0
                        ? <VacioMios texto="No has reportado horas extras" />
                        : mios.horasExtras
                            .slice()
                            .sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""))
                            .map(n => (
                          <div key={n.id} className="bg-white/5 border border-white/15 rounded-xl p-3 text-xs">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-semibold text-orange-300">Horas Extras</span>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NOVEDAD_ESTADO_COLORS[n.estadoRegistro]}`}>{n.estadoRegistro}</span>
                            </div>
                            <p className="text-white/60">{n.descripcion}</p>
                          </div>
                        ))}
                    </SeccionMios>

                    {/* Mis Reportes */}
                    <SeccionMios titulo="Mis Reportes / Novedades" count={mios.reportes.length}>
                      {mios.reportes.length === 0
                        ? <VacioMios texto="No has registrado reportes" />
                        : mios.reportes
                            .slice()
                            .sort((a, b) => (b.fechaCreacion || "").localeCompare(a.fechaCreacion || ""))
                            .map(n => (
                          <div key={n.id} className="bg-white/5 border border-white/15 rounded-xl p-3 text-xs">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-semibold text-white">{n.tipoNovedad}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NOVEDAD_ESTADO_COLORS[n.estadoRegistro]}`}>{n.estadoRegistro}</span>
                            </div>
                            <p className="text-white/60">{n.descripcion || "—"}</p>
                          </div>
                        ))}
                    </SeccionMios>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── MODAL SOLICITAR PERMISO ──────────────────────────────────────────── */}
        {modalPermiso && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
                <h2 className="font-bold text-lg text-white drop-shadow">Nueva Solicitud de Permiso</h2>
                <button onClick={() => setModalPermiso(false)} className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <FormField label="Empleado">
                  <div className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white">
                    {formPermiso.nombre || "Cargando..."}
                  </div>
                </FormField>

                {/* Modalidad: horas o días */}
                <FormField label="Modalidad del permiso *">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { key: "horas", label: "Por horas" },
                      { key: "dias", label: "Por días" },
                    ] as { key: "horas" | "dias"; label: string }[]).map(m => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setFormPermiso(p => ({ ...p, modalidad: m.key, horasPermiso: m.key === "dias" ? "" : p.horasPermiso }))}
                        className={`py-2 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${
                          formPermiso.modalidad === m.key
                            ? "bg-[#5A7836] border-[#5A7836] text-white"
                            : "border-white/25 text-white/60 hover:border-white/50 hover:text-white"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Fecha Inicio *">
                    <input type="date" value={formPermiso.fechaPermiso} onChange={e => setFormPermiso(p => ({ ...p, fechaPermiso: e.target.value }))}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                  </FormField>
                  <FormField label="Fecha Fin *">
                    <input type="date" value={formPermiso.fechaFinPermiso} min={formPermiso.fechaPermiso || undefined} onChange={e => setFormPermiso(p => ({ ...p, fechaFinPermiso: e.target.value }))}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                  </FormField>
                </div>

                {formPermiso.modalidad === "dias" && formPermiso.fechaPermiso && formPermiso.fechaFinPermiso && (
                  <p className="text-xs text-[#7ab349] -mt-1">
                    Total: {contarDias(formPermiso.fechaPermiso, formPermiso.fechaFinPermiso)} día(s)
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {formPermiso.modalidad === "horas" ? (
                    <FormField label="Horas Permiso *">
                      <input type="number" min="0.5" step="0.5" placeholder="Ej: 3" value={formPermiso.horasPermiso} onChange={e => setFormPermiso(p => ({ ...p, horasPermiso: e.target.value }))}
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#5A7836]/60" />
                    </FormField>
                  ) : <div />}
                  <FormField label="Tipo Permiso">
                    <select value={formPermiso.tipoPermiso} onChange={e => setFormPermiso(p => ({ ...p, tipoPermiso: e.target.value }))}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]">
                      {["personal", "médico", "calamidad", "académico", "otro"].map(t => (
                        <option key={t} value={t} className="bg-[#111a0e] capitalize">{t}</option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <FormField label="Motivo">
                  <div className="relative">
                    <textarea rows={3} value={formPermiso.motivoPermiso} onChange={e => setFormPermiso(p => ({ ...p, motivoPermiso: e.target.value }))}
                      placeholder="Describe el motivo del permiso o usa el micrófono…"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 pr-12 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#5A7836]/60 resize-none" />
                    <VoiceToText
                      onTextExtracted={(text) =>
                        setFormPermiso(p => ({ ...p, motivoPermiso: p.motivoPermiso ? `${p.motivoPermiso} ${text}` : text }))
                      }
                    />
                  </div>
                </FormField>

                <p className="text-[11px] text-white/40">
                  Si el permiso es remunerado o compensado lo determina el área de nómina, no el solicitante.
                </p>
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button onClick={() => setModalPermiso(false)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/50 text-sm font-semibold hover:bg-white/10 transition-colors cursor-pointer">Cancelar</button>
                <button onClick={guardarPermiso} className="flex-1 py-2.5 rounded-xl bg-[#5A7836] hover:bg-[#4a6429] text-white text-sm font-semibold transition-colors cursor-pointer">Registrar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL SOLICITAR VACACIONES ────────────────────────────────────── */}
        {modalVacaciones && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
                <h2 className="font-bold text-lg text-white drop-shadow">Solicitar Vacaciones</h2>
                <button onClick={() => setModalVacaciones(false)} className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <FormField label="Empleado">
                  <div className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white">
                    {formVacaciones.nombre || "Cargando..."}
                  </div>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Fecha Inicio *">
                    <input type="date" value={formVacaciones.fechaInicio} onChange={e => setFormVacaciones(v => ({ ...v, fechaInicio: e.target.value }))}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                  </FormField>
                  <FormField label="Fecha Fin *">
                    <input type="date" value={formVacaciones.fechaFin} onChange={e => setFormVacaciones(v => ({ ...v, fechaFin: e.target.value }))}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                  </FormField>
                </div>
                <FormField label="Fecha Reintegro *">
                  <input type="date" value={formVacaciones.fechaReintegro} onChange={e => setFormVacaciones(v => ({ ...v, fechaReintegro: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                </FormField>
                <FormField label="Días de Vacaciones *">
                  <input type="number" min="1" value={formVacaciones.diasVacaciones} onChange={e => setFormVacaciones(v => ({ ...v, diasVacaciones: parseInt(e.target.value) || 1 }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none" />
                </FormField>
                <FormField label="Motivo">
                  <textarea value={formVacaciones.motivo} onChange={e => setFormVacaciones(v => ({ ...v, motivo: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none resize-none h-20"
                    placeholder="Ingresa el motivo de las vacaciones" />
                </FormField>
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button onClick={() => setModalVacaciones(false)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/50 text-sm font-semibold hover:bg-white/10 transition-colors cursor-pointer">Cancelar</button>
                <button onClick={guardarVacaciones} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer">Registrar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL REPORTE DE NÓMINA ──────────────────────────────────────── */}
        {modalReporteNomina && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
                <h2 className="font-bold text-lg text-white drop-shadow">Registrar Reporte de Nómina</h2>
                <button onClick={() => setModalReporteNomina(false)} className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <FormField label="Empleado">
                  <div className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white">
                    {formReporte.empleado || "Cargando..."}
                  </div>
                </FormField>
                <FormField label="Tipo de Novedad *">
                  <select value={formReporte.tipoNovedad} onChange={e => setFormReporte(r => ({ ...r, tipoNovedad: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none">
                    <option value="">Seleccionar tipo</option>
                    <option value="Cambio de Horario">Cambio de Horario</option>
                    <option value="Incapacidad">Incapacidad</option>
                    <option value="Calamidad Doméstica">Calamidad Doméstica</option>
                    <option value="Amonestación">Amonestación</option>
                    <option value="Felicitación">Felicitación</option>
                    <option value="Otro">Otro</option>
                  </select>
                </FormField>
                <FormField label="Descripción">
                  <textarea value={formReporte.descripcion} onChange={e => setFormReporte(r => ({ ...r, descripcion: e.target.value }))}
                    className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none resize-none h-24"
                    placeholder="Detalla el reporte" />
                </FormField>
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button onClick={() => setModalReporteNomina(false)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/50 text-sm font-semibold hover:bg-white/10 transition-colors cursor-pointer">Cancelar</button>
                <button onClick={guardarReporteNomina} className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors cursor-pointer">Registrar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL HORAS EXTRAS ───────────────────────────────────────────── */}
        {modalHorasExtras && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
                <h2 className="font-bold text-lg text-white drop-shadow">Reportar Horas Extras</h2>
                <button onClick={() => setModalHorasExtras(false)} className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <FormField label="Empleado">
                  <div className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white">
                    {usuarioActual || "Cargando..."}
                  </div>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Fecha *">
                    <input type="date" value={formHorasExtras.fecha} onChange={e => setFormHorasExtras(h => ({ ...h, fecha: e.target.value }))}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none [color-scheme:dark]" />
                  </FormField>
                  <FormField label="Cantidad de horas *">
                    <input type="number" min="0.5" step="0.5" placeholder="Ej: 2.5" value={formHorasExtras.cantidadHoras}
                      onChange={e => setFormHorasExtras(h => ({ ...h, cantidadHoras: e.target.value }))}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#5A7836]/60" />
                  </FormField>
                </div>
                <FormField label="Motivo / Descripción">
                  <textarea rows={3} value={formHorasExtras.motivo} onChange={e => setFormHorasExtras(h => ({ ...h, motivo: e.target.value }))}
                    placeholder="¿Por qué realizaste horas extras?"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#5A7836]/60 resize-none" />
                </FormField>
                <p className="text-[11px] text-white/40">Se registrará como una novedad de tipo «Horas Extras» pendiente de revisión por nómina.</p>
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button onClick={() => setModalHorasExtras(false)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/50 text-sm font-semibold hover:bg-white/10 transition-colors cursor-pointer">Cancelar</button>
                <button onClick={guardarHorasExtras} className="flex-1 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors cursor-pointer">Reportar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL MIS SOLICITUDES ───────────────────────────────────────── */}        {modalMisSolicitudes && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-2xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/20">
                <h2 className="font-bold text-lg text-white drop-shadow">Mis Solicitudes</h2>
                <button onClick={() => setModalMisSolicitudes(false)} className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4 max-h-[calc(90vh-120px)] overflow-y-auto">
                {/* Permisos del usuario actual */}
                {permisos.filter(p => p.nombre === usuarioActual).length > 0 && (
                  <div>
                    <h3 className="text-white font-semibold mb-3 text-sm">Mis Permisos</h3>
                    <div className="space-y-2">
                      {permisos.filter(p => p.nombre === usuarioActual).map(p => (
                        <div key={p.id} className="bg-white/5 border border-white/20 rounded-xl p-3 text-xs">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-white">{p.tipoPermiso}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${PERMISO_ESTADO_COLORS[p.estadoPermiso]}`}>{p.estadoPermiso}</span>
                          </div>
                          <p className="text-white/70">{p.motivoPermiso}</p>
                          <p className="text-white/50 mt-1">{fmtDate(p.fechaPermiso)} • {p.horasPermiso}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vacaciones del usuario actual */}
                {vacaciones.filter(v => v.nombre === usuarioActual).length > 0 && (
                  <div>
                    <h3 className="text-white font-semibold mb-3 text-sm">Mis Vacaciones</h3>
                    <div className="space-y-2">
                      {vacaciones.filter(v => v.nombre === usuarioActual).map(v => (
                        <div key={v.id} className="bg-white/5 border border-white/20 rounded-xl p-3 text-xs">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-white">Vacaciones</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${VACACION_ESTADO_COLORS[v.estadoSolicitud]}`}>
                              {v.estadoSolicitud || "Sin revisar"}
                            </span>
                          </div>
                          <p className="text-white/70">{v.motivo}</p>
                          <p className="text-white/50 mt-1">{fmtDate(v.fechaInicio)} al {fmtDate(v.fechaFin)} • {v.diasVacaciones}d</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Novedades del usuario actual */}
                {novedades.filter(n => n.empleado === usuarioActual).length > 0 && (
                  <div>
                    <h3 className="text-white font-semibold mb-3 text-sm">Mis Reportes</h3>
                    <div className="space-y-2">
                      {novedades.filter(n => n.empleado === usuarioActual).map(n => (
                        <div key={n.id} className="bg-white/5 border border-white/20 rounded-xl p-3 text-xs">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-white">{n.tipoNovedad}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${NOVEDAD_ESTADO_COLORS[n.estadoRegistro]}`}>{n.estadoRegistro}</span>
                          </div>
                          <p className="text-white/70">{n.descripcion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {permisos.filter(p => p.nombre === usuarioActual).length === 0 && 
                 vacaciones.filter(v => v.nombre === usuarioActual).length === 0 && 
                 novedades.filter(n => n.empleado === usuarioActual).length === 0 && (
                  <p className="text-white/50 text-center py-8">No tienes solicitudes registradas</p>
                )}
              </div>
              <div className="px-6 pb-5 flex justify-end">
                <button onClick={() => setModalMisSolicitudes(false)} className="py-2.5 px-6 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors cursor-pointer">Cerrar</button>
              </div>
            </div>
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-5 py-4">
      <div className="text-xs text-white/50 mb-1 drop-shadow">{label}</div>
      <div className={`text-2xl font-bold drop-shadow ${color}`}>{value}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-white/70 mb-1.5 drop-shadow">{label}</label>
      {children}
    </div>
  );
}

function QuickAction({ color, label, onClick }: { color: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ backgroundColor: color }}
      className="text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:scale-105 shadow-lg cursor-pointer opacity-90 hover:opacity-100"
    >
      {label}
    </button>
  );
}

function SeccionMios({ titulo, count, children }: { titulo: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold text-sm drop-shadow">{titulo}</h3>
        <span className="text-xs text-white/40 bg-white/10 rounded-full px-2.5 py-0.5">{count}</span>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}

function VacioMios({ texto }: { texto: string }) {
  return <p className="text-white/40 text-xs text-center py-6">{texto}</p>;
}

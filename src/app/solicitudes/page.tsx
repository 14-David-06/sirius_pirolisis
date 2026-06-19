"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const BG = "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')";

type Row = { tipo: string; subtipo: string; fecha: string; estado: string };

const ESTADO_COLORS: Record<string, string> = {
  Pendiente:       "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  Concedido:       "bg-green-500/20  text-green-300  border-green-500/40",
  Aprobado:        "bg-green-500/20  text-green-300  border-green-500/40",
  Rechazado:       "bg-red-500/20    text-red-300    border-red-500/40",
  Revisado:        "bg-blue-500/20   text-blue-300   border-blue-500/40",
  Resuelto:        "bg-green-500/20  text-green-300  border-green-500/40",
  Autorizado:      "bg-green-500/20  text-green-300  border-green-500/40",
  "No autorizado": "bg-red-500/20    text-red-300    border-red-500/40",
  "Sin revisar":   "bg-gray-500/20   text-gray-300   border-gray-500/40",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length !== 3) return d;
  const [y, m, day] = parts;
  return `${day}/${m}/${y}`;
}

export default function SolicitudesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");
  const [idCore, setIdCore] = useState("");

  useEffect(() => {
    async function load() {
      try {
        // 1. Obtener usuario actual desde /api/session (probado, usado por Navbar)
        const sessionRes = await fetch("/api/session");
        if (!sessionRes.ok) return;
        const sessionData = await sessionRes.json();
        if (!sessionData.authenticated) return;
        const u = sessionData.user ?? {};
        const nombreCompleto = (u.Nombre || u.nombre || "").trim();
        setNombre(nombreCompleto);
        const uid: string = u.idPersonalCore ?? "";
        setIdCore(uid);

        // 2. Cargar datos de las rutas nomina existentes (probadas, retornan todos los registros)
        const [permRes, vacRes, novRes] = await Promise.all([
          fetch("/api/nomina/permisos"),
          fetch("/api/nomina/vacaciones"),
          fetch("/api/nomina/novedades"),
        ]);

        const combined: Row[] = [];

        if (permRes.ok) {
          const { permisos = [] } = await permRes.json();
          // Filtrar por idPersonalCore o por nombre si idCore no está disponible
          const mios = permisos.filter((p: any) =>
            uid ? p.idPersonalCore === uid : false
          );
          for (const p of mios) {
            combined.push({
              tipo: "Permiso",
              subtipo: p.tipoPermiso || "—",
              fecha: p.fechaSolicitud || "",
              estado: p.estadoPermiso || "Pendiente",
            });
          }
        }

        if (vacRes.ok) {
          const { vacaciones = [] } = await vacRes.json();
          const mias = vacaciones.filter((v: any) =>
            uid ? v.idPersonalCore === uid : false
          );
          for (const v of mias) {
            const ini = v.fechaInicio || "";
            const fin = v.fechaFin || "";
            combined.push({
              tipo: "Vacaciones",
              subtipo: ini && fin ? `${fmtDate(ini)} → ${fmtDate(fin)}` : "—",
              fecha: v.fechaPresentacion || "",
              estado: v.estadoSolicitud || "Sin revisar",
            });
          }
        }

        if (novRes.ok) {
          const { novedades = [] } = await novRes.json();
          const mias = novedades.filter((n: any) =>
            uid ? n.idPersonalCore === uid : false
          );
          for (const n of mias) {
            combined.push({
              tipo: "Novedad",
              subtipo: n.tipoNovedad || "—",
              fecha: n.fechaCreacion || "",
              estado: n.estadoRegistro || "Pendiente",
            });
          }
        }

        // Ordenar por fecha descendente
        combined.sort((a, b) => {
          if (!a.fecha && !b.fecha) return 0;
          if (!a.fecha) return 1;
          if (!b.fecha) return -1;
          return b.fecha.localeCompare(a.fecha);
        });

        setRows(combined.slice(0, 15));
      } finally {
        setCargando(false);
      }
    }
    load();
  }, []);

  const ACTIONS = [
    { label: "Solicitar Permiso",    desc: "Médico, personal, calamidad y más",          href: "/solicitudes/permiso",    color: "#5A7836" },
    { label: "Solicitar Vacaciones", desc: "Registra tu período de descanso",             href: "/solicitudes/vacaciones", color: "#2563eb" },
    { label: "Reportar Novedad",     desc: "Horas extra, incapacidad, cambio de horario", href: "/solicitudes/novedades",  color: "#ea580c" },
  ];

  return (
    <div className="min-h-screen bg-cover bg-center bg-no-repeat relative text-white" style={{ backgroundImage: BG }}>
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10">
        <Navbar />

        <div className="max-w-5xl mx-auto px-6 pt-10 pb-16">
          <div className="bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-2xl p-8">

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white drop-shadow-lg">Mis Solicitudes</h1>
              {nombre && (
                <p className="text-white/60 text-sm mt-1">Bienvenido(a), {nombre}</p>
              )}
              <p className="text-white/40 text-xs mt-0.5">Permisos, vacaciones y novedades de nómina</p>
            </div>

            {/* Acciones rápidas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
              {ACTIONS.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 rounded-2xl p-5 flex flex-col gap-3 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${a.color}33` }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={a.color} strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{a.label}</p>
                    <p className="text-xs text-white/50 mt-0.5">{a.desc}</p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Tabla recientes */}
            <div className="bg-white/10 border border-white/20 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/15 flex items-center justify-between">
                <h2 className="font-semibold text-white/80 text-sm">Mis solicitudes recientes</h2>
                {cargando && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                )}
              </div>

              {cargando ? (
                <div className="px-6 py-8 flex flex-col gap-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-8 bg-white/10 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <p className="text-white/40 text-sm">Aún no tienes solicitudes registradas.</p>
                  {!idCore && (
                    <p className="text-white/30 text-xs mt-2">
                      Tu perfil no tiene un ID de empleado asignado. Contacta a RRHH.
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Tipo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Detalle</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Fecha</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rows.map((row, i) => {
                        const cls = ESTADO_COLORS[row.estado] ?? "bg-gray-500/20 text-gray-300 border-gray-500/40";
                        return (
                          <tr key={i} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 font-medium text-white">{row.tipo}</td>
                            <td className="px-6 py-4 text-white/60 max-w-xs truncate">{row.subtipo}</td>
                            <td className="px-6 py-4 text-white/50 whitespace-nowrap">{fmtDate(row.fecha)}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
                                {row.estado}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

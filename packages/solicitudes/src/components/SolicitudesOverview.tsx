import Link from "next/link";
import { escapeAirtableValue } from "../lib/security";
import { TABLES, FIELDS, FK_ID_CORE } from "../lib/schema";

interface Props {
  idCore: string;
  basePath?: string;
}

type AirtableRecord = { id: string; fields: Record<string, unknown> };

const ESTADO_STYLE: Record<string, { bg: string; color: string }> = {
  Pendiente:       { bg: "#fef9c3", color: "#a16207" },
  Concedido:       { bg: "#dcfce7", color: "#15803d" },
  Aprobado:        { bg: "#dcfce7", color: "#15803d" },
  Rechazado:       { bg: "#fee2e2", color: "#b91c1c" },
  Revisado:        { bg: "#dbeafe", color: "#1d4ed8" },
  Resuelto:        { bg: "#f0fdf4", color: "#16a34a" },
  Autorizado:      { bg: "#dcfce7", color: "#15803d" },
  "No autorizado": { bg: "#fee2e2", color: "#b91c1c" },
};

async function fetchRecientes(idCore: string) {
  const BASE = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
  const KEY  = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

  const formula    = encodeURIComponent(`{${FK_ID_CORE}}='${escapeAirtableValue(idCore)}'`);
  const sortPerm   = encodeURIComponent(FIELDS.PERMISO.FECHA_SOLICITUD);
  const sortVac    = encodeURIComponent(FIELDS.VACACIONES.FECHA_PRESENTACION);
  const sortNov    = encodeURIComponent(FIELDS.NOVEDADES.FECHA_CREACION);
  const headers    = { Authorization: `Bearer ${KEY}` };
  const opts       = { headers, cache: "no-store" } as const;

  const [permisos, vacaciones, novedades] = await Promise.allSettled([
    fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.PERMISO)}?filterByFormula=${formula}&sort[0][field]=${sortPerm}&sort[0][direction]=desc&maxRecords=5`, opts).then((r) => r.json()),
    fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.VACACIONES)}?filterByFormula=${formula}&sort[0][field]=${sortVac}&sort[0][direction]=desc&maxRecords=5`, opts).then((r) => r.json()),
    fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.NOVEDADES)}?filterByFormula=${formula}&sort[0][field]=${sortNov}&sort[0][direction]=desc&maxRecords=5`, opts).then((r) => r.json()),
  ]);

  const rows: { tipo: string; subtipo: string; fecha: string; estado: string }[] = [];

  if (permisos.status === "fulfilled") {
    for (const r of (permisos.value.records ?? []) as AirtableRecord[]) {
      rows.push({
        tipo:    "Permiso",
        subtipo: String(r.fields[FIELDS.PERMISO.TIPO] ?? "—"),
        fecha:   String(r.fields[FIELDS.PERMISO.FECHA_SOLICITUD] ?? "—"),
        estado:  String(r.fields[FIELDS.PERMISO.ESTADO] ?? "Pendiente"),
      });
    }
  }
  if (vacaciones.status === "fulfilled") {
    for (const r of (vacaciones.value.records ?? []) as AirtableRecord[]) {
      rows.push({
        tipo:    "Vacaciones",
        subtipo: `${r.fields[FIELDS.VACACIONES.FECHA_INICIO] ?? "?"} → ${r.fields[FIELDS.VACACIONES.FECHA_FIN] ?? "?"}`,
        fecha:   String(r.fields[FIELDS.VACACIONES.FECHA_PRESENTACION] ?? "—"),
        estado:  String(r.fields[FIELDS.VACACIONES.ESTADO] ?? "—"),
      });
    }
  }
  if (novedades.status === "fulfilled") {
    for (const r of (novedades.value.records ?? []) as AirtableRecord[]) {
      rows.push({
        tipo:    "Novedad",
        subtipo: String(r.fields[FIELDS.NOVEDADES.TIPO] ?? "—"),
        fecha:   String(r.fields[FIELDS.NOVEDADES.FECHA_CREACION] ?? "—"),
        estado:  String(r.fields[FIELDS.NOVEDADES.ESTADO] ?? "Pendiente"),
      });
    }
  }

  return rows.sort((a, b) => (b.fecha > a.fecha ? 1 : -1)).slice(0, 10);
}

export async function SolicitudesOverview({ idCore, basePath = "/dashboard/solicitudes" }: Props) {
  const recientes = await fetchRecientes(idCore);

  const ACTIONS = [
    { label: "Solicitar Permiso",    desc: "Médico, personal, calamidad y más",           href: `${basePath}/permiso`,    color: "#1a51a8" },
    { label: "Solicitar Vacaciones", desc: "Registra tu período de descanso",              href: `${basePath}/vacaciones`, color: "#6bb543" },
    { label: "Reportar Novedad",     desc: "Horas extra, incapacidad, cambios de horario", href: `${basePath}/novedades`,  color: "#e07b39" },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Solicitudes</h1>
        <p className="text-gray-500 text-sm mt-1">Gestiona tus permisos, vacaciones y novedades de nómina</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3 cursor-pointer">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${a.color}18` }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={a.color} strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{a.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{a.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700 text-sm">Mis solicitudes recientes</h2>
        </div>

        {recientes.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            Aún no tienes solicitudes registradas.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Detalle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recientes.map((row, i) => {
                const style = ESTADO_STYLE[row.estado] ?? { bg: "#f1f5f9", color: "#64748b" };
                return (
                  <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-700">{row.tipo}</td>
                    <td className="px-6 py-4 text-gray-500 max-w-xs truncate">{row.subtipo}</td>
                    <td className="px-6 py-4 text-gray-500">{row.fecha}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: style.bg, color: style.color }}>
                        {row.estado}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { escapeAirtableValue } from "../lib/security";
import { TABLES, FIELDS, FK_ID_CORE, ESTADO_PENDIENTE } from "../lib/schema";
import type { ResolvePayload } from "../types";

const base = () => process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const key  = () => process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

export function createPermisoHandlers(resolvePayload: ResolvePayload) {
  async function GET() {
    const payload = await resolvePayload();
    if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const formula = encodeURIComponent(`{${FK_ID_CORE}}='${escapeAirtableValue(payload.idCore)}'`);
    const sort    = encodeURIComponent(FIELDS.PERMISO.FECHA_SOLICITUD);
    const params  = `filterByFormula=${formula}&sort[0][field]=${sort}&sort[0][direction]=desc&maxRecords=20`;
    const res = await fetch(
      `https://api.airtable.com/v0/${base()}/${encodeURIComponent(TABLES.PERMISO)}?${params}`,
      { headers: { Authorization: `Bearer ${key()}` }, cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data.records ?? []);
  }

  async function POST(req: NextRequest) {
    const payload = await resolvePayload();
    if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body  = await req.json();
    const today = new Date().toISOString().split("T")[0];

    const fields: Record<string, unknown> = {
      [FIELDS.PERMISO.NOMBRE]:          payload.nombre,
      [FIELDS.PERMISO.CEDULA]:          payload.cedula,
      [FIELDS.PERMISO.CARGO]:           body.cargo ?? "",
      [FK_ID_CORE]:                     payload.idCore,
      [FIELDS.PERMISO.FECHA_SOLICITUD]: today,
      [FIELDS.PERMISO.FECHA_INICIO]:    body.fechaInicio,
      [FIELDS.PERMISO.TIPO]:            body.tipo,
      [FIELDS.PERMISO.MOTIVO]:          body.motivo,
      [FIELDS.PERMISO.HORAS]:           body.horas ? String(body.horas) : "",
      [FIELDS.PERMISO.REMUNERADO]:      body.remunerado ?? false,
      [FIELDS.PERMISO.COMPENSADO]:      body.compensado ?? false,
      [FIELDS.PERMISO.ESTADO]:          ESTADO_PENDIENTE,
    };

    if (body.fechaFin)          fields[FIELDS.PERMISO.FECHA_FIN]  = body.fechaFin;
    if (body.fechaCompensatorio) fields[FIELDS.PERMISO.FECHA_COMP] = body.fechaCompensatorio;

    const res = await fetch(
      `https://api.airtable.com/v0/${base()}/${encodeURIComponent(TABLES.PERMISO)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error("[solicitudes/permiso POST]", err);
      return NextResponse.json({ error: "Error al guardar en Airtable." }, { status: 500 });
    }

    const record = await res.json();
    return NextResponse.json({ ok: true, id: record.id }, { status: 201 });
  }

  return { GET, POST };
}

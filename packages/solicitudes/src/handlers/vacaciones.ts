import { NextRequest, NextResponse } from "next/server";
import { escapeAirtableValue } from "../lib/security";
import { TABLES, FIELDS, FK_ID_CORE } from "../lib/schema";
import type { ResolvePayload } from "../types";

const base = () => process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const key  = () => process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

export function createVacacionesHandlers(resolvePayload: ResolvePayload) {
  async function GET() {
    const payload = await resolvePayload();
    if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const formula = encodeURIComponent(`{${FK_ID_CORE}}='${escapeAirtableValue(payload.idCore)}'`);
    const sort    = encodeURIComponent(FIELDS.VACACIONES.FECHA_PRESENTACION);
    const params  = `filterByFormula=${formula}&sort[0][field]=${sort}&sort[0][direction]=desc&maxRecords=20`;
    const res = await fetch(
      `https://api.airtable.com/v0/${base()}/${encodeURIComponent(TABLES.VACACIONES)}?${params}`,
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
      [FIELDS.VACACIONES.NOMBRE]:             payload.nombre,
      [FIELDS.VACACIONES.CEDULA]:             payload.cedula,
      [FIELDS.VACACIONES.CARGO]:              body.cargo ?? "",
      [FK_ID_CORE]:                           payload.idCore,
      [FIELDS.VACACIONES.FECHA_PRESENTACION]: today,
      [FIELDS.VACACIONES.FECHA_INICIO]:       body.fechaInicio,
      [FIELDS.VACACIONES.FECHA_FIN]:          body.fechaFin,
      [FIELDS.VACACIONES.DIAS]:               body.dias ?? 0,
      [FIELDS.VACACIONES.MOTIVO]:             body.motivo ?? "",
    };

    if (body.fechaReintegro) fields[FIELDS.VACACIONES.FECHA_REINTEGRO] = body.fechaReintegro;

    const res = await fetch(
      `https://api.airtable.com/v0/${base()}/${encodeURIComponent(TABLES.VACACIONES)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error("[solicitudes/vacaciones POST]", err);
      return NextResponse.json({ error: "Error al guardar en Airtable." }, { status: 500 });
    }

    const record = await res.json();
    return NextResponse.json({ ok: true, id: record.id }, { status: 201 });
  }

  return { GET, POST };
}

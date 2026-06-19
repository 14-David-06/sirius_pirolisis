import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE = config.airtable.novedadesNominaBaseId;
const TOKEN = config.airtable.novedadesNominaToken;
const TABLE = config.airtable.novedadesNominaVacacionesTable;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const fields: Record<string, any> = {};
    if (body.estadoSolicitud !== undefined) fields['Estado Solicitud'] = body.estadoSolicitud;

    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}/${id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[nomina/vacaciones PATCH] Airtable error:', err);
      return NextResponse.json({ error: 'Error al actualizar vacación' }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id, fields: data.fields });
  } catch (e) {
    console.error('[nomina/vacaciones PATCH]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

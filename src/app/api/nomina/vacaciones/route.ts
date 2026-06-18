import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE = config.airtable.novedadesNominaBaseId;
const TOKEN = config.airtable.novedadesNominaToken;
const TABLE = config.airtable.novedadesNominaVacacionesTable;

export async function GET() {
  try {
    const records: any[] = [];
    let offset: string | undefined;

    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?pageSize=100&sort[0][field]=Creada&sort[0][direction]=desc${offset ? `&offset=${offset}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[nomina/vacaciones GET] Airtable error:', err);
        return NextResponse.json({ error: 'Error al obtener vacaciones' }, { status: 500 });
      }

      const data = await res.json();
      records.push(...(data.records ?? []));
      offset = data.offset;
    } while (offset);

    const vacaciones = records.map((r: any) => ({
      id: r.id,
      nombre: r.fields['Nombre'] ?? '',
      idPersonalCore: r.fields['ID Personal Core'] ?? '',
      cedula: r.fields['Cedula'] ?? '',
      cargo: r.fields['Cargo'] ?? '',
      fechaPresentacion: r.fields['Fecha de Presentacion'] ?? '',
      fechaInicio: r.fields['Fecha Inicio'] ?? '',
      fechaFin: r.fields['Fecha Fin'] ?? '',
      fechaReintegro: r.fields['Fecha Reintegro'] ?? '',
      diasVacaciones: r.fields['Dias Vacaciones'] ?? 0,
      motivo: r.fields['Motivo'] ?? '',
      estadoSolicitud: r.fields['Estado Solicitud'] ?? '',
      archivo: r.fields['Archivo'] ?? '',
    }));

    return NextResponse.json({ vacaciones });
  } catch (e) {
    console.error('[nomina/vacaciones GET]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const fields: Record<string, any> = {
      'Nombre': body.nombre ?? '',
      'Cedula': body.cedula ?? '',
      'Cargo': body.cargo ?? '',
      'ID Personal Core': body.idPersonalCore ?? '',
      'Fecha de Presentacion': body.fechaPresentacion ?? '',
      'Fecha Inicio': body.fechaInicio ?? '',
      'Fecha Fin': body.fechaFin ?? '',
      'Fecha Reintegro': body.fechaReintegro ?? '',
      'Dias Vacaciones': body.diasVacaciones ?? 0,
      'Motivo': body.motivo ?? '',
    };

    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[nomina/vacaciones POST] Airtable error:', err);
      return NextResponse.json({ error: 'Error al crear vacación' }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id, fields: data.fields });
  } catch (e) {
    console.error('[nomina/vacaciones POST]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

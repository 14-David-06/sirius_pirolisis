import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE = config.airtable.novedadesNominaBaseId;
const TOKEN = config.airtable.novedadesNominaToken;
const TABLE = config.airtable.novedadesNominaReportesTable;

export async function GET() {
  try {
    const records: any[] = [];
    let offset: string | undefined;

    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?pageSize=100&sort[0][field]=Fecha%20Creaci%C3%B3n&sort[0][direction]=desc${offset ? `&offset=${offset}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[nomina/novedades GET] Airtable error:', err);
        return NextResponse.json({ error: 'Error al obtener novedades' }, { status: 500 });
      }

      const data = await res.json();
      records.push(...(data.records ?? []));
      offset = data.offset;
    } while (offset);

    const novedades = records.map((r: any) => ({
      id: r.id,
      empleado: r.fields['Empleado/Responsable'] ?? '',
      idPersonalCore: r.fields['ID Personal Core'] ?? '',
      tipoNovedad: r.fields['Tipo de Novedad'] ?? '',
      descripcion: r.fields['Descripción de la Novedad'] ?? '',
      transcripcionAudio: r.fields['Transcripcion Audio Colaborador'] ?? '',
      numeroHorasExtras: r.fields['Número Horas Extras'] ?? null,
      estadoRegistro: r.fields['Estado del Registro'] ?? 'Pendiente',
      fechaCreacion: r.fields['Fecha Creación'] ?? '',
    }));

    return NextResponse.json({ novedades });
  } catch (e) {
    console.error('[nomina/novedades GET]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const fields: Record<string, any> = {
      'Empleado/Responsable': body.empleado ?? '',
      'Tipo de Novedad': body.tipoNovedad ?? '',
      'Descripción de la Novedad': body.descripcion ?? '',
      'Estado del Registro': 'Pendiente',
    };

    if (body.idPersonalCore) fields['ID Personal Core'] = body.idPersonalCore;
    if (body.transcripcionAudio) fields['Transcripcion Audio Colaborador'] = body.transcripcionAudio;
    if (body.numeroHorasExtras != null && body.numeroHorasExtras !== '') {
      fields['Número Horas Extras'] = Number(body.numeroHorasExtras);
    }

    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      // typecast permite crear opciones de singleSelect (Empleado/Responsable) si no existen exactas
      body: JSON.stringify({ fields, typecast: true }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[nomina/novedades POST] Airtable error:', err);
      return NextResponse.json({ error: 'Error al crear novedad' }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id, fields: data.fields });
  } catch (e) {
    console.error('[nomina/novedades POST]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

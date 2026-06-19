import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE = config.airtable.novedadesNominaBaseId;
const TOKEN = config.airtable.novedadesNominaToken;
const TABLE = config.airtable.novedadesNominaPermisosTable;

export async function GET() {
  try {
    const records: any[] = [];
    let offset: string | undefined;

    do {
      const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?pageSize=100&sort[0][field]=Fecha%20de%20creacion&sort[0][direction]=desc${offset ? `&offset=${offset}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[nomina/permisos GET] Airtable error:', err);
        return NextResponse.json({ error: 'Error al obtener permisos' }, { status: 500 });
      }

      const data = await res.json();
      records.push(...(data.records ?? []));
      offset = data.offset;
    } while (offset);

    const permisos = records.map((r: any) => ({
      id: r.id,
      nombre: r.fields['Nombre'] ?? '',
      idPersonalCore: r.fields['ID Personal Core'] ?? '',
      cedula: r.fields['Cedula'] ?? '',
      cargo: r.fields['Cargo'] ?? '',
      fechaSolicitud: r.fields['Fecha de solicitud'] ?? '',
      fechaPermiso: r.fields['Fecha de permiso'] ?? '',
      fechaFinPermiso: r.fields['Fecha fin de permiso'] ?? '',
      horasPermiso: r.fields['Horas Permiso'] ?? '',
      tipoPermiso: r.fields['Tipo_Permiso'] ?? '',
      motivoPermiso: r.fields['Motivo_Permiso'] ?? '',
      estadoPermiso: r.fields['Estado_Permiso'] ?? 'Pendiente',
      remunerado: r.fields['Remunerado'] ?? false,
      compensado: r.fields['Compensado'] ?? false,
      fechaCompensatorio: r.fields['Fecha de compensatorio'] ?? '',
      archivoGenerado: r.fields['Archivo_Generado'] ?? '',
    }));

    return NextResponse.json({ permisos });
  } catch (e) {
    console.error('[nomina/permisos GET]', e);
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
      'Fecha de solicitud': body.fechaSolicitud ?? '',
      'ID Personal Core': body.idPersonalCore ?? '',
      'Fecha de permiso': body.fechaPermiso ?? '',
      'Horas Permiso': String(body.horasPermiso ?? ''),
      'Tipo_Permiso': body.tipoPermiso ?? '',
      'Motivo_Permiso': body.motivoPermiso ?? '',
      'Estado_Permiso': 'Pendiente',
      'Remunerado': body.remunerado ?? false,
      'Compensado': body.compensado ?? false,
    };

    if (body.fechaFinPermiso) fields['Fecha fin de permiso'] = body.fechaFinPermiso;

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
      console.error('[nomina/permisos POST] Airtable error:', err);
      return NextResponse.json({ error: 'Error al crear permiso' }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ id: data.id, fields: data.fields });
  } catch (e) {
    console.error('[nomina/permisos POST]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el nombre de la tabla en lugar del ID
const TABLE_NAME = process.env.AIRTABLE_RUTAS_BIOMASA_TABLE || 'Rutas Biomasa';

export async function GET(req: NextRequest) {
  try {
    if (!TABLE_NAME) {
      return NextResponse.json({
        error: 'Nombre de tabla de Rutas de Biomasa no configurado'
      }, { status: 500 });
    }

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Configuración de Airtable faltante' }, { status: 500 });
    }

    const url = new URL(req.url);
    const maxRecords = url.searchParams.get('maxRecords') || '100';

    const res = await fetch(
      `https://api.airtable.com/v0/${config.airtable.baseId}/${encodeURIComponent(TABLE_NAME)}?maxRecords=${maxRecords}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Error de Airtable', details: data }, { status: res.status });
    }

    return NextResponse.json({
      success: true,
      records: data.records
    }, { status: 200 });

  } catch (err: any) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
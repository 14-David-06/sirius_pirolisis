import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function GET(req: NextRequest) {
  try {
    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.monitoreoViajesBiomasaTableId) {
      return NextResponse.json({ error: 'Configuración de Airtable faltante' }, { status: 500 });
    }

    const TABLE_ID = config.airtable.monitoreoViajesBiomasaTableId;

    const url = new URL(req.url);
    const maxRecords = url.searchParams.get('maxRecords') || '100';

    const res = await fetch(
      `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}?maxRecords=${maxRecords}&sort%5B0%5D%5Bfield%5D=Fecha%20Registro&sort%5B0%5D%5Bdirection%5D=desc`,
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
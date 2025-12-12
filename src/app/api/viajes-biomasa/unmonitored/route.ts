import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function GET(_req: NextRequest) {
  try {
    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.viajesBiomasaTableId) {
      return NextResponse.json({ error: 'Configuración de Airtable faltante' }, { status: 500 });
    }

    const VIAJES_TABLE_ID = config.airtable.viajesBiomasaTableId;

    // Obtener viajes que no tienen Monitoreo Viajes Biomasa linkeado
    // Usamos filterByFormula para encontrar registros donde 'Monitoreo Viajes Biomasa' esté vacío
    const filterFormula = 'NOT({Monitoreo Viajes Biomasa})';

    const res = await fetch(
      `https://api.airtable.com/v0/${config.airtable.baseId}/${VIAJES_TABLE_ID}?filterByFormula=${encodeURIComponent(filterFormula)}&sort%5B0%5D%5Bfield%5D=Fecha%20Entrega&sort%5B0%5D%5Bdirection%5D=desc`,
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
      records: data.records,
      count: data.records?.length || 0
    }, { status: 200 });

  } catch (err: any) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
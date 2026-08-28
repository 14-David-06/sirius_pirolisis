import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { FILTRO_SIN_MIGRADOS } from '../../../../lib/baches-biochar';

// Usar el ID de la tabla de Baches Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.bachesTableId;

export async function GET() {
  if (!TABLE_ID) {
    return NextResponse.json({
      error: 'ID de tabla de Baches Pirolisis no configurado'
    }, { status: 500 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
    }

    // Los baches migrados de PiroliApp V 1.0 quedan fuera: el orden es por
    // `Fecha Creacion`, que es createdTime, así que los 61 históricos —creados el
    // día de la migración— encabezarían la lista por delante de la producción real.
    const url =
      `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}` +
      `?sort%5B0%5D%5Bfield%5D=Fecha%20Creacion&sort%5B0%5D%5Bdirection%5D=desc` +
      `&filterByFormula=${encodeURIComponent(FILTRO_SIN_MIGRADOS)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Airtable:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('❌ Error en API baches:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
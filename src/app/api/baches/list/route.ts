import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

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

    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}?sort%5B0%5D%5Bfield%5D=Fecha%20Creacion&sort%5B0%5D%5Bdirection%5D=desc`, {
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
import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';

// Usar el ID de la tabla de Baches Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.bachesTableId;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!TABLE_ID) {
    return NextResponse.json({
      error: 'ID de tabla de Baches Pirolisis no configurado'
    }, { status: 500 });
  }

  try {
    const { id } = params;

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
    }

    // Obtener el registro específico por ID
    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Bache no encontrado' }, { status: 404 });
      }
      console.error('❌ Error obteniendo bache de Airtable:', data);
      return NextResponse.json({ error: data?.error || 'Error obteniendo bache', details: data }, { status: response.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('❌ Error en API obtener bache:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
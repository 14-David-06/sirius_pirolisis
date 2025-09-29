import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tipoMantenimiento,
      descripcion,
      prioridad,
      realizaRegistro,
      turnoId,
      equipoId,
      insumosIds = []
    } = body;

    const baseId = config.airtable.baseId;
    const tableId = config.airtable.mantenimientosTableId;
    const apiKey = config.airtable.token;

    if (!apiKey || !baseId || !tableId) {
      return NextResponse.json({
        error: 'Missing required environment variables'
      }, { status: 500 });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;

    // Preparar los campos según la documentación
    const fields: any = {
      'Tipo Mantenimiento': tipoMantenimiento,
      'Descripción': descripcion,
      'Prioridad': prioridad,
      'Realiza Registro': realizaRegistro,
    };

    // Agregar links si existen
    if (turnoId) {
      fields['Turno Pirolisis'] = [turnoId];
    }

    if (equipoId) {
      fields['Equipo Pirolisis'] = [equipoId];
    }

    if (insumosIds.length > 0) {
      fields['Insumos Utilizados'] = insumosIds;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: fields
        }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Airtable API error:', response.status, errorText);
      return NextResponse.json({
        error: `Airtable API error: ${response.status}`,
        details: errorText
      }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error creating mantenimiento:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}

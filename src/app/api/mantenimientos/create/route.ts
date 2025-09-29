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
      equipoId, // Para compatibilidad hacia atrás
      equiposIds = [], // Nuevo campo para múltiples equipos
      insumosIds = []
    } = body;

    // Si se envía equiposIds, usarlo; si no, usar equipoId para compatibilidad
    const equiposIdsFinal = equiposIds.length > 0 ? equiposIds : (equipoId ? [equipoId] : []);

    const baseId = config.airtable.baseId;
    const tableId = config.airtable.mantenimientosTableId;
    const apiKey = config.airtable.token;

    if (!apiKey || !baseId || !tableId) {
      return NextResponse.json({
        error: 'Missing required environment variables'
      }, { status: 500 });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;

    // Preparar los campos base
    const baseFields: any = {
      'Tipo Mantenimiento': tipoMantenimiento,
      'Descripción': descripcion,
      'Prioridad': prioridad,
      'Realiza Registro': realizaRegistro,
    };

    // Agregar links si existen
    if (turnoId) {
      baseFields['Turno Pirolisis'] = [turnoId];
    }

    if (insumosIds.length > 0) {
      baseFields['Insumos Utilizados'] = insumosIds;
    }

    // Crear registros para cada equipo
    let records;
    if (equiposIdsFinal.length === 1) {
      // Un solo registro para un equipo
      records = [{
        fields: {
          ...baseFields,
          'Equipo Pirolisis': equiposIdsFinal
        }
      }];
    } else {
      // Un solo registro para múltiples equipos (Mantenimiento a todos los equipos)
      records = [{
        fields: {
          ...baseFields,
          'Equipo Pirolisis': equiposIdsFinal
        }
      }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: records
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

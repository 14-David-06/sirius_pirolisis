import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  try {
    const baseId = config.airtable.baseId;
    const tableId = config.airtable.equiposTableId;
    const apiKey = config.airtable.token;

    if (!apiKey || !baseId || !tableId) {
      return NextResponse.json({
        error: 'Missing required environment variables',
        details: {
          apiKey: !!apiKey,
          baseId: !!baseId,
          tableId: !!tableId
        }
      }, { status: 500 });
    }

    // URL sin field específico para obtener todos los campos
    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
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

    // Extract equipment names - intentar múltiples campos posibles
    const equipos = data.records.map((record: any) => ({
      id: record.id,
      nombre: record.fields['Nombre del equipo'] ||
              record.fields['Nombre'] ||
              record.fields['Equipo'] ||
              `Equipo ${record.id.slice(-4)}`, // fallback
    }));

    return NextResponse.json({ equipos });
  } catch (error) {
    console.error('Error fetching equipos:', error);
    return NextResponse.json({
      error: 'Failed to fetch equipos',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
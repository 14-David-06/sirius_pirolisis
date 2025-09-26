import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  try {
    const baseId = config.airtable.baseId;
    const tableId = config.airtable.equiposTableId;
    const apiKey = config.airtable.token;

    if (!apiKey || !baseId || !tableId) {
      return NextResponse.json({ error: 'Missing required environment variables' }, { status: 500 });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}?fields%5B%5D=fldP9WY2ulLUJ8NRZ`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract equipment names
    const equipos = data.records.map((record: any) => ({
      id: record.id,
      nombre: record.fields['Nombre del equipo'] || record.fields.fldP9WY2ulLUJ8NRZ,
    }));

    return NextResponse.json({ equipos });
  } catch (error) {
    console.error('Error fetching equipos:', error);
    return NextResponse.json({ error: 'Failed to fetch equipos' }, { status: 500 });
  }
}
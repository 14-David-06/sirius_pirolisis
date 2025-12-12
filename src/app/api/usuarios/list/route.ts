import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  try {
    const baseId = config.airtable.baseId;
    const tableId = config.airtable.usuariosTableId;
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

    // Extract user information - intentar múltiples campos posibles
    const usuarios = data.records.map((record: any) => ({
      id: record.id,
      nombre: record.fields['Nombre'] ||
              record.fields['Usuario'] ||
              record.fields['Nombre completo'] ||
              `Usuario ${record.id.slice(-4)}`, // fallback
      email: record.fields['Email'] ||
             record.fields['Correo'] ||
             record.fields['Correo electrónico'] || '',
      rol: record.fields['Rol'] ||
           record.fields['Cargo'] ||
           record.fields['Puesto'] || '',
    }));

    return NextResponse.json({ usuarios });
  } catch (error) {
    console.error('Error fetching usuarios:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
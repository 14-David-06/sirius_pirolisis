import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TURNOS_TABLE = process.env.AIRTABLE_TURNOS_TABLE || 'Turno Pirolisis';

export async function GET() {
  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    console.log('🔍 Obteniendo estructura de la tabla...');

    // Obtener algunos registros para ver la estructura
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}?maxRecords=1`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error de Airtable:', errorText);
      return NextResponse.json(
        { error: 'Error al conectar con Airtable', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('📊 Estructura de la tabla:', result);

    // Extraer nombres de campos de los registros existentes
    const fieldNames = result.records && result.records.length > 0 
      ? Object.keys(result.records[0].fields)
      : [];

    return NextResponse.json({
      success: true,
      message: 'Estructura de tabla obtenida',
      fieldNames,
      sampleRecord: result.records?.[0] || null,
      totalRecords: result.records?.length || 0
    });

  } catch (error) {
    console.error('💥 Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

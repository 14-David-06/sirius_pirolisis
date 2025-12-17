import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = 'tblqToeuk9s8ohSiR'; // ID de la tabla Viajes Biomasa

export async function GET(request: NextRequest) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json({ 
        success: false,
        error: 'Configuración de Airtable no encontrada' 
      }, { status: 500 });
    }

    // Obtener parámetros de la URL
    const { searchParams } = new URL(request.url);
    const maxRecords = searchParams.get('maxRecords') || '100';
    const view = searchParams.get('view') || '';
    
    // Construir URL de Airtable
    let airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_ID}?maxRecords=${maxRecords}`;
    
    if (view) {
      airtableUrl += `&view=${encodeURIComponent(view)}`;
    }

    // No ordenar porque "Fecha Entrega" es createdTime automático
    // Los registros ya vienen ordenados por defecto

    console.log('🚛 Consultando Viajes Biomasa desde Airtable:', airtableUrl);

    const response = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 0 } // No cachear para obtener datos frescos
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error de Airtable:', errorText);
      return NextResponse.json({ 
        success: false,
        error: `Error de Airtable: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    console.log(`✅ Viajes Biomasa obtenidos: ${data.records?.length || 0} registros`);

    return NextResponse.json({
      success: true,
      records: data.records || [],
      offset: data.offset
    });

  } catch (error: any) {
    console.error('❌ Error en API de Viajes Biomasa:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message || 'Error interno del servidor'
    }, { status: 500 });
  }
}

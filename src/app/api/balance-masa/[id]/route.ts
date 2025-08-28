import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = process.env.AIRTABLE_BALANCE_MASA_TABLE || 'Balances Masa';

interface AirtableRecord {
  id: string;
  fields: {
    'Peso Biochar (KG)': number;
    'Temperatura Reactor (R1)': number;
    'Temperatura Reactor (R2)': number;
    'Temperatura Reactor (R3)': number;
    'Temperatura Horno (H1)'?: number;
    'Temperatura Horno (H2)'?: number;
    'Temperatura Horno (H3)'?: number;
    'Temperatura Horno (H4)'?: number;
    'Temperatura Ducto (G9)'?: number;
    'Realiza Registro'?: string;
    'Turno Pirolisis'?: string[];
    'QR_lona'?: string[];
    'Fecha de Creación': string;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de Airtable no encontrada'
      }, { status: 500 });
    }

    const { id: balanceId } = await params;

    // Buscar el registro por ID de Airtable (no por ID_Balance personalizado)
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}/${balanceId}`,
      {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: 'Error al conectar con Airtable'
      }, { status: response.status });
    }

    const data = await response.json();
    
    if (!data.id) {
      return NextResponse.json({
        success: false,
        error: 'Balance no encontrado'
      }, { status: 404 });
    }

    const record: AirtableRecord = data;
    
    // Formatear la información del balance
    const balanceInfo = {
      id: record.id,
      fechaCreacion: record.fields['Fecha de Creación'],
      pesoBiochar: record.fields['Peso Biochar (KG)'],
      temperaturas: {
        reactorR1: record.fields['Temperatura Reactor (R1)'],
        reactorR2: record.fields['Temperatura Reactor (R2)'],
        reactorR3: record.fields['Temperatura Reactor (R3)'],
        hornoH1: record.fields['Temperatura Horno (H1)'],
        hornoH2: record.fields['Temperatura Horno (H2)'],
        hornoH3: record.fields['Temperatura Horno (H3)'],
        hornoH4: record.fields['Temperatura Horno (H4)'],
        ductoG9: record.fields['Temperatura Ducto (G9)'],
      },
      realizaRegistro: record.fields['Realiza Registro'],
      qrLona: record.fields['QR_lona'],
      turnoPirolisis: record.fields['Turno Pirolisis'],
    };

    return NextResponse.json({
      success: true,
      data: balanceInfo
    });

  } catch (error) {
    console.error('Error al obtener balance:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// Interfaz para el tipo de datos del balance de masa
interface BalanceMasaData {
  pesoBiochar: number;
  temperaturaR1: number;
  temperaturaR2: number;
  temperaturaR3: number;
  temperaturaH1: number;
  temperaturaH2: number;
  temperaturaH3: number;
  temperaturaH4: number;
  temperaturaG9: number;
  qrLona?: string;
  realizaRegistro?: string;
  turnoPirolisis?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const data: BalanceMasaData = await request.json();
    
    console.log('📊 Datos recibidos para balance de masa:', data);

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: 'Configuración de Airtable faltante' 
      }, { status: 500 });
    }

    // Validar datos requeridos
    if (!data.pesoBiochar || !data.temperaturaR1 || !data.temperaturaR2 || !data.temperaturaR3) {
      return NextResponse.json({ 
        success: false, 
        error: 'Faltan datos requeridos para crear el balance de masa' 
      }, { status: 400 });
    }

    // Preparar el cuerpo de la petición para Airtable
    const airtableData = {
      records: [
        {
          fields: {
            'Peso Biochar (KG)': data.pesoBiochar,
            'Temperatura Reactor (R1)': data.temperaturaR1,
            'Temperatura Reactor (R2)': data.temperaturaR2,
            'Temperatura Reactor (R3)': data.temperaturaR3,
            'Temperatura Horno (H1)': data.temperaturaH1,
            'Temperatura Horno (H2)': data.temperaturaH2,
            'Temperatura Horno (H3)': data.temperaturaH3,
            'Temperatura Horno (H4)': data.temperaturaH4,
            'Temperatura Ducto (G9)': data.temperaturaG9,
            ...(data.realizaRegistro && { 'Realiza Registro': data.realizaRegistro }),
            ...(data.qrLona && { 'QR_lona': data.qrLona }),
            ...(data.turnoPirolisis && { 'Turno Pirolisis': data.turnoPirolisis })
          }
        }
      ]
    };

    console.log('📤 Enviando datos a Airtable:', JSON.stringify(airtableData, null, 2));

    // Crear el registro en Airtable
    const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${process.env.AIRTABLE_BALANCE_MASA_TABLE}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(airtableData)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Error de Airtable:', response.status, errorData);
      return NextResponse.json({ 
        success: false, 
        error: `Error de Airtable: ${response.status} - ${errorData}` 
      }, { status: response.status });
    }

    const result = await response.json();
    console.log('✅ Balance de masa creado exitosamente:', result);

    // Extraer el ID del registro creado para el QR
    const balanceId = result.records[0].id;

    return NextResponse.json({ 
      success: true, 
      data: result,
      balanceId: balanceId,
      message: 'Balance de masa registrado exitosamente'
    });

  } catch (error) {
    console.error('❌ Error en POST /api/balance-masa/create:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno del servidor' 
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_BITACORA_TABLE;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

export async function POST(request: NextRequest) {
  try {
    console.log('📋 Iniciando creación de registro de bitácora...');

    if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
      return NextResponse.json({ 
        success: false, 
        error: 'Variables de entorno de Airtable no configuradas correctamente' 
      });
    }

    // Validar field IDs
    const nombreEventoField = process.env.AIRTABLE_FIELD_NOMBRE_EVENTO;
    const detallesEventoField = process.env.AIRTABLE_FIELD_DETALLES_EVENTO;
    const statusField = process.env.AIRTABLE_FIELD_STATUS;
    const realizaRegistroField = process.env.AIRTABLE_FIELD_REALIZA_REGISTRO;
    const turnoPirolisisField = process.env.AIRTABLE_FIELD_TURNO_PIROLISIS;

    if (!nombreEventoField || !detallesEventoField || !statusField || !realizaRegistroField) {
      return NextResponse.json({ 
        success: false, 
        error: 'Field IDs de Airtable no configurados correctamente' 
      });
    }

    const body = await request.json();
    console.log('📥 Datos recibidos:', body);

    const { evento, descripcion, severidad, registradoPor, turnoId } = body;

    // Validaciones básicas
    if (!evento || !descripcion) {
      return NextResponse.json({
        success: false,
        error: 'Evento y descripción son requeridos'
      });
    }

    // Preparar datos para Airtable usando variables de entorno
    const airtableData = {
      records: [
        {
          fields: {
            [nombreEventoField]: evento,
            [detallesEventoField]: descripcion,
            [statusField]: severidad,
            [realizaRegistroField]: registradoPor,
            // Si hay turnoId, agregarlo como link
            ...(turnoId && turnoPirolisisField && {
              [turnoPirolisisField]: [turnoId]
            })
          }
        }
      ]
    };

    console.log('📤 Enviando a Airtable:', JSON.stringify(airtableData, null, 2));

    // Hacer la petición a Airtable
    const airtableResponse = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(airtableData),
    });

    const responseData = await airtableResponse.json();

    if (!airtableResponse.ok) {
      console.error('❌ Error de Airtable:', responseData);
      return NextResponse.json({
        success: false,
        error: `Error de Airtable: ${responseData.error?.message || 'Error desconocido'}`,
        details: responseData
      });
    }

    console.log('✅ Registro creado exitosamente:', responseData);

    const createdRecord = responseData.records[0];

    return NextResponse.json({
      success: true,
      message: 'Registro de bitácora creado exitosamente',
      record: {
        id: createdRecord.id,
        evento: evento,
        descripcion: descripcion,
        severidad: severidad,
        registradoPor: registradoPor,
        fechaCreacion: createdRecord.createdTime
      }
    });

  } catch (error) {
    console.error('❌ Error en /api/bitacora/create:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    });
  }
}

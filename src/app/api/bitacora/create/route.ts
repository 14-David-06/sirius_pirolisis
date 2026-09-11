import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const TABLA_BITACORA_POR_DEFECTO = 'Bitacora Pirolisis';

export async function POST(request: NextRequest) {
  try {
    console.log('📋 Iniciando creación de registro de bitácora...');

    // ⚠️ Esta ruta leía `process.env.AIRTABLE_API_KEY`, una variable que el
    // proyecto dejó de definir al consolidar los tokens en AIRTABLE_GLOBAL_TOKEN:
    // el handler cortaba aquí y respondía "no configuradas" sin llamar a Airtable.
    // Todo acceso a Airtable pasa por config.ts, que ya resuelve el fallback.
    const token = config.airtable.token;
    const baseId = config.airtable.baseId;
    const tabla = config.airtable.bitacoraTableId || TABLA_BITACORA_POR_DEFECTO;

    const faltantes: string[] = [];
    if (!token) faltantes.push('AIRTABLE_GLOBAL_TOKEN (o AIRTABLE_TOKEN)');
    if (!baseId) faltantes.push('AIRTABLE_BASE_ID');

    const {
      nombreEvento: nombreEventoField,
      detallesEvento: detallesEventoField,
      status: statusField,
      realizaRegistro: realizaRegistroField,
      turnoPirolisis: turnoPirolisisField,
    } = config.airtable.bitacoraFields;

    if (!nombreEventoField) faltantes.push('AIRTABLE_FIELD_NOMBRE_EVENTO');
    if (!detallesEventoField) faltantes.push('AIRTABLE_FIELD_DETALLES_EVENTO');
    if (!statusField) faltantes.push('AIRTABLE_FIELD_STATUS');
    if (!realizaRegistroField) faltantes.push('AIRTABLE_FIELD_REALIZA_REGISTRO');

    // Nombrar lo que falta: el mensaje genérico anterior obligaba a leer el
    // código para saber cuál de las siete variables era la que no estaba.
    if (faltantes.length > 0) {
      console.error('❌ Variables de entorno faltantes:', faltantes);
      return NextResponse.json({
        success: false,
        error: `Variables de entorno de Airtable no configuradas: ${faltantes.join(', ')}`
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

    const airtableData = {
      records: [
        {
          fields: {
            [nombreEventoField!]: evento,
            [detallesEventoField!]: descripcion,
            [statusField!]: severidad,
            [realizaRegistroField!]: registradoPor,
            // Si hay turnoId, agregarlo como link
            ...(turnoId && turnoPirolisisField && {
              [turnoPirolisisField]: [turnoId]
            })
          }
        }
      ]
    };

    console.log('📤 Enviando a Airtable:', JSON.stringify(airtableData, null, 2));

    const airtableResponse = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tabla)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
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

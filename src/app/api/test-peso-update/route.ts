import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bacheId, peso } = body;

    console.log('🧪 TEST: Probando actualización de peso para bache:', bacheId);
    console.log('🧪 TEST: Peso a actualizar:', peso);

    if (!bacheId || !peso) {
      return NextResponse.json({ 
        success: false,
        error: 'Faltan parámetros requeridos: bacheId y peso' 
      }, { status: 400 });
    }

    // Verificar configuración
    const configStatus = {
      hasToken: !!config.airtable.token,
      hasBaseId: !!config.airtable.baseId,
      hasTableId: !!config.airtable.bachesTableId,
    };

    console.log('🧪 TEST: Estado de configuración:', configStatus);

    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.bachesTableId) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de Airtable incompleta',
        config: configStatus
      }, { status: 500 });
    }

    // Preparar datos de prueba
    const testData = {
      records: [{
        id: bacheId,
        fields: {
          'Total Biochar Humedo Bache (KG)': parseFloat(peso)
        }
      }]
    };

    console.log('🧪 TEST: Datos a enviar:', JSON.stringify(testData, null, 2));

    const url = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.bachesTableId}`;
    console.log('🧪 TEST: URL objetivo:', url);

    // Hacer la petición
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    console.log('🧪 TEST: Status de respuesta:', response.status);
    console.log('🧪 TEST: Headers de respuesta:', Object.fromEntries(response.headers.entries()));

    const contentType = response.headers.get('content-type');
    console.log('🧪 TEST: Content-Type:', contentType);

    // Verificar si es JSON
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      console.log('🧪 TEST: Respuesta no es JSON:', responseText.substring(0, 1000));
      
      return NextResponse.json({
        success: false,
        error: 'Respuesta de Airtable no es JSON',
        details: {
          status: response.status,
          contentType: contentType,
          responsePreview: responseText.substring(0, 500),
          config: configStatus
        }
      }, { status: 502 });
    }

    // Parsear JSON
    let responseData;
    try {
      responseData = await response.json();
    } catch (parseError) {
      const responseText = await response.text();
      console.log('🧪 TEST: Error parseando JSON:', parseError);
      console.log('🧪 TEST: Texto de respuesta:', responseText);
      
      return NextResponse.json({
        success: false,
        error: 'Error parseando respuesta JSON de Airtable',
        details: {
          parseError: String(parseError),
          responsePreview: responseText.substring(0, 500),
          config: configStatus
        }
      }, { status: 502 });
    }

    console.log('🧪 TEST: Respuesta parseada:', responseData);

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: 'Error de Airtable',
        details: {
          status: response.status,
          airtableError: responseData,
          config: configStatus
        }
      }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Test de actualización exitoso',
      data: responseData.records[0],
      config: configStatus
    });

  } catch (error: any) {
    console.error('🧪 TEST: Error general:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno en test',
      details: String(error)
    }, { status: 500 });
  }
}
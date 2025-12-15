import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function GET(request: NextRequest) {
  try {
    // Verificar configuración básica
    const configStatus = {
      hasAirtableToken: !!config.airtable.token,
      hasBaseId: !!config.airtable.baseId,
      hasBachesTableId: !!config.airtable.bachesTableId,
      tokenPrefix: config.airtable.token ? `${config.airtable.token.substring(0, 8)}...` : null,
      baseId: config.airtable.baseId || null,
      bachesTableId: config.airtable.bachesTableId || null,
    };

    console.log('🔍 Estado de configuración Airtable:', configStatus);

    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.bachesTableId) {
      return NextResponse.json({
        success: false,
        error: 'Configuración incompleta',
        config: configStatus
      }, { status: 500 });
    }

    // Probar conectividad básica con Airtable
    try {
      console.log('🔗 Probando conexión con Airtable...');
      const testResponse = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.bachesTableId}?maxRecords=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
      });

      const contentType = testResponse.headers.get('content-type');
      console.log('📄 Content-Type de respuesta:', contentType);
      console.log('📥 Status de respuesta:', testResponse.status);

      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await testResponse.text();
        return NextResponse.json({
          success: false,
          error: 'Respuesta no es JSON',
          details: {
            status: testResponse.status,
            contentType: contentType,
            responsePreview: responseText.substring(0, 500),
            config: configStatus
          }
        }, { status: 502 });
      }

      let responseData;
      try {
        responseData = await testResponse.json();
      } catch (parseError) {
        const responseText = await testResponse.text();
        return NextResponse.json({
          success: false,
          error: 'Error parseando JSON',
          details: {
            parseError: String(parseError),
            responsePreview: responseText.substring(0, 500),
            config: configStatus
          }
        }, { status: 502 });
      }

      if (!testResponse.ok) {
        return NextResponse.json({
          success: false,
          error: 'Error de Airtable',
          details: {
            status: testResponse.status,
            airtableError: responseData,
            config: configStatus
          }
        }, { status: testResponse.status });
      }

      return NextResponse.json({
        success: true,
        message: 'Conexión con Airtable exitosa',
        recordsFound: responseData.records?.length || 0,
        config: configStatus
      });

    } catch (networkError) {
      console.error('❌ Error de red con Airtable:', networkError);
      return NextResponse.json({
        success: false,
        error: 'Error de red',
        details: {
          networkError: String(networkError),
          config: configStatus
        }
      }, { status: 503 });
    }

  } catch (error: any) {
    console.error('❌ Error general en debug-airtable:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno',
      details: String(error)
    }, { status: 500 });
  }
}
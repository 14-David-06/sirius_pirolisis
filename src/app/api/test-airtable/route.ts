import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

const AIRTABLE_BASE_ID = config.airtable.baseId;
const AIRTABLE_TOKEN = config.airtable.token;

export async function GET() {
  console.log('🧪 [test-airtable] Iniciando test de conectividad');
  
  try {
    // Verificar variables de entorno
    console.log(`🔧 [test-airtable] Base ID: ${AIRTABLE_BASE_ID}`);
    console.log(`🔑 [test-airtable] Token existe: ${AIRTABLE_TOKEN ? 'Sí' : 'No'}`);
    console.log(`🔑 [test-airtable] Token length: ${AIRTABLE_TOKEN?.length || 0}`);
    console.log(`🔑 [test-airtable] Token prefix: ${AIRTABLE_TOKEN?.substring(0, 10)}...`);

    if (!AIRTABLE_TOKEN) {
      return NextResponse.json({ error: 'Token no configurado' }, { status: 400 });
    }

    // Primero, vamos a obtener información de las tablas de la base
    console.log('🔍 [test-airtable] Obteniendo metadata de la base...');
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`;
    console.log(`🌐 [test-airtable] Meta URL: ${metaUrl}`);

    const metaResponse = await fetch(metaUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [test-airtable] Meta response - Status: ${metaResponse.status}`);

    if (metaResponse.ok) {
      const metaData = await metaResponse.json();
      console.log(`✅ [test-airtable] Metadata obtenida:`, JSON.stringify(metaData, null, 2));
      
      return NextResponse.json({
        success: true,
        message: 'Metadata obtenida exitosamente',
        metadata: metaData
      });
    } else {
      const metaError = await metaResponse.text();
      console.log(`❌ [test-airtable] Error en metadata: ${metaError}`);
    }

    // Si no podemos obtener metadata, probemos con nombres de tabla comunes
    const tableNames = ['Operarios', 'operarios', 'OPERARIOS', 'Operario', 'operario', 'Users', 'Usuarios', 'Table 1', 'Table1'];
    
    for (const tableName of tableNames) {
      console.log(`🧪 [test-airtable] Probando tabla: ${tableName}`);
      
      const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?maxRecords=1`;
      console.log(`🌐 [test-airtable] URL: ${airtableUrl}`);

      const response = await fetch(airtableUrl, {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(`📡 [test-airtable] ${tableName} - Status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ [test-airtable] ÉXITO con tabla: ${tableName}`);
        console.log(`📊 [test-airtable] Datos de prueba:`, JSON.stringify(data, null, 2));
        
        return NextResponse.json({
          success: true,
          message: `Conexión exitosa con tabla: ${tableName}`,
          tableName,
          data
        });
      } else {
        const errorText = await response.text();
        console.log(`❌ [test-airtable] ${tableName} - Error: ${errorText}`);
      }
    }

    return NextResponse.json({
      success: false,
      message: 'No se pudo conectar con ninguna tabla'
    }, { status: 500 });

  } catch (error) {
    console.error('💥 [test-airtable] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

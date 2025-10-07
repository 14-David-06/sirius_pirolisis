import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars, logConfigSafely } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
const envValidationResult = validateEnvVars();

export async function POST(request: NextRequest) {
  console.log('🔍 [validate-cedula] Iniciando validación de cédula');
  console.log(`🌍 [validate-cedula] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`🔧 [validate-cedula] Variables críticas:`, {
    hasToken: !!process.env.AIRTABLE_TOKEN,
    hasBaseId: !!process.env.AIRTABLE_BASE_ID,
    hasTableName: !!process.env.AIRTABLE_TABLE_NAME,
    tableName: process.env.AIRTABLE_TABLE_NAME,
    tokenLength: process.env.AIRTABLE_TOKEN?.length || 0,
    baseIdLength: process.env.AIRTABLE_BASE_ID?.length || 0,
    envValidation: envValidationResult
  });
  logConfigSafely();
  
  // Verificar si las variables críticas están disponibles
  if (!config.airtable.token || !config.airtable.baseId || !config.airtable.tableName) {
    console.error('💥 [validate-cedula] Variables de entorno críticas faltantes');
    return NextResponse.json(
      { 
        message: 'Error de configuración del servidor. Variables de entorno faltantes.',
        details: process.env.NODE_ENV === 'development' ? 'Revisa tu archivo .env.local' : 'Contacta al administrador'
      },
      { status: 500 }
    );
  }
  
  try {
    console.log('📥 [validate-cedula] Parseando request body...');
    const { cedula } = await request.json();
    console.log(`📋 [validate-cedula] Cédula recibida: ${cedula}`);

    if (!cedula) {
      console.log('❌ [validate-cedula] Error: Cédula no proporcionada');
      return NextResponse.json(
        { message: 'Cédula es requerida' },
        { status: 400 }
      );
    }

    // Verificar variables de entorno
    console.log(`🔍 [validate-cedula] Nombre de tabla desde env: "${process.env.AIRTABLE_TABLE_NAME}"`);
    console.log(`🔍 [validate-cedula] Nombre de tabla desde config: "${config.airtable.tableName}"`);
    
    // Buscar usuario en Airtable por cédula
    const tableName = encodeURIComponent(config.airtable.tableName || '');
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}?filterByFormula={Cedula}="${cedula}"`;
    console.log(`🌐 [validate-cedula] URL de Airtable: ${airtableUrl}`);

    console.log('🚀 [validate-cedula] Realizando petición a Airtable...');
    const response = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [validate-cedula] Respuesta de Airtable - Status: ${response.status}`);
    console.log(`📡 [validate-cedula] Respuesta de Airtable - StatusText: ${response.statusText}`);

    console.log(`📡 [validate-cedula] Respuesta de Airtable - Status: ${response.status}`);
    console.log(`📡 [validate-cedula] Respuesta de Airtable - StatusText: ${response.statusText}`);

    if (!response.ok) {
      console.error(`💥 [validate-cedula] Airtable API error: ${response.status} ${response.statusText}`);
      
      // Intentar leer el error de Airtable
      try {
        const errorText = await response.text();
        console.error(`💥 [validate-cedula] Error body: ${errorText}`);
      } catch {
        console.error(`💥 [validate-cedula] No se pudo leer el error body`);
      }
      
      return NextResponse.json(
        { message: 'Error al conectar con la base de datos' },
        { status: 500 }
      );
    }

    console.log('📊 [validate-cedula] Parseando respuesta de Airtable...');
    const data = await response.json();
    console.log(`📊 [validate-cedula] Datos recibidos:`, JSON.stringify(data, null, 2));

    if (data.records && data.records.length > 0) {
      console.log(`✅ [validate-cedula] Usuario encontrado: ${data.records.length} registros`);
      const userRecord = data.records[0];
      const userData = userRecord.fields;
      console.log(`👤 [validate-cedula] Datos del usuario:`, JSON.stringify(userData, null, 2));

      // Verificar si el usuario ya tiene contraseña
      const hasPassword = userData.Hash && userData.Hash.trim() !== '';
      console.log(`🔐 [validate-cedula] Usuario tiene contraseña: ${hasPassword}`);

      const result = {
        exists: true,
        hasPassword,
        user: {
          id: userRecord.id,
          Cedula: userData.Cedula,
          Nombre: userData.Nombre,
          Apellido: userData.Apellido || '',
          Email: userData.Email || '',
          Telefono: userData.Telefono || '',
          Cargo: userData.Cargo,
        }
      };

      console.log(`✅ [validate-cedula] Enviando respuesta exitosa:`, JSON.stringify(result, null, 2));
      return NextResponse.json(result);
    } else {
      console.log(`❌ [validate-cedula] Usuario no encontrado para cédula: ${cedula}`);
      return NextResponse.json({
        exists: false,
        message: 'Usuario no encontrado'
      }, { status: 404 });
    }

  } catch (error) {
    console.error('💥 [validate-cedula] Error general:', error);
    console.error('💥 [validate-cedula] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars, logConfigSafely } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
validateEnvVars();

export async function POST(request: NextRequest) {
  console.log('🔍 [validate-cedula] Iniciando validación de cédula');
  logConfigSafely();
  
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
    console.log('🔧 [validate-cedula] Verificando configuración...');
    console.log(`📊 [validate-cedula] Base ID: ${AIRTABLE_BASE_ID}`);
    console.log(`📋 [validate-cedula] Table: ${AIRTABLE_TABLE_NAME}`);
    console.log(`🔑 [validate-cedula] Token existe: ${AIRTABLE_TOKEN ? 'Sí' : 'No'}`);
    console.log(`🔑 [validate-cedula] Token length: ${AIRTABLE_TOKEN?.length || 0}`);

    // Buscar usuario en Airtable por cédula
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?filterByFormula={Cedula}="${cedula}"`;
    console.log(`🌐 [validate-cedula] URL de Airtable: ${airtableUrl}`);

    console.log('🚀 [validate-cedula] Realizando petición a Airtable...');
    const response = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
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
      } catch (e) {
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

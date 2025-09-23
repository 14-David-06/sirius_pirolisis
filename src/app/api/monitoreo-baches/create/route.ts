import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
validateEnvVars();

export async function POST(request: NextRequest) {
  console.log('📊 [monitoreo-baches] Iniciando creación de registro de monitoreo');

  try {
    console.log('📥 [monitoreo-baches] Parseando request body...');
    const { records } = await request.json();
    console.log(`📊 [monitoreo-baches] Registros a crear:`, JSON.stringify(records, null, 2));

    if (!records || !Array.isArray(records) || records.length === 0) {
      console.log('❌ [monitoreo-baches] Error: No se proporcionaron registros válidos');
      return NextResponse.json(
        { message: 'Se requieren registros válidos para crear' },
        { status: 400 }
      );
    }

    // Crear registros en Airtable
    const tableName = 'Monitoreo%20Baches'; // Usando el nombre de la tabla
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}`;
    console.log(`🌐 [monitoreo-baches] URL de Airtable: ${airtableUrl}`);

    console.log('🚀 [monitoreo-baches] Enviando datos a Airtable...');
    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records })
    });

    console.log(`📡 [monitoreo-baches] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [monitoreo-baches] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [monitoreo-baches] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al crear registro de monitoreo en la base de datos' },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`✅ [monitoreo-baches] Registro creado exitosamente:`, JSON.stringify(result, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Registro de monitoreo creado exitosamente',
      data: result
    });

  } catch (error) {
    console.error('💥 [monitoreo-baches] Error interno del servidor:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
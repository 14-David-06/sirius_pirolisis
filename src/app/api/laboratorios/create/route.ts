import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
validateEnvVars();

export async function POST(request: NextRequest) {
  console.log('🔬 [laboratorios] Iniciando creación de laboratorio');

  try {
    console.log('📥 [laboratorios] Parseando request body...');
    const { records } = await request.json();
    console.log(`🔬 [laboratorios] Registros a crear:`, JSON.stringify(records, null, 2));

    if (!records || !Array.isArray(records) || records.length === 0) {
      console.log('❌ [laboratorios] Error: No se proporcionaron registros válidos');
      return NextResponse.json(
        { message: 'Se requieren registros válidos para crear laboratorio' },
        { status: 400 }
      );
    }

    // Crear registros en Airtable
    const tableName = config.airtable.laboratoriosTableId; // ID de la tabla Laboratorios desde configuración
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}`;
    console.log(`🌐 [laboratorios] URL de Airtable: ${airtableUrl}`);

    console.log('🚀 [laboratorios] Enviando datos a Airtable...');
    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records })
    });

    console.log(`📡 [laboratorios] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [laboratorios] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [laboratorios] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al crear laboratorio en la base de datos' },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`✅ [laboratorios] Laboratorio creado: ${result.records?.length || 0} registros`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('💥 [laboratorios] Error interno:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
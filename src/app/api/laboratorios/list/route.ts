import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
validateEnvVars();

export async function GET(request: NextRequest) {
  console.log('🔬 [laboratorios] Iniciando obtención de laboratorios');

  try {
    // Obtener laboratorios de Airtable
    const tableName = config.airtable.laboratoriosTableId; // ID de la tabla Laboratorios desde configuración
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}?fields%5B%5D=${config.airtable.laboratoriosFieldId!}&fields%5B%5D=${config.airtable.laboratoriosNombreFieldId!}`;
    console.log(`🌐 [laboratorios] URL de Airtable: ${airtableUrl}`);

    console.log('🚀 [laboratorios] Consultando laboratorios...');
    const response = await fetch(airtableUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
      },
    });

    console.log(`📡 [laboratorios] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [laboratorios] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [laboratorios] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al obtener laboratorios de la base de datos' },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`✅ [laboratorios] Laboratorios obtenidos: ${result.records?.length || 0}`);

    // Formatear respuesta para el frontend
    const laboratorios = result.records.map((record: any) => ({
      id: record.id,
      nombre: record.fields['Nombre Laboratorio'] || record.fields[config.airtable.laboratoriosNombreFieldId!] || 'Sin nombre'
    }));

    return NextResponse.json({
      success: true,
      laboratorios
    });

  } catch (error) {
    console.error('💥 [laboratorios] Error interno:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
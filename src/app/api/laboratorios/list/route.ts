import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars, validateLaboratoriosFields } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
validateEnvVars();
validateLaboratoriosFields();

export async function GET(_request: NextRequest) {
  console.log('🔬 [laboratorios] Iniciando obtención de laboratorios');

  try {
    // Obtener laboratorios de Airtable con todos los campos definidos
    const tableName = config.airtable.laboratoriosTableId;
    const definedFields = Object.values(config.airtable.laboratoriosFields).filter(field => field !== undefined) as string[];
    const fieldsQuery = definedFields.map(field => `fields%5B%5D=${field}`).join('&');
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}?${fieldsQuery}`;
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

    // Formatear respuesta para el frontend manteniendo compatibilidad
    const laboratorios = result.records.map((record: any) => ({
      id: record.id,
      nombre: record.fields['Nombre Laboratorio'] || 'Sin nombre',
      fields: record.fields // Incluir todos los campos para el frontend
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
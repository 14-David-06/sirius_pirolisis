import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function GET(_request: NextRequest) {
  console.log('🔍 [monitoreo-pendientes] Obteniendo registros pendientes de humedad...');

  try {
    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.monitoreoViajesBiomasaTableId) {
      console.log('❌ [monitoreo-pendientes] Error: Configuración de Airtable faltante');
      return NextResponse.json({ 
        success: false, 
        error: 'Configuración de Airtable faltante',
        records: [],
        count: 0
      }, { status: 500 });
    }

    const TABLE_ID = config.airtable.monitoreoViajesBiomasaTableId;

    // Fórmula para filtrar registros con Porcentaje Humedad = 0
    const filterFormula = `{Porcentaje Humedad} = 0`;
    const encodedFormula = encodeURIComponent(filterFormula);

    console.log('🔍 [monitoreo-pendientes] Fórmula de filtro:', filterFormula);

    // Sin ordenamiento por ahora para evitar errores de campos inexistentes
    const url = `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}?filterByFormula=${encodedFormula}`;

    console.log('🌐 [monitoreo-pendientes] URL de Airtable:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
      },
    });

    console.log(`📡 [monitoreo-pendientes] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [monitoreo-pendientes] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [monitoreo-pendientes] Error body: ${errorText}`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Error de Airtable: ${response.status} ${response.statusText}`,
          records: [],
          count: 0
        },
        { status: 200 } // Cambiar a 200 para que el frontend no marque error
      );
    }

    const data = await response.json();
    console.log(`✅ [monitoreo-pendientes] Registros pendientes obtenidos: ${data.records?.length || 0}`);
    
    if (data.records && data.records.length > 0) {
      console.log('📋 [monitoreo-pendientes] Primer registro:', JSON.stringify(data.records[0], null, 2));
    }

    return NextResponse.json({
      success: true,
      records: data.records || [],
      count: data.records?.length || 0
    });

  } catch (error) {
    console.error('💥 [monitoreo-pendientes] Error inesperado:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: `Error interno: ${error instanceof Error ? error.message : 'Unknown error'}`,
        records: [],
        count: 0
      },
      { status: 200 } // Cambiar a 200 para que el frontend no marque error
    );
  }
}

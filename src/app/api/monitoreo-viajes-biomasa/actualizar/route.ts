import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function PATCH(request: NextRequest) {
  console.log('📝 [monitoreo-actualizar] Actualizando registro de monitoreo...');

  try {
    const { registroId, porcentajeHumedad, laboratorioId } = await request.json();
    console.log(`📊 [monitoreo-actualizar] Datos recibidos:`, { registroId, porcentajeHumedad, laboratorioId });

    if (!registroId) {
      console.log('❌ [monitoreo-actualizar] Error: Se requiere ID de registro');
      return NextResponse.json(
        { message: 'Se requiere el ID del registro' },
        { status: 400 }
      );
    }

    if (!porcentajeHumedad || isNaN(parseFloat(porcentajeHumedad))) {
      console.log('❌ [monitoreo-actualizar] Error: Se requiere porcentaje de humedad válido');
      return NextResponse.json(
        { message: 'Se requiere un porcentaje de humedad válido' },
        { status: 400 }
      ); 
    }

    if (!laboratorioId) {
      console.log('❌ [monitoreo-actualizar] Error: Se requiere seleccionar un laboratorio');
      return NextResponse.json(
        { message: 'Se requiere seleccionar un laboratorio' },
        { status: 400 }
      );
    }

    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.monitoreoViajesBiomasaTableId) {
      console.log('❌ [monitoreo-actualizar] Error: Configuración de Airtable faltante');
      return NextResponse.json({ error: 'Configuración de Airtable faltante' }, { status: 500 });
    }

    const TABLE_ID = config.airtable.monitoreoViajesBiomasaTableId;

    // Preparar los datos para actualizar
    const updateData = {
      fields: {
        'Porcentaje Humedad': parseFloat(porcentajeHumedad),
        'Laboratorios': [laboratorioId]
      }
    };

    console.log('🚀 [monitoreo-actualizar] Actualizando registro en Airtable...');
    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}/${registroId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData)
    });

    console.log(`📡 [monitoreo-actualizar] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [monitoreo-actualizar] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [monitoreo-actualizar] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al actualizar registro de monitoreo en la base de datos' },
        { status: 500 }
      );
    }

    const updatedRecord = await response.json();
    console.log('✅ [monitoreo-actualizar] Registro actualizado exitosamente');

    return NextResponse.json({
      success: true,
      record: updatedRecord,
      message: 'Registro de monitoreo actualizado exitosamente'
    });

  } catch (error) {
    console.error('💥 [monitoreo-actualizar] Error inesperado:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

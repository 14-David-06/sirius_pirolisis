import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function POST(request: NextRequest) {
  console.log('📊 [monitoreo-viajes-biomasa] Iniciando creación de registro de monitoreo');

  try {
    console.log('📥 [monitoreo-viajes-biomasa] Parseando request body...');
    const { viajesBiomasa, porcentajeHumedad, realizaRegistro, laboratorioId } = await request.json();
    console.log(`📊 [monitoreo-viajes-biomasa] Datos recibidos:`, { viajesBiomasa, porcentajeHumedad, realizaRegistro, laboratorioId });

    if (!viajesBiomasa || !Array.isArray(viajesBiomasa) || viajesBiomasa.length === 0) {
      console.log('❌ [monitoreo-viajes-biomasa] Error: Se requieren viajes de biomasa válidos');
      return NextResponse.json(
        { message: 'Se requieren viajes de biomasa válidos para crear monitoreo' },
        { status: 400 }
      );
    }

    if (!porcentajeHumedad || isNaN(parseFloat(porcentajeHumedad))) {
      console.log('❌ [monitoreo-viajes-biomasa] Error: Se requiere porcentaje de humedad válido');
      return NextResponse.json(
        { message: 'Se requiere un porcentaje de humedad válido' },
        { status: 400 }
      );
    }

    if (!realizaRegistro) {
      console.log('❌ [monitoreo-viajes-biomasa] Error: Se requiere quien realiza el registro');
      return NextResponse.json(
        { message: 'Se requiere especificar quien realiza el registro' },
        { status: 400 }
      );
    }

    // Validar laboratorio solo si el porcentaje NO es 0 (no es pendiente)
    const esPendiente = parseFloat(porcentajeHumedad) === 0;
    if (!esPendiente && !laboratorioId) {
      console.log('❌ [monitoreo-viajes-biomasa] Error: Se requiere seleccionar un laboratorio');
      return NextResponse.json(
        { message: 'Se requiere seleccionar un laboratorio' },
        { status: 400 }
      );
    }

    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.monitoreoViajesBiomasaTableId) {
      console.log('❌ [monitoreo-viajes-biomasa] Error: Configuración de Airtable faltante');
      return NextResponse.json({ error: 'Configuración de Airtable faltante' }, { status: 500 });
    }

    const TABLE_ID = config.airtable.monitoreoViajesBiomasaTableId;

    // Preparar los datos para Airtable
    const recordData: any = {
      fields: {
        'Viajes Biomasa': viajesBiomasa, // Array de IDs de viajes
        'Porcentaje Humedad': parseFloat(porcentajeHumedad),
        'Reaaliza Registro': realizaRegistro // Nota: Campo con doble 'a' según documentación Airtable
      }
    };

    // Solo agregar laboratorio si está presente (no es pendiente)
    if (laboratorioId) {
      recordData.fields['Laboratorios'] = [laboratorioId];
    }

    console.log('🚀 [monitoreo-viajes-biomasa] Enviando datos a Airtable...');
    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [recordData] })
    });

    console.log(`📡 [monitoreo-viajes-biomasa] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [monitoreo-viajes-biomasa] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [monitoreo-viajes-biomasa] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al crear registro de monitoreo de viajes biomasa en la base de datos' },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`✅ [monitoreo-viajes-biomasa] Registro creado exitosamente:`, JSON.stringify(result, null, 2));

    return NextResponse.json({
      success: true,
      message: 'Registro de monitoreo de viajes biomasa creado exitosamente',
      data: result
    });

  } catch (error) {
    console.error('💥 [monitoreo-viajes-biomasa] Error interno del servidor:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
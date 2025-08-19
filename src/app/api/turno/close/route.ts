import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TURNOS_TABLE = process.env.AIRTABLE_TURNOS_TABLE || 'Turno Pirolisis';

interface CerrarTurnoData {
  turnoId: string;
  consumoAguaFin: number;
  consumoEnergiaFin: number;
  consumoGasFinal: number;
}

export async function PATCH(request: NextRequest) {
  console.log('🔄 Iniciando cierre de turno...');
  
  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      console.log('❌ Variables de entorno faltantes');
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    const { turnoId, consumoAguaFin, consumoEnergiaFin, consumoGasFinal }: CerrarTurnoData = await request.json();

    if (!turnoId) {
      return NextResponse.json(
        { error: 'ID del turno es requerido' },
        { status: 400 }
      );
    }

    if (!consumoAguaFin || !consumoEnergiaFin || !consumoGasFinal) {
      return NextResponse.json(
        { error: 'Todos los datos de cierre son requeridos' },
        { status: 400 }
      );
    }

    // Preparar los datos para actualizar el turno
    const fieldsData = {
      'Fecha Fin Turno': new Date().toISOString(),
      'Consumo Agua Fin': consumoAguaFin,
      'Consumo Energia Fin': consumoEnergiaFin,
      'Consumo Gas Final': consumoGasFinal
    };

    console.log('📊 Datos para cerrar turno:', fieldsData);

    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [
            {
              id: turnoId,
              fields: fieldsData
            }
          ]
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error de Airtable:', errorText);
      return NextResponse.json(
        { error: 'Error al cerrar turno en Airtable', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('✅ Turno cerrado exitosamente:', result);

    return NextResponse.json({
      success: true,
      message: 'Turno cerrado exitosamente',
      data: result
    });

  } catch (error) {
    console.error('💥 Error al cerrar el turno:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return NextResponse.json(
      { error: 'Error interno del servidor', details: errorMessage },
      { status: 500 }
    );
  }
}

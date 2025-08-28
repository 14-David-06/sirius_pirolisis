import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TURNOS_TABLE = process.env.AIRTABLE_TURNOS_TABLE || 'Turno Pirolisis';

export async function POST(req: NextRequest) {
  console.log('🧹 Solicitud de limpieza de estado de turno...');

  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      console.log('❌ Variables de entorno faltantes');
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { userId, action } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'UserId es requerido' },
        { status: 400 }
      );
    }

    if (action === 'clear_local_only') {
      // Solo confirmar que se puede limpiar localmente
      return NextResponse.json({
        success: true,
        message: 'Estado local puede ser limpiado',
        action: 'clear_local_only'
      });
    }

    if (action === 'validate_and_clear') {
      // Verificar si el usuario tiene turnos activos y limpiar si es necesario
      const filterFormula = `AND({Fecha Inicio Turno} != BLANK(), {Fecha Fin Turno} = BLANK(), FIND("${userId}", ARRAYJOIN({Usuarios Pirolisis}, ",")) > 0)`;
      const encodedFormula = encodeURIComponent(filterFormula);

      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}?filterByFormula=${encodedFormula}&maxRecords=1`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log('❌ Error consultando turnos:', errorText);
        return NextResponse.json(
          { error: 'Error consultando turnos en Airtable' },
          { status: response.status }
        );
      }

      const result = await response.json();

      if (result.records && result.records.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Usuario tiene turno activo en la base de datos',
          hasActiveTurno: true,
          turno: result.records[0]
        });
      } else {
        return NextResponse.json({
          success: true,
          message: 'No hay turnos activos para este usuario',
          hasActiveTurno: false,
          action: 'can_clear_local'
        });
      }
    }

    return NextResponse.json(
      { error: 'Acción no válida' },
      { status: 400 }
    );

  } catch (error) {
    console.error('💥 Error en limpieza de estado:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    return NextResponse.json(
      { error: 'Error interno del servidor', details: errorMessage },
      { status: 500 }
    );
  }
}

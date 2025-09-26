import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const AIRTABLE_TOKEN = config.airtable.token;
const AIRTABLE_BASE_ID = config.airtable.baseId;
const AIRTABLE_TURNOS_TABLE = config.airtable.turnosTableId || 'Turno Pirolisis';

export async function GET(request: NextRequest) {
  console.log('🔍 Verificando turnos abiertos...');

  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      console.log('❌ Variables de entorno faltantes');
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    // Obtener el userId de los parámetros de consulta
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      console.log('❌ UserId no proporcionado');
      return NextResponse.json(
        { error: 'UserId es requerido' },
        { status: 400 }
      );
    }

    // PRIMERO: Buscar el último turno abierto (sin importar el usuario)
    const filterFormulaOpen = `AND({Fecha Inicio Turno} != BLANK(), {Fecha Fin Turno} = BLANK())`;
    const encodedFormulaOpen = encodeURIComponent(filterFormulaOpen);

    const responseOpen = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}?filterByFormula=${encodedFormulaOpen}&sort%5B0%5D%5Bfield%5D=Fecha%20Inicio%20Turno&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=1`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!responseOpen.ok) {
      const errorText = await responseOpen.text();
      console.log('❌ Error de Airtable al buscar turnos abiertos:', errorText);
      return NextResponse.json(
        { error: 'Error al consultar turnos en Airtable', details: errorText },
        { status: responseOpen.status }
      );
    }

    const resultOpen = await responseOpen.json();
    console.log('📊 Respuesta de Airtable (turnos abiertos):', resultOpen);

    if (resultOpen.records && resultOpen.records.length > 0) {
      const turnoAbierto = resultOpen.records[0];
      console.log('⚠️ Turno abierto encontrado:', turnoAbierto);

      // Verificar si el turno abierto pertenece al usuario actual
      const usuariosPirolisis = turnoAbierto.fields['Usuarios Pirolisis'] || [];
      const turnoPerteneceAlUsuario = usuariosPirolisis.includes(userId);

      return NextResponse.json({
        hasTurnoAbierto: true,
        turnoAbierto: {
          id: turnoAbierto.id,
          operador: turnoAbierto.fields.Operador || 'Operador no identificado',
          fechaInicio: turnoAbierto.fields['Fecha Inicio Turno'],
          alimentacionBiomasa: turnoAbierto.fields['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'],
          herztTolva2: turnoAbierto.fields['🎙️ Herzt Tolva 2']
        },
        turnoPerteneceAlUsuario,
        mensaje: turnoPerteneceAlUsuario
          ? 'Turno abierto pertenece al usuario actual'
          : `Turno abierto pertenece a otro usuario: ${turnoAbierto.fields.Operador || 'Operador no identificado'}`
      });
    } else {
      console.log('✅ No hay turnos abiertos');
      return NextResponse.json({
        hasTurnoAbierto: false,
        turnoAbierto: null,
        turnoPerteneceAlUsuario: false,
        mensaje: 'No hay turnos abiertos, puedes abrir uno nuevo'
      });
    }

  } catch (error) {
    console.error('💥 Error al verificar turnos abiertos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    return NextResponse.json(
      { error: 'Error interno del servidor', details: errorMessage },
      { status: 500 }
    );
  }
}

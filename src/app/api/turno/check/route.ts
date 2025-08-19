import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TURNOS_TABLE = process.env.AIRTABLE_TURNOS_TABLE || 'Turno Pirolisis';

export async function GET() {
  console.log('🔍 Verificando turnos abiertos...');
  
  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      console.log('❌ Variables de entorno faltantes');
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    // Buscar turnos que tengan fecha de inicio pero NO fecha de fin
    const filterFormula = "AND({Fecha Inicio Turno} != BLANK(), {Fecha Fin Turno} = BLANK())";
    const encodedFormula = encodeURIComponent(filterFormula);

    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}?filterByFormula=${encodedFormula}&sort%5B0%5D%5Bfield%5D=Fecha%20Inicio%20Turno&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=1`,
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
      console.log('❌ Error de Airtable:', errorText);
      return NextResponse.json(
        { error: 'Error al consultar turnos en Airtable', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('📊 Respuesta de Airtable:', result);

    if (result.records && result.records.length > 0) {
      const turnoAbierto = result.records[0];
      console.log('⚠️ Turno abierto encontrado:', turnoAbierto);
      
      return NextResponse.json({
        hasTurnoAbierto: true,
        turnoAbierto: {
          id: turnoAbierto.id,
          operador: turnoAbierto.fields.Operador || 'Operador no identificado',
          fechaInicio: turnoAbierto.fields['Fecha Inicio Turno'],
          alimentacionBiomasa: turnoAbierto.fields['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'],
          herztTolva2: turnoAbierto.fields['🎙️ Herzt Tolva 2']
        }
      });
    } else {
      console.log('✅ No hay turnos abiertos');
      return NextResponse.json({
        hasTurnoAbierto: false,
        turnoAbierto: null
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

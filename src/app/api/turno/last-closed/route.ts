import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const AIRTABLE_TOKEN = config.airtable.token;
const AIRTABLE_BASE_ID = config.airtable.baseId;
const AIRTABLE_TURNOS_TABLE = config.airtable.turnosTableId || 'Turno Pirolisis';

export async function GET(request: NextRequest) {
  console.log('🔍 Obteniendo último turno cerrado...');

  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      console.log('❌ Variables de entorno faltantes');
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    // Buscar el último turno cerrado (tiene Fecha Fin Turno)
    const filterFormula = `{Fecha Fin Turno} != BLANK()`;
    const encodedFormula = encodeURIComponent(filterFormula);

    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}?filterByFormula=${encodedFormula}&sort%5B0%5D%5Bfield%5D=Fecha%20Fin%20Turno&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=1`,
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
    console.log('📊 Respuesta de Airtable (último turno cerrado):', result);

    if (result.records && result.records.length > 0) {
      const ultimoTurno = result.records[0];
      console.log('✅ Último turno cerrado encontrado:', ultimoTurno.id);

      return NextResponse.json({
        found: true,
        turno: {
          id: ultimoTurno.id,
          operador: ultimoTurno.fields.Operador || 'Operador no identificado',
          fechaInicio: ultimoTurno.fields['Fecha Inicio Turno'],
          fechaFin: ultimoTurno.fields['Fecha Fin Turno'],
          // Datos de apertura
          alimentacionBiomasa: ultimoTurno.fields['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'],
          herztTolva2: ultimoTurno.fields['🎙️ Herzt Tolva 2'],
          consumoAguaInicio: ultimoTurno.fields['Consumo Agua Inicio'],
          consumoEnergiaInicio: ultimoTurno.fields['Consumo Energia Inicio'],
          consumoGasInicial: ultimoTurno.fields['Consumo Gas Inicial'],
          // Datos de cierre
          consumoAguaFin: ultimoTurno.fields['Consumo Agua Fin'],
          consumoEnergiaFin: ultimoTurno.fields['Consumo Energia Fin'],
          consumoGasFinal: ultimoTurno.fields['Consumo Gas Final']
        }
      });
    } else {
      console.log('ℹ️ No se encontraron turnos cerrados');
      return NextResponse.json({
        found: false,
        turno: null,
        mensaje: 'No hay turnos cerrados anteriores'
      });
    }

  } catch (error) {
    console.error('💥 Error al obtener último turno cerrado:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    return NextResponse.json(
      { error: 'Error interno del servidor', details: errorMessage },
      { status: 500 }
    );
  }
}

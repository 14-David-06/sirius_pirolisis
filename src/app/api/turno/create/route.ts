import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TURNOS_TABLE = process.env.AIRTABLE_TURNOS_TABLE || 'Turno Pirolisis';

interface TurnoData {
  operador: string;
  alimentacionBiomasa: number;
  herztTolva2: number;
  consumoAguaInicio: number;
  consumoEnergiaInicio: number;
  consumoGasInicial: number;
  realizaRegistro: string;
  usuarioId: string;
}

interface AirtableFieldsData {
  'Fecha Inicio Turno': string;
  'Operador': string;
  '🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)': number;
  '🎙️ Hertz Tolva 2': number;
  'Consumo Agua Inicio': number;
  'Consumo Energia Inicio': number;
  'Consumo Gas Inicial': number;
  'Realiza Registro': string;
  'Usuarios Pirolisis': string[];
}

export async function POST(request: NextRequest) {
  console.log('🔄 Iniciando creación de turno...');
  
  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      console.log('❌ Variables de entorno faltantes');
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    const turnoData: TurnoData = await request.json();
    console.log('📝 Datos del turno recibidos:', turnoData);
    console.log('👤 ID del usuario:', turnoData.usuarioId);
    console.log('📋 Realiza registro:', turnoData.realizaRegistro);
    console.log('👨‍💼 Operador:', turnoData.operador);

    // Validar que tengamos los datos esenciales
    if (!turnoData.operador || !turnoData.realizaRegistro || !turnoData.usuarioId) {
      console.log('❌ Faltan datos esenciales del usuario');
      return NextResponse.json(
        { error: 'Faltan datos del usuario. Operador, Realiza Registro y Usuario ID son requeridos.' },
        { status: 400 }
      );
    }

    // Preparar los datos para Airtable usando los nombres de campos exactos
    const fieldsData: AirtableFieldsData = {
      'Fecha Inicio Turno': new Date().toISOString(),
      'Operador': turnoData.operador,                    // Nombre del usuario logueado
      '🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)': turnoData.alimentacionBiomasa,
      '🎙️ Hertz Tolva 2': turnoData.herztTolva2,
      'Consumo Agua Inicio': turnoData.consumoAguaInicio,
      'Consumo Energia Inicio': turnoData.consumoEnergiaInicio,
      'Consumo Gas Inicial': turnoData.consumoGasInicial,
      'Realiza Registro': turnoData.realizaRegistro,     // Nombre del usuario logueado
      'Usuarios Pirolisis': [turnoData.usuarioId]        // ID del usuario logueado
    };

    console.log('🔍 Verificando datos antes de enviar:');
    console.log('  - Operador:', fieldsData['Operador']);
    console.log('  - Realiza Registro:', fieldsData['Realiza Registro']);
    console.log('  - Usuarios Pirolisis:', fieldsData['Usuarios Pirolisis']);

    const airtableData = {
      records: [
        {
          fields: fieldsData
        }
      ]
    };

    console.log('📊 Datos preparados para Airtable:', JSON.stringify(airtableData, null, 2));

    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}`;
    
    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(airtableData)
    });

    console.log('🌐 Respuesta de Airtable - Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error de Airtable:', errorText);
      return NextResponse.json(
        { error: 'Error al crear el turno en Airtable', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('✅ Turno creado exitosamente:', result);

    return NextResponse.json({
      success: true,
      message: 'Turno abierto exitosamente',
      data: result
    });

  } catch (error) {
    console.error('💥 Error en la creación del turno:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}

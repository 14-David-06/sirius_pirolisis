import { NextRequest, NextResponse } from 'next/server';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_GLOBAL_TOKEN;
const AIRTABLE_BALANCE_MASA_TABLE = process.env.AIRTABLE_BALANCE_MASA_TABLE;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const maxRecords = searchParams.get('maxRecords') || '100';
    const turnoPirolisis = searchParams.get('turnoPirolisis');

    console.log('📊 Listando balances de masa...');

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN || !AIRTABLE_BALANCE_MASA_TABLE) {
      const faltantes = [
        !AIRTABLE_BASE_ID && 'AIRTABLE_BASE_ID',
        !AIRTABLE_TOKEN && 'AIRTABLE_TOKEN o AIRTABLE_GLOBAL_TOKEN',
        !AIRTABLE_BALANCE_MASA_TABLE && 'AIRTABLE_BALANCE_MASA_TABLE',
      ].filter(Boolean).join(', ');
      console.error('❌ Configuración de Airtable faltante:', faltantes);
      return NextResponse.json({
        success: false,
        error: `Configuración de Airtable faltante: ${faltantes}`
      }, { status: 500 });
    }

    // Construir la URL con parámetros
    let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_BALANCE_MASA_TABLE}?maxRecords=${maxRecords}&sort[0][field]=Fecha%20Creacion&sort[0][direction]=desc`;
    
    // Si se especifica un turno, filtrar por él
    if (turnoPirolisis) {
      const formula = `FIND("${turnoPirolisis}", ARRAYJOIN({Turno Pirolisis})) > 0`;
      url += `&filterByFormula=${encodeURIComponent(formula)}`;
    }

    console.log('📤 URL de petición:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ Error de Airtable:', response.status, errorData);
      return NextResponse.json({ 
        success: false, 
        error: `Error de Airtable: ${response.status} - ${errorData}` 
      }, { status: response.status });
    }

    const result = await response.json();
    console.log(`✅ ${result.records?.length || 0} balances de masa encontrados`);

    // Transformar los datos para un formato más fácil de usar
    const transformedRecords = result.records?.map((record: any) => ({
      id: record.id,
      fechaCreacion: record.fields['Fecha Creacion'] || record.createdTime,
      pesoBiochar: record.fields['Peso Biochar (KG)'],
      temperaturas: {
        reactorR1: record.fields['Temperatura Reactor (R1)'],
        reactorR2: record.fields['Temperatura Reactor (R2)'],
        reactorR3: record.fields['Temperatura Reactor (R3)'],
        hornoH1: record.fields['Temperatura Horno (H1)'],
        hornoH2: record.fields['Temperatura Horno (H2)'],
        hornoH3: record.fields['Temperatura Horno (H3)'],
        hornoH4: record.fields['Temperatura Horno (H4)'],
        ductoG9: record.fields['Temperatura Ducto (G9)']
      },
      qrLona: record.fields['QR_lona'],
      // FK simbólica al movimiento de salida de lonas en Sirius Insumos Core.
      idMovimientoLonas: record.fields['ID Movimiento Lonas'] ?? null,
      realizaRegistro: record.fields['Realiza Registro'],
      turnoPirolisis: record.fields['Turno Pirolisis'],
      createdTime: record.createdTime
    })) || [];

    return NextResponse.json({ 
      success: true, 
      data: transformedRecords,
      total: result.records?.length || 0,
      offset: result.offset
    });

  } catch (error) {
    console.error('❌ Error en GET /api/balance-masa/list:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Error interno del servidor' 
    }, { status: 500 });
  }
}

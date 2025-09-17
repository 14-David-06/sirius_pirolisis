import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el ID de la tabla de Baches Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.bachesTableId;

export async function POST(request: NextRequest) {
  if (!TABLE_ID) {
    return NextResponse.json({
      error: 'ID de tabla de Baches Pirolisis no configurado'
    }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { codigoBache, estadoBache, totalBiochar, lonasUsadas, fechaCreacion, balancesMasa } = body;

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
    }

    // Preparar los datos para Airtable
    const recordData = {
      fields: {
        'Codigo Bache': codigoBache || `B-${Date.now().toString().slice(-6)}`,
        'Estado Bache': estadoBache || 'Bache en proceso',
        'Total Biochar Bache (KG)': totalBiochar || 0,
        'Recuento Lonas': lonasUsadas || 0,
        'Fecha Creacion': fechaCreacion || new Date().toISOString(),
        'Balances Masa': balancesMasa || []
      }
    };

    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: [recordData] }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error creando bache en Airtable:', data);
      return NextResponse.json({ error: data?.error || 'Error creando bache', details: data }, { status: response.status });
    }

    console.log('✅ Bache creado exitosamente:', data.records[0].id);
    return NextResponse.json(data.records[0], { status: 201 });
  } catch (err: any) {
    console.error('❌ Error en API crear bache:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el ID de la tabla de Baches Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.bachesTableId;

export async function PATCH(request: NextRequest) {
  if (!TABLE_ID) {
    return NextResponse.json({
      error: 'ID de tabla de Baches Pirolisis no configurado'
    }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID del bache es requerido' }, { status: 400 });
    }

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
    }

    // Preparar los datos para actualizar
    const recordData = {
      records: [{
        id: id,
        fields: updateData.fields || updateData
      }]
    };

    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recordData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error actualizando bache en Airtable:', data);
      return NextResponse.json({ error: data?.error || 'Error actualizando bache', details: data }, { status: response.status });
    }

    console.log('✅ Bache actualizado exitosamente:', data.records[0].id);
    return NextResponse.json(data.records[0], { status: 200 });
  } catch (err: any) {
    console.error('❌ Error en API actualizar bache:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
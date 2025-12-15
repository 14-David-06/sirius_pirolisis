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

    console.log('📤 Enviando datos a Airtable:', JSON.stringify(recordData, null, 2));
    console.log('🔗 URL Airtable:', `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`);

    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recordData),
    });

    console.log('📥 Status de respuesta Airtable:', response.status);
    console.log('📋 Headers de respuesta:', Object.fromEntries(response.headers.entries()));

    // Verificar si la respuesta es JSON válido
    const contentType = response.headers.get('content-type');
    console.log('📄 Content-Type:', contentType);

    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text();
      console.error('❌ Respuesta no es JSON:', responseText);
      return NextResponse.json({ 
        error: 'Respuesta inválida de Airtable', 
        details: `Content-Type: ${contentType}, Respuesta: ${responseText.substring(0, 500)}...` 
      }, { status: 502 });
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      const responseText = await response.text();
      console.error('❌ Error parseando JSON de Airtable:', parseError);
      console.error('❌ Texto de respuesta:', responseText);
      return NextResponse.json({ 
        error: 'Error parseando respuesta de Airtable', 
        details: `Parse error: ${parseError}, Response: ${responseText.substring(0, 500)}...` 
      }, { status: 502 });
    }

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
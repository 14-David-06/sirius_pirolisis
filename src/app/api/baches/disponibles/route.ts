import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function GET() {
  // Verificar que el ID de la tabla esté configurado en variables de entorno
  if (!config.airtable.bachesTableId) {
    return NextResponse.json({
      error: 'AIRTABLE_BACHES_TABLE_ID no configurado en variables de entorno'
    }, { status: 500 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
    }

    console.log('🔍 Obteniendo baches disponibles con filtro...');
    
    // Obtener todos los baches primero y filtrar en el backend
    const url = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.bachesTableId}?maxRecords=100`;
    
    console.log('📡 URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Airtable:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
    }

    console.log('📋 Total baches obtenidos:', data.records?.length || 0);
    
    // Filtrar los baches que tienen Total Cantidad Actual Biochar Seco > 0
    const bachesDisponibles = data.records?.filter((record: any) => {
      const cantidad = record.fields?.['Total Cantidad Actual Biochar Seco'];
      return cantidad && Number(cantidad) > 0;
    }) || [];
    
    console.log('📋 Baches con cantidad disponible > 0:', bachesDisponibles.length);
    
    if (bachesDisponibles.length > 0) {
      console.log('🔍 Ejemplo de bache disponible:', {
        id: bachesDisponibles[0].id,
        codigo: bachesDisponibles[0].fields['Codigo Bache'],
        cantidadDisponible: bachesDisponibles[0].fields['Total Cantidad Actual Biochar Seco'],
        estado: bachesDisponibles[0].fields['Estado Bache']
      });
    }

    // Retornar solo los baches filtrados
    return NextResponse.json({ 
      records: bachesDisponibles 
    }, { status: 200 });
  } catch (err: any) {
    console.error('❌ Error en API baches disponibles:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
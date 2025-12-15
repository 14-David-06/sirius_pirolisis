import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
  console.log('📋 [remisiones-baches] Obteniendo datos de remisiones');
  
  // Verificar que las variables de entorno estén configuradas
  if (!config.airtable.token) {
    return NextResponse.json({ 
      success: false, 
      error: 'AIRTABLE_TOKEN no configurado en variables de entorno' 
    }, { status: 500 });
  }

  if (!config.airtable.baseId) {
    return NextResponse.json({ 
      success: false, 
      error: 'AIRTABLE_BASE_ID no configurado en variables de entorno' 
    }, { status: 500 });
  }

  if (!config.airtable.remisionesBachesTableId) {
    return NextResponse.json({ 
      success: false, 
      error: 'AIRTABLE_REMISIONES_BACHES_TABLE_ID no configurado en variables de entorno' 
    }, { status: 500 });
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const fields = searchParams.get('fields');
    const maxRecords = searchParams.get('maxRecords') || '100';

    let url = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.remisionesBachesTableId}?maxRecords=${maxRecords}`;
    
    if (fields) {
      const fieldParams = fields.split(',').map(field => `fields[]=${encodeURIComponent(field)}`).join('&');
      url += `&${fieldParams}`;
    }
    
    console.log(`🌐 [remisiones-baches] URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [remisiones-baches] Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [remisiones-baches] Error: ${errorText}`);
      return NextResponse.json({
        success: false,
        error: `Airtable API error: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    console.log(`✅ [remisiones-baches] Registros obtenidos: ${data.records?.length || 0}`);

    return NextResponse.json({
      success: true,
      records: data.records || [],
      offset: data.offset
    });

  } catch (error) {
    console.error('💥 [remisiones-baches] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('📝 [remisiones-baches] Creando nueva remisión');
  
  try {
    const body = await request.json();
    console.log('📥 [remisiones-baches] Datos recibidos:', JSON.stringify(body, null, 2));

    // Validaciones ya realizadas en el GET, pero verificamos por completitud
    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.remisionesBachesTableId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Configuración de Airtable no disponible' 
      }, { status: 500 });
    }

    // Mapear los campos del formulario a los field IDs de Airtable
    const airtableRecord = {
      fields: {
        // Campos básicos
        'fldmNHfw9SbO681TG': body.fechaEvento, // Fecha Evento
        'fldObqYpC3cLTBj37': body.realizaRegistro, // Realiza Registro
        'fldRPpV3y45VhKRSI': body.observaciones || '', // Observaciones
        
        // Información del cliente
        'fldVARtVS53dq9pDY': body.cliente, // Cliente
        'fldYg8R8RpJQQqadA': body.nitCcCliente, // NIT/CC Cliente
        
        // Información de recepción
        'fldXnVGzelY4i2giG': body.responsableRecibe || '', // Responsable Recibe
        'fldhrzAUojnYobB5f': body.numeroDocumentoRecibe || '', // Numero Documento Recibe
        
        // Bache vinculado (si existe)
        ...(body.bachePirolisisAlterado && { 'fldoFVv9YJoxFtg1G': [body.bachePirolisisAlterado] })
      }
    };

    console.log('🔄 [remisiones-baches] Registro a enviar:', JSON.stringify(airtableRecord, null, 2));

    const url = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.remisionesBachesTableId}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(airtableRecord)
    });

    console.log(`📡 [remisiones-baches] Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [remisiones-baches] Error: ${errorText}`);
      return NextResponse.json({
        success: false,
        error: `Error de Airtable: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    console.log(`✅ [remisiones-baches] Registro creado con ID: ${data.id}`);

    return NextResponse.json({
      success: true,
      record: data,
      message: 'Remisión creada exitosamente'
    });

  } catch (error) {
    console.error('💥 [remisiones-baches] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
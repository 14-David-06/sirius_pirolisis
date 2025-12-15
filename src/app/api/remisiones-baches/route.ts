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

    // Validaciones de configuración
    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.remisionesBachesTableId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Configuración de Airtable no disponible' 
      }, { status: 500 });
    }

    if (!config.airtable.detalleCantidadesRemisionTableId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tabla de Detalle Cantidades no configurada' 
      }, { status: 500 });
    }

    // Validaciones de datos
    if (!body.bachesSeleccionados || !Array.isArray(body.bachesSeleccionados) || body.bachesSeleccionados.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Debe seleccionar al menos un bache' 
      }, { status: 400 });
    }

    // PASO 1: Crear el registro principal en "Remisiones Baches Pirolisis"
    const remisionRecord = {
      fields: {
        // Campos básicos usando field IDs de la documentación
        'fldmNHfw9SbO681TG': body.fechaEvento, // Fecha Evento
        'fldObqYpC3cLTBj37': body.realizaRegistro, // Realiza Registro
        'fldRPpV3y45VhKRSI': body.observaciones || '', // Observaciones
        
        // Información del cliente
        'fldVARtVS53dq9pDY': body.cliente, // Cliente
        'fldYg8R8RpJQQqadA': body.nitCcCliente, // NIT/CC Cliente
        
        // Información de recepción (opcional)
        'fldXnVGzelY4i2giG': body.responsableRecibe || '', // Responsable Recibe
        'fldhrzAUojnYobB5f': body.numeroDocumentoRecibe || '', // Numero Documento Recibe
        
        // Baches Pirólisis Alterados (IDs de los baches)
        'fldoFVv9YJoxFtg1G': body.bachesSeleccionados.map((bache: any) => bache.bacheId)
      }
    };

    console.log('🔄 [remisiones-baches] Registro principal a crear:', JSON.stringify(remisionRecord, null, 2));

    const remisionUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.remisionesBachesTableId}`;
    
    const remisionResponse = await fetch(remisionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(remisionRecord)
    });

    if (!remisionResponse.ok) {
      const errorText = await remisionResponse.text();
      console.error(`❌ [remisiones-baches] Error creando remisión: ${errorText}`);
      return NextResponse.json({
        success: false,
        error: `Error creando remisión: ${remisionResponse.status}`,
        details: errorText
      }, { status: remisionResponse.status });
    }

    const remisionData = await remisionResponse.json();
    console.log(`✅ [remisiones-baches] Remisión creada con ID: ${remisionData.id}`);

    // PASO 2: Crear los registros de detalle en "Detalle Cantidades Remision Pirolisis"
    const detalleRecords = body.bachesSeleccionados.map((bache: any) => ({
      fields: {
        // Usando field IDs de la documentación de Airtable
        'fldG3TWFNPP0NeM1S': parseFloat(bache.cantidadSolicitada) || 0, // Cantidad Especificada (KG)
        'fldidpnUMEMARpMto': [remisionData.id], // Remisión Bache Pirolisis (link a registro principal)
        'fldAbWHgKSnS2qAtY': [bache.bacheId] // Bache Pirolisis (link a bache específico)
      }
    }));

    console.log('🔄 [remisiones-baches] Registros de detalle a crear:', JSON.stringify(detalleRecords, null, 2));

    const detalleUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.detalleCantidadesRemisionTableId}`;
    
    const detalleResponse = await fetch(detalleUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: detalleRecords })
    });

    if (!detalleResponse.ok) {
      const errorText = await detalleResponse.text();
      console.error(`❌ [remisiones-baches] Error creando detalles: ${errorText}`);
      
      // En caso de error, intentar limpiar el registro principal creado
      try {
        await fetch(`${remisionUrl}/${remisionData.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${config.airtable.token}` }
        });
        console.log('🧹 [remisiones-baches] Registro principal eliminado por rollback');
      } catch (deleteError) {
        console.error('❌ [remisiones-baches] Error en rollback:', deleteError);
      }
      
      return NextResponse.json({
        success: false,
        error: `Error creando detalles de cantidades: ${detalleResponse.status}`,
        details: errorText
      }, { status: detalleResponse.status });
    }

    const detalleData = await detalleResponse.json();
    console.log(`✅ [remisiones-baches] ${detalleData.records?.length || 0} registros de detalle creados`);

    return NextResponse.json({
      success: true,
      record: remisionData,
      detalleRecords: detalleData.records,
      message: 'Remisión y detalles creados exitosamente'
    });

  } catch (error) {
    console.error('💥 [remisiones-baches] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
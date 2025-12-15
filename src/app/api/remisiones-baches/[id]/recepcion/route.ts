import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log(`📥 [recepcion-remision] Registrando recepción para remisión: ${id}`);
  
  // Verificar configuración
  if (!config.airtable.token || !config.airtable.baseId || !config.airtable.remisionesBachesTableId) {
    return NextResponse.json({ 
      success: false, 
      error: 'Configuración de Airtable no disponible' 
    }, { status: 500 });
  }

  try {
    // Parse form data
    const formData = await request.formData();
    const responsableRecibe = formData.get('responsableRecibe') as string;
    const numeroDocumentoRecibe = formData.get('numeroDocumentoRecibe') as string;
    const telefonoRecibe = formData.get('telefonoRecibe') as string;
    const emailRecibe = formData.get('emailRecibe') as string;
    const observacionesRecepcion = formData.get('observacionesRecepcion') as string;
    const aceptaTratamientoDatos = formData.get('aceptaTratamientoDatos') === 'true';
    const aceptaTerminosCondiciones = formData.get('aceptaTerminosCondiciones') === 'true';
    const aceptaUsoResponsableBiochar = formData.get('aceptaUsoResponsableBiochar') === 'true';

    console.log('📥 [recepcion-remision] Datos recibidos:', {
      responsableRecibe,
      numeroDocumentoRecibe,
      telefonoRecibe,
      emailRecibe,
      observacionesRecepcion,
      aceptaTratamientoDatos,
      aceptaTerminosCondiciones,
      aceptaUsoResponsableBiochar
    });

    // Validaciones
    if (!responsableRecibe?.trim()) {
      return NextResponse.json({ 
        success: false, 
        error: 'El responsable de recepción es requerido' 
      }, { status: 400 });
    }

    if (!numeroDocumentoRecibe?.trim()) {
      return NextResponse.json({ 
        success: false, 
        error: 'El número de documento es requerido' 
      }, { status: 400 });
    }

    if (!aceptaTratamientoDatos) {
      return NextResponse.json({ 
        success: false, 
        error: 'Debe aceptar el tratamiento de datos personales' 
      }, { status: 400 });
    }

    if (!aceptaTerminosCondiciones) {
      return NextResponse.json({ 
        success: false, 
        error: 'Debe aceptar los términos y condiciones' 
      }, { status: 400 });
    }

    if (!aceptaUsoResponsableBiochar) {
      return NextResponse.json({ 
        success: false, 
        error: 'Debe declarar el uso responsable del biochar' 
      }, { status: 400 });
    }

    // Preparar datos para Airtable usando Field IDs
    const updateData: any = {
      fields: {
        [config.airtable.remisionesBachesFields.responsableRecibe!]: responsableRecibe,
        [config.airtable.remisionesBachesFields.numeroDocumentoRecibe!]: numeroDocumentoRecibe
      }
    };

    // Agregar teléfono si está disponible
    if (telefonoRecibe?.trim() && config.airtable.remisionesBachesFields.telefonoRecibe) {
      updateData.fields[config.airtable.remisionesBachesFields.telefonoRecibe] = telefonoRecibe;
    }

    // Agregar email si está disponible
    if (emailRecibe?.trim() && config.airtable.remisionesBachesFields.emailRecibe) {
      updateData.fields[config.airtable.remisionesBachesFields.emailRecibe] = emailRecibe;
    }

    // Agregar observaciones si se proporcionan
    if (observacionesRecepcion?.trim()) {
      // Obtener las observaciones existentes primero
      const getResponse = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.remisionesBachesTableId}/${id}`, {
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (getResponse.ok) {
        const existingData = await getResponse.json();
        const existingObservations = existingData.fields?.[config.airtable.remisionesBachesFields.observaciones!] || '';
        const newObservations = existingObservations 
          ? `${existingObservations}\n\n--- Observaciones de Recepción ---\n${observacionesRecepcion}`
          : `--- Observaciones de Recepción ---\n${observacionesRecepcion}`;
        
        updateData.fields[config.airtable.remisionesBachesFields.observaciones!] = newObservations;
      }
    }

    console.log('🔄 [recepcion-remision] Datos a actualizar:', JSON.stringify(updateData, null, 2));

    // Actualizar en Airtable
    const url = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.remisionesBachesTableId}/${id}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData)
    });

    console.log(`📡 [recepcion-remision] Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [recepcion-remision] Error: ${errorText}`);
      return NextResponse.json({
        success: false,
        error: `Error registrando recepción: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const updatedRecord = await response.json();
    console.log(`✅ [recepcion-remision] Recepción registrada exitosamente`);

    return NextResponse.json({
      success: true,
      message: 'Recepción registrada correctamente',
      record: updatedRecord
    });

  } catch (error: any) {
    console.error('❌ [recepcion-remision] Error interno:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}
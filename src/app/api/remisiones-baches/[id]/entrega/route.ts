import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log(`📦 [entrega-remision] Actualizando entrega para remisión: ${id}`);
  
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
    const responsableEntrega = formData.get('responsableEntrega') as string;
    const numeroDocumentoEntrega = formData.get('numeroDocumentoEntrega') as string;
    const telefonoEntrega = formData.get('telefonoEntrega') as string;
    const emailEntrega = formData.get('emailEntrega') as string;
    const aceptaTratamientoDatos = formData.get('aceptaTratamientoDatos') === 'true';
    const aceptaTerminosCondiciones = formData.get('aceptaTerminosCondiciones') === 'true';

    console.log('📥 [entrega-remision] Datos recibidos:', {
      responsableEntrega,
      numeroDocumentoEntrega,
      telefonoEntrega,
      emailEntrega,
      aceptaTratamientoDatos,
      aceptaTerminosCondiciones
    });

    // Validaciones
    if (!responsableEntrega?.trim()) {
      return NextResponse.json({ 
        success: false, 
        error: 'El responsable de entrega es requerido' 
      }, { status: 400 });
    }

    if (!numeroDocumentoEntrega?.trim()) {
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

    // Preparar datos para Airtable usando Field IDs
    const updateData: any = {
      fields: {
        [config.airtable.remisionesBachesFields.responsableEntrega!]: responsableEntrega,
        [config.airtable.remisionesBachesFields.numeroDocumentoEntrega!]: numeroDocumentoEntrega
      }
    };

    // Agregar teléfono si está disponible
    if (telefonoEntrega?.trim() && config.airtable.remisionesBachesFields.telefonoEntrega) {
      updateData.fields[config.airtable.remisionesBachesFields.telefonoEntrega] = telefonoEntrega;
    }

    // Agregar email si está disponible
    if (emailEntrega?.trim() && config.airtable.remisionesBachesFields.emailEntrega) {
      updateData.fields[config.airtable.remisionesBachesFields.emailEntrega] = emailEntrega;
    }

    console.log('🔄 [entrega-remision] Datos a actualizar:', JSON.stringify(updateData, null, 2));

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

    console.log(`📡 [entrega-remision] Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [entrega-remision] Error: ${errorText}`);
      return NextResponse.json({
        success: false,
        error: `Error actualizando remisión: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const updatedRecord = await response.json();
    console.log(`✅ [entrega-remision] Entrega registrada exitosamente`);

    return NextResponse.json({
      success: true,
      message: 'Información de entrega actualizada correctamente',
      record: updatedRecord
    });

  } catch (error: any) {
    console.error('❌ [entrega-remision] Error interno:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    }, { status: 500 });
  }
}
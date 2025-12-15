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
    const firmaEntrega = formData.get('firmaEntrega') as File | null;

    console.log('📥 [entrega-remision] Datos recibidos:', {
      responsableEntrega,
      numeroDocumentoEntrega,
      tieneFirma: !!firmaEntrega
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

    // Preparar datos para Airtable usando Field IDs
    const updateData: any = {
      fields: {
        [config.airtable.remisionesBachesFields.responsableEntrega!]: responsableEntrega,
        [config.airtable.remisionesBachesFields.numeroDocumentoEntrega!]: numeroDocumentoEntrega
      }
    };

    // Si hay firma, subirla primero (por ahora solo guardamos indicación de que existe)
    if (firmaEntrega) {
      // TODO: Implementar subida de archivo a S3 o Airtable
      // Por ahora solo marcamos que hay firma
      console.log('📎 [entrega-remision] Firma recibida:', firmaEntrega.name, firmaEntrega.size);
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
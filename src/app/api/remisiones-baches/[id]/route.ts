import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log(`📋 [remision-detail] Obteniendo remisión: ${id}`);
  
  // Verificar configuración
  if (!config.airtable.token || !config.airtable.baseId || !config.airtable.remisionesBachesTableId) {
    return NextResponse.json({ 
      success: false, 
      error: 'Configuración de Airtable no disponible' 
    }, { status: 500 });
  }

  try {
    const url = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.remisionesBachesTableId}/${id}`;
    
    console.log(`🌐 [remision-detail] URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [remision-detail] Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [remision-detail] Error: ${errorText}`);
      return NextResponse.json({
        success: false,
        error: `Airtable API error: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const record = await response.json();
    console.log(`✅ [remision-detail] Remisión obtenida`);

    return NextResponse.json({
      success: true,
      record: record
    });

  } catch (error: any) {
    console.error('❌ [remision-detail] Error interno:', error);
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export async function GET() {
  console.log('🧪 [test-token] Iniciando test básico del token');
  
  try {
    console.log(`🔑 [test-token] Token existe: ${AIRTABLE_TOKEN ? 'Sí' : 'No'}`);
    console.log(`🔑 [test-token] Token length: ${AIRTABLE_TOKEN?.length || 0}`);
    console.log(`🔑 [test-token] Token: ${AIRTABLE_TOKEN}`);

    if (!AIRTABLE_TOKEN) {
      return NextResponse.json({ error: 'Token no configurado' }, { status: 400 });
    }

    // Primero, vamos a probar obtener las bases a las que tenemos acceso
    console.log('🔍 [test-token] Obteniendo bases disponibles...');
    const basesUrl = 'https://api.airtable.com/v0/meta/bases';
    console.log(`🌐 [test-token] URL: ${basesUrl}`);

    const response = await fetch(basesUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [test-token] Response - Status: ${response.status}`);
    console.log(`📡 [test-token] Response - StatusText: ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ [test-token] Bases disponibles:`, JSON.stringify(data, null, 2));
      
      return NextResponse.json({
        success: true,
        message: 'Token válido',
        bases: data
      });
    } else {
      const errorText = await response.text();
      console.log(`❌ [test-token] Error: ${errorText}`);
      
      return NextResponse.json({
        success: false,
        message: 'Error con el token',
        error: errorText,
        status: response.status
      }, { status: response.status });
    }

  } catch (error) {
    console.error('💥 [test-token] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

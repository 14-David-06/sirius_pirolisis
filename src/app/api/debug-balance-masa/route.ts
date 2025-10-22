// src/app/api/debug-balance-masa/route.ts
// Endpoint de diagnóstico específico para balance-masa

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Verificar variables de entorno críticas
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      config: {
        hasAirtableToken: !!process.env.AIRTABLE_TOKEN,
        tokenLength: process.env.AIRTABLE_TOKEN?.length || 0,
        hasAirtableBaseId: !!process.env.AIRTABLE_BASE_ID,
        baseIdLength: process.env.AIRTABLE_BASE_ID?.length || 0,
        hasBalanceMasaTable: !!process.env.AIRTABLE_BALANCE_MASA_TABLE,
        balanceMasaTable: process.env.AIRTABLE_BALANCE_MASA_TABLE || 'NOT_SET',
        hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || 'NOT_SET',
        hasAwsKeys: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        vercelUrl: process.env.VERCEL_URL || 'NOT_SET'
      },
      urlResolver: {
        canImport: false,
        error: null as string | null,
        testUrl: null as string | null
      },
      recommendations: [] as string[]
    };

    // Intentar importar url-resolver
    try {
      const { resolveApiUrl } = await import('@/lib/url-resolver');
      const testUrl = resolveApiUrl('/api/test');
      diagnostics.urlResolver = {
        canImport: true,
        error: null,
        testUrl
      };
    } catch (importError) {
      diagnostics.urlResolver = {
        canImport: false,
        error: importError instanceof Error ? importError.message : 'Unknown import error',
        testUrl: null
      };
    }

    // Generar recomendaciones
    if (!diagnostics.config.hasAirtableToken) {
      diagnostics.recommendations.push('❌ AIRTABLE_TOKEN faltante - configurar en variables de entorno de Vercel');
    }
    if (!diagnostics.config.hasAirtableBaseId) {
      diagnostics.recommendations.push('❌ AIRTABLE_BASE_ID faltante - configurar en variables de entorno de Vercel');
    }
    if (!diagnostics.config.hasBalanceMasaTable || diagnostics.config.balanceMasaTable === 'NOT_SET') {
      diagnostics.recommendations.push('❌ AIRTABLE_BALANCE_MASA_TABLE faltante - configurar en variables de entorno de Vercel');
    }
    if (!diagnostics.config.hasAwsKeys) {
      diagnostics.recommendations.push('⚠️ AWS credentials faltantes - PDF/QR no funcionarán');
    }
    if (!diagnostics.config.hasAppUrl || diagnostics.config.appUrl === 'NOT_SET') {
      diagnostics.recommendations.push('⚠️ NEXT_PUBLIC_APP_URL faltante - URLs pueden ser incorrectas');
    }

    return NextResponse.json(diagnostics, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      }
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Error en diagnóstico',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Test de creación simple para aislar el problema
export async function POST(request: NextRequest) {
  console.log('🧪 [debug-balance-masa] Test de creación básica');
  
  try {
    // Verificar configuración mínima
    if (!process.env.AIRTABLE_TOKEN || !process.env.AIRTABLE_BASE_ID || !process.env.AIRTABLE_BALANCE_MASA_TABLE) {
      return NextResponse.json({
        success: false,
        error: 'Configuración incompleta',
        missing: {
          token: !process.env.AIRTABLE_TOKEN,
          baseId: !process.env.AIRTABLE_BASE_ID,
          table: !process.env.AIRTABLE_BALANCE_MASA_TABLE
        }
      }, { status: 400 });
    }

    // Datos de prueba mínimos
    const testData = {
      'Peso Biochar (KG)': 100,
      'Temperatura Reactor (R1)': 450,
      'Temperatura Reactor (R2)': 460,
      'Temperatura Reactor (R3)': 455,
      'Realiza Registro': 'Test Debug - ' + new Date().toISOString()
    };

    console.log('📤 Enviando test a Airtable...');

    const response = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_BALANCE_MASA_TABLE}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: testData }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error en Airtable:', response.status, errorText);
      
      return NextResponse.json({
        success: false,
        error: 'Error creando en Airtable',
        status: response.status,
        statusText: response.statusText,
        details: errorText
      }, { status: response.status });
    }

    const result = await response.json();
    console.log('✅ Test exitoso:', result.id);

    return NextResponse.json({
      success: true,
      message: 'Test de creación básica exitoso',
      recordId: result.id,
      testData
    });

  } catch (error) {
    console.error('💥 [debug-balance-masa] Error en test:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
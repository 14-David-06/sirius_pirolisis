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
      },
      urlResolver: {
        canImport: false,
        error: null as string | null,
        testUrl: null as string | null
      }
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
// src/app/api/debug-config/route.ts
// Endpoint para diagnosticar configuración en producción

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(request: NextRequest) {
  try {
    // Solo permitir en desarrollo o con una clave secreta
    const { searchParams } = new URL(request.url);
    const debugKey = searchParams.get('key');
    
    // En producción, requerir una clave específica
    if (process.env.NODE_ENV === 'production' && debugKey !== process.env.DEBUG_SECRET_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const diagnosticInfo = {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      configuration: {
        // Variables críticas (sin exponer valores reales)
        airtable: {
          hasToken: !!config.airtable.token,
          tokenLength: config.airtable.token?.length || 0,
          hasBaseId: !!config.airtable.baseId,
          baseIdLength: config.airtable.baseId?.length || 0,
          hasTableName: !!config.airtable.tableName,
          tableName: config.airtable.tableName, // Safe to show
          hasBalanceMasaTable: !!process.env.AIRTABLE_BALANCE_MASA_TABLE,
          balanceMasaTable: process.env.AIRTABLE_BALANCE_MASA_TABLE,
          hasTurnosTable: !!config.airtable.turnosTableId,
          turnosTable: config.airtable.turnosTableId,
        },
        urls: {
          hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
          appUrl: process.env.NEXT_PUBLIC_APP_URL,
          hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        },
      },
      // Test de conectividad básica
      networkTests: {
        canResolveAirtable: true, // Implementar test real si es necesario
      }
    };

    return NextResponse.json(diagnosticInfo, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });

  } catch (error) {
    console.error('Error en diagnóstico:', error);
    
    return NextResponse.json({
      error: 'Error interno',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
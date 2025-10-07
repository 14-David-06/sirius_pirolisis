import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET() {
  console.log('🏥 [health] Health check iniciado');
  
  try {
    // Verificaciones básicas del sistema
    const checks = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      nodeVersion: process.version,
      
      // Verificar variables críticas (sin exponer valores)
      airtable: {
        hasToken: !!config.airtable.token,
        hasBaseId: !!config.airtable.baseId,
        hasTableName: !!config.airtable.tableName,
        tableName: config.airtable.tableName // Este no es sensible
      },
      
      // Test básico de conectividad a Airtable (sin hacer requests reales)
      connectivity: {
        airtableConfigured: !!(config.airtable.token && config.airtable.baseId && config.airtable.tableName)
      }
    };

    const isHealthy = checks.airtable.hasToken && 
                     checks.airtable.hasBaseId && 
                     checks.airtable.hasTableName;

    console.log('🏥 [health] Estado del sistema:', {
      healthy: isHealthy,
      environment: checks.environment,
      airtableConfigured: checks.connectivity.airtableConfigured
    });

    return NextResponse.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      message: isHealthy ? 'Todos los sistemas operativos' : 'Configuración incompleta'
    }, { 
      status: isHealthy ? 200 : 503 
    });

  } catch (error) {
    console.error('💥 [health] Error en health check:', error);
    
    return NextResponse.json({
      status: 'error',
      message: 'Error en el health check',
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

// ⚠️ ENDPOINT DE DIAGNÓSTICO TEMPORAL - ELIMINAR EN PRODUCCIÓN
// Solo para diagnosticar problemas de variables de entorno

export async function GET(request: NextRequest) {
  console.log('🔍 [debug-env] Iniciando diagnóstico de variables de entorno');
  
  try {
    // Verificar variables críticas (sin exponer valores sensibles)
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV,
      // Airtable - solo verificar si existen
      AIRTABLE_TOKEN: process.env.AIRTABLE_TOKEN ? '✅ Configurado' : '❌ Faltante',
      AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID ? '✅ Configurado' : '❌ Faltante',
      AIRTABLE_TABLE_NAME: process.env.AIRTABLE_TABLE_NAME ? `✅ ${process.env.AIRTABLE_TABLE_NAME}` : '❌ Faltante',
      
      // Verificar otras tablas críticas
      AIRTABLE_USUARIOS_TABLE_ID: process.env.AIRTABLE_USUARIOS_TABLE_ID ? '✅ Configurado' : '❌ Faltante',
      AIRTABLE_TURNOS_TABLE_ID: process.env.AIRTABLE_TURNOS_TABLE_ID ? '✅ Configurado' : '❌ Faltante',
      AIRTABLE_BALANCE_MASA_TABLE: process.env.AIRTABLE_BALANCE_MASA_TABLE ? '✅ Configurado' : '❌ Faltante',
      
      // AWS S3 - crítico para PDF y QR
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? '✅ Configurado' : '❌ Faltante',
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? '✅ Configurado' : '❌ Faltante',
      AWS_REGION: process.env.AWS_REGION ? `✅ ${process.env.AWS_REGION}` : '❌ Faltante (usando us-east-1)',
      
      // URL Configuration
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ? `✅ ${process.env.NEXT_PUBLIC_APP_URL}` : '❌ Faltante',
      VERCEL_URL: process.env.VERCEL_URL ? `✅ ${process.env.VERCEL_URL}` : '❌ Faltante',
      
      // Config object values
      configAirtableToken: config.airtable.token ? '✅ Configurado en config' : '❌ Faltante en config',
      configAirtableBaseId: config.airtable.baseId ? '✅ Configurado en config' : '❌ Faltante en config',
      configAirtableTableName: config.airtable.tableName ? `✅ ${config.airtable.tableName}` : '❌ Faltante en config',
    };

    // Información del sistema
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      timestamp: new Date().toISOString(),
      envKeys: Object.keys(process.env).filter(key => key.startsWith('AIRTABLE_')).length + ' variables AIRTABLE_*'
    };

    console.log('📊 [debug-env] Variables de entorno:', envCheck);
    console.log('🖥️ [debug-env] Información del sistema:', systemInfo);

    return NextResponse.json({
      status: 'success',
      environment: envCheck,
      system: systemInfo,
      message: 'Diagnóstico completado. Revisa los logs del servidor para más detalles.'
    });

  } catch (error) {
    console.error('💥 [debug-env] Error en diagnóstico:', error);
    
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Error desconocido',
      message: 'Error durante el diagnóstico'
    }, { status: 500 });
  }
}

// ⚠️ IMPORTANTE: Este endpoint debe ser eliminado antes del deploy final
// Solo es para diagnóstico temporal
// src/app/api/health-detailed/route.ts
// Health check detallado para diagnóstico de producción

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { urlResolver } from '@/lib/url-resolver';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeEnv = searchParams.get('env') === 'true';
    
    // Solo mostrar detalles de entorno en desarrollo o con clave
    const debugKey = searchParams.get('key');
    const showDetails = process.env.NODE_ENV === 'development' || 
                       debugKey === process.env.DEBUG_SECRET_KEY;

    const healthData: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || 'unknown',
    };

    if (showDetails) {
      // Configuración de Airtable (sin exponer tokens)
      healthData.airtable = {
        configured: {
          token: !!config.airtable.token,
          baseId: !!config.airtable.baseId,
          tableName: !!config.airtable.tableName,
          turnosTable: !!config.airtable.turnosTableId,
          balanceMasaTable: !!process.env.AIRTABLE_BALANCE_MASA_TABLE,
        },
        lengths: {
          token: config.airtable.token?.length || 0,
          baseId: config.airtable.baseId?.length || 0,
        },
        tableNames: {
          main: config.airtable.tableName,
          turnos: config.airtable.turnosTableId,
          balanceMasa: process.env.AIRTABLE_BALANCE_MASA_TABLE,
        }
      };

      // Configuración de URLs
      const urlValidation = urlResolver.validateConfiguration();
      healthData.urls = {
        baseUrl: urlResolver.getBaseUrl(),
        validation: urlValidation,
        environment: {
          nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL,
          vercelUrl: process.env.VERCEL_URL,
          nextAuthUrl: process.env.NEXTAUTH_URL,
        }
      };

      // Test básico de conectividad a Airtable
      try {
        if (config.airtable.token && config.airtable.baseId) {
          const testResponse = await fetch(
            `https://api.airtable.com/v0/${config.airtable.baseId}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${config.airtable.token}`,
              },
            }
          );
          
          healthData.connectivity = {
            airtable: {
              status: testResponse.ok ? 'connected' : 'error',
              statusCode: testResponse.status,
              message: testResponse.ok ? 'OK' : 'Failed to connect'
            }
          };
        } else {
          healthData.connectivity = {
            airtable: {
              status: 'not_configured',
              message: 'Missing token or baseId'
            }
          };
        }
      } catch (error) {
        healthData.connectivity = {
          airtable: {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }

      // Variables de entorno si se solicita
      if (includeEnv) {
        healthData.envVars = {
          defined: Object.keys(process.env).filter(key => 
            key.startsWith('AIRTABLE_') || 
            key.startsWith('NEXT_PUBLIC_') ||
            key.startsWith('NEXTAUTH_') ||
            key.includes('URL')
          ),
          critical: {
            AIRTABLE_TOKEN: !!process.env.AIRTABLE_TOKEN,
            AIRTABLE_BASE_ID: !!process.env.AIRTABLE_BASE_ID,
            AIRTABLE_TABLE_NAME: !!process.env.AIRTABLE_TABLE_NAME,
            NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
            AIRTABLE_BALANCE_MASA_TABLE: !!process.env.AIRTABLE_BALANCE_MASA_TABLE,
            AIRTABLE_TURNOS_TABLE_ID: !!process.env.AIRTABLE_TURNOS_TABLE_ID,
          }
        };
      }
    } else {
      healthData.message = 'Basic health check - use ?key=DEBUG_KEY for details';
    }

    // Determinar status general
    const criticalVarsPresent = !!(
      config.airtable.token && 
      config.airtable.baseId && 
      config.airtable.tableName
    );
    
    if (!criticalVarsPresent) {
      healthData.status = 'degraded';
      healthData.warning = 'Critical environment variables missing';
    }

    const statusCode = healthData.status === 'healthy' ? 200 : 
                      healthData.status === 'degraded' ? 200 : 503;

    return NextResponse.json(healthData, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });

  } catch (error) {
    console.error('Error in health check:', error);
    
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
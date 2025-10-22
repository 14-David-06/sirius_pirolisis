// src/middleware/error-handler.ts
// Middleware para manejo centralizado de errores

import { NextResponse } from 'next/server';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class NetworkError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ConfigurationError extends Error {
  constructor(message: string, public missingVars?: string[]) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function handleApiError(error: unknown, context?: string): NextResponse {
  console.error(`❌ Error in ${context}:`, error);

  // Log adicional para debugging en producción
  if (process.env.NODE_ENV === 'production') {
    console.error('Production error details:', {
      timestamp: new Date().toISOString(),
      context,
      error: {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : 'No stack'
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        hasAirtableToken: !!process.env.AIRTABLE_TOKEN,
        hasAirtableBaseId: !!process.env.AIRTABLE_BASE_ID,
        hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      }
    });
  }

  // Manejo específico por tipo de error
  if (error instanceof ConfigurationError) {
    return NextResponse.json({
      error: 'Configuration Error',
      message: 'Faltan variables de entorno críticas',
      details: error.missingVars,
      canRetry: false,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }

  if (error instanceof NetworkError) {
    return NextResponse.json({
      error: 'Network Error',
      message: 'Error de conectividad',
      details: error.message,
      canRetry: true,
      timestamp: new Date().toISOString()
    }, { status: 503 }); // Service Unavailable
  }

  // Error de fetch genérico
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return NextResponse.json({
      error: 'Fetch Error',
      message: 'Error al realizar petición HTTP',
      details: error.message,
      canRetry: true,
      timestamp: new Date().toISOString()
    }, { status: 502 }); // Bad Gateway
  }

  // Error genérico
  return NextResponse.json({
    error: 'Internal Server Error',
    message: error instanceof Error ? error.message : 'Error desconocido',
    canRetry: false,
    timestamp: new Date().toISOString()
  }, { status: 500 });
}

export function validateRequiredEnvVars(requiredVars: string[]): void {
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missingVars.join(', ')}`,
      missingVars
    );
  }
}

export async function safeApiCall<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Re-throw para que el handler principal pueda procesarlo
    if (error instanceof NetworkError || error instanceof ConfigurationError) {
      throw error;
    }

    // Wrap otros errores en NetworkError si parecen relacionados con red
    if (error instanceof Error && (
      error.message.includes('fetch') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('NAME_NOT_RESOLVED')
    )) {
      throw new NetworkError(`Network error in ${context}: ${error.message}`, error);
    }

    // Re-throw otros errores sin modificar
    throw error;
  }
}
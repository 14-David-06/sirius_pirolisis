// src/lib/url-resolver.ts
// Helper para resolver URLs correctamente en diferentes entornos

export class UrlResolver {
  private static instance: UrlResolver;
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.resolveBaseUrl();
  }

  static getInstance(): UrlResolver {
    if (!UrlResolver.instance) {
      UrlResolver.instance = new UrlResolver();
    }
    return UrlResolver.instance;
  }

  private resolveBaseUrl(): string {
    // Prioridad de URLs base:
    // 1. NEXT_PUBLIC_APP_URL (configurada explícitamente)
    // 2. VERCEL_URL (automática en Vercel)
    // 3. Localhost para desarrollo

    if (process.env.NEXT_PUBLIC_APP_URL) {
      let url = process.env.NEXT_PUBLIC_APP_URL;
      // Asegurar que comience con https:// en producción
      if (process.env.NODE_ENV === 'production' && !url.startsWith('http')) {
        url = `https://${url}`;
      }
      return url;
    }

    if (process.env.VERCEL_URL) {
      // VERCEL_URL no incluye protocolo
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
      return `${protocol}://${process.env.VERCEL_URL}`;
    }

    // Fallback para desarrollo
    return 'http://localhost:3000';
  }

  /**
   * Resuelve una URL de API interna
   */
  resolveApiUrl(path: string): string {
    // Limpiar el path
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    // En entornos serverless, usar URLs relativas para llamadas internas
    if (this.isServerlessEnvironment()) {
      return cleanPath;
    }

    return `${this.baseUrl}${cleanPath}`;
  }

  /**
   * Resuelve URL completa para uso externo
   */
  resolveFullUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  /**
   * Obtiene la URL base actual
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Verifica si estamos en un entorno serverless
   */
  private isServerlessEnvironment(): boolean {
    return !!(process.env.VERCEL || process.env.LAMBDA_TASK_ROOT || process.env.AWS_EXECUTION_ENV);
  }

  /**
   * Valida configuración de URLs
   */
  validateConfiguration(): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Verificar variables de entorno
    if (!process.env.NEXT_PUBLIC_APP_URL && process.env.NODE_ENV === 'production') {
      issues.push('NEXT_PUBLIC_APP_URL no está configurada en producción');
      recommendations.push('Configurar NEXT_PUBLIC_APP_URL con la URL completa de tu aplicación');
    }

    // Verificar formato de URL
    try {
      new URL(this.baseUrl);
    } catch {
      issues.push(`URL base inválida: ${this.baseUrl}`);
      recommendations.push('Verificar formato de NEXT_PUBLIC_APP_URL (debe incluir protocolo)');
    }

    // Verificar HTTPS en producción
    if (process.env.NODE_ENV === 'production' && !this.baseUrl.startsWith('https://')) {
      issues.push('URL base no usa HTTPS en producción');
      recommendations.push('Configurar URL base con protocolo HTTPS en producción');
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations
    };
  }
}

// Export singleton instance
export const urlResolver = UrlResolver.getInstance();

// Helper functions para backward compatibility
export function resolveApiUrl(path: string): string {
  return urlResolver.resolveApiUrl(path);
}

export function resolveFullUrl(path: string): string {
  return urlResolver.resolveFullUrl(path);
}

export function getBaseUrl(): string {
  return urlResolver.getBaseUrl();
}
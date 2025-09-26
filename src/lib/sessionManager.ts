// src/lib/sessionManager.ts
// Gestión de sesiones en cliente (localStorage) - LEGACY MODE
// Para sesiones seguras usar ServerSessionManager en APIs

export interface UserSession {
  user: {
    id: string;
    Cedula: string;
    Nombre: string;
    Apellido: string;
    Email: string;
    Telefono: string;
    Cargo: string;
  };
  loginTime: string;
}

const USE_SECURE_SESSIONS = process.env.USE_SECURE_SESSIONS === 'true';

export class SessionManager {
  private static readonly SESSION_KEY = 'userSession';

  // Crear sesión (solo localStorage para backwards compatibility)
  static async createSecureSession(userData: UserSession['user']): Promise<void> {
    if (USE_SECURE_SESSIONS) {
      // En modo seguro, las sesiones se manejan en server-side
      console.warn('SessionManager.createSecureSession called in secure mode - use ServerSessionManager in APIs');
      return;
    }

    const session: UserSession = {
      user: userData,
      loginTime: new Date().toISOString(),
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    }
  }

  // Obtener sesión (solo localStorage)
  static async getSession(): Promise<UserSession | null> {
    if (USE_SECURE_SESSIONS) {
      // En modo seguro, usar API /api/session
      console.warn('SessionManager.getSession called in secure mode - use /api/session endpoint');
      return null;
    }

    if (typeof window !== 'undefined') {
      try {
        const session = localStorage.getItem(this.SESSION_KEY);
        return session ? JSON.parse(session) : null;
      } catch (error) {
        console.error('Error parsing session:', error);
        return null;
      }
    }
    return null;
  }

  // Destruir sesión (solo localStorage)
  static async destroySession(): Promise<void> {
    if (USE_SECURE_SESSIONS) {
      // En modo seguro, usar API /api/logout
      console.warn('SessionManager.destroySession called in secure mode - use /api/logout endpoint');
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.SESSION_KEY);
    }
  }
}
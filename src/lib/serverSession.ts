// src/lib/serverSession.ts
// Funciones de sesión que solo funcionan en Server Components/APIs

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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

const SESSION_COOKIE_NAME = 'sirius_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 24 * 60 * 60, // 24 horas
  path: '/',
};

export class ServerSessionManager {
  static async createSecureSession(userData: UserSession['user']): Promise<void> {
    const session: UserSession = {
      user: userData,
      loginTime: new Date().toISOString(),
    };

    const encryptedSession = this.encryptSession(session);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, encryptedSession, COOKIE_OPTIONS);
  }

  static async getSession(request?: NextRequest): Promise<UserSession | null> {
    try {
      const sessionCookie = request?.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (!sessionCookie) {
        const cookieStore = await cookies();
        const fallbackCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        if (!fallbackCookie) return null;
        return this.decryptSession(fallbackCookie);
      }
      return this.decryptSession(sessionCookie);
    } catch (error) {
      console.error('Error decrypting session:', error);
      return null;
    }
  }

  static async destroySession(response?: NextResponse): Promise<void> {
    if (response) {
      response.cookies.set(SESSION_COOKIE_NAME, '', {
        ...COOKIE_OPTIONS,
        maxAge: 0,
      });
    } else {
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, '', {
        ...COOKIE_OPTIONS,
        maxAge: 0,
      });
    }
  }

  // Métodos de encriptación (simplificados)
  private static encryptSession(session: UserSession): string {
    return Buffer.from(JSON.stringify(session)).toString('base64');
  }

  private static decryptSession(encrypted: string): UserSession {
    return JSON.parse(Buffer.from(encrypted, 'base64').toString());
  }
}
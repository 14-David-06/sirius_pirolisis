// src/lib/serverSession.ts
// Funciones de sesión que solo funcionan en Server Components/APIs

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  VERSION_SESION,
  VIGENCIA_SESION_HORAS,
  firmarSesion,
  sesionVigente,
  verificarSesion,
} from './sesion-firma';
import { secretosSesion } from './sesion-config.server';

// Lo sensible (p.ej. emitir enlaces de recepción) pregunta antes si «con sesión»
// autentica de verdad. Vive en `sesion-config.server`, que no arrastra Next.
export { sesionFirmada } from './sesion-config.server';

export interface UserSession {
  user: {
    id: string;
    Cedula: string;
    Nombre: string;
    Apellido: string;
    Email: string;
    Telefono: string;
    Cargo: string;
    idPersonalCore?: string; // SIRIUS-PER-XXXX (Nomina Core)
    idPirolisis?: string;    // record ID en tabla Usuarios Pirolisis
  };
  loginTime: string;
}

const SESSION_COOKIE_NAME = 'sirius_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: VIGENCIA_SESION_HORAS * 60 * 60, // 24 horas, las mismas que exige el servidor
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

  // Con SESSION_SECRET la cookie va firmada (`sesion-firma.ts`). Sin él se
  // escribe y se lee exactamente como antes, base64(JSON): un despliegue sin la
  // variable no puede dejar a la planta sin login (`sesion-config.server.ts`).
  private static encryptSession(session: UserSession): string {
    const json = JSON.stringify(session);
    const [secreto] = secretosSesion();
    return secreto ? firmarSesion(json, secreto) : Buffer.from(json).toString('base64');
  }

  private static decryptSession(encrypted: string): UserSession | null {
    const secretos = secretosSesion();
    if (secretos.length === 0) {
      return JSON.parse(Buffer.from(encrypted, 'base64').toString());
    }

    const json = verificarSesion(encrypted, secretos);
    if (json === null) {
      // Sin el prefijo es la cookie de antes de la firma: cada usuario inicia
      // sesión una vez tras el despliegue. Con el prefijo, una cookie alterada o
      // un secreto rotado sin pasar el viejo a SESSION_SECRET_ANTERIOR.
      const motivo = encrypted.startsWith(`${VERSION_SESION}.`) ? 'firma inválida' : 'sin firma';
      console.warn(`[sesion] cookie rechazada: ${motivo}`);
      return null;
    }

    const session = sesionDeJson(json);
    if (!session) {
      console.warn('[sesion] cookie rechazada: contenido inválido');
      return null;
    }
    if (!sesionVigente(session.loginTime, new Date())) {
      console.warn('[sesion] cookie rechazada: vencida');
      return null;
    }
    return session;
  }
}

/**
 * La forma mínima de una sesión. La firma ya garantiza que la escribió este
 * servidor; esto cubre un cambio futuro de formato que olvide subir la versión.
 */
function sesionDeJson(json: string): UserSession | null {
  try {
    const s = JSON.parse(json);
    const valida =
      s && typeof s === 'object' && s.user && typeof s.user === 'object' && typeof s.loginTime === 'string';
    return valida ? (s as UserSession) : null;
  } catch {
    return null;
  }
}
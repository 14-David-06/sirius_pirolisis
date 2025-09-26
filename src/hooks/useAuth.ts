// src/hooks/useAuth.ts
// Hook centralizado para gestión de autenticación con soporte para sesiones seguras

import { useState, useEffect } from 'react';
import { SessionManager, UserSession } from '@/lib/sessionManager';

export function useAuth() {
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        let session: UserSession | null = null;

        if (process.env.USE_SECURE_SESSIONS === 'true') {
          // Usar API para sesiones seguras
          const response = await fetch('/api/session');
          if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
              session = {
                user: data.user,
                loginTime: data.loginTime,
              };
            }
          }
        } else {
          // Usar localStorage legacy
          session = await SessionManager.getSession();
        }

        setUserSession(session);
      } catch (error) {
        console.error('Error checking session:', error);
        setUserSession(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (userData: UserSession['user']) => {
    try {
      if (process.env.USE_SECURE_SESSIONS === 'true') {
        // Login via API (que crea la cookie)
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cedula: userData.Cedula,
            password: 'dummy', // En producción, esto vendría del form
          }),
        });

        if (!response.ok) {
          throw new Error('Login failed');
        }

        const data = await response.json();
        const newSession: UserSession = {
          user: data.user,
          loginTime: new Date().toISOString(),
        };
        setUserSession(newSession);
      } else {
        // Login legacy
        await SessionManager.createSecureSession(userData);
        const newSession: UserSession = {
          user: userData,
          loginTime: new Date().toISOString(),
        };
        setUserSession(newSession);
      }
    } catch (error) {
      console.error('Error during login:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (process.env.USE_SECURE_SESSIONS === 'true') {
        // Logout via API
        await fetch('/api/logout', { method: 'POST' });
      } else {
        // Logout legacy
        await SessionManager.destroySession();
      }
      setUserSession(null);
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  };

  return {
    user: userSession?.user || null,
    loginTime: userSession?.loginTime || null,
    isAuthenticated: !!userSession,
    loading,
    login,
    logout,
  };
}
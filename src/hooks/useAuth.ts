// src/hooks/useAuth.ts
// Hook centralizado para gestión de autenticación usando Clean Architecture

import { useState, useEffect } from 'react';
import { AuthenticatedUser, UserCredentials } from '../domain/entities/User';
import { SessionManager } from '../lib/sessionManager';

export function useAuth() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        let sessionUser: AuthenticatedUser | null = null;

        if (process.env.USE_SECURE_SESSIONS === 'true') {
          // Usar API para sesiones seguras
          const response = await fetch('/api/session');
          if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
              sessionUser = {
                id: data.user.id,
                cedula: data.user.cedula || data.user.Cedula,
                nombre: data.user.nombre || data.user.Nombre,
                apellido: data.user.apellido || data.user.Apellido,
                email: data.user.email || data.user.Email,
                telefono: data.user.telefono || data.user.Telefono,
                cargo: data.user.cargo || data.user.Cargo,
                loginTime: data.loginTime,
              };
            }
          }
        } else {
          // Usar localStorage legacy
          const session = await SessionManager.getSession();
          if (session) {
            sessionUser = {
              id: session.user.id,
              cedula: session.user.Cedula,
              nombre: session.user.Nombre,
              apellido: session.user.Apellido,
              email: session.user.Email,
              telefono: session.user.Telefono,
              cargo: session.user.Cargo,
              loginTime: session.loginTime,
            };
          }
        }

        setUser(sessionUser);
      } catch (error) {
        console.error('Error checking session:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const login = async (credentials: UserCredentials) => {
    try {
      // Call login API directly instead of using AuthService on client
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const data = await response.json();

      // Fix property names to match User entity
      const authenticatedUser: AuthenticatedUser = {
        id: data.user.id,
        cedula: data.user.cedula || data.user.Cedula,
        nombre: data.user.nombre || data.user.Nombre,
        apellido: data.user.apellido || data.user.Apellido,
        email: data.user.email || data.user.Email,
        telefono: data.user.telefono || data.user.Telefono,
        cargo: data.user.cargo || data.user.Cargo,
        loginTime: new Date().toISOString(),
      };

      if (process.env.USE_SECURE_SESSIONS === 'true') {
        // Session is already created by API
        setUser(authenticatedUser);
      } else {
        // Create session legacy - convert to expected format
        const sessionUser = {
          id: authenticatedUser.id,
          Cedula: authenticatedUser.cedula,
          Nombre: authenticatedUser.nombre,
          Apellido: authenticatedUser.apellido,
          Email: authenticatedUser.email,
          Telefono: authenticatedUser.telefono,
          Cargo: authenticatedUser.cargo,
        };
        await SessionManager.createSecureSession(sessionUser);
        setUser(authenticatedUser);
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
      setUser(null);
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  };

  return {
    user,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
  };
}
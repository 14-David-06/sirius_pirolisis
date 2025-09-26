// src/examples/CleanArchitectureUsage.tsx
// Ejemplo de cómo usar la nueva arquitectura Clean Architecture

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { Container } from '../infrastructure/container';

export function CleanArchitectureExample() {
  const { user, isAuthenticated, login, logout, loading } = useAuth();

  const handleLogin = async () => {
    try {
      // Usar AuthService a través del Container
      const authService = Container.getAuthService();

      // Esto eventualmente usará el hook, pero mostrando el flujo
      await login({
        cedula: '123456789',
        password: 'password123',
      });
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Clean Architecture Example</h1>

      {isAuthenticated ? (
        <div>
          <p>Welcome, {user?.nombre}!</p>
          <p>Cedula: {user?.cedula}</p>
          <p>Cargo: {user?.cargo}</p>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <div>
          <p>Not authenticated</p>
          <button onClick={handleLogin}>Login with Clean Architecture</button>
        </div>
      )}

      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
        <h3>Architecture Flow:</h3>
        <ol>
          <li>UI Component calls useAuth hook</li>
          <li>useAuth uses AuthService from Container</li>
          <li>AuthService uses IUserRepository (Airtable or Postgres)</li>
          <li>Repository handles data access</li>
          <li>Results flow back through the layers</li>
        </ol>
      </div>
    </div>
  );
}
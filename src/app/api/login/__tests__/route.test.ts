// src/app/api/login/__tests__/route.test.ts
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { SessionManager } from '@/lib/sessionManager';

// Mock dependencies
jest.mock('@/lib/config', () => ({
  config: {
    airtable: {
      token: 'mock-token',
      baseId: 'mock-base',
      tableName: 'mock-table',
    },
  },
  validateEnvVars: jest.fn(),
  logConfigSafely: jest.fn(),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

jest.mock('@/lib/serverSession', () => ({
  ServerSessionManager: {
    createSecureSession: jest.fn(),
  },
}));

const mockServerSessionManager = require('@/lib/serverSession').ServerSessionManager;
const mockBcryptCompare = require('bcryptjs').compare;

// Mock fetch
global.fetch = jest.fn();

describe('/api/login', () => {
  const mockUser = {
    id: 'rec123',
    fields: {
      Cedula: '123456789',
      Nombre: 'Juan',
      Apellido: 'Pérez',
      Email: 'juan@example.com',
      Telefono: '555-1234',
      Cargo: 'Operador',
      Hash: '$2b$10$mockhash',
      Salt: 'mocksalt',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USE_SECURE_SESSIONS = 'true';
  });

  it('should return 400 for missing credentials', async () => {
    const request = new NextRequest('http://localhost:3000/api/login', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Cédula y contraseña son requeridas');
  });

  it('should return 404 for non-existent user', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ records: [] }),
    });

    const request = new NextRequest('http://localhost:3000/api/login', {
      method: 'POST',
      body: JSON.stringify({ cedula: '123456789', password: 'password' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.message).toBe('Usuario no encontrado');
  });

  it('should return 401 for wrong password', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ records: [mockUser] }),
    });
    mockBcryptCompare.mockResolvedValue(false);

    const request = new NextRequest('http://localhost:3000/api/login', {
      method: 'POST',
      body: JSON.stringify({ cedula: '123456789', password: 'wrongpassword' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.message).toBe('Contraseña incorrecta');
  });

  it('should login successfully and create session', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ records: [mockUser] }),
    });
    mockBcryptCompare.mockResolvedValue(true);
    mockServerSessionManager.createSecureSession.mockResolvedValue();

    const request = new NextRequest('http://localhost:3000/api/login', {
      method: 'POST',
      body: JSON.stringify({ cedula: '123456789', password: 'correctpassword' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.user).toEqual({
      id: 'rec123',
      Cedula: '123456789',
      Nombre: 'Juan',
      Apellido: 'Pérez',
      Email: 'juan@example.com',
      Telefono: '555-1234',
      Cargo: 'Operador',
    });

    expect(mockServerSessionManager.createSecureSession).toHaveBeenCalledWith({
      id: 'rec123',
      Cedula: '123456789',
      Nombre: 'Juan',
      Apellido: 'Pérez',
      Email: 'juan@example.com',
      Telefono: '555-1234',
      Cargo: 'Operador',
    });
  });

  it('should handle Airtable API errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const request = new NextRequest('http://localhost:3000/api/login', {
      method: 'POST',
      body: JSON.stringify({ cedula: '123456789', password: 'password' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.message).toBe('Error al conectar con la base de datos');
  });
});
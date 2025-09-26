// src/lib/__tests__/sessionManager.test.ts
import { SessionManager } from '../sessionManager';

// Mock de cookies
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => Promise.resolve({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

describe('SessionManager', () => {
  const mockUser = {
    id: 'user123',
    Cedula: '123456789',
    Nombre: 'Juan',
    Apellido: 'Pérez',
    Email: 'juan@example.com',
    Telefono: '555-1234',
    Cargo: 'Operador',
  };

  beforeEach(() => {
    // Limpiar localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(() => null),
        setItem: jest.fn(() => null),
        removeItem: jest.fn(() => null),
        clear: jest.fn(() => null),
      },
      writable: true,
    });

    // Reset process.env
    delete process.env.USE_SECURE_SESSIONS;
  });

  describe('with USE_SECURE_SESSIONS=false (legacy mode)', () => {
    beforeEach(() => {
      process.env.USE_SECURE_SESSIONS = 'false';
    });

    it('should create session in localStorage', async () => {
      await SessionManager.createSecureSession(mockUser);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'userSession',
        expect.stringContaining('"user"')
      );
    });

    it('should get session from localStorage', async () => {
      const mockSession = { user: mockUser, loginTime: new Date().toISOString() };
      (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(mockSession));

      const session = await SessionManager.getSession();

      expect(session).toEqual(mockSession);
    });

    it('should destroy session from localStorage', async () => {
      await SessionManager.destroySession();

      expect(localStorage.removeItem).toHaveBeenCalledWith('userSession');
    });
  });

  describe('with USE_SECURE_SESSIONS=true (secure mode)', () => {
    beforeEach(() => {
      process.env.USE_SECURE_SESSIONS = 'true';
    });

    it('should create secure session with cookies', async () => {
      const mockCookies = {
        set: jest.fn(),
      };
      const { cookies } = require('next/headers');
      cookies.mockResolvedValue(mockCookies);

      await SessionManager.createSecureSession(mockUser);

      expect(mockCookies.set).toHaveBeenCalledWith(
        'sirius_session',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: false, // development
          sameSite: 'strict',
        })
      );
    });

    it('should handle session decryption errors gracefully', async () => {
      const mockCookies = {
        get: jest.fn(() => ({ value: 'invalid-base64' })),
      };
      const { cookies } = require('next/headers');
      cookies.mockResolvedValue(mockCookies);

      const session = await SessionManager.getSession();

      expect(session).toBeNull();
    });
  });

  describe('encryption/decryption', () => {
    it('should encrypt and decrypt session correctly', () => {
      const session = { user: mockUser, loginTime: new Date().toISOString() };

      // Access private methods for testing (normally not recommended)
      const encrypted = (SessionManager as any).encryptSession(session);
      const decrypted = (SessionManager as any).decryptSession(encrypted);

      expect(decrypted).toEqual(session);
    });
  });
});
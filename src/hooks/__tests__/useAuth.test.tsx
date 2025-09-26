// src/hooks/__tests__/useAuth.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { SessionManager } from '@/lib/sessionManager';

// Mock SessionManager
jest.mock('@/lib/sessionManager', () => ({
  SessionManager: {
    getSession: jest.fn(),
    createSecureSession: jest.fn(),
    destroySession: jest.fn(),
  },
}));

const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>;

describe('useAuth', () => {
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
    jest.clearAllMocks();
  });

  it('should initialize with loading state', () => {
    mockSessionManager.getSession.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBe(null);
  });

  it('should load authenticated user on mount', async () => {
    const mockSession = {
      user: mockUser,
      loginTime: new Date().toISOString(),
    };
    mockSessionManager.getSession.mockResolvedValue(mockSession);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.loginTime).toEqual(mockSession.loginTime);
  });

  it('should handle login', async () => {
    mockSessionManager.getSession.mockResolvedValue(null);
    mockSessionManager.createSecureSession.mockResolvedValue();

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.login(mockUser);
    });

    expect(mockSessionManager.createSecureSession).toHaveBeenCalledWith(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
  });

  it('should handle logout', async () => {
    const mockSession = {
      user: mockUser,
      loginTime: new Date().toISOString(),
    };
    mockSessionManager.getSession.mockResolvedValue(mockSession);
    mockSessionManager.destroySession.mockResolvedValue();

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockSessionManager.destroySession).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBe(null);
  });

  it('should handle session check errors gracefully', async () => {
    mockSessionManager.getSession.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBe(null);
  });
});
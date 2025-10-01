// src/application/services/__tests__/AuthService.test.ts
import { AuthService } from '../AuthService';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User, UserCredentials } from '../../../domain/entities/User';

// Mock repository
class MockUserRepository implements IUserRepository {
  private users: User[] = [
    {
      id: 'user1',
      cedula: '123456789',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@example.com',
      telefono: '555-1234',
      cargo: 'Operador',
      hash: '$2b$10$mockhash', // Mock bcrypt hash
      salt: 'mocksalt',
    },
  ];

  async findByCedula(cedula: string): Promise<User | null> {
    return this.users.find(u => u.cedula === cedula) || null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }

  async validateCredentials(credentials: UserCredentials): Promise<User | null> {
    const user = await this.findByCedula(credentials.cedula);
    if (user && user.hash) {
      // Simplified validation for testing
      if (credentials.password === 'correctpassword') {
        const { hash, salt, ...userWithoutCredentials } = user;
        return userWithoutCredentials;
      }
    }
    return null;
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    throw new Error('Not implemented');
  }

  async update(id: string, user: Partial<User>): Promise<User | null> {
    throw new Error('Not implemented');
  }

  async delete(id: string): Promise<boolean> {
    throw new Error('Not implemented');
  }
}

describe('AuthService', () => {
  let authService: AuthService;
  let mockRepository: IUserRepository;

  beforeEach(() => {
    mockRepository = new MockUserRepository();
    authService = new AuthService(mockRepository);
  });

  describe('authenticate', () => {
    it('should authenticate valid credentials', async () => {
      const credentials: UserCredentials = {
        cedula: '123456789',
        password: 'correctpassword',
      };

      const result = await authService.authenticate(credentials);

      expect(result).toBeTruthy();
      expect(result?.id).toBe('user1');
      expect(result?.cedula).toBe('123456789');
      expect(result?.nombre).toBe('Juan');
      expect(result?.loginTime).toBeDefined();
      expect(result?.hash).toBeUndefined(); // Should not include credentials
      expect(result?.salt).toBeUndefined();
    });

    it('should return null for invalid credentials', async () => {
      const credentials: UserCredentials = {
        cedula: '123456789',
        password: 'wrongpassword',
      };

      const result = await authService.authenticate(credentials);

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const credentials: UserCredentials = {
        cedula: '999999999',
        password: 'password',
      };

      const result = await authService.authenticate(credentials);

      expect(result).toBeNull();
    });

    it('should handle repository errors', async () => {
      const failingRepository: IUserRepository = {
        ...mockRepository,
        validateCredentials: jest.fn().mockRejectedValue(new Error('DB Error')),
      } as any;

      const failingAuthService = new AuthService(failingRepository);
      const credentials: UserCredentials = {
        cedula: '123456789',
        password: 'password',
      };

      await expect(failingAuthService.authenticate(credentials))
        .rejects.toThrow('Authentication failed');
    });
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      const result = await authService.getUserById('user1');

      expect(result).toBeTruthy();
      expect(result?.id).toBe('user1');
      expect(result?.nombre).toBe('Juan');
    });

    it('should return null for non-existent user', async () => {
      const result = await authService.getUserById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUserByCedula', () => {
    it('should return user by cedula', async () => {
      const result = await authService.getUserByCedula('123456789');

      expect(result).toBeTruthy();
      expect(result?.cedula).toBe('123456789');
      expect(result?.nombre).toBe('Juan');
    });

    it('should return null for non-existent cedula', async () => {
      const result = await authService.getUserByCedula('999999999');

      expect(result).toBeNull();
    });
  });
});
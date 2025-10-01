// src/domain/repositories/__tests__/IUserRepository.test.ts
import { IUserRepository } from '../IUserRepository';
import { User, UserCredentials } from '../../entities/User';

// Mock implementation for testing interfaces
class MockUserRepository implements IUserRepository {
  private users: User[] = [];

  async findByCedula(cedula: string): Promise<User | null> {
    return this.users.find(u => u.cedula === cedula) || null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.find(u => u.id === id) || null;
  }

  async validateCredentials(credentials: UserCredentials): Promise<User | null> {
    const user = this.users.find(u => u.cedula === credentials.cedula);
    if (user && user.hash === `hash_${credentials.password}`) {
      const { hash, salt, ...userWithoutCredentials } = user;
      return userWithoutCredentials;
    }
    return null;
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    const newUser: User = { ...user, id: `user_${Date.now()}` };
    this.users.push(newUser);
    return newUser;
  }

  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return null;
    this.users[index] = { ...this.users[index], ...updates };
    return this.users[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) return false;
    this.users.splice(index, 1);
    return true;
  }
}

describe('IUserRepository Interface', () => {
  let repository: IUserRepository;

  beforeEach(() => {
    repository = new MockUserRepository();
  });

  it('should create and find user by cedula', async () => {
    const userData = {
      cedula: '123456789',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@example.com',
      telefono: '555-1234',
      cargo: 'Operador',
      hash: 'hash_password123',
      salt: 'salt123',
    };

    const created = await repository.create(userData);
    expect(created.id).toBeDefined();
    expect(created.cedula).toBe(userData.cedula);

    const found = await repository.findByCedula('123456789');
    expect(found).toEqual(created);
  });

  it('should validate credentials correctly', async () => {
    const userData = {
      cedula: '123456789',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@example.com',
      telefono: '555-1234',
      cargo: 'Operador',
      hash: 'hash_password123',
      salt: 'salt123',
    };

    await repository.create(userData);

    const validCredentials: UserCredentials = {
      cedula: '123456789',
      password: 'password123',
    };

    const authenticated = await repository.validateCredentials(validCredentials);
    expect(authenticated).toBeTruthy();
    expect(authenticated?.hash).toBeUndefined(); // Should not return credentials
    expect(authenticated?.salt).toBeUndefined();

    const invalidCredentials: UserCredentials = {
      cedula: '123456789',
      password: 'wrongpassword',
    };

    const notAuthenticated = await repository.validateCredentials(invalidCredentials);
    expect(notAuthenticated).toBeNull();
  });

  it('should update user', async () => {
    const userData = {
      cedula: '123456789',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@example.com',
      telefono: '555-1234',
      cargo: 'Operador',
    };

    const created = await repository.create(userData);
    const updated = await repository.update(created.id, { nombre: 'Juan Carlos' });

    expect(updated?.nombre).toBe('Juan Carlos');
    expect(updated?.cedula).toBe('123456789'); // Unchanged
  });

  it('should delete user', async () => {
    const userData = {
      cedula: '123456789',
      nombre: 'Juan',
      apellido: 'Pérez',
      email: 'juan@example.com',
      telefono: '555-1234',
      cargo: 'Operador',
    };

    const created = await repository.create(userData);
    const deleted = await repository.delete(created.id);
    expect(deleted).toBe(true);

    const found = await repository.findById(created.id);
    expect(found).toBeNull();
  });
});
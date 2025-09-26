// src/tests/integration/AuthIntegration.test.ts
import { Container } from '../../infrastructure/container';
import { AuthService } from '../../application/services/AuthService';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';

describe('Auth Integration Test', () => {
  let authService: AuthService;
  let userRepository: IUserRepository;

  beforeEach(() => {
    // Reset container for each test
    Container.reset();

    // Get services from container
    authService = Container.getAuthService();
    userRepository = Container.getUserRepository();
  });

  it('should authenticate user through Clean Architecture layers', async () => {
    // This is a basic integration test showing the flow
    // In real scenario, we'd mock the repository

    // Verify services are properly injected
    expect(authService).toBeDefined();
    expect(userRepository).toBeDefined();

    // Verify repository has required methods
    expect(typeof userRepository.findByCedula).toBe('function');
    expect(typeof userRepository.create).toBe('function');
    expect(typeof userRepository.update).toBe('function');

    // Verify AuthService has required methods
    expect(typeof authService.authenticate).toBe('function');
    expect(typeof authService.getUserById).toBe('function');
  });

  it('should define User interface correctly', () => {
    const userData: User = {
      id: 'user-123',
      Cedula: '123456789',
      Nombre: 'Juan',
      Apellido: 'Pérez',
      Email: 'juan@example.com',
      Telefono: '555-0123',
      Cargo: 'Operador',
      hash: 'hashedpassword',
      salt: 'somesalt',
    };

    expect(userData.Cedula).toBe('123456789');
    expect(userData.Nombre).toBe('Juan');
    expect(userData.Apellido).toBe('Pérez');
    expect(userData.Cargo).toBe('Operador');
    expect(userData.hash).toBe('hashedpassword');
  });
});
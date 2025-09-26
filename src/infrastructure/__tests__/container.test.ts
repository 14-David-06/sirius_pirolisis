// src/infrastructure/__tests__/container.test.ts
import { Container } from '../container';
import { AirtableUserRepository } from '../repositories/AirtableUserRepository';
import { PostgresUserRepository } from '../repositories/PostgresUserRepository';

describe('Container', () => {
  beforeEach(() => {
    Container.reset();
  });

  describe('getUserRepository', () => {
    it('should return AirtableUserRepository by default', () => {
      delete process.env.USE_POSTGRES_REPOSITORY;

      const repository = Container.getUserRepository();

      expect(repository).toBeInstanceOf(AirtableUserRepository);
    });

    it('should return PostgresUserRepository when USE_POSTGRES_REPOSITORY=true', () => {
      // Temporarily set env variable
      const originalEnv = process.env.USE_POSTGRES_REPOSITORY;
      process.env.USE_POSTGRES_REPOSITORY = 'true';

      // Reset container to pick up new env
      Container.reset();

      const repository = Container.getUserRepository();

      expect(repository).toBeInstanceOf(PostgresUserRepository);

      // Restore original env
      process.env.USE_POSTGRES_REPOSITORY = originalEnv;
      Container.reset();
    });

    it('should return the same instance on multiple calls', () => {
      const repository1 = Container.getUserRepository();
      const repository2 = Container.getUserRepository();

      expect(repository1).toBe(repository2);
    });
  });

  describe('getAuthService', () => {
    it('should return AuthService with correct repository', () => {
      const authService = Container.getAuthService();

      expect(authService).toBeDefined();
      expect(authService).toHaveProperty('authenticate');
      expect(authService).toHaveProperty('getUserById');
      expect(authService).toHaveProperty('getUserByCedula');
    });

    it('should return the same instance on multiple calls', () => {
      const service1 = Container.getAuthService();
      const service2 = Container.getAuthService();

      expect(service1).toBe(service2);
    });
  });

  describe('reset', () => {
    it('should reset all instances', () => {
      const repository1 = Container.getUserRepository();
      const service1 = Container.getAuthService();

      Container.reset();

      const repository2 = Container.getUserRepository();
      const service2 = Container.getAuthService();

      expect(repository1).not.toBe(repository2);
      expect(service1).not.toBe(service2);
    });
  });
});
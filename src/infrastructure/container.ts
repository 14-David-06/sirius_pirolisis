// src/infrastructure/container.ts
// Container de inyección de dependencias para la aplicación

import { IUserRepository } from '../domain/repositories/IUserRepository';
import { AuthService } from '../application/services/AuthService';
import { AirtableUserRepository } from './repositories/AirtableUserRepository';
import { PostgresUserRepository } from './repositories/PostgresUserRepository';

// Feature flag para elegir implementación
const USE_POSTGRES = process.env.USE_POSTGRES_REPOSITORY === 'true';

export class Container {
  private static userRepository: IUserRepository | null = null;
  private static authService: AuthService | null = null;

  static getUserRepository(): IUserRepository {
    if (!this.userRepository) {
      this.userRepository = USE_POSTGRES
        ? new PostgresUserRepository()
        : new AirtableUserRepository();
    }
    return this.userRepository;
  }

  static getAuthService(): AuthService {
    if (!this.authService) {
      this.authService = new AuthService(this.getUserRepository());
    }
    return this.authService;
  }

  // Reset para testing
  static reset(): void {
    this.userRepository = null;
    this.authService = null;
  }
}
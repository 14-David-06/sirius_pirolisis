// src/application/services/AuthService.ts
// Servicio de aplicación para lógica de autenticación

import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User, UserCredentials, AuthenticatedUser } from '../../domain/entities/User';
import { LoggerService } from '../../infrastructure/services/LoggerService';

export class AuthService {
  constructor(private userRepository: IUserRepository) {}

  async authenticate(credentials: UserCredentials): Promise<AuthenticatedUser | null> {
    try {
      const user = await this.userRepository.validateCredentials(credentials);
      if (!user) {
        LoggerService.warn('Authentication failed: invalid credentials', { cedula: credentials.cedula });
        return null;
      }

      // Crear usuario autenticado con timestamp
      const authenticatedUser: AuthenticatedUser = {
        ...user,
        loginTime: new Date().toISOString(),
      };

      LoggerService.info('User authenticated successfully', { userId: user.id });
      return authenticatedUser;
    } catch (error) {
      LoggerService.error('Authentication error', error as Error, { cedula: credentials.cedula });
      throw new Error('Authentication failed');
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findById(id);
    } catch (error) {
      LoggerService.error('Error retrieving user by ID', error as Error, { userId: id });
      return null;
    }
  }

  async getUserByCedula(cedula: string): Promise<User | null> {
    try {
      return await this.userRepository.findByCedula(cedula);
    } catch (error) {
      LoggerService.error('Error retrieving user by cedula', error as Error, { cedula });
      return null;
    }
  }
}
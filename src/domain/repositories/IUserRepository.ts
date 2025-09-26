// src/domain/repositories/IUserRepository.ts
// Interfaz de repositorio para operaciones de usuario

import { User, UserCredentials } from '../entities/User';

export interface IUserRepository {
  findByCedula(cedula: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  validateCredentials(credentials: UserCredentials): Promise<User | null>;
  create(user: Omit<User, 'id'>): Promise<User>;
  update(id: string, user: Partial<User>): Promise<User | null>;
  delete(id: string): Promise<boolean>;
}
// src/infrastructure/repositories/PostgresUserRepository.ts
// Adapter placeholder para PostgreSQL + Prisma como implementación de IUserRepository
// TODO: Implementar cuando se migre a Postgres

import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User, UserCredentials } from '../../domain/entities/User';

export class PostgresUserRepository implements IUserRepository {
  async findByCedula(cedula: string): Promise<User | null> {
    // TODO: Implementar con Prisma
    // const user = await prisma.user.findUnique({
    //   where: { cedula }
    // });
    // return user ? this.mapPrismaToUser(user) : null;
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async findById(id: string): Promise<User | null> {
    // TODO: Implementar con Prisma
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async validateCredentials(credentials: UserCredentials): Promise<User | null> {
    // TODO: Implementar con Prisma + bcrypt
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    // TODO: Implementar con Prisma
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async update(id: string, user: Partial<User>): Promise<User | null> {
    // TODO: Implementar con Prisma
    throw new Error('PostgresUserRepository not implemented yet');
  }

  async delete(id: string): Promise<boolean> {
    // TODO: Implementar con Prisma
    throw new Error('PostgresUserRepository not implemented yet');
  }

  private mapPrismaToUser(prismaUser: any): User {
    // TODO: Mapear de Prisma model a domain entity
    return {
      id: prismaUser.id,
      cedula: prismaUser.cedula,
      nombre: prismaUser.nombre,
      apellido: prismaUser.apellido,
      email: prismaUser.email,
      telefono: prismaUser.telefono,
      cargo: prismaUser.cargo,
      hash: prismaUser.hash,
      salt: prismaUser.salt,
    };
  }
}
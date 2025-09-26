// src/infrastructure/repositories/AirtableUserRepository.ts
// Adapter para Airtable como implementación de IUserRepository

import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User, UserCredentials } from '../../domain/entities/User';
import { config } from '../../lib/config';
import bcrypt from 'bcryptjs';

export class AirtableUserRepository implements IUserRepository {
  private readonly tableName = config.airtable.tableName;
  private readonly baseId = config.airtable.baseId;
  private readonly token = config.airtable.token;

  async findByCedula(cedula: string): Promise<User | null> {
    try {
      const filterFormula = encodeURIComponent(`{Cedula}="${cedula}"`);
      const url = `https://api.airtable.com/v0/${this.baseId}/${this.tableName}?filterByFormula=${filterFormula}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.records || data.records.length === 0) {
        return null;
      }

      const record = data.records[0];
      return this.mapAirtableRecordToUser(record);
    } catch (error) {
      console.error('Error in AirtableUserRepository.findByCedula:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      const url = `https://api.airtable.com/v0/${this.baseId}/${this.tableName}/${id}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Airtable API error: ${response.status}`);
      }

      const record = await response.json();
      return this.mapAirtableRecordToUser(record);
    } catch (error) {
      console.error('Error in AirtableUserRepository.findById:', error);
      throw error;
    }
  }

  async validateCredentials(credentials: UserCredentials): Promise<User | null> {
    try {
      const user = await this.findByCedula(credentials.cedula);
      if (!user || !user.hash) {
        return null;
      }

      const isValidPassword = await bcrypt.compare(credentials.password, user.hash);
      if (!isValidPassword) {
        return null;
      }

      // No devolver hash/salt en el resultado
      const { hash, salt, ...userWithoutCredentials } = user;
      return userWithoutCredentials;
    } catch (error) {
      console.error('Error in AirtableUserRepository.validateCredentials:', error);
      throw error;
    }
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    try {
      const fields = {
        Cedula: user.cedula,
        Nombre: user.nombre,
        Apellido: user.apellido,
        Email: user.email,
        Telefono: user.telefono,
        Cargo: user.cargo,
        Hash: user.hash,
        Salt: user.salt,
      };

      const url = `https://api.airtable.com/v0/${this.baseId}/${this.tableName}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status}`);
      }

      const record = await response.json();
      return this.mapAirtableRecordToUser(record);
    } catch (error) {
      console.error('Error in AirtableUserRepository.create:', error);
      throw error;
    }
  }

  async update(id: string, user: Partial<User>): Promise<User | null> {
    try {
      const fields: any = {};
      if (user.cedula) fields.Cedula = user.cedula;
      if (user.nombre) fields.Nombre = user.nombre;
      if (user.apellido) fields.Apellido = user.apellido;
      if (user.email) fields.Email = user.email;
      if (user.telefono) fields.Telefono = user.telefono;
      if (user.cargo) fields.Cargo = user.cargo;
      if (user.hash) fields.Hash = user.hash;
      if (user.salt) fields.Salt = user.salt;

      const url = `https://api.airtable.com/v0/${this.baseId}/${this.tableName}/${id}`;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Airtable API error: ${response.status}`);
      }

      const record = await response.json();
      return this.mapAirtableRecordToUser(record);
    } catch (error) {
      console.error('Error in AirtableUserRepository.update:', error);
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const url = `https://api.airtable.com/v0/${this.baseId}/${this.tableName}/${id}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return false;
        }
        throw new Error(`Airtable API error: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Error in AirtableUserRepository.delete:', error);
      throw error;
    }
  }

  private mapAirtableRecordToUser(record: any): User {
    return {
      id: record.id,
      cedula: record.fields.Cedula || '',
      nombre: record.fields.Nombre || '',
      apellido: record.fields.Apellido || '',
      email: record.fields.Email || '',
      telefono: record.fields.Telefono || '',
      cargo: record.fields.Cargo || '',
      hash: record.fields.Hash,
      salt: record.fields.Salt,
    };
  }
}
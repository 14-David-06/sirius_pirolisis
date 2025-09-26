// src/domain/entities/User.ts
// Entidad de dominio para Usuario

export interface User {
  id: string;
  cedula: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  cargo: string;
  hash?: string; // Solo para autenticación
  salt?: string; // Solo para autenticación
}

export interface UserCredentials {
  cedula: string;
  password: string;
}

export interface AuthenticatedUser extends User {
  loginTime: string;
}
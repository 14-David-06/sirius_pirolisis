// src/domain/entities/Aforo.ts
// Entidad de aforo operacional — medición puntual de producción durante un turno

import { z } from 'zod';

export const CreateAforoSchema = z.object({
  turnoId: z.string().min(1, 'El ID del turno es requerido'),
  hertzTolva: z.number().positive('Los Hertz de la tolva deben ser positivos'),
  alimentacionBiomasaMinuto: z.number().positive('La alimentación de biomasa debe ser positiva'),
  produccionBiocharMinuto: z.number().nonnegative('La producción de biochar no puede ser negativa'),
});

export type CreateAforoInput = z.infer<typeof CreateAforoSchema>;

export interface Aforo {
  id: string;
  fechaHoraRegistro: string;
  turnoId: string;
  hertzTolva: number;
  alimentacionBiomasaMinuto: number;
  produccionBiocharMinuto: number;
  rendimientoInstantaneo: number;
  alimentacionBiomasaHora: number;
  produccionBiocharHora: number;
  realizaRegistro: string;
}

export type TipoApertura = 'arranque' | 'continuidad' | 'mantenimiento';

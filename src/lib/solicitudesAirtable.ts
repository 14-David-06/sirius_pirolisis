// src/lib/solicitudesAirtable.ts
// Base y tablas de Novedades Nómina para @sirius/solicitudes.
//
// El paquete leería las tablas de sus propias variables de entorno
// (AIRTABLE_TABLE_SOLICITUD_*), pero PiroliApp identifica cada tabla por su ID
// (`tblXXX`) desde `config.ts`, que es la regla del repositorio: ningún ID de
// Airtable en el fuente. Pasárselas explícitas evita además depender de que
// nadie renombre una tabla en la base compartida.

import { config } from './config';
import type { AirtableConfig } from '@sirius/solicitudes/infra';

export const solicitudesAirtable: AirtableConfig = {
  // Si faltan, el paquete lanza en el request con un mensaje que nombra la
  // variable: no se valida aquí para no tumbar el build donde el entorno no está.
  baseId: config.airtable.novedadesNominaBaseId!,
  apiKey: config.airtable.novedadesNominaToken!,
  tablas: {
    permiso: config.airtable.novedadesNominaPermisosTable,
    vacaciones: config.airtable.novedadesNominaVacacionesTable,
    novedades: config.airtable.novedadesNominaReportesTable,
    diasSirianos: config.airtable.novedadesNominaDiasSirianosTable,
  },
};

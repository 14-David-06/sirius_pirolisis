// src/lib/solicitudesAuth.ts
// Cómo resuelve PiroliApp la sesión que @sirius/solicitudes pide inyectar.
//
// El paquete no sabe nada del sistema de auth de la app: solo pide idCore,
// nombre y cédula. `idPersonalCore` (SIRIUS-PER-XXXX, de Nomina Core) es la FK
// con la que se filtran las tablas de solicitudes; sin él no hay a quién
// atribuir la solicitud, así que se devuelve null y el handler responde 401.

import { ServerSessionManager } from "./serverSession";
import type { ResolvePayload } from "@sirius/solicitudes/server";

export const resolvePayload: ResolvePayload = async () => {
  const session = await ServerSessionManager.getSession();
  if (!session) return null;

  const { Nombre, Apellido, Cedula, idPersonalCore } = session.user;
  if (!idPersonalCore) return null;

  return {
    idCore: idPersonalCore,
    nombre: `${Nombre} ${Apellido}`.trim(),
    cedula: Cedula,
  };
};

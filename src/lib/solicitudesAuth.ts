import { ServerSessionManager } from "./serverSession";
import type { ResolvePayload } from "@sirius/solicitudes";

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

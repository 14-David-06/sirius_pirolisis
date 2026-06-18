import { createPermisoHandlers } from "@sirius/solicitudes";
import { resolvePayload } from "@/lib/solicitudesAuth";

export const { GET, POST } = createPermisoHandlers(resolvePayload);

import { createVacacionesHandlers } from "@sirius/solicitudes";
import { resolvePayload } from "@/lib/solicitudesAuth";

export const { GET, POST } = createVacacionesHandlers(resolvePayload);

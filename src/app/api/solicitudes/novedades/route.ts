import { createNovedadesHandlers } from "@sirius/solicitudes";
import { resolvePayload } from "@/lib/solicitudesAuth";

export const { GET, POST } = createNovedadesHandlers(resolvePayload);

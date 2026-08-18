import { createVacacionesHandlers } from "@sirius/solicitudes/server";
import { resolvePayload } from "@/lib/solicitudesAuth";
import { solicitudesInfra } from "@/lib/solicitudesInfra";
import { solicitudesAirtable } from "@/lib/solicitudesAirtable";

export const { GET, POST } = createVacacionesHandlers({
  resolvePayload,
  infra: solicitudesInfra,
  airtable: solicitudesAirtable,
});

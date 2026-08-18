// Las novedades de nómina son un registro informativo: no llevan firma ni
// documento, así que este handler no necesita el adaptador de almacenamiento.
import { createNovedadesHandlers } from "@sirius/solicitudes/server";
import { resolvePayload } from "@/lib/solicitudesAuth";
import { solicitudesAirtable } from "@/lib/solicitudesAirtable";

export const { GET, POST } = createNovedadesHandlers({
  resolvePayload,
  airtable: solicitudesAirtable,
});

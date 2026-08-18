import { redirect } from "next/navigation";
import { SolicitudesOverview } from "@sirius/solicitudes";
import { ServerSessionManager } from "@/lib/serverSession";
import { solicitudesAirtable } from "@/lib/solicitudesAirtable";
import { SolicitudesShell } from "@/components/SolicitudesShell";

/**
 * Depende de la cookie de sesión, así que nunca se prerenderiza. Sin esto Next lo
 * intenta en el build y `ServerSessionManager.getSession()` se traga el error de
 * uso dinámico en su `catch`, dejando un "Error decrypting session" que no es uno.
 */
export const dynamic = "force-dynamic";

/**
 * Historial y accesos del colaborador. El overview lee las tres tablas por su
 * cuenta, así que recibe la misma config de Airtable que los handlers: apuntarlo
 * a otras tablas dejaría el historial siempre vacío.
 */
export default async function SolicitudesPage() {
  const session = await ServerSessionManager.getSession();
  const idCore = session?.user.idPersonalCore;
  if (!session || !idCore) redirect("/login");

  const nombre = `${session.user.Nombre} ${session.user.Apellido}`.trim();

  return (
    <SolicitudesShell>
      <SolicitudesOverview
        idCore={idCore}
        nombre={nombre}
        basePath="/solicitudes"
        airtable={solicitudesAirtable}
      />
    </SolicitudesShell>
  );
}

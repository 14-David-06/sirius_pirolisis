"use client";

import { NovedadesForm } from "@sirius/solicitudes";
import { SolicitudesShell } from "@/components/SolicitudesShell";

export default function NovedadesPage() {
  return (
    <SolicitudesShell>
      <NovedadesForm basePath="/solicitudes" />
    </SolicitudesShell>
  );
}

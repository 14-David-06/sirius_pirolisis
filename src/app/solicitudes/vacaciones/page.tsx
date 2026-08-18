"use client";

import { VacacionesForm } from "@sirius/solicitudes";
import { SolicitudesShell } from "@/components/SolicitudesShell";

export default function VacacionesPage() {
  return (
    <SolicitudesShell>
      <VacacionesForm basePath="/solicitudes" />
    </SolicitudesShell>
  );
}

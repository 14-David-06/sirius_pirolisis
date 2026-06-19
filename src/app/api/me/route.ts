import { NextRequest, NextResponse } from "next/server";
import { ServerSessionManager } from "@/lib/serverSession";

export async function GET(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { Nombre, Apellido, Cedula, Cargo, idPersonalCore } = session.user;
  return NextResponse.json({
    nombre: `${Nombre} ${Apellido}`.trim(),
    cedula: Cedula,
    idCore: idPersonalCore ?? "",
    cargo: Cargo,
  });
}

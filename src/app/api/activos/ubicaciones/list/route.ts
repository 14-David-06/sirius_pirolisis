import { NextResponse } from 'next/server';
import { ActivosError, listarUbicaciones } from '@/lib/activos.server';

/** GET /api/activos/ubicaciones/list — catálogo de ubicaciones activas. */
export async function GET() {
  try {
    const ubicaciones = await listarUbicaciones();
    return NextResponse.json(
      { success: true, data: ubicaciones, total: ubicaciones.length },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      return NextResponse.json(
        { success: false, error: err.message, details: err.details },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API ubicaciones/list:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

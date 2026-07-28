import { NextResponse } from 'next/server';
import { ActivosError, listarTipos } from '@/lib/activos.server';

/**
 * GET /api/activos/tipos-activo/list — catálogo de tipos de activo.
 *
 * El campo `Descripción` de la tabla es de tipo `aiText`, así que Airtable lo
 * devuelve como `{ state, value, isStale }`; `normalizarTipo` lo aplana antes de
 * salir. (Ese objeto era el origen de los "wrappers seguros" que había en los
 * selectores: no era un problema de React sino del tipo de campo.)
 */
export async function GET() {
  try {
    const tipos = await listarTipos();
    return NextResponse.json({ success: true, data: tipos, total: tipos.length }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      return NextResponse.json(
        { success: false, error: err.message, details: err.details },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API tipos-activo/list:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

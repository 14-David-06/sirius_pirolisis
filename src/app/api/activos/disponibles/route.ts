import { NextRequest, NextResponse } from 'next/server';
import { ActivosError, listarActivos } from '@/lib/activos.server';

/**
 * GET /api/activos/disponibles — activos sin responsable y en estado usable.
 *
 * Filtra en memoria sobre el listado normalizado en vez de con
 * `filterByFormula`: así "disponible" significa exactamente lo mismo aquí, en
 * las estadísticas y en la UI. Acepta `categoria` y `ubicacion` (por nombre).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoria = searchParams.get('categoria');
    const ubicacion = searchParams.get('ubicacion');

    const activos = await listarActivos();

    const disponibles = activos.filter((activo) => {
      const f = activo.fields;
      if (f.asignado) return false;
      if (f.estado !== 'Operativo' && f.estado !== 'Disponible en Almacén') return false;
      if (categoria && !(f.categorias || []).includes(categoria)) return false;
      if (ubicacion && f.ubicacion !== ubicacion) return false;
      return true;
    });

    return NextResponse.json(
      { success: true, records: disponibles, data: disponibles, total: disponibles.length },
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
    console.error('❌ Error en API activos/disponibles:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

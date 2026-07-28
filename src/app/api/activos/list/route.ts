import { NextResponse } from 'next/server';
import { ActivosError, listarActivos } from '@/lib/activos.server';

/**
 * GET /api/activos/list — todos los activos con los links ya resueltos.
 *
 * Devuelve el inventario completo en una sola llamada y sin `filterByFormula`:
 * el filtrado y la búsqueda ocurren en memoria en `useActivos`, así cambiar un
 * filtro es instantáneo y no dispara una consulta a Airtable por cada cambio.
 */
export async function GET() {
  try {
    const records = await listarActivos();
    return NextResponse.json({ records, total: records.length }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

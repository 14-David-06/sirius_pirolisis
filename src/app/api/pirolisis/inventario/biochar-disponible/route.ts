import { NextResponse } from 'next/server';
import { resolverBiocharDisponible } from '../../../../../lib/baches-biochar';

/**
 * GET /api/pirolisis/inventario/biochar-disponible
 *
 * El biochar seco disponible, con su fuente y el contraste entre las dos vistas
 * del mismo inventario (Sirius Insumos Core vs. la fórmula de los baches).
 *
 * Existe para las pantallas que solo necesitan el número y no el desglose por
 * bache: el Dashboard de Producción lo sumaba en el cliente desde la lista de
 * baches, que era la fuente vieja. Cualquier pantalla nueva que muestre "biochar
 * en stock" debe consumir este endpoint y no recalcular la suma.
 */
export async function GET() {
  try {
    const biochar = await resolverBiocharDisponible();
    return NextResponse.json(biochar, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET inventario/biochar-disponible:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

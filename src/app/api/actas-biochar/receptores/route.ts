import { NextResponse } from 'next/server';
import { listarReceptores } from '@/lib/actas-biochar';

/**
 * GET /api/actas-biochar/receptores
 *
 * Receptores de biochar sin contraprestación comercial (universidades, ONG,
 * agricultores). Alimenta el selector del formulario del acta para poder REUSAR un
 * receptor: es lo que permite consolidar trazabilidad por institución cuando la
 * misma recibe varias entregas.
 *
 * No son clientes de Sirius Clients Core a propósito: una donación no genera pedido
 * ni factura, y meterlos allí los volvería clientes en los reportes de venta del
 * ecosistema.
 */
export async function GET() {
  try {
    return NextResponse.json({ success: true, receptores: await listarReceptores() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [actas-biochar/receptores] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

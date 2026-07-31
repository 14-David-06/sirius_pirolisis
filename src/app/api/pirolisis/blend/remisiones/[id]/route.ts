import { NextResponse } from 'next/server';
import { resolverRemision, serializarRemision } from '../../../../../../lib/blend-remisiones-core';

// GET /api/pirolisis/blend/remisiones/[id]
//
// `id` acepta el record ID (`recXXX`) o el código legible (`SIRIUS-REM-XXXX`), como
// en el flujo del laboratorio: los enlaces internos llevan el record ID y los que
// se comparten con el cliente llevan el código.
//
// ⚠️ MIGRACIÓN 2026-07-30: lee de Sirius Remisiones Core, no de `blend_remisiones`.
// Se quitó el PATCH genérico de `fields`: la remisión del Core solo se toca por los
// caminos con reglas (`/estado`, `/receptor`, `/generar-pdf`), porque la composición
// y el CO₂ ahora son DERIVADOS del lote y escribirlos a mano los haría divergir.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const remision = await resolverRemision(id);
    if (!remision) {
      return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
    }
    return NextResponse.json({ record: serializarRemision(remision) }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/remisiones/[id]:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

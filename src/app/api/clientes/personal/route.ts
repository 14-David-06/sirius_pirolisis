import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { assertCodigoSimbolico } from '@/lib/airtable-escape';
import { listarPersonalCliente } from '@/lib/personal-cliente-core';

/**
 * GET /api/clientes/personal?cliente=CL-XXXX
 *
 * El personal activo del cliente en Sirius Clients Core, para elegir quién se
 * lleva un despacho. Exige sesión: devuelve cédulas y teléfonos de terceros.
 */
export async function GET(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const cliente = request.nextUrl.searchParams.get('cliente') ?? '';
  try {
    assertCodigoSimbolico(cliente, 'cliente');
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  try {
    const personal = await listarPersonalCliente(cliente);
    if (personal === null) {
      return NextResponse.json(
        { error: 'Sirius Clients Core no está configurado' },
        { status: 503 }
      );
    }
    return NextResponse.json({ personal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET clientes/personal:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

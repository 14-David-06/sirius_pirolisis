import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { assertCodigoSimbolico } from '@/lib/airtable-escape';
import { crearAreaCliente, listarAreasCliente } from '@/lib/areas-cliente-core';

/**
 * GET  /api/clientes/areas?cliente=CL-XXXX → áreas activas del cliente.
 * POST /api/clientes/areas { cliente, nombre } → crea el área (o devuelve la que
 *      ya tenga ese nombre).
 *
 * Se crean desde el despacho porque es ahí donde el operador se entera de que
 * falta una: mandarlo a Airtable a registrarla es como termina escrita a mano en
 * las observaciones.
 */
function clienteValido(cliente: string): NextResponse | null {
  try {
    assertCodigoSimbolico(cliente, 'cliente');
    return null;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const cliente = request.nextUrl.searchParams.get('cliente') ?? '';
  const invalido = clienteValido(cliente);
  if (invalido) return invalido;

  try {
    const areas = await listarAreasCliente(cliente);
    if (areas === null) {
      return NextResponse.json({ error: 'Sirius Clients Core no está configurado' }, { status: 503 });
    }
    return NextResponse.json({ areas });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET clientes/areas:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cliente = String(body?.cliente ?? '');
  const nombre = String(body?.nombre ?? '').trim();
  const invalido = clienteValido(cliente);
  if (invalido) return invalido;
  if (!nombre || nombre.length > 80) {
    return NextResponse.json({ error: 'Nombre de área inválido' }, { status: 400 });
  }

  try {
    const area = await crearAreaCliente(cliente, nombre, session.user.idPersonalCore);
    return NextResponse.json({ area });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST clientes/areas:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { assertCodigoSimbolico } from '@/lib/airtable-escape';
import { listarPersonalCliente } from '@/lib/personal-cliente-core';
import { listarPersonasAnteriores, type PersonaAnterior } from '@/lib/quien-recoge';
import { sanearError } from '@/lib/log-seguro';

/**
 * GET /api/clientes/personal?cliente=CL-XXXX
 *
 * El personal activo del cliente en Sirius Clients Core, para elegir quién se
 * lleva un despacho, y en `anteriores` quienes ya llevaron o recibieron una
 * remisión de ese cliente sin estar en su personal (ver `quien-recoge.ts`).
 * Exige sesión: devuelve cédulas y teléfonos de terceros.
 *
 * `anteriores` es best-effort: si Remisiones Core no responde, la lista del Core
 * sigue sirviendo y `errorAnteriores` lo dice. Al revés no: sin Clients Core no
 * se sabe a quién excluir, y el 503 de siempre se mantiene.
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
    let anteriores: PersonaAnterior[] = [];
    let errorAnteriores: string | undefined;
    try {
      anteriores = await listarPersonasAnteriores(
        cliente,
        personal.map((p) => p.cedula)
      );
    } catch (err) {
      errorAnteriores = 'No se pudieron leer las personas de remisiones anteriores.';
      console.error('⚠️ clientes/personal: remisiones anteriores:', sanearError(err));
    }
    return NextResponse.json({ personal, anteriores, errorAnteriores });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET clientes/personal:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

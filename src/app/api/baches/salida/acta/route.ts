import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { config } from '@/lib/config';
import { ActaNoEncontrada, guardarReceptorEntrega, leerActaEntrega } from '@/lib/acta-entrega-biochar';
import { generarActaEntregaPdf } from '@/lib/acta-entrega-biochar-pdf';
import { receptorIncompleto, type ReceptorEntrega } from '@/lib/salida-bache.constants';

/**
 * Acta de entrega de una salida de biochar sin contraprestación
 * (`SAL-ENT-<fecha>-S-00XXX`). Ver `src/lib/acta-entrega-biochar.ts`.
 *
 *   GET ?referencia=…               → el PDF, armado de la remisión de la salida
 *   GET ?referencia=…&formato=json  → los datos, para el formulario
 *   PUT { referencia, receptor }    → guarda o corrige quién recibe
 *
 * Exige sesión: el acta lleva nombre, cédula y placa de un tercero.
 */
export async function GET(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const referencia = request.nextUrl.searchParams.get('referencia')?.trim() ?? '';
  try {
    const acta = await leerActaEntrega(referencia);

    if (request.nextUrl.searchParams.get('formato') === 'json') {
      return NextResponse.json({ acta });
    }

    // Sin quién recibe el acta no documenta nada: se pide completarla primero en
    // vez de imprimir un papel con el receptor en blanco.
    const falta = receptorIncompleto(acta.receptor);
    if (falta) return NextResponse.json({ error: falta }, { status: 409 });

    const pdf = await generarActaEntregaPdf({
      ...acta,
      co2Kg: Number((acta.kg * config.carbon.factorSecuestroCo2).toFixed(2)),
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Acta-${acta.referencia}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return responderError(err, 'GET');
  }
}

export async function PUT(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { referencia?: unknown; receptor?: Partial<ReceptorEntrega> }
    | null;
  const referencia = typeof body?.referencia === 'string' ? body.referencia.trim() : '';
  const falta = receptorIncompleto(body?.receptor);
  if (falta) return NextResponse.json({ error: falta }, { status: 400 });

  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const r = body!.receptor!;
  try {
    const acta = await guardarReceptorEntrega(referencia, {
      nombre: String(r.nombre).trim(),
      cedula: String(r.cedula).trim(),
      vehiculo: texto(r.vehiculo),
      color: texto(r.color),
      placa: texto(r.placa),
    });
    return NextResponse.json({ acta });
  } catch (err) {
    return responderError(err, 'PUT');
  }
}

function responderError(err: unknown, metodo: string) {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ActaNoEncontrada) return NextResponse.json({ error: message }, { status: 404 });
  console.error(`❌ [baches/salida/acta ${metodo}]`, message);
  return NextResponse.json({ error: message }, { status: 500 });
}

import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { despacharPedidoBlend, DespachoInvalido } from '@/lib/despacho-blend';
import { validarFormaDespacho } from '@/lib/despacho-biochar.calculos';
import { serializarRemision } from '@/lib/blend-remisiones-core';
import { CandadoOcupado } from '@/lib/candado';
import { qrDataUrl } from '@/lib/recepcion/qr';
import { sanearError } from '@/lib/log-seguro';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/pirolisis/pedidos/despachar
 *
 * Despacha un pedido de Biochar Blend: produce el Blend que falte con el biochar
 * y el abono de bodega, emite la remisión en Sirius Remisiones Core y descuenta el
 * producto del libro mayor (ver `despacharPedidoBlend()`).
 *
 * Exige sesión: emite un documento comercial y, desde el 2026-10-21, el enlace con
 * el que el cliente confirma la recepción. Antes respondía a cualquiera.
 *
 * `lotes` ([códigos]) o `lote` son opcionales: sin ellos, el despacho usa el
 * producto que ya exista y produce lo que falte. Con ellos, sale de esos lotes
 * —una remisión por el total, una Salida por lote— o no sale.
 *
 * `baches` ([{ codigo, kg }]) es REQUERIDO cuando hay que producir: de qué bache
 * salió cada kg es la trazabilidad que sostiene la contabilidad de carbono.
 *
 * `dryRun: true` devuelve el plan sin escribir nada, con `plan.idDespacho`. La
 * confirmación reenvía esa llave: si ya hay una remisión con ella, responde
 * `yaExistia` sin emitir otra (un doble clic no despacha dos veces).
 *
 * Códigos:
 *   200 — despachado (o plan, si fue ensayo)
 *   207 — la remisión se emitió pero un paso best-effort falló (inventario, estado
 *         del pedido, enlace o documento); los `steps` dicen cuál.
 *   400 — cuerpo mal formado.
 *   401 — sin sesión.
 *   409 — no se despachó nada: pedido cerrado, más kg de los que debe, o no hay
 *         Blend ni con qué producirlo.
 *   500 — falló un paso crítico; `error` lo dice en palabras.
 *   503 — otro despacho de Blend sigue en curso en esta instancia (`CandadoOcupado`).
 */
export async function POST(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Sesión vencida: inicie sesión de nuevo.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'El cuerpo no es JSON válido.' }, { status: 400 });
  }

  const forma = validarFormaDespacho(body, { exigirReparto: false });
  if (!forma.ok) return NextResponse.json({ success: false, error: forma.error }, { status: 400 });
  const d = forma.datos;
  const realizaRegistro = `${session.user.Nombre ?? ''} ${session.user.Apellido ?? ''}`.trim();

  try {
    const resultado = await despacharPedidoBlend(
      {
        idPedido: d.idPedido,
        lote: typeof body.lote === 'string' && body.lote.trim() ? body.lote.trim() : undefined,
        lotes: Array.isArray(body.lotes) ? body.lotes.map(String).filter(Boolean) : undefined,
        kg: d.kg,
        baches: Array.isArray(body.baches)
          ? (body.baches as Array<Record<string, unknown>>).map((b) => ({
              codigo: String(b?.codigo ?? ''),
              kg: Number(b?.kg),
            }))
          : undefined,
        responsableEntrega: d.responsableEntrega,
        realizaRegistro: realizaRegistro || undefined,
        transportista: d.transportista,
        observaciones: d.observaciones,
        idAreaCliente: d.idAreaCliente,
        fechaDespacho: d.fechaDespacho,
        idDespacho: d.idDespacho,
      },
      { dryRun: d.dryRun }
    );

    if (d.dryRun) {
      return NextResponse.json({ success: true, dryRun: true, plan: resultado.plan }, { status: 200 });
    }

    const steps = resultado.steps ?? [];
    const fallidos = steps.filter((s) => !s.ok && !s.skipped);
    const codigo = resultado.remision?.codigo ?? '';
    const recepcion = await recepcionDe(resultado.enlace ?? null);
    const criticoFallido = steps.find((s) => !s.ok && !s.skipped);

    return NextResponse.json(
      {
        success: resultado.ok,
        message: resultado.ok
          ? resultado.yaExistia
            ? `La remisión ${codigo} ya estaba emitida para este despacho: no se emitió otra.`
            : `Remisión ${codigo} emitida por ${resultado.plan.kg} kg ` +
              `${resultado.plan.reparto.length > 1 ? 'de los lotes' : 'del lote'} ${resultado.plan.lote}` +
              `${resultado.plan.origen === 'produccion' ? ' (producido en este despacho)' : ''}.`
          : 'El despacho no se pudo completar.',
        plan: resultado.plan,
        yaExistia: resultado.yaExistia || undefined,
        remision: resultado.remision ? serializarRemision(resultado.remision) : null,
        recepcion,
        steps,
        ...(resultado.ok ? {} : { error: criticoFallido?.error ?? 'Falló un paso crítico del despacho.' }),
      },
      // Crítico fallido → 500; best-effort fallido con remisión emitida → 207.
      { status: resultado.ok ? (fallidos.length ? 207 : 200) : 500 }
    );
  } catch (err: unknown) {
    if (err instanceof DespachoInvalido) {
      // 409 y no 400: los datos venían bien formados; lo que no cuadra es el
      // estado del inventario o del pedido, y eso el operador lo puede resolver.
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    if (err instanceof CandadoOcupado) {
      return NextResponse.json({ success: false, error: err.message }, { status: 503 });
    }
    const message = sanearError(err);
    console.error('❌ Error en POST pirolisis/pedidos/despachar:', message);
    return NextResponse.json({ success: false, error: `No se pudo despachar: ${message}` }, { status: 500 });
  }
}

/** El enlace con su QR para mostrarlo en la pantalla, sin otra petición. */
async function recepcionDe(enlace: { url: string; venceEl: string } | null) {
  if (!enlace) return null;
  const qr = await qrDataUrl(enlace.url).catch(() => null);
  return { url: enlace.url, venceEl: enlace.venceEl, qrDataUrl: qr };
}

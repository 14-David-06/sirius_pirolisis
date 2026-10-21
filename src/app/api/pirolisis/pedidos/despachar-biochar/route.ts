import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import {
  despacharPedidoBiochar,
  DespachoBiocharInvalido,
  DespachoEnCurso,
  LecturaCoreFallida,
} from '@/lib/despacho-biochar';
import { validarFormaDespacho } from '@/lib/despacho-biochar.calculos';
import { serializarRemision } from '@/lib/blend-remisiones-core';
import { CandadoOcupado } from '@/lib/candado';
import { qrDataUrl } from '@/lib/recepcion/qr';
import { sanearError } from '@/lib/log-seguro';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/pirolisis/pedidos/despachar-biochar
 *
 * Despacho COMERCIAL de biochar puro (`SIRIUS-PRODUCT-0015`) contra un pedido de
 * Sirius Pedidos Core. El operador digita el TOTAL; la app lo reparte FIFO por
 * bache contra lo despachable del Core (ver `despacharPedidoBiochar()`).
 *
 *   { dryRun: true, idPedido, kg?, responsableEntrega, transportista?, idAreaCliente?,
 *     fechaDespacho?, observaciones? }
 *     → 200 { success, dryRun: true, plan }        (no escribe nada; trae plan.idDespacho)
 *
 *   { dryRun: false, …lo mismo, idDespacho: plan.idDespacho, reparto: plan.reparto }
 *     → 200 | 207 | 500 { success, message, plan, yaExistia?, remision, recepcion, steps, error? }
 *
 * La confirmación escribe EXACTAMENTE el reparto del ensayo: recalcularlo caería
 * en otros baches si el saldo se movió. Si ya no cabe, 409 y se ensaya de nuevo.
 * Confirmar dos veces con la misma llave no emite otra remisión (`yaExistia`); si
 * la de la llave sigue en Borrador, 409 con `despachoIncompleto` y se termina
 * desde `/completar`.
 *
 * Códigos: 400 forma · 401 sin sesión · 409 `DespachoBiocharInvalido` (pedido
 * cerrado o sin línea 0015, kg de más, reparto que cambió, área ajena, Borrador
 * pendiente —también el de un reintento con la misma llave— con
 * `despachoIncompleto`; remisión de la llave anulada) · 503 `LecturaCoreFallida`,
 * falta configuración u otro despacho en curso (`DespachoEnCurso`: otra instancia
 * ganó la llave; trae `codigoRemision`) · 500 falló un paso crítico DESPUÉS de
 * emitir (la remisión queda en Borrador, viene `codigoRemision`, y se completa
 * desde `/completar`).
 */
export async function POST(request: NextRequest) {
  const session = await ServerSessionManager.getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Sesión vencida: inicie sesión de nuevo.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'El cuerpo no es JSON válido.' }, { status: 400 });
  }

  const forma = validarFormaDespacho(body, { exigirReparto: true });
  if (!forma.ok) return NextResponse.json({ success: false, error: forma.error }, { status: 400 });
  const d = forma.datos;
  const realizaRegistro = `${session.user.Nombre ?? ''} ${session.user.Apellido ?? ''}`.trim() || d.responsableEntrega;

  try {
    const resultado = await despacharPedidoBiochar(
      {
        idPedido: d.idPedido,
        kg: d.kg,
        reparto: d.reparto,
        idDespacho: d.idDespacho,
        responsableEntrega: d.responsableEntrega,
        realizaRegistro,
        transportista: d.transportista,
        idAreaCliente: d.idAreaCliente,
        fechaDespacho: d.fechaDespacho,
        observaciones: d.observaciones,
      },
      { dryRun: d.dryRun }
    );

    if (d.dryRun) {
      return NextResponse.json({ success: true, dryRun: true, plan: resultado.plan }, { status: 200 });
    }

    const fallidos = resultado.steps.filter((s) => !s.ok && !s.skipped);
    const codigo = resultado.remision?.codigo ?? resultado.codigoRemision ?? '';
    const recepcion = resultado.enlace
      ? {
          url: resultado.enlace.url,
          venceEl: resultado.enlace.venceEl,
          qrDataUrl: await qrDataUrl(resultado.enlace.url).catch(() => null),
        }
      : null;

    return NextResponse.json(
      {
        success: resultado.ok,
        message: resultado.ok
          ? resultado.yaExistia
            ? `El despacho ya tenía la remisión ${codigo}: se completó lo que faltaba, sin emitir otra.`
            : `Remisión ${codigo} emitida por ${resultado.plan.kg} kg de biochar de ${resultado.plan.reparto.length} bache(s).`
          : codigo
            ? `El despacho quedó incompleto: la remisión ${codigo} sigue en Borrador. Use «Completar» para terminarlo.`
            : 'El despacho no se pudo emitir.',
        plan: resultado.plan,
        yaExistia: resultado.yaExistia || undefined,
        remision: resultado.remision ? serializarRemision(resultado.remision) : null,
        // El código aunque `remision` no se haya podido releer: con un paso
        // crítico fallido, el Borrador existe y la UI lo ofrece para completar.
        codigoRemision: codigo || null,
        recepcion,
        steps: resultado.steps,
        ...(resultado.ok ? {} : { error: fallidos[0]?.error ?? 'Falló un paso crítico del despacho.' }),
      },
      { status: resultado.ok ? (fallidos.length ? 207 : 200) : 500 }
    );
  } catch (err) {
    return respuestaDeError(err);
  }
}

function respuestaDeError(err: unknown) {
  if (err instanceof DespachoBiocharInvalido) {
    return NextResponse.json(
      { success: false, error: err.message, despachoIncompleto: err.despachoIncompleto },
      { status: 409 }
    );
  }
  if (err instanceof DespachoEnCurso) {
    return NextResponse.json(
      { success: false, error: err.message, enCurso: true, codigoRemision: err.codigoRemision },
      { status: 503 }
    );
  }
  if (err instanceof LecturaCoreFallida || err instanceof CandadoOcupado) {
    return NextResponse.json({ success: false, error: err.message }, { status: 503 });
  }
  const message = sanearError(err);
  console.error('❌ Error en POST pirolisis/pedidos/despachar-biochar:', message);
  return NextResponse.json({ success: false, error: `No se pudo despachar: ${message}` }, { status: 500 });
}

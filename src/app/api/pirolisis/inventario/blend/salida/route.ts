import { NextRequest, NextResponse } from 'next/server';
import { ServerSessionManager } from '@/lib/serverSession';
import { runSalidaBlend } from '@/lib/salida-blend';
import { MOTIVOS_SALIDA_BLEND, esMotivoSalidaBlend } from '@/lib/salida-bache.constants';

/**
 * POST /api/pirolisis/inventario/blend/salida
 *
 * Saca Biochar Blend de bodega por un motivo que NO es un despacho (laboratorio,
 * muestra, merma, traslado). Se pide un TOTAL y se reparte FIFO por lote, pero se
 * escribe UNA sola Salida en Sirius Inventario Production Core, con el reparto en
 * sus marcas `[kg-lote:…]`. Ver `src/lib/salida-blend.ts`.
 *
 * Body:
 *   {
 *     kg: number,                    // requerido: el total a sacar
 *     motivo: "laboratorio" | "muestra" | "merma" | "traslado",
 *     lotes?: [{ lote, kg }],        // el reparto del ensayo; OBLIGATORIO al confirmar
 *     referencia?: string,           // la que devolvió el ensayo; OBLIGATORIA al confirmar
 *     destino?: string,
 *     observaciones?: string,
 *     fecha?: "YYYY-MM-DD",
 *     dryRun?: boolean
 *   }
 *
 * Respuestas: 200 · 207 (el movimiento quedó sin vincular al saldo, ver `steps`)
 * · 400 · 409 (no alcanza) · 500.
 *
 * Idempotente con `SAL-<MOTIVO>-<fecha>[-<n>]`: reintentar la confirmación con la
 * misma referencia no vuelve a descontar.
 */
export async function POST(request: NextRequest) {
  // La sesión NO se exige, igual que en la salida de biochar y la de abono: la
  // cookie `sirius_session` vence a las 24 h mientras la sesión del navegador
  // (localStorage) sigue viva, así que exigirla rechazaba con "No autorizado" a un
  // operador que la pantalla daba por conectado (2026-10-20). Si está, manda en la
  // atribución; si no, se usa el nombre que envía la pantalla.
  const session = await ServerSessionManager.getSession(request);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  if (!esMotivoSalidaBlend(body.motivo)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Motivo de salida inválido',
        details: `Debe ser uno de: ${MOTIVOS_SALIDA_BLEND.join(', ')}. Los despachos a clientes van por remisión.`,
      },
      { status: 400 }
    );
  }

  const kg = Number(body.kg);
  if (!Number.isFinite(kg) || kg <= 0) {
    return NextResponse.json({ success: false, error: 'Los KG a sacar deben ser un número mayor que cero' }, { status: 400 });
  }

  if (body.lotes !== undefined && !Array.isArray(body.lotes)) {
    return NextResponse.json({ success: false, error: '`lotes` debe ser una lista de { lote, kg }' }, { status: 400 });
  }
  const lotes = (body.lotes as Array<Record<string, unknown>> | undefined)?.map((l) => ({
    lote: String(l?.lote ?? '').trim(),
    kg: Number(l?.kg),
  }));
  if (lotes?.some((l) => !l.lote || !Number.isFinite(l.kg) || l.kg <= 0)) {
    return NextResponse.json(
      { success: false, error: 'Cada lote del reparto necesita su código y unos KG mayores que cero' },
      { status: 400 }
    );
  }

  const fecha = String(body.fecha ?? '').trim();
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ success: false, error: 'La fecha debe venir como YYYY-MM-DD' }, { status: 400 });
  }

  const texto = (v: unknown) => String(v ?? '').trim() || undefined;
  const nombre =
    [session?.user.Nombre, session?.user.Apellido].filter(Boolean).join(' ').trim() ||
    texto(body.realizaRegistro);

  try {
    const resultado = await runSalidaBlend({
      kg,
      motivo: body.motivo,
      lotes,
      referencia: texto(body.referencia),
      destino: texto(body.destino),
      observaciones: texto(body.observaciones),
      realizaRegistro: nombre || 'Sistema',
      fecha: fecha || undefined,
      dryRun: body.dryRun === true,
    });

    const fallidos = resultado.steps.filter((p) => !p.ok);
    const deLotes = resultado.lotes.map((l) => `${l.kg} kg de ${l.lote}`).join(', ');

    if (!resultado.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            'La salida no se pudo registrar en el libro mayor. Reintenta: si llegó a escribirse, no se descuenta de nuevo.',
          ...resultado,
        },
        { status: 500 }
      );
    }

    const message = resultado.dryRun
      ? `Ensayo: saldrían ${resultado.kg} kg de Blend (${deLotes}) → ${resultado.destino}. No se escribió nada.`
      : resultado.yaExistia
        ? 'Esta salida ya estaba registrada: no se descontó de nuevo.'
        : fallidos.length
          ? `Salieron ${resultado.kg} kg de Blend (${deLotes}), pero el saldo no lo refleja. Revisa los detalles.`
          : `Salida de Blend registrada: ${resultado.kg} kg (${deLotes}) → ${resultado.destino}.`;

    return NextResponse.json({ success: true, message, ...resultado }, { status: fallidos.length ? 207 : 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [inventario/blend/salida] Error:', message);
    const status = /solo hay|solo tiene|no alcanzan/.test(message)
      ? 409
      : /reparto|repetido|mayor que cero|No existe/.test(message)
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

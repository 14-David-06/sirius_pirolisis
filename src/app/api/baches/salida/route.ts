import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { esMotivoSalida, MOTIVOS_SALIDA, runSalidaBiochar } from '@/lib/salida-bache';
import { receptorIncompleto, type ReceptorEntrega } from '@/lib/salida-bache.constants';

/**
 * POST /api/baches/salida
 *
 * Saca biochar de bodega por un motivo que NO es producción de Blend
 * (laboratorio, muestra, merma, traslado, entrega). Se pide un TOTAL y se reparte
 * FIFO por bache; cada bache escribe sus tres partes: el detalle que baja su
 * fórmula, la Salida en el libro mayor de Sirius Inventario Production Core y su
 * `Estado Bache`. Ver `runSalidaBiochar()` en `src/lib/salida-bache.ts`.
 *
 * Body:
 *   {
 *     kg: number,                    // requerido: el total a sacar
 *     motivo: "laboratorio" | "muestra" | "merma" | "traslado" | "entrega",
 *     baches?: [{ bache, kg }],      // el reparto del ensayo; OBLIGATORIO al confirmar
 *     referenciaBase?: string,       // la que devolvió el ensayo; reenviarla al confirmar
 *     destino?: string,              // laboratorio / área / quien recibe
 *     observaciones?: string,
 *     realizaRegistro?: string,      // queda como responsable del movimiento del Core
 *     fecha?: "YYYY-MM-DD",          // por defecto hoy; entra en la referencia
 *     receptor?: { nombre, cedula, vehiculo?, color?, placa? }, // OBLIGATORIO en `entrega`
 *     dryRun?: boolean               // resuelve y valida sin escribir nada
 *   }
 *
 * Respuestas:
 *   200 — todo escrito (o la salida ya estaba completa: `ya_existia`)
 *   207 — los baches quedaron descontados pero un paso de trazabilidad falló (ver `steps`)
 *   400 — body inválido
 *   409 — no hay ese biochar disponible
 *   500 — configuración incompleta o fallo del paso crítico
 *
 * Es idempotente por bache con la referencia `SAL-<MOTIVO>-<fecha>[-<n>]-<bache>`:
 * reintentar la confirmación con el mismo reparto no duplica el descuento, y si a
 * un bache le faltó un paso, lo completa.
 */
export async function POST(request: Request) {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json({ success: false, error: 'Configuración de PiroliApp incompleta' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  const motivo = (body as Record<string, unknown>).motivo;

  if (!esMotivoSalida(motivo)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Motivo de salida inválido',
        details: `Debe ser uno de: ${Object.keys(MOTIVOS_SALIDA).join(', ')}.`,
      },
      { status: 400 }
    );
  }

  const kg = Number((body as Record<string, unknown>).kg);
  if (!Number.isFinite(kg) || kg <= 0) {
    return NextResponse.json(
      { success: false, error: 'Los KG a sacar deben ser un número mayor que cero' },
      { status: 400 }
    );
  }

  const bachesRaw = (body as Record<string, unknown>).baches;
  if (bachesRaw !== undefined && !Array.isArray(bachesRaw)) {
    return NextResponse.json({ success: false, error: '`baches` debe ser una lista de { bache, kg }' }, { status: 400 });
  }
  const baches = (bachesRaw as Array<Record<string, unknown>> | undefined)?.map((b) => ({
    bache: String(b?.bache ?? '').trim(),
    kg: Number(b?.kg),
  }));
  if (baches?.some((b) => !b.bache || !Number.isFinite(b.kg) || b.kg <= 0)) {
    return NextResponse.json(
      { success: false, error: 'Cada bache del reparto necesita su código y unos KG mayores que cero' },
      { status: 400 }
    );
  }

  // La entrega sin contraprestación sale con acta, y el acta sin quién recibe no
  // documenta nada. Se rechaza antes de mover inventario.
  const receptorRaw = (body as Record<string, unknown>).receptor as Partial<ReceptorEntrega> | undefined;
  let receptor: ReceptorEntrega | undefined;
  if (motivo === 'entrega') {
    const falta = receptorIncompleto(receptorRaw);
    if (falta) {
      return NextResponse.json(
        { success: false, error: falta, details: 'Una entrega sin contraprestación necesita quién la recibe: es lo que imprime el acta.' },
        { status: 400 }
      );
    }
    const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    receptor = {
      nombre: String(receptorRaw!.nombre).trim(),
      cedula: String(receptorRaw!.cedula).trim(),
      vehiculo: texto(receptorRaw!.vehiculo),
      color: texto(receptorRaw!.color),
      placa: texto(receptorRaw!.placa),
    };
  }

  try {
    const resultado = await runSalidaBiochar({
      motivo,
      kg,
      baches,
      referenciaBase: String((body as Record<string, unknown>).referenciaBase ?? '').trim() || undefined,
      destino: String((body as Record<string, unknown>).destino ?? '').trim() || undefined,
      observaciones: String((body as Record<string, unknown>).observaciones ?? '').trim() || undefined,
      realizaRegistro: String((body as Record<string, unknown>).realizaRegistro ?? '').trim() || 'Sistema',
      fecha: String((body as Record<string, unknown>).fecha ?? '').trim() || undefined,
      dryRun: (body as Record<string, unknown>).dryRun === true,
      receptor,
    });

    const fallidos = resultado.steps.filter((paso) => !paso.ok);

    if (!resultado.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'La salida no se pudo completar: falló el descuento de un bache. Reintenta: los que ya salieron no se descuentan de nuevo.',
          ...resultado,
        },
        { status: 500 }
      );
    }

    const deBaches = resultado.salidas.map((s) => `${s.bache.kg} kg de ${s.bache.codigo}`).join(', ');
    const mensaje = resultado.dryRun
      ? `Ensayo: saldrían ${resultado.kg} kg (${deBaches}) → ${resultado.destino}. No se escribió nada.`
      : resultado.yaExistia
      ? `Esta salida ya estaba registrada: no se descontó de nuevo.`
      : fallidos.length
        ? `Se descontaron ${resultado.kg} kg (${deBaches}), pero un paso de trazabilidad falló. Revisa los detalles.`
        : `Salida registrada: ${resultado.kg} kg (${deBaches}) → ${resultado.destino}.`;

    return NextResponse.json({ success: true, message: mensaje, ...resultado }, { status: fallidos.length ? 207 : 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [baches/salida] Error:', message);

    // Los errores de validación del servicio (bache inexistente, KG por encima del
    // disponible, reparto mal formado) son del cliente, no del servidor: un 500 haría
    // que la UI ofreciera "reintentar" algo que nunca va a funcionar.
    const esDisponibilidad = /no tiene|solo tiene|solo hay/.test(message);
    const esNoEncontrado = /No existe|No se encontró/.test(message);
    const esEntrada = /reparto|repetido|mayor que cero/.test(message);
    const status = esDisponibilidad ? 409 : esNoEncontrado ? 404 : esEntrada ? 400 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

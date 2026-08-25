import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { esMotivoSalida, MOTIVOS_SALIDA, runSalidaBache } from '@/lib/salida-bache';

/**
 * POST /api/baches/salida
 *
 * Da salida al biochar de un bache por un motivo que NO es producción de Blend
 * (laboratorio, muestra, merma, traslado), escribiendo las tres partes que
 * representan el bache: el detalle que baja su fórmula, la Salida en el libro
 * mayor de Sirius Inventario Production Core y su `Estado Bache`. Ver
 * `src/lib/salida-bache.ts`.
 *
 * Body:
 *   {
 *     bache: "recXXX" | "S-00171",   // requerido
 *     motivo: "laboratorio" | "muestra" | "merma" | "traslado",
 *                                    // "entrega" NO: eso va por /actas-biochar (422)
 *     kg?: number,                   // omitido = el bache completo
 *     destino?: string,              // laboratorio / área / quien recibe
 *     observaciones?: string,
 *     realizaRegistro?: string,      // queda como responsable del movimiento del Core
 *     fecha?: "YYYY-MM-DD",          // por defecto hoy; entra en la referencia
 *     dryRun?: boolean               // resuelve y valida sin escribir nada
 *   }
 *
 * Respuestas:
 *   200 — todo escrito (o la salida ya estaba completa: `ya_existia`)
 *   207 — el bache quedó descontado pero un paso de trazabilidad falló (ver `steps`)
 *   400 — body inválido
 *   409 — el bache no tiene ese biochar disponible
 *   422 — es una entrega sin contraprestación: se registra con un acta, no aquí
 *   500 — configuración incompleta o fallo del paso crítico
 *
 * Es idempotente por la referencia `SAL-<MOTIVO>-<fecha>-<bache>`: reintentar no
 * duplica el descuento, y si a una salida anterior le faltó un paso, lo completa.
 */
export async function POST(request: Request) {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json({ success: false, error: 'Configuración de PiroliApp incompleta' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  const bache = String((body as Record<string, unknown>).bache ?? '').trim();
  const motivo = (body as Record<string, unknown>).motivo;

  if (!bache) {
    return NextResponse.json(
      { success: false, error: 'Falta el bache', details: 'Envía `bache` con el record ID o el Codigo Bache (S-00XXX).' },
      { status: 400 }
    );
  }
  // `entrega` NO se registra por aquí (decisión de David, 2026-08-25). Una entrega
  // sin contraprestación es la que el numeral 5.4.2 de la metodología obliga a
  // documentar con receptor, uso previsto declarado y firma de las dos partes; por
  // esta ruta quedaría como una observación de texto libre, sin nada que la acredite.
  // El acta llama a `runSalidaBache` directamente con su propio código como
  // referencia, así que el camino existe: es el otro.
  if (motivo === 'entrega') {
    return NextResponse.json(
      {
        success: false,
        error: 'Una entrega sin contraprestación se registra con un acta de entrega, no como salida simple.',
        details:
          'Ve a /actas-biochar y crea el acta: descuenta el mismo inventario, y además deja el receptor, ' +
          'el uso previsto y las firmas que exige el numeral 5.4.2 de la metodología.',
        ruta: '/actas-biochar',
      },
      { status: 422 }
    );
  }
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

  const kgRaw = (body as Record<string, unknown>).kg;
  const kg = kgRaw === undefined || kgRaw === null || kgRaw === '' ? undefined : Number(kgRaw);
  if (kg !== undefined && (!Number.isFinite(kg) || kg <= 0)) {
    return NextResponse.json(
      { success: false, error: 'Los KG deben ser un número mayor que cero (u omitirse para sacar el bache completo)' },
      { status: 400 }
    );
  }

  try {
    const resultado = await runSalidaBache({
      bache,
      motivo,
      kg,
      destino: String((body as Record<string, unknown>).destino ?? '').trim() || undefined,
      observaciones: String((body as Record<string, unknown>).observaciones ?? '').trim() || undefined,
      realizaRegistro: String((body as Record<string, unknown>).realizaRegistro ?? '').trim() || 'Sistema',
      fecha: String((body as Record<string, unknown>).fecha ?? '').trim() || undefined,
      dryRun: (body as Record<string, unknown>).dryRun === true,
    });

    const fallidos = resultado.steps.filter((paso) => !paso.ok);

    if (!resultado.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'La salida no se pudo registrar: falló el descuento del bache.',
          ...resultado,
        },
        { status: 500 }
      );
    }

    const mensaje = resultado.dryRun
      ? `Ensayo: saldrían ${resultado.bache.kg} kg del bache ${resultado.bache.codigo} → ${resultado.destino} (${resultado.referencia}). No se escribió nada.`
      : resultado.yaExistia
      ? `La salida ${resultado.referencia} ya estaba registrada: no se descontó de nuevo.`
      : fallidos.length
        ? `Se descontaron ${resultado.bache.kg} kg del bache ${resultado.bache.codigo}, pero un paso de trazabilidad falló. Revisa los detalles.`
        : `Salida registrada: ${resultado.bache.kg} kg del bache ${resultado.bache.codigo} → ${resultado.destino}.`;

    return NextResponse.json({ success: true, message: mensaje, ...resultado }, { status: fallidos.length ? 207 : 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [baches/salida] Error:', message);

    // Los errores de validación del servicio (bache inexistente, KG por encima del
    // disponible) son del cliente, no del servidor: un 500 haría que la UI ofreciera
    // "reintentar" algo que nunca va a funcionar.
    const esDisponibilidad = /no tiene|solo tiene/.test(message);
    const esNoEncontrado = /No existe|No se encontró/.test(message);
    const status = esDisponibilidad ? 409 : esNoEncontrado ? 404 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

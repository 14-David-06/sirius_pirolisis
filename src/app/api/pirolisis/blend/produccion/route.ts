import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { loteDeProduccion, runProduccionBlend } from '@/lib/produccion-blend';
import type { ConsumoBacheInput } from '@/lib/produccion-blend';

/**
 * Producción de Biochar Blend: biochar puro + abono 4G → producto terminado.
 *
 * Escribe las cinco partes de un lote `BLEND-…` (ver `src/lib/produccion-blend.ts`):
 * el detalle que baja la fórmula de cada bache, la Salida de biochar por bache, la
 * Salida de abono, la Entrada de Blend y los estados de los baches.
 */

/**
 * GET /api/pirolisis/blend/produccion
 *
 * La fórmula del Blend y el lote que le tocaría a hoy. Existe para que el
 * formulario sugiera los kg de abono sin llevarse una copia de los porcentajes:
 * `config.blend` es la única fuente y sus variables no son `NEXT_PUBLIC_`, así que
 * el cliente no puede leerlas.
 *
 * ⚠️ Los porcentajes suman 99,7% a propósito: es una decisión abierta con DataLab y
 * no se debe forzar a 100 (§5 de CLAUDE.md).
 */
export async function GET() {
  const fecha = new Date().toISOString().split('T')[0];
  return NextResponse.json({
    success: true,
    fecha,
    loteSugerido: loteDeProduccion(fecha),
    formula: config.blend,
  });
}

/**
 * POST /api/pirolisis/blend/produccion
 *
 * Body:
 *   {
 *     baches: [{ bache: "recXXX" | "S-00171", kg?: number }],  // requerido, ≥1
 *     kgAbono: number,                 // requerido (0 es válido)
 *     kgBlend?: number,                // omitido = biochar + abono
 *     sufijoLote?: string,             // pedido u otro distintivo del lote del día
 *     fecha?: "YYYY-MM-DD",            // por defecto hoy; entra en el lote
 *     realizaRegistro?: string,        // queda como responsable en el Core
 *     observaciones?: string,
 *     dryRun?: boolean                 // resuelve y valida sin escribir nada
 *   }
 *
 * Respuestas:
 *   200 — todo escrito (o la producción ya estaba completa: `yaExistia`)
 *   207 — los baches se descontaron pero un paso de trazabilidad falló (ver `steps`)
 *   400 — body inválido
 *   404 — algún bache no existe
 *   409 — un bache no tiene ese biochar disponible, o está repetido
 *   500 — configuración incompleta o fallo del paso crítico
 *
 * Es idempotente por el lote: reintentar no duplica el descuento, y si a una
 * producción anterior le faltó un paso, lo completa.
 */
export async function POST(request: Request) {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json({ success: false, error: 'Configuración de PiroliApp incompleta' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }
  const campos = body as Record<string, unknown>;

  const bachesRaw = campos.baches;
  if (!Array.isArray(bachesRaw) || bachesRaw.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Falta el biochar',
        details: 'Envía `baches` con al menos un bache: [{ bache: "S-00171", kg: 500 }].',
      },
      { status: 400 }
    );
  }

  const baches: ConsumoBacheInput[] = [];
  for (const fila of bachesRaw) {
    const item = (fila ?? {}) as Record<string, unknown>;
    const bache = String(item.bache ?? '').trim();
    if (!bache) {
      return NextResponse.json(
        { success: false, error: 'Hay un bache sin identificar', details: 'Cada fila necesita `bache`.' },
        { status: 400 }
      );
    }
    const kgRaw = item.kg;
    const kg = kgRaw === undefined || kgRaw === null || kgRaw === '' ? undefined : Number(kgRaw);
    if (kg !== undefined && (!Number.isFinite(kg) || kg <= 0)) {
      return NextResponse.json(
        { success: false, error: `Los KG del bache ${bache} deben ser un número mayor que cero (u omitirse para tomarlo completo)` },
        { status: 400 }
      );
    }
    baches.push({ bache, kg });
  }

  const kgAbono = Number(campos.kgAbono ?? 0);
  if (!Number.isFinite(kgAbono) || kgAbono < 0) {
    return NextResponse.json(
      { success: false, error: 'Los KG de abono deben ser un número mayor o igual que cero' },
      { status: 400 }
    );
  }

  const kgBlendRaw = campos.kgBlend;
  const kgBlend = kgBlendRaw === undefined || kgBlendRaw === null || kgBlendRaw === '' ? undefined : Number(kgBlendRaw);
  if (kgBlend !== undefined && (!Number.isFinite(kgBlend) || kgBlend <= 0)) {
    return NextResponse.json(
      { success: false, error: 'Los KG de Blend producido deben ser un número mayor que cero (u omitirse)' },
      { status: 400 }
    );
  }

  try {
    const resultado = await runProduccionBlend({
      baches,
      kgAbono,
      kgBlend,
      sufijoLote: String(campos.sufijoLote ?? '').trim() || undefined,
      fecha: String(campos.fecha ?? '').trim() || undefined,
      realizaRegistro: String(campos.realizaRegistro ?? '').trim() || 'Sistema',
      observaciones: String(campos.observaciones ?? '').trim() || undefined,
      dryRun: campos.dryRun === true,
    });

    const fallidos = resultado.steps.filter((paso) => !paso.ok);

    if (!resultado.ok) {
      return NextResponse.json(
        { success: false, error: 'La producción no se pudo registrar: falló el descuento de los baches.', ...resultado },
        { status: 500 }
      );
    }

    const mensaje = resultado.dryRun
      ? `Ensayo del lote ${resultado.lote}: ${resultado.kgBiochar} kg de biochar (${resultado.baches.length} bache(s)) + ${resultado.kgAbono} kg de abono → ${resultado.kgBlend} kg de Blend. No se escribió nada.`
      : resultado.yaExistia
        ? `El lote ${resultado.lote} ya estaba registrado: no se descontó de nuevo.`
        : fallidos.length
          ? `Se descontaron ${resultado.kgBiochar} kg de biochar para el lote ${resultado.lote}, pero un paso de trazabilidad falló. Revisa los detalles.`
          : `Producción registrada: lote ${resultado.lote} — ${resultado.kgBlend} kg de Blend.`;

    return NextResponse.json({ success: true, message: mensaje, ...resultado }, { status: fallidos.length ? 207 : 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [blend/produccion] Error:', message);

    // Los errores de validación del servicio son del cliente, no del servidor: un 500
    // haría que la UI ofreciera "reintentar" algo que nunca va a funcionar.
    const esConflicto = /no tiene|solo (tiene|hay)|repetido|no consume/.test(message);
    const esNoEncontrado = /No existe|No se encontró/.test(message);
    const status = esConflicto ? 409 : esNoEncontrado ? 404 : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

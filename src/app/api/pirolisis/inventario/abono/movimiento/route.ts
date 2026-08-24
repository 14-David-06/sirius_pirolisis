import { NextResponse } from 'next/server';
import {
  referenciaConsumoAbono,
  referenciaEntradaAbono,
  registrarMovimientoAbono,
  resumenAbono,
} from '@/lib/abono-inventario-core';

/**
 * POST /api/pirolisis/inventario/abono/movimiento
 *
 * Ingresa o saca abono 4G del libro mayor (Sirius Inventario Production Core).
 *
 * ═══ POR QUÉ ES MUCHO MÁS SIMPLE QUE LA SALIDA DE UN BACHE ════════════════════
 * Una salida de biochar escribe TRES partes (el detalle que baja la fórmula del
 * bache, la Salida del Core y el `Estado Bache`) porque el biochar se lleva en dos
 * vistas: el libro mayor y la fórmula del bache. El abono NO tiene baches ni
 * fórmula propia en PiroliApp: su única representación es el movimiento del Core.
 * Un solo write, sin `StepResult` ni 207 que reportar.
 *
 * Body:
 *   {
 *     tipo: "Entrada" | "Salida",   // requerido
 *     kg: number,                   // requerido, > 0
 *     fecha?: "YYYY-MM-DD",         // por defecto hoy
 *     lote?: string,                // Salida: lote BLEND-… que lo consume
 *     referencia?: string,          // Entrada: remisión o documento del proveedor
 *     observaciones?: string,
 *     realizaRegistro?: string,
 *   }
 *
 * Respuestas:
 *   200 — registrado (o `yaExistia`: la referencia ya estaba y no se duplicó)
 *   400 — body inválido
 *   409 — salida por más kg de los que hay
 *   503 — el abono no está configurado como producto del Core
 *
 * Idempotencia: la referencia. En una Salida es `ABONO-<lote>`, así que dos
 * consumos del mismo lote se leen como uno; en una Entrada es `ABONO-<documento>`
 * o `ABONO-ENTRADA-<fecha>`. El abono entra y sale en cargas de miles de kg: un
 * doble clic no es un error de redondeo, es un inventario inflado que nadie sabe
 * después de dónde salió.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  const campos = body as Record<string, unknown>;
  const tipo = String(campos.tipo ?? '').trim();
  if (tipo !== 'Entrada' && tipo !== 'Salida') {
    return NextResponse.json(
      { success: false, error: "El tipo debe ser 'Entrada' o 'Salida'" },
      { status: 400 }
    );
  }

  const kg = Number(campos.kg);
  if (!Number.isFinite(kg) || kg <= 0) {
    return NextResponse.json(
      { success: false, error: 'Los KG deben ser un número mayor que cero' },
      { status: 400 }
    );
  }

  const fecha = String(campos.fecha ?? '').trim() || new Date().toISOString().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json(
      { success: false, error: 'La fecha debe venir como YYYY-MM-DD' },
      { status: 400 }
    );
  }

  const lote = String(campos.lote ?? '').trim();
  const referenciaManual = String(campos.referencia ?? '').trim();
  const observaciones = String(campos.observaciones ?? '').trim();
  const realizaRegistro = String(campos.realizaRegistro ?? '').trim() || 'Sistema';

  // Una Salida sin destino no se puede rastrear después: el consumo de abono existe
  // para explicar de qué está hecho un lote de Blend, y sin el lote es un número
  // que baja el saldo y no dice nada.
  if (tipo === 'Salida' && !lote && !referenciaManual) {
    return NextResponse.json(
      {
        success: false,
        error: 'Falta el destino de la salida',
        details:
          'Envía `lote` con el lote BLEND-… que consume el abono, o `referencia` si la salida ' +
          'no es una producción (traslado, merma).',
      },
      { status: 400 }
    );
  }

  const estado = await resumenAbono();
  if (!estado) {
    return NextResponse.json(
      {
        success: false,
        error: 'El abono 4G no está configurado como producto de Inventario Production Core',
        details:
          'Falta AIRTABLE_INVENTARIO_ABONO_4G_PRODUCT_ID. Se crea con ' +
          'scripts/migrar-abono-inventario-core.mjs --producto --apply.',
      },
      { status: 503 }
    );
  }

  // El saldo se valida contra `Stock_Actual`, y si no se pudo leer se cae a la suma
  // de los movimientos: sacar más de lo que hay deja el inventario en negativo, y un
  // saldo negativo es el error que después nadie sabe explicar (pasó con S-00177).
  const disponible = estado.kg ?? estado.kgSegunMovimientos;
  if (tipo === 'Salida' && kg > disponible + 0.01) {
    return NextResponse.json(
      {
        success: false,
        error: `Solo hay ${disponible.toFixed(2)} kg de abono en bodega (se pidieron ${kg.toFixed(2)}).`,
      },
      { status: 409 }
    );
  }

  const documentoReferencia =
    tipo === 'Salida'
      ? lote
        ? referenciaConsumoAbono(lote)
        : `ABONO-${referenciaManual}`
      : referenciaEntradaAbono(fecha, referenciaManual);

  try {
    const resultado = await registrarMovimientoAbono({
      tipo,
      kg,
      documentoReferencia,
      motivo:
        tipo === 'Entrada'
          ? 'Ingreso de abono 4G a bodega'
          : lote
            ? `Consumo para produccion de Biochar Blend ${lote}`
            : 'Salida de abono 4G',
      fecha,
      produccionDestino: tipo === 'Salida' ? lote || referenciaManual : undefined,
      responsable: realizaRegistro,
      observaciones: observaciones || undefined,
    });

    if (!resultado) {
      return NextResponse.json(
        { success: false, error: 'El abono 4G no está configurado en el Core' },
        { status: 503 }
      );
    }

    if (resultado.yaExistia) {
      return NextResponse.json({
        success: true,
        yaExistia: true,
        referencia: documentoReferencia,
        message:
          `El movimiento ${documentoReferencia} ya estaba registrado: no se volvió a mover el ` +
          'inventario.',
      });
    }

    if (!resultado.vinculadoAlStock) {
      // No es un fallo del write, y por eso responde 200: el movimiento existe. Pero
      // sin el link a `Stock_Actual` el saldo no lo cuenta, y eso hay que decirlo o
      // el operador ve "registrado" con un saldo que no se movió.
      return NextResponse.json({
        success: true,
        referencia: documentoReferencia,
        movimientoId: resultado.movimientoId,
        advertencia:
          'El movimiento se creó pero no quedó vinculado a Stock_Actual, así que el saldo no lo ' +
          'refleja. Falta la fila de stock del producto en el Core.',
        message: `Movimiento registrado (${resultado.cantidad} kg), pero el saldo no lo cuenta.`,
      });
    }

    return NextResponse.json({
      success: true,
      referencia: documentoReferencia,
      movimientoId: resultado.movimientoId,
      kg: resultado.cantidad,
      message:
        tipo === 'Entrada'
          ? `Ingresaron ${resultado.cantidad} kg de abono 4G a bodega.`
          : `Salieron ${resultado.cantidad} kg de abono 4G${lote ? ` hacia ${lote}` : ''}.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [inventario/abono/movimiento] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

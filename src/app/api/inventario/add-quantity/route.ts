import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import {
  appendMovimientoToStock,
  getOrCreateStockForInsumo,
} from '../../../../lib/stock-insumos';
import {
  buildCamposIdCore,
  resolveIdResponsableCore,
} from '../../../../lib/movimientos-insumos';

/**
 * POST /api/inventario/add-quantity
 *
 * Registra una entrada de insumo en Sirius Insumos Core.
 *
 * MIGRADO (2026-07-27): Antes creaba en Entrada Insumos Pirolisis (local).
 * Ahora crea Movimiento Insumos (tipo="Entrada") y actualiza Stock Insumos del Core.
 *
 * Body esperado:
 * - itemId (string, requerido): record ID del insumo en Sirius Insumos Core
 * - cantidad (number, requerido): cantidad a ingresar
 * - Realiza Registro (string, opcional): quién registra
 * - notas (string, opcional): observaciones
 */
export async function POST(request: Request) {
  // Validar configuración
  if (!config.airtable.insumosCoreBaseId || !config.airtable.movimientosInsumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      error: 'Configuración de Sirius Insumos Core incompleta',
      details: 'Faltan AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID'
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;
    const coreBaseId = config.airtable.insumosCoreBaseId;
    const movimientosTableId = config.airtable.movimientosInsumosTableId;
    const movFields = config.airtable.movimientoFields;

    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
        details: 'Falta AIRTABLE_GLOBAL_TOKEN'
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('📥 Datos recibidos en API add-quantity:', body);

    const {
      itemId,
      cantidad,
      notas,
      'Realiza Registro': realizaRegistro,
      'ID Responsable Core': idResponsableCore,
    } = body;

    // Validar campos requeridos
    if (!itemId || !cantidad) {
      return NextResponse.json({
        error: 'Campos requeridos faltantes',
        details: 'Se requieren: itemId y cantidad'
      }, { status: 400 });
    }

    const cantidadNumerica = parseFloat(cantidad);
    if (isNaN(cantidadNumerica) || cantidadNumerica <= 0) {
      return NextResponse.json({
        error: 'Cantidad inválida',
        details: 'La cantidad debe ser un número positivo'
      }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPCIONAL: Obtener turno actual abierto (para guardarlo en Notas)
    // ═══════════════════════════════════════════════════════════════════════════
    let turnoActual: { id: string } | null = null;
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        new URL(request.url).origin ||
        'http://localhost:3000';
      const turnoResponse = await fetch(`${baseUrl}/api/turno/check?userId=any`, {
        method: 'GET',
      });

      if (turnoResponse.ok) {
        const turnoData = await turnoResponse.json();
        if (turnoData.hasTurnoAbierto && turnoData.turnoAbierto) {
          turnoActual = turnoData.turnoAbierto;
          console.log('📋 Turno abierto encontrado:', turnoActual?.id);
        }
      }
    } catch (turnoErr) {
      console.warn('⚠️ Error consultando turno (no crítico):', turnoErr);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 0 (CRÍTICO): Verificar/crear Stock Insumos ANTES de crear movimiento
    // Esto previene movimientos huérfanos si el Stock no existe
    // ═══════════════════════════════════════════════════════════════════════════
    // Estrategia: Obtener TODOS los stocks (paginados) y filtrar en JS.
    // Ver src/lib/stock-insumos.ts: el match NO puede hacerse con
    // filterByFormula ni leyendo `fields` por field ID.
    console.log(`🔍 Buscando Stock existente para insumo: ${itemId}`);

    let stockInsumoId: string;

    try {
      const { stockId, created } = await getOrCreateStockForInsumo(itemId);
      stockInsumoId = stockId;

      if (created) {
        console.warn(`⚠️ Stock Insumos NO existía para ${itemId}, creado: ${stockInsumoId}`);
      } else {
        console.log(`📦 Stock Insumos encontrado: ${stockInsumoId}`);
      }
    } catch (stockErr: any) {
      console.error('❌ Error al resolver Stock Insumos:', stockErr);
      return NextResponse.json({
        error: 'No se pudo resolver el registro de Stock para este insumo',
        details: String(stockErr?.message || stockErr)
      }, { status: 500 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Crear movimiento de entrada en Movimientos Insumos
    // ═══════════════════════════════════════════════════════════════════════════
    const movimientoFields: Record<string, any> = {};

    // Link al insumo
    if (movFields.insumo) {
      movimientoFields[movFields.insumo] = [itemId];
    }

    // Cantidad
    if (movFields.cantidad) {
      movimientoFields[movFields.cantidad] = cantidadNumerica;
    }

    // Tipo movimiento = "Entrada"
    if (movFields.tipoMovimiento) {
      movimientoFields[movFields.tipoMovimiento] = 'Entrada';
    }

    // Subtipo: DEJAR VACÍO (campo existe pero no está en uso)
    // if (movFields.subtipo) {
    //   movimientoFields[movFields.subtipo] = '';
    // }

    // IDs core: área origen, área destino y responsable (SIRIUS-PER)
    Object.assign(
      movimientoFields,
      buildCamposIdCore(await resolveIdResponsableCore(idResponsableCore), 'entrada de insumo')
    );

    // Notas: concatenar notas del usuario + referencia a turno (si hay)
    if (movFields.notas) {
      let notasCompletas = '';
      if (notas) {
        notasCompletas += notas;
      }
      if (turnoActual) {
        if (notasCompletas) notasCompletas += '\n';
        notasCompletas += `Entrada vinculada a Turno ${turnoActual.id}`;
      }
      if (notasCompletas) {
        movimientoFields[movFields.notas] = notasCompletas;
      }
    }

    console.log('📤 Creando movimiento de entrada en Core:', movimientoFields);

    const createMovResponse = await fetch(
      `https://api.airtable.com/v0/${coreBaseId}/${movimientosTableId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{
            fields: movimientoFields
          }]
        }),
      }
    );

    const movimientoData = await createMovResponse.json();

    if (!createMovResponse.ok) {
      console.error('❌ Error al crear movimiento en Core:', movimientoData);
      return NextResponse.json({
        error: movimientoData?.error || 'Error al crear movimiento',
        details: movimientoData
      }, { status: createMovResponse.status });
    }

    const nuevoMovimientoId = movimientoData.records[0].id;
    console.log(`✅ Movimiento de entrada creado: ${nuevoMovimientoId}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Vincular movimiento al Stock Insumos (ya garantizado que existe)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(`🔗 Vinculando movimiento ${nuevoMovimientoId} al stock ${stockInsumoId}`);

    try {
      // Preserva los movimientos ya vinculados: el PATCH de un campo link
      // reemplaza el array completo.
      await appendMovimientoToStock(stockInsumoId, nuevoMovimientoId);
    } catch (linkErr: any) {
      console.error('❌ Error al actualizar Stock Insumos:', linkErr);
      return NextResponse.json({
        error: 'Movimiento creado pero faltó vincular al stock',
        details: String(linkErr?.message || linkErr)
      }, { status: 500 });
    }

    console.log(`✅ Stock Insumos actualizado con nuevo movimiento`);

    return NextResponse.json({
      success: true,
      message: `Entrada registrada exitosamente. Cantidad: ${cantidadNumerica}`,
      data: {
        movimiento: movimientoData.records[0],
        stockInsumoId
      }
    }, { status: 201 });

  } catch (err: any) {
    console.error('❌ Error en API add-quantity:', err);
    return NextResponse.json({
      error: String(err.message || err)
    }, { status: 500 });
  }
}

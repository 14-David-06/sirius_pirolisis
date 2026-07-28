import { NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';
import {
  appendMovimientoToStock,
  findStockByInsumo,
} from '../../../../../lib/stock-insumos';
import {
  buildCamposIdCore,
  resolveIdResponsableCore,
} from '../../../../../lib/movimientos-insumos';

/**
 * POST /api/pirolisis/inventario/entrada-abono4g
 *
 * Registra una entrada de Abono 4G en el inventario.
 *
 * MIGRADO (2026-07-27): Antes creaba en Entrada Insumos Pirolisis (local).
 * Ahora crea Movimiento Insumos (tipo="Entrada") en el Core.
 *
 * Body esperado:
 * - cantidad (number, requerido): cantidad de Abono 4G a ingresar
 * - realizaRegistro (string, opcional): quién registra
 * - notas (string, opcional): observaciones
 */
export async function POST(request: Request) {
  // Validar configuración
  if (!config.airtable.insumosCoreBaseId || !config.airtable.movimientosInsumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      success: false,
      error: 'Configuración de Sirius Insumos Core incompleta',
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;
    const coreBaseId = config.airtable.insumosCoreBaseId;
    const movimientosTableId = config.airtable.movimientosInsumosTableId;
    const movFields = config.airtable.movimientoFields;
    const abono4gRecordId = config.airtable.blendAbono4gRecordId;

    if (!token || !abono4gRecordId) {
      return NextResponse.json({
        success: false,
        error: 'Configuración incompleta: falta token o record ID de Abono 4G',
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('📥 Entrada de Abono 4G:', body);

    const { cantidad, realizaRegistro, notas } = body;
    const idResponsableCore = await resolveIdResponsableCore(body.idResponsableCore);

    if (!cantidad || isNaN(parseFloat(cantidad)) || parseFloat(cantidad) <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Cantidad inválida',
        details: 'Se requiere una cantidad numérica positiva',
      }, { status: 400 });
    }

    const cantidadNumerica = parseFloat(cantidad);

    // Crear movimiento de entrada
    const movimientoFields: Record<string, any> = {
      [movFields.insumo!]: [abono4gRecordId],
      [movFields.cantidad!]: cantidadNumerica,
      [movFields.tipoMovimiento!]: 'Entrada',
      // IDs core: área origen, área destino y responsable (SIRIUS-PER)
      ...buildCamposIdCore(idResponsableCore, 'entrada de Abono 4G'),
    };

    if (notas) {
      movimientoFields[movFields.notas!] = notas;
    }

    const createMovResponse = await fetch(
      `https://api.airtable.com/v0/${coreBaseId}/${movimientosTableId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{ fields: movimientoFields }]
        }),
      }
    );

    const movimientoData = await createMovResponse.json();

    if (!createMovResponse.ok) {
      console.error('❌ Error al crear movimiento de Abono 4G:', movimientoData);
      return NextResponse.json({
        success: false,
        error: 'Error al crear movimiento',
        details: movimientoData
      }, { status: createMovResponse.status });
    }

    const nuevoMovimientoId = movimientoData.records[0].id;
    console.log(`✅ Entrada de Abono 4G registrada: ${nuevoMovimientoId}`);

    // Actualizar Stock Insumos
    // NOTA: No filtramos por área porque el campo "Area" no existe
    // NOTA 2: Insumo ID es multipleRecordLinks; el match se hace en JS sobre los
    //         record IDs. Ver src/lib/stock-insumos.ts
    const { record: stockRecord } = await findStockByInsumo(abono4gRecordId);

    if (!stockRecord) {
      console.error(`❌ Stock Insumos NO existe para Abono 4G: ${abono4gRecordId}`);
      return NextResponse.json({
        success: false,
        error: 'No existe Stock para Abono 4G',
        details: 'El insumo Abono 4G debe tener un registro de Stock antes de agregar movimientos.'
      }, { status: 404 });
    }

    try {
      // Preserva los movimientos ya vinculados: el PATCH de un campo link
      // reemplaza el array completo.
      await appendMovimientoToStock(stockRecord.id, nuevoMovimientoId);
    } catch (linkErr: any) {
      console.error('❌ Error al actualizar Stock de Abono 4G:', linkErr);
      return NextResponse.json({
        success: false,
        error: 'Movimiento creado pero faltó vincular al stock',
        details: String(linkErr?.message || linkErr)
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Entrada de Abono 4G registrada: ${cantidadNumerica} kg`,
      data: movimientoData.records[0]
    }, { status: 201 });

  } catch (err: any) {
    console.error('❌ Error en entrada-abono4g:', err);
    return NextResponse.json({
      success: false,
      error: String(err.message || err)
    }, { status: 500 });
  }
}

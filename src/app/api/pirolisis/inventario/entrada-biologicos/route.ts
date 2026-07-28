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
 * POST /api/pirolisis/inventario/entrada-biologicos
 *
 * Registra una entrada de Biológicos DataLab en el inventario.
 *
 * MIGRADO (2026-07-27): Antes creaba en Entrada Insumos Pirolisis (local).
 * Ahora crea Movimiento Insumos (tipo="Entrada") en el Core.
 *
 * Body esperado:
 * - cantidad (number, requerido): cantidad de Biológicos a ingresar
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
    const biologicosRecordId = config.airtable.blendBiologicosRecordId;

    if (!token || !biologicosRecordId) {
      return NextResponse.json({
        success: false,
        error: 'Configuración incompleta: falta token o record ID de Biológicos',
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('📥 Entrada de Biológicos DataLab:', body);

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
      [movFields.insumo!]: [biologicosRecordId],
      [movFields.cantidad!]: cantidadNumerica,
      [movFields.tipoMovimiento!]: 'Entrada',
      // IDs core: área origen, área destino y responsable (SIRIUS-PER)
      ...buildCamposIdCore(idResponsableCore, 'entrada de Biológicos'),
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
      console.error('❌ Error al crear movimiento de Biológicos:', movimientoData);
      return NextResponse.json({
        success: false,
        error: 'Error al crear movimiento',
        details: movimientoData
      }, { status: createMovResponse.status });
    }

    const nuevoMovimientoId = movimientoData.records[0].id;
    console.log(`✅ Entrada de Biológicos registrada: ${nuevoMovimientoId}`);

    // Actualizar Stock Insumos
    // NOTA: No filtramos por área porque el campo "Area" no existe
    // NOTA 2: Insumo ID es multipleRecordLinks; el match se hace en JS sobre los
    //         record IDs. Ver src/lib/stock-insumos.ts
    const { record: stockRecord } = await findStockByInsumo(biologicosRecordId);

    if (!stockRecord) {
      console.error(`❌ Stock Insumos NO existe para Biológicos: ${biologicosRecordId}`);
      return NextResponse.json({
        success: false,
        error: 'No existe Stock para Biológicos',
        details: 'El insumo Biológicos debe tener un registro de Stock antes de agregar movimientos.'
      }, { status: 404 });
    }

    try {
      // Preserva los movimientos ya vinculados: el PATCH de un campo link
      // reemplaza el array completo.
      await appendMovimientoToStock(stockRecord.id, nuevoMovimientoId);
    } catch (linkErr: any) {
      console.error('❌ Error al actualizar Stock de Biológicos:', linkErr);
      return NextResponse.json({
        success: false,
        error: 'Movimiento creado pero faltó vincular al stock',
        details: String(linkErr?.message || linkErr)
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Entrada de Biológicos registrada: ${cantidadNumerica} L`,
      data: movimientoData.records[0]
    }, { status: 201 });

  } catch (err: any) {
    console.error('❌ Error en entrada-biologicos:', err);
    return NextResponse.json({
      success: false,
      error: String(err.message || err)
    }, { status: 500 });
  }
}

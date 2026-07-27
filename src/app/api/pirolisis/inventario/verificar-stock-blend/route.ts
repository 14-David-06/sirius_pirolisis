import { NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';
import {
  fetchAllStockInsumos,
  findStockInRecords,
  getStockActual,
} from '../../../../../lib/stock-insumos';

/**
 * GET /api/pirolisis/inventario/verificar-stock-blend
 *
 * Verifica si hay stock suficiente de Abono 4G y Biológicos DataLab
 * para producir una cantidad dada de Biochar Blend.
 *
 * MIGRADO (2026-07-27): Antes leía de Inventario Insumos Pirolisis (local).
 * Ahora lee de Insumo + Stock Insumos del Core.
 *
 * Query params:
 * - kgTotal: KG totales de Blend a producir (requerido)
 */
export async function GET(request: Request) {
  // Validar configuración
  if (!config.airtable.insumosCoreBaseId || !config.airtable.stockInsumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      error: 'Configuración de Sirius Insumos Core incompleta',
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;

    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
      }, { status: 500 });
    }

    // Leer query param kgTotal
    const { searchParams } = new URL(request.url);
    const kgTotalStr = searchParams.get('kgTotal');

    if (!kgTotalStr) {
      return NextResponse.json({
        error: 'Parámetro requerido faltante',
        details: 'Se requiere kgTotal (KG totales de Blend a producir)',
      }, { status: 400 });
    }

    const kgTotal = parseFloat(kgTotalStr);
    if (isNaN(kgTotal) || kgTotal <= 0) {
      return NextResponse.json({
        error: 'kgTotal inválido',
        details: 'kgTotal debe ser un número positivo',
      }, { status: 400 });
    }

    // Proporciones del Blend
    const { pctAbono, pctBiologicos } = config.blend;
    const kgAbono = kgTotal * pctAbono;
    const kgBiologicos = kgTotal * pctBiologicos;

    console.log(`🔍 Verificando stock para ${kgTotal} kg de Blend: Abono=${kgAbono.toFixed(2)} kg, Biológicos=${kgBiologicos.toFixed(2)} kg`);

    // NOTA: Campo {Area} no existe en Stock Insumos
    // NOTA 2: Insumo ID es multipleRecordLinks; el match se hace en JS sobre los
    //         record IDs. Ver src/lib/stock-insumos.ts
    const stockRecords = await fetchAllStockInsumos();

    const stockDe = (insumoRecordId: string) => {
      const { record } = findStockInRecords(insumoRecordId, stockRecords);
      return record ? getStockActual(record) : 0;
    };

    const stockAbono = stockDe(config.airtable.blendAbono4gRecordId!);
    const stockBiologicos = stockDe(config.airtable.blendBiologicosRecordId!);

    console.log(`📦 Stock disponible: Abono=${stockAbono} kg, Biológicos=${stockBiologicos} L`);

    // Verificar si hay suficiente
    const suficienteAbono = stockAbono >= kgAbono;
    const suficienteBiologicos = stockBiologicos >= kgBiologicos;
    const suficiente = suficienteAbono && suficienteBiologicos;

    const resultado = {
      suficiente,
      kgTotal,
      requerido: {
        abono: Number(kgAbono.toFixed(2)),
        biologicos: Number(kgBiologicos.toFixed(2)),
      },
      disponible: {
        abono: stockAbono,
        biologicos: stockBiologicos,
      },
      faltante: {
        abono: suficienteAbono ? 0 : Number((kgAbono - stockAbono).toFixed(2)),
        biologicos: suficienteBiologicos ? 0 : Number((kgBiologicos - stockBiologicos).toFixed(2)),
      },
    };

    if (!suficiente) {
      console.warn('⚠️ Stock insuficiente:', resultado.faltante);
    } else {
      console.log('✅ Stock suficiente para la producción');
    }

    return NextResponse.json(resultado, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en verificar-stock-blend:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';

// Campo fórmula: la REST API devuelve el valor con el nombre como clave
const FIELD_TOTAL_STOCK = 'Total Cantidad Stock';

export async function GET(request: NextRequest) {
  if (!config.airtable.inventarioTableId) {
    console.warn('⚠️ AIRTABLE_INVENTARIO_TABLE_ID no está configurado en .env.local');
    return NextResponse.json({
      error: 'AIRTABLE_INVENTARIO_TABLE_ID no está configurado. Revisa tu archivo .env.local',
      details: 'Para activar el módulo de inventario, configura AIRTABLE_INVENTARIO_TABLE_ID en .env.local',
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        error: 'Configuración de Airtable incompleta',
        details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID',
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const kgTotalParam = searchParams.get('kg_total');

    if (!kgTotalParam) {
      return NextResponse.json({
        error: 'Parámetro requerido faltante',
        details: 'Se requiere el query param: kg_total',
      }, { status: 400 });
    }

    const kgTotal = parseFloat(kgTotalParam);
    if (isNaN(kgTotal) || kgTotal <= 0) {
      return NextResponse.json({
        error: 'Parámetro inválido',
        details: 'kg_total debe ser un número positivo',
      }, { status: 400 });
    }

    const baseUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.inventarioTableId}`;
    const headers = {
      'Authorization': `Bearer ${config.airtable.token}`,
      'Content-Type': 'application/json',
    };

    // Fetch ambos records en paralelo
    const [r1, r2] = await Promise.all([
      fetch(`${baseUrl}/${config.airtable.blendAbono4gRecordId}`, { headers }),
      fetch(`${baseUrl}/${config.airtable.blendBiologicosRecordId}`, { headers }),
    ]);

    const [d1, d2] = await Promise.all([r1.json(), r2.json()]);

    if (!r1.ok) {
      console.error('❌ Error al obtener Abono 4G:', d1);
      return NextResponse.json({ error: d1?.error || 'Airtable error', details: d1 }, { status: r1.status });
    }
    if (!r2.ok) {
      console.error('❌ Error al obtener Biologicos DataLab:', d2);
      return NextResponse.json({ error: d2?.error || 'Airtable error', details: d2 }, { status: r2.status });
    }

    const stockAbono4g: number = d1.fields?.[FIELD_TOTAL_STOCK] ?? 0;
    const stockBiologicos: number = d2.fields?.[FIELD_TOTAL_STOCK] ?? 0;

    // Proporciones de la mezcla Biochar Blend
    const abono_necesario = kgTotal * 0.74;
    const biologicos_necesario = kgTotal * 0.007;

    // suficiente: true solo si AMBOS insumos cubren su proporción individualmente
    const abono_suficiente = stockAbono4g >= abono_necesario;
    const biologicos_suficiente = stockBiologicos >= biologicos_necesario;
    const suficiente = abono_suficiente && biologicos_suficiente;

    console.log(`📊 Verificación blend: kg_total=${kgTotal}, abono_necesario=${abono_necesario}, biologicos_necesario=${biologicos_necesario}, stock_abono4g=${stockAbono4g}, stock_biologicos=${stockBiologicos}, suficiente=${suficiente}`);

    return NextResponse.json({
      kg_total_solicitado: kgTotal,
      suficiente,
      proporciones: {
        abono_4g: { proporcion: 0.74, kg_necesario: abono_necesario, stock_actual: stockAbono4g, suficiente: abono_suficiente },
        biologicos_datalab: { proporcion: 0.007, kg_necesario: biologicos_necesario, stock_actual: stockBiologicos, suficiente: biologicos_suficiente },
      },
      stock: {
        abono_4g: {
          id: config.airtable.blendAbono4gRecordId,
          insumo: d1.fields?.['Insumo'] ?? 'Abono 4G',
          stock_actual: stockAbono4g,
        },
        biologicos_datalab: {
          id: config.airtable.blendBiologicosRecordId,
          insumo: d2.fields?.['Insumo'] ?? 'Biologicos DataLab',
          stock_actual: stockBiologicos,
        },
      },
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET verificar-stock-blend:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

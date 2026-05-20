import { NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';

// Campo fórmula: la REST API de Airtable lo devuelve con el nombre como clave
const FIELD_TOTAL_STOCK = 'Total Cantidad Stock';

export async function GET() {
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

    const insumos = [
      {
        id: d1.id,
        insumo: d1.fields?.['Insumo'] ?? null,
        categoria: d1.fields?.['Categoria Insumo'] ?? null,
        presentacion: d1.fields?.['Presentacion Insumo'] ?? null,
        stock_actual: d1.fields?.[FIELD_TOTAL_STOCK] ?? 0,
      },
      {
        id: d2.id,
        insumo: d2.fields?.['Insumo'] ?? null,
        categoria: d2.fields?.['Categoria Insumo'] ?? null,
        presentacion: d2.fields?.['Presentacion Insumo'] ?? null,
        stock_actual: d2.fields?.[FIELD_TOTAL_STOCK] ?? 0,
      },
    ];

    console.log('📊 Insumos Blend obtenidos:', insumos.map(i => `${i.insumo}: ${i.stock_actual}`).join(', '));

    return NextResponse.json({ insumos }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend-insumos:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

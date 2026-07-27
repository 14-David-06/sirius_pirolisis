import { NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';

/**
 * GET /api/pirolisis/inventario/blend-insumos
 *
 * Obtiene el stock actual de los insumos Blend (Abono 4G y Biológicos DataLab).
 *
 * MIGRADO (2026-07-27): Antes leía de Inventario Insumos Pirolisis (local).
 * Ahora lee de Insumo + Stock Insumos del Core.
 *
 * Los record IDs usados son los del Core:
 * - Abono 4G (SIRIUS-INS-0064): AIRTABLE_BLEND_ABONO_4G_RECORD_ID
 * - Biológicos DataLab (SIRIUS-INS-0065): AIRTABLE_BLEND_BIOLOGICOS_RECORD_ID
 */
export async function GET() {
  // Validar configuración
  if (!config.airtable.insumosCoreBaseId || !config.airtable.insumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      error: 'Configuración de Sirius Insumos Core incompleta',
      details: 'Faltan AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_INSUMOS_TABLE_ID',
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;
    const coreBaseId = config.airtable.insumosCoreBaseId;
    const insumosTableId = config.airtable.insumosTableId;
    const stockInsumosTableId = config.airtable.stockInsumosTableId;
    const pirolisisAreaCode = config.airtable.pirolisisAreaCode;

    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
        details: 'Falta AIRTABLE_GLOBAL_TOKEN',
      }, { status: 500 });
    }

    if (!config.airtable.blendAbono4gRecordId || !config.airtable.blendBiologicosRecordId) {
      return NextResponse.json({
        error: 'Record IDs de insumos Blend no configurados',
        details: 'Faltan AIRTABLE_BLEND_ABONO_4G_RECORD_ID o AIRTABLE_BLEND_BIOLOGICOS_RECORD_ID',
      }, { status: 500 });
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Helper para obtener insumo + su stock
    const fetchInsumoConStock = async (insumoRecordId: string) => {
      // 1. Leer insumo del catálogo
      const insumoUrl = `https://api.airtable.com/v0/${coreBaseId}/${insumosTableId}/${insumoRecordId}`;
      const insumoRes = await fetch(insumoUrl, { headers });
      const insumoData = await insumoRes.json();

      if (!insumoRes.ok) {
        throw new Error(`Error al leer insumo ${insumoRecordId}: ${JSON.stringify(insumoData)}`);
      }

      // 2. Buscar su stock en Stock Insumos
      // NOTA: Campo {Area} no existe en Stock Insumos
      // NOTA 2: Insumo ID es multipleRecordLinks, usamos FIND() para buscar el ID
      const stockFilter = encodeURIComponent(
        `SEARCH("${insumoRecordId}", {Insumo ID})`
      );
      const stockUrl = `https://api.airtable.com/v0/${coreBaseId}/${stockInsumosTableId}?filterByFormula=${stockFilter}`;
      const stockRes = await fetch(stockUrl, { headers });
      const stockData = await stockRes.json();

      const stockActual = stockData.records?.[0]?.fields?.stock_actual ?? 0;

      return {
        id: insumoData.id,
        insumo: insumoData.fields?.['Nombre'] ?? null,
        categoria: insumoData.fields?.['Categoria'] ?? null,  // Es un link, no texto
        presentacion: insumoData.fields?.['Unidad Base'] ?? null,  // Es un link, no texto
        stock_actual: stockActual,
      };
    };

    // Fetch ambos insumos en paralelo
    const [abono4g, biologicos] = await Promise.all([
      fetchInsumoConStock(config.airtable.blendAbono4gRecordId),
      fetchInsumoConStock(config.airtable.blendBiologicosRecordId),
    ]);

    const insumos = [abono4g, biologicos];

    console.log(
      '📊 Insumos Blend obtenidos:',
      insumos.map(i => `${i.insumo}: ${i.stock_actual}`).join(', ')
    );

    return NextResponse.json({ insumos }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend-insumos:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

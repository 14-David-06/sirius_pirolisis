import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { metricasQuerySchema, TIPO_USO_PRODUCTIVO, TIPO_USO_VALUES, type TipoUso } from '../../../../domain/entities/Inventario';

const SALIDAS_TABLE_ID = config.airtable.salidasTableId || 'Salida Insumos Pirolisis';

// Map legacy Spanish labels to ENUM values
function mapLegacyTipoForMetrics(raw: string): TipoUso {
  const legacy: Record<string, TipoUso> = {
    'consumo en proceso': 'balance_de_masa',
    'devolución a proveedor': 'ajuste_inventario',
    'ajuste': 'ajuste_inventario',
    'traslado a otro almacén': 'ajuste_inventario',
    'mantenimiento': 'limpieza_mantenimiento',
    'otro': 'otro',
  };
  const lower = raw.toLowerCase();
  if ((TIPO_USO_VALUES as readonly string[]).includes(lower)) return lower as TipoUso;
  return legacy[lower] || 'otro';
}

export async function GET(request: NextRequest) {
  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de Airtable incompleta',
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const queryParams = {
      insumo_id: searchParams.get('insumo_id') || undefined,
      fecha_inicio: searchParams.get('fecha_inicio') || undefined,
      fecha_fin: searchParams.get('fecha_fin') || undefined,
      turno_id: searchParams.get('turno_id') || undefined,
    };

    const validation = metricasQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Parámetros inválidos',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const params = validation.data;

    // Construir filtro de Airtable
    const filters: string[] = [];
    if (params.insumo_id) {
      const safeId = params.insumo_id.replace(/'/g, "\\'");
      filters.push(`FIND('${safeId}', ARRAYJOIN({Inventario Insumos Pirolisis}))`);
    }
    if (params.fecha_inicio) {
      filters.push(`IS_AFTER(CREATED_TIME(), '${params.fecha_inicio}T00:00:00.000Z')`);
    }
    if (params.fecha_fin) {
      filters.push(`IS_BEFORE(CREATED_TIME(), '${params.fecha_fin}T23:59:59.999Z')`);
    }
    if (params.turno_id) {
      const safeTurno = params.turno_id.replace(/'/g, "\\'");
      filters.push(`FIND('${safeTurno}', ARRAYJOIN({Turno Pirolisis}))`);
    }

    // Fetch todas las salidas con paginación
    let allRecords: Array<{ id: string; fields: Record<string, unknown>; createdTime: string }> = [];
    let offset: string | undefined;

    do {
      const urlParams = new URLSearchParams();
      urlParams.set('pageSize', '100');

      if (filters.length === 1) {
        urlParams.set('filterByFormula', filters[0]);
      } else if (filters.length > 1) {
        urlParams.set('filterByFormula', `AND(${filters.join(', ')})`);
      }

      if (offset) {
        urlParams.set('offset', offset);
      }

      const fetchUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${SALIDAS_TABLE_ID}?${urlParams.toString()}`;

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error de Airtable en métricas:', errorData);
        return NextResponse.json({
          success: false,
          error: 'Error al consultar salidas',
          details: errorData,
        }, { status: response.status });
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    // Calcular métricas
    let totalProductivas = 0;
    let totalOperativas = 0;
    const desglosePorTipo: Record<string, number> = {};
    const consumoPorTurnoMap: Record<string, number> = {};
    const balancesSet = new Set<string>();

    for (const record of allRecords) {
      const tipoUsoRaw = (record.fields['Tipo de Salida'] as string) || 'otro';
      const tipoUso = mapLegacyTipoForMetrics(tipoUsoRaw);
      const cantidad = (record.fields['Cantidad Sale'] as number) || 1;
      const esProductivo = TIPO_USO_PRODUCTIVO[tipoUso] ?? false;

      if (esProductivo) {
        totalProductivas += cantidad;
      } else {
        totalOperativas += cantidad;
      }

      desglosePorTipo[tipoUso] = (desglosePorTipo[tipoUso] || 0) + cantidad;

      // Consumo por turno
      const turnoLinks = record.fields['Turno Pirolisis'] as string[] | undefined;
      if (turnoLinks && turnoLinks.length > 0) {
        const turnoId = turnoLinks[0];
        consumoPorTurnoMap[turnoId] = (consumoPorTurnoMap[turnoId] || 0) + cantidad;
      }

      // Contar balances únicos
      const balanceLinks = record.fields['Balance Masa'] as string[] | undefined;
      if (balanceLinks) {
        for (const b of balanceLinks) {
          balancesSet.add(b);
        }
      }
    }

    const totalSalidas = totalProductivas + totalOperativas;
    const eficienciaPct = totalSalidas > 0 ? Math.round((totalProductivas / totalSalidas) * 10000) / 100 : 0;
    const unidadesPorBalance = balancesSet.size > 0 ? Math.round((totalProductivas / balancesSet.size) * 100) / 100 : 0;

    const consumoPorTurno = Object.entries(consumoPorTurnoMap).map(([turno_id, cantidad]) => ({
      turno_id,
      cantidad,
    }));

    return NextResponse.json({
      success: true,
      data: {
        total_salidas: totalSalidas,
        total_productivas: totalProductivas,
        total_operativas: totalOperativas,
        eficiencia_pct: eficienciaPct,
        desglose_por_tipo: desglosePorTipo,
        consumo_por_turno: consumoPorTurno,
        unidades_por_balance: unidadesPorBalance,
      },
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API metricas:', message);
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 });
  }
}

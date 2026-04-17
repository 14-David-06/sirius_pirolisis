import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';
import { metricasLonasQuerySchema, TIPO_USO_PRODUCTIVO, type TipoUso } from '../../../../../domain/entities/Inventario';

const SALIDAS_TABLE_ID = config.airtable.salidasTableId || 'Salida Insumos Pirolisis';
const INVENTARIO_TABLE_ID = config.airtable.inventarioTableId;

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
      fecha_inicio: searchParams.get('fecha_inicio') || undefined,
      fecha_fin: searchParams.get('fecha_fin') || undefined,
    };

    const validation = metricasLonasQuerySchema.safeParse(queryParams);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Parámetros inválidos',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const params = validation.data;

    // Paso 1: Obtener IDs de insumos con categoria = "lona"
    const lonaIds = await getInsumosIdsByCategoria('lona');

    if (lonaIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          fecha_inicio: params.fecha_inicio || null,
          fecha_fin: params.fecha_fin || null,
          total_lonas_productivas: 0,
          total_lonas_operativas: 0,
          eficiencia_pct: 0,
        },
      }, { status: 200 });
    }

    // Paso 2: Buscar salidas vinculadas a esos insumos (lonas)
    const filters: string[] = [];

    // Filtrar por insumos de tipo lona
    const lonaFilters = lonaIds.map(id => `FIND('${id}', ARRAYJOIN({Inventario Insumos Pirolisis}))`);
    if (lonaFilters.length === 1) {
      filters.push(lonaFilters[0]);
    } else {
      filters.push(`OR(${lonaFilters.join(', ')})`);
    }

    if (params.fecha_inicio) {
      filters.push(`IS_AFTER(CREATED_TIME(), '${params.fecha_inicio}T00:00:00.000Z')`);
    }
    if (params.fecha_fin) {
      filters.push(`IS_BEFORE(CREATED_TIME(), '${params.fecha_fin}T23:59:59.999Z')`);
    }

    // Fetch salidas con paginación
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
        console.error('❌ Error de Airtable en métricas lonas:', errorData);
        return NextResponse.json({
          success: false,
          error: 'Error al consultar salidas de lonas',
          details: errorData,
        }, { status: response.status });
      }

      const data = await response.json();
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    // Calcular métricas de lonas
    let totalProductivas = 0;
    let totalOperativas = 0;

    for (const record of allRecords) {
      const tipoUso = (record.fields['Tipo de Salida'] as string) || 'otro';
      const cantidad = (record.fields['Cantidad Sale'] as number) || 1;
      const esProductivo = TIPO_USO_PRODUCTIVO[tipoUso as TipoUso] ?? false;

      if (esProductivo) {
        totalProductivas += cantidad;
      } else {
        totalOperativas += cantidad;
      }
    }

    const total = totalProductivas + totalOperativas;
    const eficienciaPct = total > 0 ? Math.round((totalProductivas / total) * 10000) / 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        fecha_inicio: params.fecha_inicio || null,
        fecha_fin: params.fecha_fin || null,
        total_lonas_productivas: totalProductivas,
        total_lonas_operativas: totalOperativas,
        eficiencia_pct: eficienciaPct,
      },
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API metricas/lonas:', message);
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 });
  }
}

/**
 * Obtiene los IDs de registros de inventario que tienen Categoria Insumo = categoria
 */
async function getInsumosIdsByCategoria(categoria: string): Promise<string[]> {
  if (!INVENTARIO_TABLE_ID || !config.airtable.token || !config.airtable.baseId) {
    return [];
  }

  const urlParams = new URLSearchParams();
  urlParams.set('filterByFormula', `{Categoria Insumo} = '${categoria}'`);
  urlParams.set('fields[]', 'Insumo'); // Solo traer el campo nombre para eficiencia

  const url = `https://api.airtable.com/v0/${config.airtable.baseId}/${INVENTARIO_TABLE_ID}?${urlParams.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('❌ Error buscando insumos por categoría:', await response.text());
      return [];
    }

    const data = await response.json();
    return (data.records || []).map((r: { id: string }) => r.id);
  } catch (err) {
    console.error('❌ Error en getInsumosIdsByCategoria:', err);
    return [];
  }
}

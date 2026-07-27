import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE_ID = config.airtable.activosCoreBaseId;
const TABLE_ID = config.airtable.asignacionesTableId;

export async function GET(request: NextRequest) {
  // Verificar configuración
  if (!BASE_ID || !TABLE_ID) {
    return NextResponse.json({
      error: 'Módulo de Activos Fijos no configurado'
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado'
      }, { status: 500 });
    }

    // Leer filtros opcionales del query string
    const { searchParams } = new URL(request.url);
    const responsableFilter = searchParams.get('responsable');
    const areaFilter = searchParams.get('area');
    const soloActivas = searchParams.get('soloActivas') === 'true';
    const activoId = searchParams.get('activoId');

    // Construir filterByFormula de Airtable
    const filters: string[] = [];

    if (responsableFilter) {
      const safeResp = responsableFilter.replace(/'/g, "\\'");
      filters.push(`{Responsable} = '${safeResp}'`);
    }

    if (areaFilter) {
      const safeArea = areaFilter.replace(/'/g, "\\'");
      filters.push(`{Área del Responsable} = '${safeArea}'`);
    }

    if (soloActivas) {
      filters.push(`OR({Fecha Devolución} = '', {Fecha Devolución} = BLANK())`);
    }

    if (activoId) {
      // Filtrar por activo específico
      filters.push(`SEARCH('${activoId}', ARRAYJOIN({Activo}, ', '))`);
    }

    let url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
    const params = new URLSearchParams();

    if (filters.length === 1) {
      params.set('filterByFormula', filters[0]);
    } else if (filters.length > 1) {
      params.set('filterByFormula', `AND(${filters.join(', ')})`);
    }

    // Ordenar por fecha de asignación descendente
    params.set('sort[0][field]', 'Fecha Asignación');
    params.set('sort[0][direction]', 'desc');

    // Paginación
    params.set('pageSize', '100');

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    // Fetch con paginación automática
    let allRecords: unknown[] = [];
    let offset: string | undefined;

    do {
      const fetchUrl = offset
        ? `${url}${queryString ? '&' : '?'}offset=${offset}`
        : url;

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Error de Airtable:', data);
        return NextResponse.json({
          error: data?.error?.type || 'Airtable error',
          details: data
        }, { status: response.status });
      }

      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    console.log(`📊 Asignaciones obtenidas: ${allRecords.length} registros`);

    return NextResponse.json({ records: allRecords }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/asignaciones/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

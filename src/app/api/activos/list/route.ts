import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE_ID = config.airtable.activosCoreBaseId;
const TABLE_ID = config.airtable.activosFijosTableId;

export async function GET(request: NextRequest) {
  // Verificar configuración
  if (!BASE_ID || !TABLE_ID) {
    console.warn('⚠️ Configuración de Sirius Activos Core incompleta');
    return NextResponse.json({
      error: 'Módulo de Activos Fijos no configurado',
      details: 'Verifica AIRTABLE_ACTIVOS_CORE_BASE_ID y AIRTABLE_ACTIVOS_FIJOS_TABLE_ID en .env.local'
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
        details: 'Falta AIRTABLE_TOKEN o AIRTABLE_GLOBAL_TOKEN'
      }, { status: 500 });
    }

    // Leer filtros opcionales del query string
    const { searchParams } = new URL(request.url);
    const categoriaFilter = searchParams.get('categoria');
    const estadoFilter = searchParams.get('estado');
    const ubicacionFilter = searchParams.get('ubicacion');
    const areaFilter = searchParams.get('area');
    const soloAsignados = searchParams.get('soloAsignados') === 'true';
    const soloDisponibles = searchParams.get('soloDisponibles') === 'true';
    const proximosAVencer = searchParams.get('proximosAVencer') === 'true';

    // Construir filterByFormula de Airtable
    const filters: string[] = [];

    if (categoriaFilter) {
      const safeCat = categoriaFilter.replace(/'/g, "\\'");
      filters.push(`SEARCH('${safeCat}', ARRAYJOIN({Categoría}, ', '))`);
    }

    if (estadoFilter) {
      const safeEst = estadoFilter.replace(/'/g, "\\'");
      filters.push(`{Estado Operativo} = '${safeEst}'`);
    }

    if (ubicacionFilter) {
      const safeLoc = ubicacionFilter.replace(/'/g, "\\'");
      filters.push(`SEARCH('${safeLoc}', ARRAYJOIN({Ubicación Actual}, ', '))`);
    }

    if (areaFilter) {
      const safeArea = areaFilter.replace(/'/g, "\\'");
      filters.push(`{Área Responsable} = '${safeArea}'`);
    }

    if (soloAsignados) {
      filters.push(`AND({Responsable Asignado} != '', {Responsable Asignado} != BLANK())`);
    }

    if (soloDisponibles) {
      filters.push(`OR({Responsable Asignado} = '', {Responsable Asignado} = BLANK())`);
      filters.push(`{Estado Operativo} = 'Operativo'`);
    }

    if (proximosAVencer) {
      filters.push(`AND({Días para Vencimiento} <= 30, {Días para Vencimiento} > 0)`);
    }

    let url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
    const params = new URLSearchParams();

    if (filters.length === 1) {
      params.set('filterByFormula', filters[0]);
    } else if (filters.length > 1) {
      params.set('filterByFormula', `AND(${filters.join(', ')})`);
    }

    // Paginación: traer todos los registros usando pageSize y offset
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

    console.log(`📊 Activos obtenidos: ${allRecords.length} registros`);

    return NextResponse.json({ records: allRecords }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE_ID = config.airtable.activosCoreBaseId;
const TABLE_ID = config.airtable.activosFijosTableId;

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

    // Leer filtros opcionales
    const { searchParams } = new URL(request.url);
    const categoriaFilter = searchParams.get('categoria');
    const ubicacionFilter = searchParams.get('ubicacion');

    // Construir filterByFormula - Disponibles significa:
    // 1. Sin responsable asignado (campo vacío)
    // 2. Estado Operativo (funcionando correctamente)
    const filters: string[] = [
      'OR({Responsable Asignado} = "", {Responsable Asignado} = BLANK())',
      '{Estado Operativo} = "Operativo"'
    ];

    if (categoriaFilter) {
      const safeCat = categoriaFilter.replace(/'/g, "\\'");
      filters.push(`SEARCH('${safeCat}', ARRAYJOIN({Categoría}, ', '))`);
    }

    if (ubicacionFilter) {
      const safeLoc = ubicacionFilter.replace(/'/g, "\\'");
      filters.push(`SEARCH('${safeLoc}', ARRAYJOIN({Ubicación Actual}, ', '))`);
    }

    let url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
    const params = new URLSearchParams();

    params.set('filterByFormula', `AND(${filters.join(', ')})`);
    params.set('pageSize', '100');

    const queryString = params.toString();
    url += `?${queryString}`;

    // Fetch con paginación automática
    let allRecords: unknown[] = [];
    let offset: string | undefined;

    do {
      const fetchUrl = offset ? `${url}&offset=${offset}` : url;

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

    console.log(`📊 Activos disponibles: ${allRecords.length} registros`);

    return NextResponse.json({
      records: allRecords,
      total: allRecords.length
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/disponibles:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

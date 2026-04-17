import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el ID de la tabla de Inventario Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.inventarioTableId;

export async function GET(request: NextRequest) {
  // Verificar si la variable de entorno está configurada
  if (!TABLE_ID) {
    console.warn('⚠️ AIRTABLE_INVENTARIO_TABLE_ID no está configurado en .env.local');
    return NextResponse.json({
      error: 'AIRTABLE_INVENTARIO_TABLE_ID no está configurado. Revisa tu archivo .env.local',
      details: 'Para activar el módulo de inventario, configura AIRTABLE_INVENTARIO_TABLE_ID en .env.local'
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        error: 'Configuración de Airtable incompleta',
        details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID'
      }, { status: 500 });
    }

    // Leer filtros opcionales del query string
    const { searchParams } = new URL(request.url);
    const categoriaFilter = searchParams.get('categoria');
    const estadoFilter = searchParams.get('estado');

    // Construir filterByFormula de Airtable si hay filtros
    const filters: string[] = [];
    if (categoriaFilter) {
      const safeCat = categoriaFilter.replace(/'/g, "\\'");
      filters.push(`{Categoria Insumo} = '${safeCat}'`);
    }
    if (estadoFilter) {
      const safeEst = estadoFilter.replace(/'/g, "\\'");
      filters.push(`{Estado} = '${safeEst}'`);
    }

    let url = `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`;
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
        return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
      }

      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    console.log(`📊 Datos de inventario obtenidos: ${allRecords.length} registros`);

    return NextResponse.json({ records: allRecords }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API inventario:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
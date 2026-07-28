import { NextRequest, NextResponse } from 'next/server';
import { ACTIVOS_TABLE_IDS } from '@/lib/activos.fields';
import {
  ActivosError,
  assertActivosConfig,
  assertTabla,
  fetchAllRecords,
  normalizarAsignacion,
} from '@/lib/activos.server';

/**
 * GET /api/activos/asignaciones/list — historial de entregas y devoluciones.
 *
 * Filtros: `responsable`, `area`, `soloActivas`, `activoId`.
 * `activoId` se filtra en memoria porque comparar un campo de tipo link en
 * `filterByFormula` obliga a usar el nombre del registro vinculado (inestable),
 * no su record ID.
 */
export async function GET(request: NextRequest) {
  try {
    assertActivosConfig();
    const tableId = assertTabla(
      ACTIVOS_TABLE_IDS.asignaciones,
      'AIRTABLE_ASIGNACIONES_TABLE_ID'
    );

    const { searchParams } = new URL(request.url);
    const responsable = searchParams.get('responsable');
    const area = searchParams.get('area');
    const soloActivas = searchParams.get('soloActivas') === 'true';
    const activoId = searchParams.get('activoId');

    const filtros: string[] = [];
    if (responsable) filtros.push(`{Responsable} = '${responsable.replace(/'/g, "\\'")}'`);
    if (area) filtros.push(`{Área del Responsable} = '${area.replace(/'/g, "\\'")}'`);
    if (soloActivas) filtros.push('{Fecha Devolución} = BLANK()');

    const params = new URLSearchParams();
    if (filtros.length === 1) params.set('filterByFormula', filtros[0]);
    if (filtros.length > 1) params.set('filterByFormula', `AND(${filtros.join(', ')})`);
    params.set('sort[0][field]', 'Fecha Asignación');
    params.set('sort[0][direction]', 'desc');

    const crudos = await fetchAllRecords<{
      id: string;
      fields: Record<string, unknown>;
      createdTime: string;
    }>(tableId, params);

    let records = crudos.map(normalizarAsignacion);
    if (activoId) {
      records = records.filter((asignacion) => asignacion.fields.activoId === activoId);
    }

    return NextResponse.json({ records, total: records.length }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/asignaciones/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

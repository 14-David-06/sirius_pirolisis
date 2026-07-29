import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { MATERIAS_PRIMAS } from '../../../../lib/bodega.constants';
import { MOVIMIENTO_FIELD_NAMES } from '../../../../lib/movimientos-insumos';
import type { MovimientoBodega } from '../../../../types/bodega';
import type { MateriaPrimaKey } from '../../../../lib/bodega.constants';

/**
 * GET /api/bodega/movimientos?limit=20
 *
 * Últimos movimientos (entradas y salidas) de las materias primas del Blend que
 * viven en Sirius Insumos Core: bioabono y biológicos.
 *
 * El biochar NO aparece aquí: sus movimientos son remisiones de baches, no
 * movimientos de insumos. Se consultan en /sistema-baches.
 *
 * ⚠️ El match del insumo se hace en JS sobre los record IDs: en una fórmula de
 * Airtable un campo link se evalúa como el texto del campo primario del registro
 * vinculado, no como el record ID, así que `filterByFormula` no puede comparar
 * contra un `recXXX`. Ver src/lib/stock-insumos.ts.
 */

const AT = 'https://api.airtable.com/v0';

/** Páginas máximas a recorrer buscando movimientos de estas dos materias primas. */
const MAX_PAGINAS = 6;

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;

/**
 * Nombres REALES de los campos de `Movimientos Insumos` que se leen aquí,
 * verificados contra el schema de la base.
 *
 * ⚠️ `Cantidad ` lleva un espacio al final y las notas viven en un campo llamado
 * `Name`: son los nombres tal como están en Airtable, no erratas. Airtable
 * indexa `fields` por NOMBRE (no por field ID) salvo que se pida lo contrario,
 * así que estos strings son los que importan al leer.
 */
const CAMPO = {
  cantidad: 'Cantidad ',
  notas: 'Name',
} as const;

/**
 * Lee un campo tolerando el nombre canónico, alias razonables y el field ID.
 * Airtable indexa `fields` por NOMBRE salvo que se pida por field ID.
 */
function readField(
  fields: Record<string, unknown> | undefined,
  nombres: string[],
  fieldId?: string
): unknown {
  if (!fields) return undefined;
  for (const nombre of nombres) {
    if (fields[nombre] !== undefined) return fields[nombre];
  }
  if (fieldId && fields[fieldId] !== undefined) return fields[fieldId];
  return undefined;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry && typeof entry === 'object' && 'id' in entry) {
        const id = (entry as { id?: unknown }).id;
        return typeof id === 'string' ? id : null;
      }
      return null;
    })
    .filter((id): id is string => Boolean(id));
}

export async function GET(request: Request) {
  const token = config.airtable.insumosCoreToken;
  const baseId = config.airtable.insumosCoreBaseId;
  const tableId = config.airtable.movimientosInsumosTableId;

  if (!token || !baseId || !tableId) {
    return NextResponse.json({
      error: 'Configuración de Movimientos Insumos incompleta',
      details:
        'Faltan AIRTABLE_GLOBAL_TOKEN, AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_MOVIMIENTOS_INSUMOS_TABLE_ID',
    }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = parseInt(searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, LIMIT_MAX)
    : LIMIT_DEFAULT;

  // insumoId → materia prima
  const materiaPorInsumo = new Map<string, MateriaPrimaKey>();
  if (config.airtable.blendAbono4gRecordId) {
    materiaPorInsumo.set(config.airtable.blendAbono4gRecordId, 'bioabono');
  }
  if (config.airtable.blendBiologicosRecordId) {
    materiaPorInsumo.set(config.airtable.blendBiologicosRecordId, 'biologicos');
  }

  if (materiaPorInsumo.size === 0) {
    return NextResponse.json({
      error: 'Record IDs de las materias primas no configurados',
      details: 'Faltan AIRTABLE_BLEND_ABONO_4G_RECORD_ID y AIRTABLE_BLEND_BIOLOGICOS_RECORD_ID',
    }, { status: 400 });
  }

  try {
    const movimientos: MovimientoBodega[] = [];
    let offset: string | undefined;
    let paginas = 0;

    do {
      const url = new URL(`${AT}/${baseId}/${tableId}`);
      url.searchParams.set('pageSize', '100');
      // ID es autonumber: descendente = del más reciente al más antiguo.
      url.searchParams.set('sort[0][field]', MOVIMIENTO_FIELD_NAMES.id);
      url.searchParams.set('sort[0][direction]', 'desc');
      if (offset) url.searchParams.set('offset', offset);

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Error al leer Movimientos Insumos: ${JSON.stringify(data)}`);
      }

      for (const record of data.records ?? []) {
        const insumoIds = toRecordIds(
          readField(record.fields, [MOVIMIENTO_FIELD_NAMES.insumo], config.airtable.movimientoFields.insumo)
        );
        const key = insumoIds.map((id) => materiaPorInsumo.get(id)).find(Boolean);
        if (!key) continue;

        const def = MATERIAS_PRIMAS[key];

        movimientos.push({
          id: record.id,
          codigo: String(
            readField(record.fields, [MOVIMIENTO_FIELD_NAMES.codigo]) ?? record.id
          ),
          materia: key,
          materiaNombre: def.nombre,
          tipo: String(
            readField(
              record.fields,
              [MOVIMIENTO_FIELD_NAMES.tipoMovimiento],
              config.airtable.movimientoFields.tipoMovimiento
            ) ?? ''
          ),
          cantidad: toNumber(
            readField(
              record.fields,
              [CAMPO.cantidad, 'Cantidad'],
              config.airtable.movimientoFields.cantidad
            )
          ),
          unidad: def.unidad,
          notas: String(
            readField(
              record.fields,
              [CAMPO.notas, 'Notas'],
              config.airtable.movimientoFields.notas
            ) ?? ''
          ),
          fecha: record.createdTime ?? null,
        });

        if (movimientos.length >= limit) break;
      }

      offset = data.offset;
      paginas++;
    } while (offset && paginas < MAX_PAGINAS && movimientos.length < limit);

    const truncado = movimientos.length >= limit || (Boolean(offset) && paginas >= MAX_PAGINAS);

    return NextResponse.json({ movimientos, limit, truncado }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET bodega/movimientos:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

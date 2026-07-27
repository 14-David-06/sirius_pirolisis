import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { fetchAllStockInsumos, getInsumoIds, getMovimientoIds, getStockActual } from '../../../../lib/stock-insumos';

/**
 * GET /api/inventario/list
 *
 * Lista insumos de Sirius Insumos Core con el stock del área Pirólisis.
 *
 * MIGRADO (2026-07-27): Antes leía Inventario Insumos Pirolisis (local).
 * Ahora lee Insumo + Stock Insumos del Core.
 *
 * Query params opcionales:
 * - categoria: filtra por NOMBRE de categoría (ej. "Repuestos y Refacciones")
 *
 * Cada registro devuelve, además de los campos crudos del Core, campos
 * normalizados para el frontend:
 * - codigo          → "SIRIUS-INS-0059"
 * - categorias      → todos los nombres de categoría (un insumo puede tener varias)
 * - unidad          → símbolo de la unidad base ("und", "kg", "L")
 * - unidad_nombre   → nombre de la unidad ("Unidad", "Kilogramo", "Litro")
 * - stock_actual    → stock real calculado por el Core
 * - stock_minimo    → umbral de alerta
 * - estado_calculado→ 'agotado' | 'por_agotarse' | 'disponible'
 */

const AT = 'https://api.airtable.com/v0';

interface AirtableRecord {
  id: string;
  createdTime?: string;
  fields: Record<string, any>;
}

/** Lee una tabla completa siguiendo la paginación de Airtable. */
async function fetchTable(
  baseId: string,
  tableId: string,
  token: string,
  filterByFormula?: string
): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${AT}/${baseId}/${tableId}`);
    url.searchParams.set('pageSize', '100');
    if (filterByFormula) url.searchParams.set('filterByFormula', filterByFormula);
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Error al leer ${tableId}: ${JSON.stringify(data)}`);
    }

    all.push(...(data.records ?? []));
    offset = data.offset;
  } while (offset);

  return all;
}

/** Normaliza un campo link a un array de record IDs. */
function toRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object' && 'id' in entry
          ? String((entry as { id: unknown }).id)
          : null
    )
    .filter((id): id is string => Boolean(id));
}

function toNumber(value: unknown): number {
  // Las fórmulas de Airtable pueden devolver { specialValue: 'NaN' }.
  const n = typeof value === 'object' && value !== null ? NaN : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  if (!config.airtable.insumosCoreBaseId || !config.airtable.insumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      error: 'Configuración de Sirius Insumos Core incompleta',
      details: 'Faltan AIRTABLE_INSUMOS_CORE_BASE_ID o AIRTABLE_INSUMOS_TABLE_ID en .env.local'
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;
    const coreBaseId = config.airtable.insumosCoreBaseId;
    const insumosTableId = config.airtable.insumosTableId;
    const categoriaTableId = config.airtable.categoriaInsumoTableId;
    const unidadesTableId = config.airtable.unidadesMedidaTableId;
    const pirolisisAreaCode = config.airtable.pirolisisAreaCode;

    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
        details: 'Falta AIRTABLE_GLOBAL_TOKEN'
      }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const categoriaFilter = searchParams.get('categoria');

    // ═══════════════════════════════════════════════════════════════════════════
    // Cargar en PARALELO todo lo necesario.
    //
    // ⚠️ Antes se resolvían categoría y unidad con un fetch por insumo (N+1):
    // ~52 requests secuenciales para 26 insumos, contra un límite de 5 req/s.
    // Las tablas de catálogo son pequeñas: se leen enteras una vez y el join
    // se hace en memoria.
    // ═══════════════════════════════════════════════════════════════════════════
    const [insumos, categoriaRecords, unidadRecords, stockRecords] = await Promise.all([
      fetchTable(coreBaseId, insumosTableId, token, `{ID Area Origen} = '${pirolisisAreaCode}'`),
      categoriaTableId ? fetchTable(coreBaseId, categoriaTableId, token) : Promise.resolve([]),
      unidadesTableId ? fetchTable(coreBaseId, unidadesTableId, token) : Promise.resolve([]),
      fetchAllStockInsumos(),
    ]);

    console.log(
      `📦 Core: ${insumos.length} insumos, ${categoriaRecords.length} categorías, ` +
      `${unidadRecords.length} unidades, ${stockRecords.length} registros de stock`
    );

    // Catálogos: recordId → nombre legible
    const nombreCategoria = new Map<string, string>();
    for (const cat of categoriaRecords) {
      const nombre = cat.fields?.['Tipo de insumo'];
      if (typeof nombre === 'string' && nombre) nombreCategoria.set(cat.id, nombre);
    }

    const unidadPorId = new Map<string, { simbolo: string; nombre: string }>();
    for (const unidad of unidadRecords) {
      const nombre = String(unidad.fields?.['Nombre'] ?? '');
      const simbolo = String(unidad.fields?.['Simbolo'] ?? '') || nombre;
      if (simbolo) unidadPorId.set(unidad.id, { simbolo, nombre: nombre || simbolo });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Mapa insumo → stock.
    // Si hay registros de Stock duplicados para un insumo (ver
    // src/lib/stock-insumos.ts), gana el que tiene más movimientos vinculados:
    // "el último gana" haría que un duplicado vacío mostrara el insumo en 0.
    // ═══════════════════════════════════════════════════════════════════════════
    const stockPorInsumo = new Map<string, { stock: number; movimientos: number }>();

    for (const stockRecord of stockRecords) {
      const stock = getStockActual(stockRecord);
      const movimientos = getMovimientoIds(stockRecord).length;

      for (const insumoId of getInsumoIds(stockRecord)) {
        const previo = stockPorInsumo.get(insumoId);
        if (previo && previo.movimientos >= movimientos) {
          console.warn(`⚠️ Stock duplicado para insumo ${insumoId}; se ignora ${stockRecord.id}`);
          continue;
        }
        stockPorInsumo.set(insumoId, { stock, movimientos });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Normalizar cada insumo (join en memoria, sin más requests)
    // ═══════════════════════════════════════════════════════════════════════════
    const registros = insumos.map((insumo) => {
      const stockActual = stockPorInsumo.get(insumo.id)?.stock ?? 0;

      // Un insumo puede pertenecer a VARIAS categorías.
      const categorias = toRecordIds(insumo.fields?.['Categoria'])
        .map((id) => nombreCategoria.get(id))
        .filter((nombre): nombre is string => Boolean(nombre));

      // Unidad: símbolo de la unidad base; si no está, el texto libre
      // "Unidad Medida" del insumo.
      const unidadIds = toRecordIds(insumo.fields?.['Unidad Base']);
      const unidadBase = unidadIds.map((id) => unidadPorId.get(id)).find(Boolean);
      const unidadTexto = typeof insumo.fields?.['Unidad Medida'] === 'string'
        ? insumo.fields['Unidad Medida']
        : '';

      const unidad = unidadBase?.simbolo || unidadTexto || 'und';
      const unidadNombre = unidadBase?.nombre || unidadTexto || 'Unidad';

      const stockMinimo = toNumber(insumo.fields?.['Stock Minimo']);

      // Estado derivado del stock real. El campo "Estado Insumo" del Core
      // (Activo/Inactivo/Stock) describe el ciclo de vida del catálogo, no la
      // disponibilidad, y está vacío en la mayoría de los insumos.
      const estadoCalculado =
        stockActual <= 0
          ? 'agotado'
          : stockMinimo > 0 && stockActual <= stockMinimo
            ? 'por_agotarse'
            : 'disponible';

      return {
        id: insumo.id,
        createdTime: insumo.createdTime,
        fields: {
          ...insumo.fields,

          // — Campos normalizados para el frontend —
          codigo: insumo.fields?.['Código SIRIUS-INS'] ?? '',
          categorias,
          unidad,
          unidad_nombre: unidadNombre,
          stock_actual: stockActual,
          stock_minimo: stockMinimo,
          estado_calculado: estadoCalculado,
          estado_catalogo: insumo.fields?.['Estado Insumo'] ?? '',

          // — Alias de compatibilidad —
          'Insumo': insumo.fields?.['Nombre'] ?? 'Sin nombre',
          'Categoria Insumo': categorias.join(', '),
          'Total Cantidad Stock': stockActual,
          'Unidad Base': unidad,
        },
      };
    });

    // Filtro por nombre de categoría (en memoria: el campo es un link, no texto)
    const resultados = categoriaFilter
      ? registros.filter((r) =>
          r.fields.categorias.some(
            (cat) => cat.toLowerCase() === categoriaFilter.toLowerCase()
          )
        )
      : registros;

    console.log(`✅ Inventario con stock calculado: ${resultados.length} registros`);

    return NextResponse.json({ records: resultados }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API inventario/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

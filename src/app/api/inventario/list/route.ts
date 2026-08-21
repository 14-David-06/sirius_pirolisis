import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { STOCK_MINIMO_DEFAULT } from '../../../../lib/inventario.constants';
import { fetchAllStockInsumos, getInsumoIds, getMovimientoIds, getStockActual } from '../../../../lib/stock-insumos';

/**
 * GET /api/inventario/list
 *
 * Lista insumos de Sirius Insumos Core con el stock del área Pirólisis.
 *
 * MIGRADO (2026-07-27): Antes leía Inventario Insumos Pirolisis (local).
 * Ahora lee Insumo + Stock Insumos del Core.
 *
 * SIN CATEGORÍAS (2026-07-28): los consumibles del área no se clasifican, así
 * que ya no se lee la tabla `Categoria Insumo` ni se acepta el filtro
 * `?categoria=`. Ver src/lib/inventario.constants.ts.
 *
 * SIN MATERIAS PRIMAS DEL BLEND (2026-07-29): el bioabono (Abono 4G) y los
 * biológicos se excluyen de este listado. Son materias primas de producción, no
 * consumibles del área, y se controlan en /bodega con su propia lógica (stock
 * mínimo derivado de la fórmula, capacidad de producción, deducción automática
 * al producir Blend). Mostrarlos también aquí obligaba al operario a decidir en
 * qué módulo mirar y hacía que las alertas de reposición de consumibles se
 * mezclaran con las de producción. El stock sigue siendo el MISMO registro del
 * Core: esto solo cambia dónde se ve.
 *
 * Cada registro devuelve, además de los campos crudos del Core, campos
 * normalizados para el frontend:
 * - codigo          → "SIRIUS-INS-0059"
 * - unidad          → símbolo de la unidad base ("und", "kg", "L")
 * - unidad_nombre   → nombre de la unidad ("Unidad", "Kilogramo", "Litro")
 * - stock_actual    → stock real calculado por el Core
 * - stock_minimo    → umbral de alerta (STOCK_MINIMO_DEFAULT si el Core no lo tiene)
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

export async function GET() {
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
    const unidadesTableId = config.airtable.unidadesMedidaTableId;
    const pirolisisAreaCode = config.airtable.pirolisisAreaCode;

    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado',
        details: 'Falta AIRTABLE_GLOBAL_TOKEN'
      }, { status: 500 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Cargar en PARALELO todo lo necesario.
    //
    // ⚠️ Antes se resolvía la unidad con un fetch por insumo (N+1): ~26 requests
    // secuenciales contra un límite de 5 req/s. La tabla de unidades es pequeña:
    // se lee entera una vez y el join se hace en memoria.
    //
    // El filtro por área es la garantía de aislamiento: solo entran insumos con
    // `ID Area Origen` = Pirólisis, así que nada de otras áreas llega a la UI.
    // ═══════════════════════════════════════════════════════════════════════════
    const [insumos, unidadRecords, stockRecords] = await Promise.all([
      fetchTable(coreBaseId, insumosTableId, token, `{ID Area Origen} = '${pirolisisAreaCode}'`),
      unidadesTableId ? fetchTable(coreBaseId, unidadesTableId, token) : Promise.resolve([]),
      fetchAllStockInsumos(),
    ]);

    console.log(
      `📦 Core: ${insumos.length} insumos, ${unidadRecords.length} unidades, ` +
      `${stockRecords.length} registros de stock`
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // Excluir las materias primas del Blend: viven en /bodega.
    // Se filtra por record ID (no por nombre) para que renombrar el insumo en el
    // Core no reviva la exclusión ni la rompa. Ver src/lib/bodega.constants.ts.
    //
    // `Biochar Puro` también, pero por otra razón: desde el 2026-08-21 dejó de ser
    // un insumo (es un producto, y su libro mayor es Inventario Production Core). El
    // registro sigue existiendo en Insumos Core con su histórico y en stock 0, y sin
    // esta exclusión aparecería como un consumible agotado que nadie puede reponer.
    // ═══════════════════════════════════════════════════════════════════════════
    const insumosBodega = new Set(
      [
        config.airtable.blendAbono4gRecordId,
        config.airtable.blendBiologicosRecordId,
        config.airtable.blendBiocharInsumoRecordId,
      ].filter((id): id is string => Boolean(id))
    );

    const insumosConsumibles = insumos.filter((insumo) => !insumosBodega.has(insumo.id));

    if (insumosConsumibles.length !== insumos.length) {
      console.log(
        `🏬 ${insumos.length - insumosConsumibles.length} materia(s) prima(s) del Blend excluidas del inventario de consumibles (se ven en /bodega)`
      );
    }

    // Catálogo: recordId → unidad legible
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
    const registros = insumosConsumibles.map((insumo) => {
      const stockActual = stockPorInsumo.get(insumo.id)?.stock ?? 0;

      // Unidad: símbolo de la unidad base; si no está, el texto libre
      // "Unidad Medida" del insumo.
      const unidadIds = toRecordIds(insumo.fields?.['Unidad Base']);
      const unidadBase = unidadIds.map((id) => unidadPorId.get(id)).find(Boolean);
      const unidadTexto = typeof insumo.fields?.['Unidad Medida'] === 'string'
        ? insumo.fields['Unidad Medida']
        : '';

      const unidad = unidadBase?.simbolo || unidadTexto || 'und';
      const unidadNombre = unidadBase?.nombre || unidadTexto || 'Unidad';

      // Stock mínimo: el del Core si está definido; si no, el default del área
      // (2 und), para que el insumo siempre tenga umbral de reposición.
      const stockMinimoCore = toNumber(insumo.fields?.['Stock Minimo']);
      const stockMinimo = stockMinimoCore > 0 ? stockMinimoCore : STOCK_MINIMO_DEFAULT;

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
          unidad,
          unidad_nombre: unidadNombre,
          stock_actual: stockActual,
          stock_minimo: stockMinimo,
          estado_calculado: estadoCalculado,
          estado_catalogo: insumo.fields?.['Estado Insumo'] ?? '',

          // — Alias de compatibilidad —
          'Insumo': insumo.fields?.['Nombre'] ?? 'Sin nombre',
          'Total Cantidad Stock': stockActual,
          'Unidad Base': unidad,
        },
      };
    });

    console.log(`✅ Inventario con stock calculado: ${registros.length} registros`);

    return NextResponse.json({ records: registros }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API inventario/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

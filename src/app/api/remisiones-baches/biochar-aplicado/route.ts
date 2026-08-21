import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { escapeAirtableValue } from '../../../../lib/airtable-escape';

const REMISIONES_TABLE = config.airtable.remisionesBachesTableId;
const DETALLE_TABLE = config.airtable.detalleCantidadesRemisionTableId;

const FECHA_FIELD = 'Fecha Evento';
const DETALLE_LINK_FIELD = 'Detalle Cantidades Bache Pirolisis';
const KG_FIELD = 'Cantidad Especificada (KG)';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Biochar seco que SALIÓ de los baches en el período, en kg y toneladas.
 * Es el denominador MRV del dashboard de carbono total (remoción bruta = 2,6 t
 * CO₂ por t aplicada).
 *
 * REESCRITO (2026-08-21): antes leía `blend_remisiones` de PiroliApp sumando su
 * campo `KG Biochar Puro`. Esa tabla se BORRÓ al invertirse la propiedad de las
 * remisiones hacia Remisiones Core, así que la petición devolvía
 * INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND → 500, y `useCarbonoTotal` traduce
 * cualquier fallo a 0 t aplicadas: la cascada mostraba remoción bruta 0 y CORCs
 * negativos como si fueran datos reales.
 *
 * La fuente ahora es `Remisiones Baches Pirolisis` + su `Detalle Cantidades`,
 * que es el libro local de todo biochar puro que sale de un bache: remisiones a
 * cliente, salidas sin producir (`runSalidaBache`), actas de entrega y el
 * consumo para producir Blend. Todo en MASA SECA, que es la única base que
 * maneja la app.
 *
 * ⚠️ El biochar que va a Blend queda fechado el día en que salió del bache
 * (producción del lote), no el día en que el Blend se despachó al cliente. Para
 * la huella por tonelada da igual mientras el período sea amplio; en un mes
 * suelto puede desfasar.
 */
export async function POST(request: NextRequest) {
  try {
    const { fecha_inicio, fecha_fin } = await request.json();

    if (!fecha_inicio || !fecha_fin) {
      return NextResponse.json({ error: 'fecha_inicio y fecha_fin son requeridos' }, { status: 400 });
    }
    if (!FECHA_ISO.test(fecha_inicio) || !FECHA_ISO.test(fecha_fin)) {
      return NextResponse.json({ error: 'fecha_inicio y fecha_fin deben ser YYYY-MM-DD' }, { status: 400 });
    }

    const { token, baseId } = config.airtable;
    if (!token || !baseId || !REMISIONES_TABLE || !DETALLE_TABLE) {
      return NextResponse.json({ error: 'Configuración de Airtable incompleta' }, { status: 500 });
    }

    const fetchAll = async (tableId: string, params: Record<string, string>) => {
      const records: { id: string; fields: Record<string, unknown> }[] = [];
      let offset: string | undefined;
      do {
        const search = new URLSearchParams({ ...params, pageSize: '100' });
        if (offset) search.set('offset', offset);
        const response = await fetch(
          `https://api.airtable.com/v0/${baseId}/${tableId}?${search.toString()}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || `Airtable error (${tableId}): ${response.status}`);
        }
        records.push(...(data.records ?? []));
        offset = data.offset;
      } while (offset);
      return records;
    };

    const formula = `AND(`
      + `NOT(IS_BEFORE({${FECHA_FIELD}}, '${escapeAirtableValue(fecha_inicio)}')),`
      + `NOT(IS_AFTER({${FECHA_FIELD}}, '${escapeAirtableValue(fecha_fin)}'))`
      + `)`;

    // Dos lecturas completas y el cruce en JS, no una consulta por remisión: el
    // rate limit de Airtable es de 5 req/s por base y este endpoint se dispara
    // en paralelo con los otros dos del dashboard.
    const [remisiones, detalles] = await Promise.all([
      fetchAll(REMISIONES_TABLE, { filterByFormula: formula }),
      fetchAll(DETALLE_TABLE, {}),
    ]);

    const kgPorDetalle = new Map<string, number>();
    for (const detalle of detalles) {
      const kg = detalle.fields[KG_FIELD];
      kgPorDetalle.set(detalle.id, typeof kg === 'number' ? kg : 0);
    }

    let biocharSecoKg = 0;
    for (const remision of remisiones) {
      const links = remision.fields[DETALLE_LINK_FIELD];
      if (!Array.isArray(links)) continue;
      for (const link of links) {
        if (typeof link === 'string') biocharSecoKg += kgPorDetalle.get(link) ?? 0;
      }
    }

    return NextResponse.json({
      success: true,
      biocharSecoKg,
      biocharSecoTon: biocharSecoKg / 1000,
      bachesCount: remisiones.length,
      fecha_inicio,
      fecha_fin,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('❌ [biochar-aplicado]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

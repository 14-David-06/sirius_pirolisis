import { NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';
import {
  fetchAllStockInsumos,
  findStockInRecords,
  getStockActual,
} from '../../../../../lib/stock-insumos';
import { resolverBiocharDisponible } from '../../../../../lib/baches-biochar';
import { calcularCapacidadBlend } from '../../../../../lib/bodega.constants';
import { getProduccionBlend } from '../../../../../lib/blend-produccion-core';
import {
  calcularAgenda,
  ESTADOS_CERRADOS,
  type PedidoAgendable,
} from '../../../../../lib/agenda-blend';

/**
 * GET /api/pirolisis/blend/agenda
 *
 * Agenda de producción de Biochar Blend: los pedidos ordenados por fecha de
 * entrega, con la materia prima que compromete cada uno y si la bodega alcanza
 * a cubrirlos.
 *
 * La regla de cobertura (acumulada, no por pedido) vive en
 * `src/lib/agenda-blend.ts` y está cubierta por tests. Aquí solo se leen los
 * datos y se aplican los filtros de presentación.
 *
 * Query params opcionales:
 * - desde / hasta: ISO date (YYYY-MM-DD) para acotar el rango mostrado.
 * - incluirCerrados: 'false' para omitir despachados y cancelados.
 */

interface PedidoApi {
  id: string;
  fields: Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const incluirCerrados = searchParams.get('incluirCerrados') !== 'false';

    // Los pedidos se piden al endpoint que ya los normaliza (enriquece cliente
    // desde Clients Core, parsea empaque/KG de las notas y mapea estados del
    // Core a los de la app). Duplicar esa lógica aquí la haría divergir.
    const requestOrigin = new URL(request.url).origin;
    const pedidosRes = await fetch(
      new URL('/api/pirolisis/blend/pedidos', requestOrigin).toString(),
      { method: 'GET' }
    );
    const pedidosData = await pedidosRes.json();

    if (!pedidosRes.ok) {
      return NextResponse.json(
        { error: 'No se pudieron leer los pedidos de Blend', details: pedidosData },
        { status: 502 }
      );
    }

    const registros: PedidoApi[] = pedidosData.records ?? [];

    const pedidos: PedidoAgendable[] = registros.map((pedido) => ({
      pedidoRecordId: pedido.id,
      idPedidoCore: String(pedido.fields['ID Pedido Core'] ?? ''),
      cliente: String(pedido.fields['Cliente'] ?? ''),
      nit: String(pedido.fields['NIT Cliente'] ?? ''),
      // 'Fecha Requerida' es la fecha de entrega comprometida; hoy el Core la
      // guarda en el mismo campo que la fecha de pedido, de ahí el respaldo.
      fecha: String(pedido.fields['Fecha Requerida'] || pedido.fields['Fecha Pedido'] || ''),
      kg: Number(pedido.fields['KG Total Pedido'] ?? 0),
      estado: String(pedido.fields['Estado'] ?? ''),
      empaque: String(pedido.fields['Empaque'] ?? ''),
      observaciones: String(pedido.fields['Observaciones'] ?? ''),
      kgFuente: String(pedido.fields['_kgFuente'] ?? ''),
      detalleRecordId: String(pedido.fields['_detalleRecordId'] ?? ''),
    }));

    // Stock disponible de las tres materias primas + producción registrada, en
    // paralelo. Ninguna depende de las otras y son 4 bases distintas.
    const [stockRecords, produccion] = await Promise.all([
      fetchAllStockInsumos(),
      getProduccionBlend().catch(() => null),
    ]);

    // Con el `Stock Insumos` ya leído: el resolutor lo necesita para el saldo del
    // biochar y paginar la misma tabla dos veces gasta el límite de 5 req/s.
    const biochar = await resolverBiocharDisponible(stockRecords);

    const stockDe = (insumoRecordId: string | undefined) => {
      if (!insumoRecordId) return 0;
      const { record } = findStockInRecords(insumoRecordId, stockRecords);
      return record ? getStockActual(record) : 0;
    };

    const disponible = {
      biochar: biochar.kg,
      abono: stockDe(config.airtable.blendAbono4gRecordId),
      biologicos: stockDe(config.airtable.blendBiologicosRecordId),
    };

    const { pctBiochar, pctAbono, pctBiologicos, pctAgua } = config.blend;

    // La misma cuenta que hace la bodega, con la misma función: "hasta dónde
    // alcanza la materia prima" no puede dar dos respuestas según la pantalla.
    const capacidad = calcularCapacidadBlend({
      biochar: disponible.biochar,
      bioabono: disponible.abono,
      biologicos: disponible.biologicos,
    });

    const { eventos, resumen } = calcularAgenda(pedidos, disponible, {
      pctBiochar,
      pctAbono,
      pctBiologicos,
    });

    // Filtros de PRESENTACIÓN: se aplican después de calcular, para que acotar el
    // rango de fechas no altere el compromiso ya contraído por pedidos anteriores.
    let visibles = eventos;
    if (!incluirCerrados) {
      visibles = visibles.filter((e) => !ESTADOS_CERRADOS.has(e.estado));
    }
    if (desde) visibles = visibles.filter((e) => !e.fecha || e.fecha >= desde);
    if (hasta) visibles = visibles.filter((e) => !e.fecha || e.fecha <= hasta);

    console.log(
      `📅 Agenda Blend: ${resumen.pedidosTotales} pedidos (${resumen.pedidosAbiertos} abiertos), ` +
      `${resumen.kgComprometidos} kg comprometidos, ${resumen.kgCubiertos} kg cubiertos` +
      ` · capacidad ${capacidad.kgBlend} kg de Blend (limita ${capacidad.limitante ?? 'nada'})`
    );

    return NextResponse.json(
      {
        eventos: visibles,
        disponible,
        formula: { pctBiochar, pctAbono, pctBiologicos, pctAgua },
        capacidad,
        resumen,
        produccion,
        fuenteBiochar: {
          origen: biochar.origen,
          kgBaches: biochar.kgBaches,
          kgCore: biochar.kgCore,
          divergencia: biochar.divergencia,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/agenda:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../../lib/config';
import { getProduccionPorPedido } from '../../../../../../lib/blend-produccion-core';

// GET /api/pirolisis/blend/produccion/by-pedido?pedido=SIRIUS-PED-XXXX
//
// Resuelve la producción de Biochar Blend de un pedido.
//
// ⚠️ MIGRACIÓN 2026-07-30: antes leía la tabla local `Produccion Biochar Blend
// Pirolisis`. Ahora la producción vive en los Core: la Entrada de producto
// terminado en Sirius Inventario Production Core (atribuida al pedido por
// `ubicacion_destino_id`) da el lote y los KG, y las Salidas de biochar en Sirius
// Insumos Core con ese lote en `ID Produccion Destino` dan los baches y sus KG.
//
// El pedido vive en Sirius Pedidos Core sin link cruzado, así que la relación se
// resuelve por FK simbólica y no por linked-record.
//
// Respuesta (se mantiene la forma que espera la UI de remisiones):
//   { produccion: { id, codigo, estado, kg_total, kg_biochar_puro, kg_abono_4g,
//     kg_agua, kg_biologicos, baches, baches_detalle } | null }
export async function GET(request: NextRequest) {
  const pedido = new URL(request.url).searchParams.get('pedido');
  if (!pedido) {
    return NextResponse.json(
      { error: 'Falta el query param: pedido (SIRIUS-PED-XXXX)' },
      { status: 400 }
    );
  }

  try {
    const produccion = await getProduccionPorPedido(pedido);
    if (!produccion) {
      return NextResponse.json({ produccion: null }, { status: 200 });
    }

    const { pctBiochar, pctAbono, pctAgua, pctBiologicos } = config.blend;

    // Los KG por componente se derivan de la fórmula, igual que antes los calculaba
    // Airtable en la tabla local. El biochar, en cambio, se toma de las Salidas
    // reales por bache: es el número que de verdad se descontó, y puede diferir de
    // `kgTotal * pctBiochar` por el redondeo del reparto entre baches.
    const kgBiocharReal = produccion.baches.reduce((total, b) => total + b.kg, 0);

    return NextResponse.json(
      {
        produccion: {
          // La identidad ahora es el lote, no un record ID de Airtable.
          id: produccion.lote,
          codigo: produccion.lote,
          estado: produccion.estado,
          kg_total: produccion.kgTotal,
          kg_biochar_puro: kgBiocharReal || Number((produccion.kgTotal * pctBiochar).toFixed(2)),
          kg_abono_4g: Number((produccion.kgTotal * pctAbono).toFixed(2)),
          kg_agua: Number((produccion.kgTotal * pctAgua).toFixed(2)),
          kg_biologicos: Number((produccion.kgTotal * pctBiologicos).toFixed(2)),
          // Record IDs de los baches, que es lo que la UI usa para preseleccionar.
          baches: produccion.baches.map((b) => b.bacheId).filter(Boolean),
          // Desglose con código y KG por bache, para mostrarlo sin otra consulta.
          baches_detalle: produccion.baches,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/produccion/by-pedido:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

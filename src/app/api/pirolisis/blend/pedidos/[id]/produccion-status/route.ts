import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';

// GET /api/pirolisis/blend/pedidos/[id]/produccion-status
//
// id = recordId del Pedido en Sirius Pedidos Core.
//
// Verifica si la producción del Biochar Blend para este pedido está completa,
// sumando registros de Movimientos_Inventario en Sirius Inventario Production Core
// con:
//   - tipo_movimiento = 'Entrada'
//   - motivo          = 'Producción'
//   - producto_id     = SIRIUS-PRODUCT-0016 (Biochar Blend)
//   - ubicacion_destino_id = ID Pedido Core (SIRIUS-PED-XXXX)
//
// Respuesta: { completa, kg_producido, kg_solicitado, falta, id_pedido_core }
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const coreBaseId = config.airtable.pedidosCoreBaseId;
  const pedidosTable = config.airtable.pedidosCorePedidosTable;
  const detallesTable = config.airtable.pedidosCoreDetallesTable;
  const coreToken = config.airtable.pedidosCoreToken;
  const biocharCode = config.airtable.inventarioProdCoreBiocharBlendProductId;

  const invBaseId = config.airtable.inventarioProdCoreBaseId;
  const invMovTable = config.airtable.inventarioProdCoreMovimientosTable;
  const invToken = config.airtable.inventarioProdCoreToken;

  if (!coreToken || !coreBaseId) {
    return NextResponse.json(
      { error: 'Configuración Sirius Pedidos Core incompleta' },
      { status: 500 }
    );
  }
  if (!invToken || !invBaseId) {
    return NextResponse.json(
      { error: 'Configuración Sirius Inventario Production Core incompleta' },
      { status: 500 }
    );
  }
  if (!biocharCode) {
    return NextResponse.json(
      { error: 'Configuración: producto Biochar Blend no definido' },
      { status: 500 }
    );
  }

  const coreHeaders = { Authorization: `Bearer ${coreToken}` };
  const invHeaders = { Authorization: `Bearer ${invToken}` };

  const { id } = await params;

  try {
    // 1. Obtener pedido en Core para leer ID Pedido Core (SIRIUS-PED-XXXX)
    const pedidoRes = await fetch(
      `https://api.airtable.com/v0/${coreBaseId}/${pedidosTable}/${id}`,
      { headers: coreHeaders }
    );
    const pedido = await pedidoRes.json();
    if (!pedidoRes.ok) {
      return NextResponse.json(
        { error: 'Pedido no encontrado en Sirius Pedidos Core', details: pedido },
        { status: pedidoRes.status }
      );
    }

    const idPedidoCore = String(pedido.fields?.['ID Pedido Core'] ?? '');
    if (!idPedidoCore) {
      return NextResponse.json(
        { error: 'Pedido sin ID Pedido Core (formula vacía)' },
        { status: 422 }
      );
    }

    // 2. Obtener KG solicitados del Detalle
    let kgSolicitado = 0;
    if (detallesTable) {
      const dFormula = `{ID Producto Core}='${biocharCode}'`;
      const dParams = new URLSearchParams({ filterByFormula: dFormula, pageSize: '100' });
      const dRes = await fetch(
        `https://api.airtable.com/v0/${coreBaseId}/${detallesTable}?${dParams.toString()}`,
        { headers: coreHeaders }
      );
      const dData = await dRes.json();
      if (dRes.ok && Array.isArray(dData.records)) {
        const detalle = dData.records.find((d: { id: string; fields: Record<string, unknown> }) =>
          ((d.fields?.['Pedido'] as string[] | undefined) ?? []).includes(id)
        );
        if (detalle) kgSolicitado = Number(detalle.fields?.['Cantidad Pedido'] ?? 0);
      }
    }

    // 3. Sumar entradas en Movimientos_Inventario (Inventario Production Core)
    const safeCode = biocharCode.replace(/'/g, "\\'");
    const safePed = idPedidoCore.replace(/'/g, "\\'");
    const movFormula = `AND({tipo_movimiento}='Entrada',{motivo}='Producción',{producto_id}='${safeCode}',{ubicacion_destino_id}='${safePed}')`;
    let kgProducido = 0;
    let movOffset: string | undefined;
    do {
      const mParams = new URLSearchParams({
        filterByFormula: movFormula,
        pageSize: '100',
      });
      if (movOffset) mParams.set('offset', movOffset);
      const mRes = await fetch(
        `https://api.airtable.com/v0/${invBaseId}/${invMovTable}?${mParams.toString()}`,
        { headers: invHeaders }
      );
      const mData = await mRes.json();
      if (!mRes.ok) {
        console.error('❌ Error Movimientos_Inventario:', mData);
        return NextResponse.json(
          { error: 'Error al consultar Sirius Inventario Production Core', details: mData },
          { status: mRes.status }
        );
      }
      for (const r of mData.records || []) {
        kgProducido += Number(r.fields?.['cantidad'] ?? 0);
      }
      movOffset = mData.offset;
    } while (movOffset);

    const falta = Math.max(0, kgSolicitado - kgProducido);
    const completa = kgSolicitado > 0 && kgProducido >= kgSolicitado;

    return NextResponse.json(
      {
        completa,
        kg_producido: kgProducido,
        kg_solicitado: kgSolicitado,
        falta,
        id_pedido_core: idPedidoCore,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET produccion-status:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

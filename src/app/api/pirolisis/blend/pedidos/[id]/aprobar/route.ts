import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';


// Estados desde los que se permite aprobar
const ESTADOS_APROBABLES = ['Recibido', 'Pendiente Stock'];

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function pedidoUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendPedidosTableId}/${id}`;
}

// POST /api/pirolisis/blend/pedidos/[id]/aprobar
//
// Flujo:
//   1. Lee el pedido y valida que esté en estado aprobable
//   2. Llama internamente a GET /api/pirolisis/inventario/verificar-stock-blend?kg_total=X
//      (ese endpoint aplica: abono_necesario = kg_total × 0.74, biologicos_necesario = kg_total × 0.007)
//   3a. Si suficiente=true  → crea registro en Produccion Biochar Blend Pirolisis,
//                             actualiza pedido a "Aprobado" y linkea la producción
//   3b. Si suficiente=false → actualiza pedido a "Pendiente Stock" y retorna detalle del faltante
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta', details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID' },
      { status: 500 }
    );
  }

  const { id } = await params;

  try {
    // 1. Obtener pedido actual
    const getRes = await fetch(pedidoUrl(id), { headers: airtableHeaders() });
    const pedido = await getRes.json();

    if (!getRes.ok) {
      if (getRes.status === 404) {
        return NextResponse.json({ error: 'Pedido no encontrado', details: id }, { status: 404 });
      }
      return NextResponse.json({ error: pedido?.error || 'Airtable error', details: pedido }, { status: getRes.status });
    }

    const estadoActual: string = pedido.fields?.['Estado'] ?? '';

    if (!ESTADOS_APROBABLES.includes(estadoActual)) {
      return NextResponse.json({
        error: 'Aprobación no permitida',
        details: `Solo se puede aprobar un pedido en estado "Recibido" o "Pendiente Stock". Estado actual: "${estadoActual}"`,
        estado_actual: estadoActual,
      }, { status: 409 });
    }

    const kgSolicitados: number = pedido.fields?.['KG Solicitados'] ?? 0;
    const cliente: string = pedido.fields?.['Cliente'] ?? '';
    const empaque: string = pedido.fields?.['Empaque'] ?? '';

    // 2. Verificar stock vía endpoint interno
    //    verificar-stock-blend aplica internamente: abono = kg_total × 0.74, biologicos = kg_total × 0.007
    console.log(`🔍 Verificando stock blend para ${kgSolicitados} kg (pedido ${id})...`);
    const requestOrigin = new URL(request.url).origin;
    const stockUrl = new URL('/api/pirolisis/inventario/verificar-stock-blend', requestOrigin);
    stockUrl.searchParams.set('kg_total', String(kgSolicitados));

    const stockRes = await fetch(stockUrl.toString(), { method: 'GET' });
    const stockData = await stockRes.json();

    if (!stockRes.ok) {
      console.error('❌ Error al verificar stock blend:', stockData);
      return NextResponse.json({
        error: 'Error al verificar stock',
        details: stockData,
      }, { status: 502 });
    }

    console.log(`📊 Stock verificado: suficiente=${stockData.suficiente}`, stockData.proporciones);

    if (!stockData.suficiente) {
      // 3b. Stock insuficiente → cambiar pedido a "Pendiente Stock"
      const psRes = await fetch(pedidoUrl(id), {
        method: 'PATCH',
        headers: airtableHeaders(),
        body: JSON.stringify({ fields: { 'Estado': 'Pendiente Stock' } }),
      });

      if (!psRes.ok) {
        const psErr = await psRes.json();
        console.error('❌ Error al marcar pedido como Pendiente Stock:', psErr);
        return NextResponse.json({
          error: 'Stock insuficiente y no se pudo actualizar el estado del pedido',
          details: psErr,
          stock_insuficiente: true,
          faltante: stockData.proporciones,
        }, { status: 502 });
      }

      console.log(`⚠️ Pedido ${id}: stock insuficiente → Pendiente Stock`);
      return NextResponse.json({
        success: false,
        aprobado: false,
        message: 'Stock insuficiente — pedido marcado como Pendiente Stock',
        estado_actual: 'Pendiente Stock',
        faltante: stockData.proporciones,
        stock: stockData.stock,
      }, { status: 200 });
    }

    // 3a. Stock suficiente → crear registro en Produccion Biochar Blend Pirolisis
    const produccionFields: Record<string, unknown> = {
      'KG Total Blend': kgSolicitados,
      'Cliente': cliente,
      'Empaque': empaque,
      'Pedido Origen': id,
      'Estado': 'Pendiente',
      'Realiza Registro': 'Sistema',
    };

    console.log('📤 Creando registro de producción blend:', produccionFields);
    const prodRes = await fetch(
      `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendProduccionTableId}`,
      {
        method: 'POST',
        headers: airtableHeaders(),
        body: JSON.stringify({ records: [{ fields: produccionFields }] }),
      }
    );
    const prodData = await prodRes.json();

    if (!prodRes.ok) {
      console.error('❌ Error al crear producción blend:', prodData);
      return NextResponse.json({
        error: 'Error al crear registro de producción',
        details: prodData,
      }, { status: 502 });
    }

    const produccionRecordId: string = prodData.records?.[0]?.id ?? '';
    console.log('✅ Producción blend creada:', produccionRecordId);

    // Actualizar pedido: estado = "Aprobado" + link al registro de producción
    const patchRes = await fetch(pedidoUrl(id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({
        fields: {
          'Estado': 'Aprobado',
          'Produccion Blend': [produccionRecordId],
        },
      }),
    });
    const patchData = await patchRes.json();

    if (!patchRes.ok) {
      // Caso crítico: la producción fue creada pero el pedido no pudo actualizarse.
      // El registro produccionRecordId existe en Airtable sin link al pedido.
      // El pedido queda en su estado anterior — re-ejecutar aprobar crearía una segunda producción.
      console.error(
        `🚨 PRODUCCIÓN HUÉRFANA: registro ${produccionRecordId} creado en tbl5Mh3DZYrbWAtzE pero PATCH del pedido ${id} falló. Requiere intervención manual.`,
        patchData
      );
      return NextResponse.json({
        error: 'Producción creada pero no se pudo vincular al pedido. Requiere revisión manual.',
        produccion_huerfana: produccionRecordId,
        details: patchData,
      }, { status: 502 });
    }

    console.log(`✅ Pedido ${id} aprobado → Producción ${produccionRecordId}`);
    return NextResponse.json({
      success: true,
      aprobado: true,
      message: 'Pedido aprobado y producción creada exitosamente',
      pedido: patchData,
      produccion: prodData.records?.[0],
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/pedidos/[id]/aprobar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

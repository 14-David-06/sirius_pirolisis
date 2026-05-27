import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';

// POST /api/pirolisis/blend/pedidos/[id]/iniciar-produccion
//
// id = recordId del Pedido en Sirius Pedidos Core.
//
// Flujo:
//   1. Lee el pedido en Sirius Pedidos Core (valida estado Recibido / Pendiente Stock)
//   2. Lee el Detalle del pedido para obtener KG solicitados (filtro por Biochar Blend)
//   3. Llama internamente /api/pirolisis/inventario/verificar-stock-blend?kg_total=X
//      → aplica fórmula abono = kg×0.74, biologicos = kg×0.007 contra inventario LOCAL.
//   4a. Si insuficiente → PATCH pedido a "Pendiente Stock" y retorna 409 con detalle del faltante
//        y mensaje guía: "Registra la entrada en Sirius Inventario Production Core...".
//   4b. Si suficiente →
//        - Crea registro en blend_produccion local (sin link al pedido — usamos texto plano).
//        - PATCH pedido en Core a "En Produccion".
//        - Retorna 200.
//
// Importante: NO descuenta inventario aquí (lo hace otro proceso al despachar).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const coreBaseId = config.airtable.pedidosCoreBaseId;
  const pedidosTable = config.airtable.pedidosCorePedidosTable;
  const detallesTable = config.airtable.pedidosCoreDetallesTable;
  const coreToken = config.airtable.pedidosCoreToken;
  const biocharCode = config.airtable.inventarioProdCoreBiocharBlendProductId;

  const localToken = config.airtable.token;
  const localBaseId = config.airtable.baseId;
  const blendProduccionTableId = config.airtable.blendProduccionTableId;

  if (!coreToken || !coreBaseId) {
    return NextResponse.json(
      { error: 'Configuración Sirius Pedidos Core incompleta' },
      { status: 500 }
    );
  }
  if (!localToken || !localBaseId) {
    return NextResponse.json(
      { error: 'Configuración PiroliApp local incompleta' },
      { status: 500 }
    );
  }

  const coreHeaders = {
    Authorization: `Bearer ${coreToken}`,
    'Content-Type': 'application/json',
  };
  const localHeaders = {
    Authorization: `Bearer ${localToken}`,
    'Content-Type': 'application/json',
  };

  const { id } = await params;
  const pedidoCoreUrl = `https://api.airtable.com/v0/${coreBaseId}/${pedidosTable}/${id}`;

  try {
    // 1. Leer pedido en Core
    const getRes = await fetch(pedidoCoreUrl, { headers: coreHeaders });
    const pedido = await getRes.json();
    if (!getRes.ok) {
      return NextResponse.json(
        { error: 'Pedido no encontrado en Sirius Pedidos Core', details: pedido },
        { status: getRes.status }
      );
    }

    const estadoActual = String(pedido.fields?.['Estado'] ?? '');
    // Sirius Pedidos Core sólo tiene 'Recibido' para pedidos que aún no han iniciado
    // ('Pendiente Stock' es un estado interno de la app, no existe en Core).
    const ESTADOS_VALIDOS = ['Recibido'];
    if (!ESTADOS_VALIDOS.includes(estadoActual)) {
      return NextResponse.json(
        {
          error: 'Iniciar producción no permitido',
          details: `Solo se puede iniciar producción en estado Recibido. Estado actual en Core: "${estadoActual}"`,          estado_actual: estadoActual,
        },
        { status: 409 }
      );
    }

    const idPedidoCore = String(pedido.fields?.['ID Pedido Core'] ?? '');
    const idClienteCore = String(pedido.fields?.['ID Cliente Core'] ?? '');

    // 2. Buscar Detalle para obtener KG (Cantidad Pedido del producto Biochar Blend)
    let kgSolicitados = 0;
    let empaque = '';
    if (detallesTable && biocharCode) {
      // ARRAYJOIN devuelve valores del campo primario, no record IDs.
      // Se filtra sólo por producto y se resuelve el link al pedido en JS.
      const dFormula = `{ID Producto Core}='${biocharCode}'`;
      const dParams = new URLSearchParams({ filterByFormula: dFormula, pageSize: '100' });
      const dRes = await fetch(
        `https://api.airtable.com/v0/${coreBaseId}/${detallesTable}?${dParams.toString()}`,
        { headers: coreHeaders }
      );
      const dData = await dRes.json();
      if (dRes.ok && Array.isArray(dData.records)) {
        const detalle = dData.records.find((d: { id: string; fields: Record<string, unknown> }) => {
          const links = (d.fields?.['Pedido'] as string[] | undefined) ?? [];
          return links.includes(id);
        });
        if (detalle) {
          kgSolicitados = Number(detalle.fields?.['Cantidad Pedido'] ?? 0);
        }
      }
    }

    if (!kgSolicitados || kgSolicitados <= 0) {
      return NextResponse.json(
        { error: 'No se pudo determinar KG solicitados del pedido (Detalle no encontrado o Cantidad inválida)' },
        { status: 422 }
      );
    }

    // Parse empaque de las notas
    const notas = String(pedido.fields?.['Notas'] ?? '');
    const empaqueMatch = notas.match(/Empaque:\s*([^|]+)/i);
    if (empaqueMatch) empaque = empaqueMatch[1].trim();

    // 3. Verificar stock contra inventario LOCAL via endpoint existente
    console.log(`🔍 Verificando stock blend para ${kgSolicitados} kg (pedido core ${idPedidoCore})...`);
    const requestOrigin = new URL(request.url).origin;
    const stockUrl = new URL('/api/pirolisis/inventario/verificar-stock-blend', requestOrigin);
    stockUrl.searchParams.set('kg_total', String(kgSolicitados));

    const stockRes = await fetch(stockUrl.toString(), { method: 'GET' });
    const stockData = await stockRes.json();

    if (!stockRes.ok) {
      console.error('❌ Error al verificar stock blend:', stockData);
      return NextResponse.json(
        { error: 'Error al verificar stock', details: stockData },
        { status: 502 }
      );
    }

    if (!stockData.suficiente) {
      // Stock insuficiente → mantenemos Core como 'Recibido' (no existe 'Pendiente Stock' en Core).
      // La UI infiere el estado interno desde la respuesta 409.
      console.log(`⚠️ Pedido ${id}: stock insuficiente → Pendiente Stock`);
      return NextResponse.json(
        {
          error: 'Insumos insuficientes',
          mensaje:
            'Faltan insumos para iniciar la producción. Registra la entrada en el inventario antes de continuar.',
          estado_actual: 'Pendiente Stock',
          insumos: stockData.proporciones,
          stock: stockData.stock,
        },
        { status: 409 }
      );
    }

    // 4b. Suficiente → PATCH pedido en Core primero, luego crear blend_produccion local
    //     (orden invertido para evitar registros huérfanos si el PATCH falla)

    // PATCH pedido en Core → Procesando (= 'En Producción' en la app)
    const patchRes = await fetch(pedidoCoreUrl, {
      method: 'PATCH',
      headers: coreHeaders,
      body: JSON.stringify({ fields: { Estado: 'Procesando' } }),
    });
    const patchData = await patchRes.json();
    if (!patchRes.ok) {
      const patchError = patchData?.error?.message ?? patchData?.error ?? JSON.stringify(patchData);
      console.error('❌ Error al actualizar estado del pedido en Core:', patchData);
      return NextResponse.json(
        {
          error: `No se pudo actualizar estado en Sirius Pedidos Core: ${patchError}`,
          details: patchData,
        },
        { status: 502 }
      );
    }

    // PATCH exitoso → ahora crear registro local blend_produccion
    let produccionRecordId = '';
    if (blendProduccionTableId) {
      const produccionFields: Record<string, unknown> = {
        'KG Total Blend': kgSolicitados,
        'Cliente': idClienteCore || 'N/A',
        'Empaque': empaque || 'N/A',
        'Estado': 'En Proceso',
        'Realiza Registro': 'Sistema',
      };

      const prodRes = await fetch(
        `https://api.airtable.com/v0/${localBaseId}/${blendProduccionTableId}`,
        {
          method: 'POST',
          headers: localHeaders,
          body: JSON.stringify({ records: [{ fields: produccionFields }] }),
        }
      );
      const prodData = await prodRes.json();
      if (!prodRes.ok) {
        console.warn('⚠️ No se pudo crear registro local de producción (no crítico):', prodData);
      } else {
        produccionRecordId = prodData.records?.[0]?.id ?? '';
        console.log('✅ blend_produccion creado:', produccionRecordId);
      }
    }

    console.log(`✅ Pedido ${idPedidoCore} → En Produccion (producción local ${produccionRecordId || 'no creada'})`);
    return NextResponse.json(
      {
        success: true,
        message: 'Producción iniciada exitosamente',
        estado_actual: 'En Produccion',
        id_pedido_core: idPedidoCore,
        produccion_record_id: produccionRecordId,
        kg_total: kgSolicitados,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/pedidos/[id]/iniciar-produccion:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

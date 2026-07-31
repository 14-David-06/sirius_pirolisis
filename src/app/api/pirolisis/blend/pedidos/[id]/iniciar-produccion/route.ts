import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';
import { runBlendDeduction } from '../../../../../../../lib/blend-deduction';

// POST /api/pirolisis/blend/pedidos/[id]/iniciar-produccion
//
// id = recordId del Pedido en Sirius Pedidos Core.
//
// ⚠️ MIGRACIÓN 2026-07-30: la producción ya NO se registra como fila en
// `Produccion Biochar Blend Pirolisis` (tabla local de PiroliApp). Ahora la
// identidad de la producción es un CÓDIGO DE LOTE (`BLEND-…`) y el registro son
// los movimientos en las bases Core que lo llevan: las Salidas de insumo en
// Sirius Insumos Core (`ID Produccion Destino`) y la Entrada de producto terminado
// en Sirius Inventario Production Core (`documento_referencia`). Ver
// `src/lib/blend-deduction.ts`.
//
// Flujo:
//   1. Lee el pedido en Sirius Pedidos Core (valida estado Recibido)
//   2. Lee el Detalle del pedido para obtener KG solicitados (filtro por Biochar Blend)
//   3. Llama internamente /api/pirolisis/inventario/verificar-stock-blend?kgTotal=X
//      → aplica la fórmula del Blend contra el inventario real.
//   4a. Si insuficiente → retorna 409 con el detalle del faltante.
//   4b. Si suficiente →
//        - PATCH pedido en Core a "Procesando" (LOCK de idempotencia: re-invocar
//          devuelve 409 porque el estado ya no es "Recibido" → no hay doble deducción).
//        - Genera el código de lote y llama a runBlendDeduction, que descuenta
//          biochar de los baches seleccionados (y su espejo en Insumos Core),
//          Abono/Biológicos, registra la Entrada de producto terminado y pasa los
//          baches consumidos a Bache Incompleto / Bache Agotado.
//        - Retorna 200 (o 207 si algún paso falló).
//
// Requiere en el body: { baches: string[] } — record IDs de los baches que el
// operador seleccionó para cubrir el biochar (Paso 3). El sistema reparte los KG.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const coreBaseId = config.airtable.pedidosCoreBaseId;
  const pedidosTable = config.airtable.pedidosCorePedidosTable;
  const detallesTable = config.airtable.pedidosCoreDetallesTable;
  const coreToken = config.airtable.pedidosCoreToken;
  const biocharCode = config.airtable.inventarioProdCoreBiocharBlendProductId;

  // El token local sigue haciendo falta: la deduccion escribe el detalle por
  // bache y el estado del bache en PiroliApp (ver blend-deduction.ts).
  const localToken = config.airtable.token;
  const localBaseId = config.airtable.baseId;

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
  const { id } = await params;
  const pedidoCoreUrl = `https://api.airtable.com/v0/${coreBaseId}/${pedidosTable}/${id}`;

  // Baches seleccionados (Paso 3). Acepta:
  //   - baches: string[]                         → reparto automático por orden
  //   - baches: [{ id|bacheId, kg }]             → reparto explícito por bache
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const rawBaches = (body as any)?.baches ?? (body as any)?.bacheIds;
  let bacheIds: string[] = [];
  let bacheAllocations: { bacheId: string; kg: number }[] | undefined;
  if (Array.isArray(rawBaches) && rawBaches.length) {
    if (typeof rawBaches[0] === 'object' && rawBaches[0] !== null) {
      bacheAllocations = rawBaches
        .map((b: any) => ({ bacheId: String(b.id ?? b.bacheId ?? ''), kg: Number(b.kg ?? 0) }))
        .filter((b: { bacheId: string; kg: number }) => b.bacheId && b.kg > 0);
      bacheIds = bacheAllocations.map((b) => b.bacheId);
    } else {
      bacheIds = rawBaches.map((x: any) => String(x));
    }
  }
  const realizaRegistro = String((body as any)?.realizaRegistro || 'Sistema');

  if (!bacheIds.length) {
    return NextResponse.json(
      {
        error: 'Debes seleccionar al menos un bache para el biochar',
        details: 'El body debe incluir { baches: [recordId, ...] } con los baches que cubren el 20% de biochar.',
      },
      { status: 400 }
    );
  }

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
    // ⚠️ El nombre del parámetro es `kgTotal`. Enviar `kg_total` devolvía 400 y
    // este endpoint lo traducía a un 502 "Error al verificar stock": iniciar
    // producción era imposible desde la migración al Core (2026-07-27).
    stockUrl.searchParams.set('kgTotal', String(kgSolicitados));

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
          error: 'Materia prima insuficiente',
          mensaje:
            'Falta materia prima para iniciar la producción. Registra la entrada en bodega antes de continuar.',
          estado_actual: 'Pendiente Stock',
          // Claves reales de verificar-stock-blend. Antes se leían `proporciones`
          // y `stock`, que no existen: el 409 viajaba con los campos en undefined.
          requerido: stockData.requerido,
          disponible: stockData.disponible,
          faltante: stockData.faltante,
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

    // PATCH exitoso: el pedido queda bloqueado en Procesando.
    //
    // El código de lote es la identidad de la producción. Se construye con la fecha
    // y el pedido para que sea legible, único y DETERMINISTA: reintentar la misma
    // producción el mismo día produce el mismo lote, así que los movimientos del
    // Core quedan agrupados en vez de duplicados bajo códigos distintos. El pedido
    // en Core ya no está en "Recibido", que es el lock real contra el doble consumo.
    const hoy = new Date().toISOString().split('T')[0];
    const sufijoPedido = (idPedidoCore || id).replace(/[^A-Za-z0-9]/g, '').slice(-8) || 'SINPED';
    const lote = `BLEND-${hoy}-${sufijoPedido}`;
    console.log(`🏷️ Lote de producción: ${lote} (${kgSolicitados} kg, empaque ${empaque || 'sin dato'})`);

    // Auto-deducción de inventario y registro de la producción en los Core.
    const deduccion = await runBlendDeduction({
      lote,
      kgTotal: kgSolicitados,
      bacheIds,
      bacheAllocations,
      cliente: idClienteCore || 'N/A',
      pedidoSimbolico: idPedidoCore,
      realizaRegistro,
    });

    const pasosFallidos = deduccion.steps.filter((s) => !s.ok);
    console.log(
      `✅ Pedido ${idPedidoCore} → En Produccion (lote ${lote}). ` +
      `Deducción ok=${deduccion.ok}, pasos fallidos=${pasosFallidos.length}`
    );

    return NextResponse.json(
      {
        // `success` refleja solo los pasos CRÍTICOS (baches e insumos). Los
        // best-effort se reportan en `deduccion.steps` y elevan el status a 207.
        success: deduccion.ok,
        message: deduccion.ok
          ? pasosFallidos.length
            ? 'Producción registrada y stock descontado, pero algún paso de trazabilidad falló. Revisa los detalles.'
            : 'Producción iniciada y inventario descontado exitosamente'
          : 'La deducción de inventario falló en un paso crítico. Revisa los detalles.',
        estado_actual: 'En Produccion',
        id_pedido_core: idPedidoCore,
        lote,
        // Alias por compatibilidad: la UI muestra `produccion_codigo`.
        produccion_codigo: lote,
        kg_total: kgSolicitados,
        deduccion,
      },
      { status: deduccion.ok && !pasosFallidos.length ? 200 : 207 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/pedidos/[id]/iniciar-produccion:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

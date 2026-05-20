import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';


// Transiciones permitidas: de → [a...]
const TRANSICIONES: Record<string, string[]> = {
  'Borrador':         ['Pendiente Firma', 'Cancelada'],
  'Pendiente Firma':  ['En Transito', 'Cancelada'],
  'En Transito':      ['Entregada', 'Cancelada'],
  'Entregada':        [],
  'Cancelada':        [],
};

const ESTADOS_VALIDOS = Object.keys(TRANSICIONES);

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function remisionUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendRemisionesTableId}/${id}`;
}

// PATCH /api/pirolisis/blend/remisiones/[id]/estado
// Body: { estado: string, campos_adicionales?: Record<string, unknown> }
//   - Al transicionar a "Pendiente Firma" se puede incluir datos de entrega
//   - Al transicionar a "En Transito" se puede incluir Firma Timestamp, IP Firma, etc.
//   - Al transicionar a "Entregada" → actualiza pedido origen a "Despachado"
export async function PATCH(
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
    const body = await request.json();
    const { estado: estadoNuevo, campos_adicionales } = body as {
      estado: string;
      campos_adicionales?: Record<string, unknown>;
    };

    if (!estadoNuevo) {
      return NextResponse.json({ error: 'Campo requerido faltante: estado' }, { status: 400 });
    }

    if (!ESTADOS_VALIDOS.includes(estadoNuevo)) {
      return NextResponse.json({
        error: 'Estado inválido',
        details: `Valores válidos: ${ESTADOS_VALIDOS.join(', ')}`,
      }, { status: 400 });
    }

    // Leer estado actual de la remisión
    const getRes = await fetch(remisionUrl(id), { headers: airtableHeaders() });
    const getData = await getRes.json();

    if (!getRes.ok) {
      if (getRes.status === 404) return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
      return NextResponse.json({ error: getData?.error || 'Airtable error', details: getData }, { status: getRes.status });
    }

    const estadoActual: string = getData.fields?.['Estado'] ?? '';
    const transicionesPermitidas: string[] = TRANSICIONES[estadoActual] ?? [];

    if (!transicionesPermitidas.includes(estadoNuevo)) {
      return NextResponse.json({
        error: 'Transición de estado no permitida',
        de: estadoActual,
        a: estadoNuevo,
        permitidas: transicionesPermitidas,
      }, { status: 400 });
    }

    // Construir campos para el PATCH
    const patchFields: Record<string, unknown> = {
      'Estado': estadoNuevo,
      ...(campos_adicionales || {}),
    };

    // Si transiciona a "En Transito" y aún no hay timestamp de firma, registrarlo
    if (estadoNuevo === 'En Transito' && !patchFields['Firma Timestamp']) {
      patchFields['Firma Timestamp'] = new Date().toISOString();
    }

    const patchRes = await fetch(remisionUrl(id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields: patchFields }),
    });
    const patchData = await patchRes.json();

    if (!patchRes.ok) {
      return NextResponse.json({ error: patchData?.error || 'Airtable error', details: patchData }, { status: patchRes.status });
    }

    console.log(`✅ blend_remision ${id}: ${estadoActual} → ${estadoNuevo}`);

    // Efecto secundario: si se marca como Entregada → marcar pedido como Despachado
    let pedidoActualizado = null;
    if (estadoNuevo === 'Entregada') {
      const pedidoIds: string[] = getData.fields?.['Pedido Origen'] ?? [];
      const pedidoId = pedidoIds[0];

      if (pedidoId) {
        try {
          const pedidoUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendPedidosTableId}/${pedidoId}`;
          const pedidoRes = await fetch(pedidoUrl, {
            method: 'PATCH',
            headers: airtableHeaders(),
            body: JSON.stringify({ fields: { 'Estado': 'Despachado' } }),
          });
          pedidoActualizado = await pedidoRes.json();
          if (!pedidoRes.ok) {
            console.warn(`⚠️ Remisión ${id} marcada Entregada, pero no se pudo actualizar pedido ${pedidoId}:`, pedidoActualizado);
          } else {
            console.log(`✅ Pedido ${pedidoId} → Despachado`);
          }
        } catch (pedidoErr) {
          console.warn(`⚠️ Error al actualizar pedido ${pedidoId} (no crítico):`, pedidoErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      record: patchData,
      transicion: { de: estadoActual, a: estadoNuevo },
      ...(pedidoActualizado ? { pedido_actualizado: pedidoActualizado } : {}),
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en PATCH blend/remisiones/[id]/estado:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

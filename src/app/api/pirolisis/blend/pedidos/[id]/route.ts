import { NextResponse } from 'next/server';
import { config } from '../../../../../../lib/config';


function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function recordUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendPedidosTableId}/${id}`;
}

function guardConfig(): NextResponse | null {
  if (!config.airtable.token || !config.airtable.baseId) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta', details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID' },
      { status: 500 }
    );
  }
  return null;
}

// GET /api/pirolisis/blend/pedidos/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = guardConfig();
  if (guard) return guard;

  const { id } = await params;

  try {
    const res = await fetch(recordUrl(id), { headers: airtableHeaders() });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Pedido no encontrado', details: id }, { status: 404 });
      }
      console.error('❌ Error Airtable GET pedido:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
    }

    return NextResponse.json({ record: data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/pedidos/[id]:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/pirolisis/blend/pedidos/[id]
// No elimina el registro — cambia estado a "Cancelado".
// Solo permitido si estado actual = "Recibido".
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = guardConfig();
  if (guard) return guard;

  const { id } = await params;

  try {
    // Obtener estado actual
    const getRes = await fetch(recordUrl(id), { headers: airtableHeaders() });
    const getData = await getRes.json();

    if (!getRes.ok) {
      if (getRes.status === 404) {
        return NextResponse.json({ error: 'Pedido no encontrado', details: id }, { status: 404 });
      }
      return NextResponse.json({ error: getData?.error || 'Airtable error', details: getData }, { status: getRes.status });
    }

    const estadoActual: string = getData.fields?.['Estado'] ?? '';

    if (estadoActual !== 'Recibido') {
      return NextResponse.json({
        error: 'Cancelación no permitida',
        details: `Solo se puede cancelar un pedido en estado "Recibido". Estado actual: "${estadoActual}"`,
        estado_actual: estadoActual,
      }, { status: 409 });
    }

    // Cambiar estado a Cancelado
    const patchRes = await fetch(recordUrl(id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields: { 'Estado': 'Cancelado' } }),
    });
    const patchData = await patchRes.json();

    if (!patchRes.ok) {
      console.error('❌ Error PATCH cancelar pedido:', patchData);
      return NextResponse.json({ error: patchData?.error || 'Airtable error', details: patchData }, { status: patchRes.status });
    }

    console.log('✅ Pedido cancelado:', id);
    return NextResponse.json(
      { success: true, message: 'Pedido cancelado exitosamente', record: patchData },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en DELETE blend/pedidos/[id]:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

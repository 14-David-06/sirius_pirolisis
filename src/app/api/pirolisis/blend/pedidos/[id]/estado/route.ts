import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';


// Mapa de transiciones permitidas por estado
const TRANSICIONES: Record<string, string[]> = {
  'Recibido':       ['Aprobado', 'Pendiente Stock', 'Cancelado'],
  'Pendiente Stock': ['Aprobado', 'Cancelado'],
  'Aprobado':       ['En Produccion', 'Cancelado'],
  'En Produccion':  ['Listo Despacho'],
  'Listo Despacho': ['Despachado'],
  'Despachado':     [],
  'Cancelado':      [],
};

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function recordUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendPedidosTableId}/${id}`;
}

// PATCH /api/pirolisis/blend/pedidos/[id]/estado
// Body: { estado: string }
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
    const { estado: estadoNuevo } = body as { estado: string };

    if (!estadoNuevo) {
      return NextResponse.json(
        { error: 'Campo requerido faltante', details: 'Se requiere: estado' },
        { status: 400 }
      );
    }

    if (!Object.keys(TRANSICIONES).includes(estadoNuevo)) {
      return NextResponse.json(
        { error: 'Estado inválido', details: `Valores válidos: ${Object.keys(TRANSICIONES).join(', ')}` },
        { status: 400 }
      );
    }

    // Obtener estado actual del pedido
    const getRes = await fetch(recordUrl(id), { headers: airtableHeaders() });
    const getData = await getRes.json();

    if (!getRes.ok) {
      if (getRes.status === 404) {
        return NextResponse.json({ error: 'Pedido no encontrado', details: id }, { status: 404 });
      }
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

    // Aplicar nuevo estado
    const patchRes = await fetch(recordUrl(id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields: { 'Estado': estadoNuevo } }),
    });
    const patchData = await patchRes.json();

    if (!patchRes.ok) {
      console.error('❌ Error PATCH estado blend_pedidos:', patchData);
      return NextResponse.json({ error: patchData?.error || 'Airtable error', details: patchData }, { status: patchRes.status });
    }

    console.log(`✅ Estado pedido ${id}: ${estadoActual} → ${estadoNuevo}`);
    return NextResponse.json({
      success: true,
      message: `Estado actualizado: ${estadoActual} → ${estadoNuevo}`,
      record: patchData,
    }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en PATCH blend/pedidos/[id]/estado:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

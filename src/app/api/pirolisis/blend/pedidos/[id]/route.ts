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

// PATCH /api/pirolisis/blend/pedidos/[id]
// Edita un pedido de Biochar Blend en Sirius Pedidos Core (fuente única de verdad).
// id = recordId del Pedido en Sirius Pedidos Core.
// Campos editables: kg_solicitados, empaque, fecha_requerida, observaciones.
// Solo se permite editar en estados Recibido / Pendiente Stock.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const baseId = config.airtable.pedidosCoreBaseId;
  const pedidosTable = config.airtable.pedidosCorePedidosTable;
  const detallesTable = config.airtable.pedidosCoreDetallesTable;
  const token = config.airtable.pedidosCoreToken;

  if (!token || !baseId) {
    return NextResponse.json(
      { error: 'Configuración Sirius Pedidos Core incompleta' },
      { status: 500 }
    );
  }

  const coreHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const { id } = await params;

  try {
    const body = await request.json();
    const { kg_solicitados, empaque, fecha_requerida, observaciones, producto } = body as {
      kg_solicitados?: number;
      empaque?: string;
      fecha_requerida?: string;
      observaciones?: string;
      producto?: string;
    };

    // 1. Leer pedido actual en Core
    const pedidoCoreUrl = `https://api.airtable.com/v0/${baseId}/${pedidosTable}/${id}`;
    const getRes = await fetch(pedidoCoreUrl, { headers: coreHeaders });
    const pedido = await getRes.json();
    if (!getRes.ok) {
      return NextResponse.json(
        { error: 'Pedido no encontrado en Sirius Pedidos Core', details: pedido },
        { status: getRes.status }
      );
    }

    const estadoActual = String(pedido.fields?.['Estado'] ?? '');
    const EDITABLES = ['Recibido', 'Pendiente Stock'];
    if (!EDITABLES.includes(estadoActual)) {
      return NextResponse.json(
        {
          error: 'Edición no permitida',
          details: `Solo se puede editar pedidos en estado Recibido o Pendiente Stock. Estado actual: "${estadoActual}"`,
        },
        { status: 409 }
      );
    }

    // 2. Reconstruir Notas preservando estructura "Producto: X | KG: N — Empaque: Y | <observaciones>"
    const kgNum = kg_solicitados !== undefined ? Number(kg_solicitados) : undefined;
    const notasOriginales = String(pedido.fields?.['Notas'] ?? '');
    let prodActual = 'Biochar Blend';
    let empaqueActual = '';
    let obsActuales = '';
    let kgActual: number | undefined;
    for (const p of notasOriginales.split('|').map((s) => s.trim())) {
      let m: RegExpMatchArray | null;
      if ((m = p.match(/^Producto:\s*(.+)$/i))) {
        prodActual = m[1].trim();
        continue;
      }
      if ((m = p.match(/^KG:\s*([\d.]+)\s*[—-]\s*Empaque:\s*(.+)$/i))) {
        kgActual = parseFloat(m[1]);
        empaqueActual = m[2].trim();
        continue;
      }
      if ((m = p.match(/^KG:\s*([\d.]+)$/i))) {
        kgActual = parseFloat(m[1]);
        continue;
      }
      if ((m = p.match(/^Empaque:\s*(.+)$/i))) {
        empaqueActual = m[1].trim();
        continue;
      }
      if (p) obsActuales = obsActuales ? `${obsActuales} | ${p}` : p;
    }

    const newProd = producto ?? prodActual;
    const newKg = kgNum ?? kgActual ?? 0;
    const newEmpaque = empaque ?? empaqueActual;
    const newObs = observaciones !== undefined ? observaciones : obsActuales;

    const notasNuevas = [
      `Producto: ${newProd}`,
      `KG: ${newKg} — Empaque: ${newEmpaque}`,
      newObs,
    ]
      .filter(Boolean)
      .join(' | ');

    // 3. PATCH Pedido en Core
    const pedidoFields: Record<string, unknown> = { Notas: notasNuevas };
    if (fecha_requerida) pedidoFields['Fecha de Pedido'] = fecha_requerida;

    const patchRes = await fetch(pedidoCoreUrl, {
      method: 'PATCH',
      headers: coreHeaders,
      body: JSON.stringify({ fields: pedidoFields }),
    });
    const patchData = await patchRes.json();
    if (!patchRes.ok) {
      return NextResponse.json(
        { error: 'Error al actualizar Pedido en Sirius Pedidos Core', details: patchData },
        { status: patchRes.status }
      );
    }

    // 4. Si cambió KG → actualizar Detalle correspondiente
    if (kgNum !== undefined && detallesTable) {
      try {
        const biocharCode = config.airtable.inventarioProdCoreBiocharBlendProductId;
        const dFormula = biocharCode ? `{ID Producto Core}='${biocharCode}'` : '{ID Producto Core}!=""';
        const dParams = new URLSearchParams({ filterByFormula: dFormula, pageSize: '100' });
        const dRes = await fetch(
          `https://api.airtable.com/v0/${baseId}/${detallesTable}?${dParams.toString()}`,
          { headers: coreHeaders }
        );
        const dData = await dRes.json();
        if (dRes.ok && Array.isArray(dData.records)) {
          const detalleRec = dData.records.find((d: { id: string; fields: Record<string, unknown> }) =>
            ((d.fields?.['Pedido'] as string[] | undefined) ?? []).includes(id)
          );
        if (detalleRec) {
          await fetch(
            `https://api.airtable.com/v0/${baseId}/${detallesTable}/${detalleRec.id}`,
            {
              method: 'PATCH',
              headers: coreHeaders,
              body: JSON.stringify({ fields: { 'Cantidad Pedido': kgNum } }),
            }
          );
        } } else {
          console.warn('⚠️ No se encontró detalle para actualizar Cantidad Pedido');
        }
      } catch (e) {
        console.warn('⚠️ Error actualizando Detalle (no crítico):', e);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Pedido actualizado en Sirius Pedidos Core',
        pedido: patchData,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en PATCH blend/pedidos/[id]:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { config } from '../../../../../../lib/config';


function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function recordUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendRemisionesTableId}/${id}`;
}

// GET /api/pirolisis/blend/remisiones/[id]
export async function GET(
  _request: Request,
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
    const res = await fetch(recordUrl(id), { headers: airtableHeaders() });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
      }
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
    }

    return NextResponse.json({ record: data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/remisiones/[id]:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/pirolisis/blend/remisiones/[id]
// Permite actualizar campos de la remisión (datos de entrega/recepción, observaciones, firma, etc.)
// No gestiona cambios de estado — usar /[id]/estado para eso
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
    const { fields } = body as { fields?: Record<string, unknown> };

    if (!fields || Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Se requiere al menos un campo en "fields"' }, { status: 400 });
    }

    // Campos de estado NO se pueden actualizar desde este endpoint
    if ('Estado' in fields) {
      return NextResponse.json({
        error: 'No se puede cambiar el estado desde este endpoint. Usa PATCH /[id]/estado',
      }, { status: 400 });
    }

    const res = await fetch(recordUrl(id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: 'Remisión no encontrada', details: id }, { status: 404 });
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
    }

    return NextResponse.json({ success: true, record: data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en PATCH blend/remisiones/[id]:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

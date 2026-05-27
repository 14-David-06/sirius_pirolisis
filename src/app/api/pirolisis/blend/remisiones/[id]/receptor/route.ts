import { NextResponse } from 'next/server';
import { config } from '../../../../../../../lib/config';

function airtableHeaders() {
  return {
    Authorization: `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function remisionUrl(id: string) {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendRemisionesTableId}/${id}`;
}

// PATCH /api/pirolisis/blend/remisiones/[id]/receptor
// Actualiza los campos del responsable que recibe la remisión (lado cliente).
// Se llama justo después de crear la remisión con POST /api/pirolisis/blend/remisiones.
// Body: { responsable_recibe, num_doc_recibe, telefono_recibe?, email_recibe? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!config.airtable.token || !config.airtable.baseId || !config.airtable.blendRemisionesTableId) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta' },
      { status: 500 }
    );
  }

  const { id } = await params;

  try {
    const body = await request.json() as {
      responsable_recibe?: string;
      num_doc_recibe?: string;
      telefono_recibe?: string;
      email_recibe?: string;
    };

    const { responsable_recibe, num_doc_recibe, telefono_recibe, email_recibe } = body;

    if (!responsable_recibe && !num_doc_recibe && !telefono_recibe && !email_recibe) {
      return NextResponse.json(
        { error: 'No se proporcionaron campos para actualizar' },
        { status: 400 }
      );
    }

    const fields: Record<string, string> = {};
    if (responsable_recibe) fields['Responsable Recibe'] = responsable_recibe;
    if (num_doc_recibe)     fields['Num Doc Recibe']     = num_doc_recibe;
    if (telefono_recibe)    fields['Telefono Recibe']    = telefono_recibe;
    if (email_recibe)       fields['Email Recibe']       = email_recibe;

    const res = await fetch(remisionUrl(id), {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error('❌ Error Airtable PATCH receptor:', data);
      return NextResponse.json(
        { error: data?.error?.message || data?.error || 'Airtable error', details: data },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, record: data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en PATCH blend/remisiones/[id]/receptor:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

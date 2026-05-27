import { NextResponse } from 'next/server';

const CLIENTES_BASE_ID = process.env.AIRTABLE_CLIENTES_BASE_ID!;
const CLIENTES_TABLE_ID = process.env.AIRTABLE_CLIENTES_TABLE_ID!;
const PERSONAL_TABLE_ID = process.env.AIRTABLE_CLIENTES_PERSONAL_TABLE_ID;
const TOKEN = process.env.AIRTABLE_CLIENTES_TOKEN || process.env.AIRTABLE_TOKEN!;

export interface PersonaCliente {
  recordId: string;
  nombre: string;
  cedula: string;
  email: string;
  emailNotificacion: string;
  telefono: string;
  cargo: string;
}

// GET /api/pirolisis/blend/clientes/[clienteId]/personal
// Retorna el personal activo vinculado al cliente desde Sirius Clients Core.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clienteId: string }> }
) {
  if (!CLIENTES_BASE_ID || !TOKEN || !PERSONAL_TABLE_ID) {
    return NextResponse.json(
      { error: 'Faltan variables de entorno para Sirius Clients Core' },
      { status: 500 }
    );
  }

  const { clienteId } = await params;

  try {
    // 1. Obtener el registro del cliente para extraer los IDs de Personal Clientes (linked records)
    const clienteRes = await fetch(
      `https://api.airtable.com/v0/${CLIENTES_BASE_ID}/${CLIENTES_TABLE_ID}/${clienteId}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );

    if (!clienteRes.ok) {
      if (clienteRes.status === 404) {
        return NextResponse.json({ error: 'Cliente no encontrado', details: clienteId }, { status: 404 });
      }
      const d = await clienteRes.json();
      return NextResponse.json({ error: d?.error || 'Airtable error', details: d }, { status: clienteRes.status });
    }

    const clienteData = await clienteRes.json();
    const personalIds: string[] = (clienteData.fields['Personal Clientes'] as string[]) ?? [];

    if (personalIds.length === 0) {
      return NextResponse.json({ personal: [] }, { status: 200 });
    }

    // 2. Obtener todos los registros de personal en una sola llamada usando RECORD_ID() filter
    const orParts = personalIds.map(id => `RECORD_ID()='${id}'`).join(',');
    const filterFormula = personalIds.length === 1 ? `RECORD_ID()='${personalIds[0]}'` : `OR(${orParts})`;

    const params2 = new URLSearchParams({
      filterByFormula: filterFormula,
      pageSize: '100',
    });
    [
      'Nombre Completo',
      'Cedula',
      'Email',
      'Email Notificacion',
      'Teléfono',
      'Cargo',
      'Estado Personal',
    ].forEach(f => params2.append('fields[]', f));

    const personalRes = await fetch(
      `https://api.airtable.com/v0/${CLIENTES_BASE_ID}/${PERSONAL_TABLE_ID}?${params2.toString()}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const personalData = await personalRes.json();

    if (!personalRes.ok) {
      console.error('❌ Error Airtable GET personal:', personalData);
      return NextResponse.json(
        { error: personalData?.error?.message || personalData?.error || 'Airtable error', details: personalData },
        { status: personalRes.status }
      );
    }

    // 3. Filtrar solo los activos y mapear
    const personal: PersonaCliente[] = (personalData.records ?? [])
      .filter((r: Record<string, unknown>) => (r.fields as Record<string, unknown>)['Estado Personal'] === 'Activo')
      .map((r: Record<string, unknown>) => {
        const f = r.fields as Record<string, unknown>;
        return {
          recordId: r.id as string,
          nombre: (f['Nombre Completo'] as string) ?? '',
          cedula: (f['Cedula'] as string) ?? '',
          email: (f['Email'] as string) ?? '',
          emailNotificacion: (f['Email Notificacion'] as string) ?? '',
          telefono: (f['Teléfono'] as string) ?? '',
          cargo: (f['Cargo'] as string) ?? '',
        };
      });

    return NextResponse.json({ personal }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/clientes/[clienteId]/personal:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

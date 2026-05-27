import { NextResponse } from 'next/server';

const CLIENTES_BASE_ID = process.env.AIRTABLE_CLIENTES_BASE_ID!;
const CLIENTES_TABLE_ID = process.env.AIRTABLE_CLIENTES_TABLE_ID!;
// AIRTABLE_CLIENTES_TOKEN: token opcional con acceso a Sirius Clients Core.
// Si no está definido, se usa el token principal (debe tener scope a AIRTABLE_CLIENTES_BASE_ID).
const TOKEN = process.env.AIRTABLE_CLIENTES_TOKEN || process.env.AIRTABLE_TOKEN!;

// GET /api/pirolisis/blend/clientes
// Retorna todos los clientes activos de Sirius Clients Core, ordenados por nombre.
export async function GET() {
  if (!CLIENTES_BASE_ID || !CLIENTES_TABLE_ID || !TOKEN) {
    return NextResponse.json(
      { error: 'Faltan variables de entorno para Sirius Clients Core (AIRTABLE_CLIENTES_BASE_ID / AIRTABLE_CLIENTES_TABLE_ID)' },
      { status: 500 }
    );
  }

  try {
    const clientes: Array<{ recordId: string; nombre: string; nit: string; ciudad: string; idClienteCore: string }> = [];
    let offset: string | undefined;

    do {
      const params = new URLSearchParams({
        pageSize: '100',
        'sort[0][field]': 'Cliente',
        'sort[0][direction]': 'asc',
      });
      params.append('fields[]', 'Cliente');
      params.append('fields[]', 'Nit');
      params.append('fields[]', 'Ciudad');
      params.append('fields[]', 'ID'); // CL-XXXX — campo ID único central del cliente
      if (offset) params.set('offset', offset);

      const res = await fetch(
        `https://api.airtable.com/v0/${CLIENTES_BASE_ID}/${CLIENTES_TABLE_ID}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = await res.json();

      if (!res.ok) {
        console.error('❌ Error Airtable GET clientes:', data);
        return NextResponse.json(
          { error: data?.error?.message || data?.error || 'Airtable error', details: data },
          { status: res.status }
        );
      }

      for (const r of data.records ?? []) {
        const nombre = (r.fields['Cliente'] as string) ?? '';
        if (!nombre) continue;
        clientes.push({
          recordId: r.id as string,
          nombre,
          nit: (r.fields['Nit'] as string) ?? '',
          ciudad: (r.fields['Ciudad'] as string) ?? '',
          idClienteCore: (r.fields['ID'] as string) ?? '',
        });
      }

      offset = data.offset;
    } while (offset);

    return NextResponse.json({ clientes }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/clientes:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

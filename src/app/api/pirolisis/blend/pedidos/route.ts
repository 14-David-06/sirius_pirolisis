import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';


const EMPAQUE_VALUES = ['Big Bag', 'Lona', 'Bulto', 'Otro'] as const;
type Empaque = typeof EMPAQUE_VALUES[number];

function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function tableUrl() {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendPedidosTableId}`;
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

// GET /api/pirolisis/blend/pedidos
// Query params opcionales: ?estado=X&cliente=Y
export async function GET(request: NextRequest) {
  const guard = guardConfig();
  if (guard) return guard;

  try {
    const { searchParams } = new URL(request.url);
    const estadoFilter = searchParams.get('estado');
    const clienteFilter = searchParams.get('cliente');

    const filters: string[] = [];
    if (estadoFilter) {
      const safe = estadoFilter.replace(/'/g, "\\'");
      filters.push(`{Estado} = '${safe}'`);
    }
    if (clienteFilter) {
      const safe = clienteFilter.replace(/'/g, "\\'");
      filters.push(`FIND(LOWER('${safe}'), LOWER({Cliente})) > 0`);
    }

    const params = new URLSearchParams();
    if (filters.length === 1) params.set('filterByFormula', filters[0]);
    else if (filters.length > 1) params.set('filterByFormula', `AND(${filters.join(', ')})`);
    params.set('pageSize', '100');
    params.set('sort[0][field]', 'Fecha Pedido');
    params.set('sort[0][direction]', 'desc');

    let allRecords: unknown[] = [];
    let offset: string | undefined;

    do {
      if (offset) params.set('offset', offset);
      const res = await fetch(`${tableUrl()}?${params.toString()}`, {
        headers: airtableHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('❌ Error Airtable GET blend_pedidos:', data);
        return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
      }
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    console.log(`📋 blend_pedidos: ${allRecords.length} registros obtenidos`);
    return NextResponse.json({ records: allRecords }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/pedidos:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/pirolisis/blend/pedidos
// Crea pedido con estado inicial "Recibido"
export async function POST(request: Request) {
  const guard = guardConfig();
  if (guard) return guard;

  try {
    const body = await request.json();
    console.log('📥 blend_pedidos POST body:', body);

    const {
      cliente,
      kg_solicitados,
      empaque,
      fecha_pedido,
      fecha_requerida,
      nit_cc_cliente,
      contacto_cliente,
      telefono,
      email,
      observaciones,
      realiza_registro,
    } = body as {
      cliente: string;
      kg_solicitados: number;
      empaque: Empaque;
      fecha_pedido?: string;
      fecha_requerida?: string;
      nit_cc_cliente?: string;
      contacto_cliente?: string;
      telefono?: string;
      email?: string;
      observaciones?: string;
      realiza_registro?: string;
    };

    if (!cliente) {
      return NextResponse.json(
        { error: 'Campo requerido faltante', details: 'Se requiere: cliente' },
        { status: 400 }
      );
    }

    const kgNumericos = parseFloat(String(kg_solicitados));
    if (!kg_solicitados || isNaN(kgNumericos) || kgNumericos <= 0) {
      return NextResponse.json(
        { error: 'Campo requerido faltante o inválido', details: 'kg_solicitados debe ser un número positivo' },
        { status: 400 }
      );
    }

    if (!empaque || !(EMPAQUE_VALUES as readonly string[]).includes(empaque)) {
      return NextResponse.json(
        { error: 'Campo requerido faltante o inválido', details: `empaque debe ser uno de: ${EMPAQUE_VALUES.join(', ')}` },
        { status: 400 }
      );
    }

    const fields: Record<string, unknown> = {
      'Cliente': cliente,
      'KG Solicitados': kgNumericos,
      'Empaque': empaque,
      'Estado': 'Recibido',
    };

    if (fecha_pedido) fields['Fecha Pedido'] = fecha_pedido;
    if (fecha_requerida) fields['Fecha Requerida'] = fecha_requerida;
    if (nit_cc_cliente) fields['NIT/CC Cliente'] = nit_cc_cliente;
    if (contacto_cliente) fields['Contacto Cliente'] = contacto_cliente;
    if (telefono) fields['Telefono'] = telefono;
    if (email) fields['Email'] = email;
    if (observaciones) fields['Observaciones'] = observaciones;
    if (realiza_registro) fields['Realiza Registro'] = realiza_registro;

    console.log('📤 Creando pedido blend:', fields);
    const res = await fetch(tableUrl(), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ records: [{ fields }] }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error('❌ Error Airtable POST blend_pedidos:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
    }

    const record = data.records?.[0];
    console.log('✅ Pedido blend creado:', record?.id);
    return NextResponse.json(
      { success: true, message: 'Pedido creado exitosamente', record },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/pedidos:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

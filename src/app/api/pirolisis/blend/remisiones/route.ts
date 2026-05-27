import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';


function airtableHeaders() {
  return {
    'Authorization': `Bearer ${config.airtable.token}`,
    'Content-Type': 'application/json',
  };
}

function tableUrl() {
  return `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendRemisionesTableId}`;
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

// GET /api/pirolisis/blend/remisiones
// Query params: ?estado=X&cliente=Y
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
    params.set('sort[0][field]', 'Fecha Evento');
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
        console.error('❌ Error Airtable GET blend_remisiones:', data);
        return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
      }
      allRecords = allRecords.concat(data.records || []);
      offset = data.offset;
    } while (offset);

    console.log(`📋 blend_remisiones: ${allRecords.length} registros obtenidos`);
    return NextResponse.json({ records: allRecords }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/remisiones:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/pirolisis/blend/remisiones
// Body:
//   pedido_id            (string, requerido)
//   produccion_id        (string, requerido)
//   cliente              (string, override)
//   nit_cc_cliente       (string)
//   fecha_evento         (string ISO, opcional — default hoy)
//   realiza_registro     (string, requerido)
//   kg_biochar_puro      (number, requerido)
//   kg_abono_4g          (number, requerido)
//   kg_agua              (number, requerido)
//   kg_biologicos        (number, requerido)
//   baches_ids           (string[], requerido)
//   responsable_entrega  (string, requerido)
//   num_doc_entrega      (string, requerido)
//   telefono_entrega     (string)
//   email_entrega        (string)
//   observaciones        (string)
export async function POST(request: NextRequest) {
  const guard = guardConfig();
  if (guard) return guard;

  try {
    const body = await request.json();

    const {
      pedido_id,
      produccion_id,
      cliente,
      nit_cc_cliente,
      fecha_evento,
      realiza_registro,
      kg_biochar_puro,
      kg_abono_4g,
      kg_agua,
      kg_biologicos,
      baches_ids,
      responsable_entrega,
      num_doc_entrega,
      telefono_entrega,
      email_entrega,
      observaciones,
    } = body as {
      pedido_id?: string;
      produccion_id?: string;
      cliente?: string;
      nit_cc_cliente?: string;
      fecha_evento?: string;
      realiza_registro?: string;
      kg_biochar_puro?: number;
      kg_abono_4g?: number;
      kg_agua?: number;
      kg_biologicos?: number;
      baches_ids?: string[];
      responsable_entrega?: string;
      num_doc_entrega?: string;
      telefono_entrega?: string;
      email_entrega?: string;
      observaciones?: string;
    };

    // Validaciones
    const required: Record<string, unknown> = {
      pedido_id, produccion_id, realiza_registro, responsable_entrega, num_doc_entrega,
    };
    const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      return NextResponse.json({ error: 'Campos requeridos faltantes', details: missing }, { status: 400 });
    }
    if (typeof kg_biochar_puro !== 'number' || typeof kg_abono_4g !== 'number' ||
        typeof kg_agua !== 'number' || typeof kg_biologicos !== 'number') {
      return NextResponse.json({ error: 'Los campos kg_* deben ser números' }, { status: 400 });
    }
    if (!Array.isArray(baches_ids) || baches_ids.length === 0) {
      return NextResponse.json({ error: 'baches_ids debe ser un arreglo con al menos un ID' }, { status: 400 });
    }

    // Verificar que el pedido exista y esté en estado aprobable
    const pedidoRes = await fetch(
      `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.blendPedidosTableId}/${pedido_id}`,
      { headers: airtableHeaders() }
    );
    const pedidoData = await pedidoRes.json();
    if (!pedidoRes.ok) {
      if (pedidoRes.status === 404) return NextResponse.json({ error: 'Pedido no encontrado', details: pedido_id }, { status: 404 });
      return NextResponse.json({ error: pedidoData?.error || 'Airtable error', details: pedidoData }, { status: pedidoRes.status });
    }

    const estadoPedido: string = pedidoData.fields?.['Estado'] ?? '';
    const estadosValidos = ['Aprobado', 'En Producción', 'En Produccion', 'Listo Despacho'];
    if (!estadosValidos.includes(estadoPedido)) {
      return NextResponse.json({
        error: 'El pedido no está en un estado válido para crear una remisión',
        details: `Estado actual: "${estadoPedido}". Válidos: ${estadosValidos.join(', ')}`,
        estado_actual: estadoPedido,
      }, { status: 409 });
    }

    // Calcular totales y CO2 secuestrado
    const kg_total = kg_biochar_puro + kg_abono_4g + kg_agua + kg_biologicos;
    const co2_secuestrado_kg = +(kg_biochar_puro * config.carbon.factorSecuestroCo2).toFixed(4);

    // Resolución del nombre del cliente (del pedido si no viene en el body)
    const clienteFinal: string = cliente?.trim() || pedidoData.fields?.['Cliente'] || '';
    if (!clienteFinal) {
      return NextResponse.json({ error: 'No se pudo determinar el nombre del cliente' }, { status: 400 });
    }

    const fechaFinal = fecha_evento || new Date().toISOString().split('T')[0];

    // Construir payload para Airtable
    const fields: Record<string, unknown> = {
      'Cliente': clienteFinal,
      'Fecha Evento': fechaFinal,
      'Estado': 'Borrador',
      'Realiza Registro': realiza_registro,
      'KG Total Despachados': +kg_total.toFixed(2),
      'KG Biochar Puro': +kg_biochar_puro.toFixed(2),
      'KG Abono 4G': +kg_abono_4g.toFixed(2),
      'KG Agua': +kg_agua.toFixed(2),
      'KG Biologicos': +kg_biologicos.toFixed(2),
      'CO2 Secuestrado KG': co2_secuestrado_kg,
      'Responsable Entrega': responsable_entrega,
      'Num Doc Entrega': num_doc_entrega,
      'Pedido Origen': [pedido_id!],
      'Produccion Origen': [produccion_id!],
      'Baches Utilizados': baches_ids,
    };

    if (nit_cc_cliente) fields['NIT/CC Cliente'] = nit_cc_cliente;
    if (telefono_entrega) fields['Telefono Entrega'] = telefono_entrega;
    if (email_entrega) fields['Email Entrega'] = email_entrega;
    if (observaciones) fields['Observaciones'] = observaciones;

    const createRes = await fetch(tableUrl(), {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify({ records: [{ fields }] }),
    });
    const createData = await createRes.json();

    if (!createRes.ok) {
      console.error('❌ Error al crear blend_remision:', createData);
      return NextResponse.json({ error: createData?.error || 'Airtable error', details: createData }, { status: createRes.status });
    }

    const record = createData.records?.[0];
    console.log(`✅ blend_remision creada: ${record?.id}`);

    return NextResponse.json({
      success: true,
      record,
      co2_secuestrado_kg,
      kg_total: +kg_total.toFixed(2),
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST blend/remisiones:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

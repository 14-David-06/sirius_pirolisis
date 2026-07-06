import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../../../lib/config';

// GET /api/pirolisis/blend/produccion/by-pedido?pedido=SIRIUS-PED-XXXX
//
// Resuelve la producción de Biochar Blend vinculada a un pedido vía la FK
// simbólica `Pedido Origen` (texto SIRIUS-PED-XXXX). El pedido vive en Sirius
// Pedidos Core (sin link cruzado a PiroliApp), así que la relación se resuelve
// por este campo, no por linked-record.
//
// Respuesta: { produccion: { id, codigo, estado, kg_total, kg_biochar_puro,
//   kg_abono_4g, kg_agua, kg_biologicos } | null }
export async function GET(request: NextRequest) {
  const base = config.airtable.baseId;
  const token = config.airtable.token;
  const table = config.airtable.blendProduccionTableId;

  if (!base || !token || !table) {
    return NextResponse.json(
      { error: 'Configuración de Airtable incompleta (blend_produccion)' },
      { status: 500 }
    );
  }

  const pedido = new URL(request.url).searchParams.get('pedido');
  if (!pedido) {
    return NextResponse.json({ error: 'Falta el query param: pedido (SIRIUS-PED-XXXX)' }, { status: 400 });
  }

  try {
    const safe = pedido.replace(/'/g, "\\'");
    const params = new URLSearchParams({ filterByFormula: `{Pedido Origen}='${safe}'`, maxRecords: '20' });
    const res = await fetch(`https://api.airtable.com/v0/${base}/${table}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: res.status });
    }

    const records: Array<{ id: string; fields: Record<string, unknown> }> = data.records || [];
    // Preferir una producción no cancelada; si hay varias, la última.
    const activa = records.filter((r) => String(r.fields?.['Estado'] ?? '') !== 'Cancelado');
    const rec = (activa.length ? activa : records)[records.length ? records.length - 1 : 0] ?? activa[activa.length - 1] ?? null;

    if (!rec) {
      return NextResponse.json({ produccion: null }, { status: 200 });
    }

    const f = rec.fields;
    return NextResponse.json(
      {
        produccion: {
          id: rec.id,
          codigo: String(f['ID'] ?? rec.id),
          estado: String(f['Estado'] ?? ''),
          kg_total: Number(f['KG Total Blend'] ?? 0),
          kg_biochar_puro: Number(f['KG Biochar Puro'] ?? 0),
          kg_abono_4g: Number(f['KG Abono 4G'] ?? 0),
          kg_agua: Number(f['KG Agua'] ?? 0),
          kg_biologicos: Number(f['KG Biologicos'] ?? 0),
          // Baches usados en la producción (los KG por bache se fijaron al producir).
          baches: Array.isArray(f['Baches Utilizados']) ? (f['Baches Utilizados'] as string[]) : [],
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { config } from '../../../lib/config';

// GET /api/debug-pedidos-core-estados
// Usa la Airtable Metadata API para listar las opciones reales del campo Estado
// en la tabla de Pedidos de Sirius Pedidos Core.
// SOLO para uso en desarrollo — eliminar en producción.
export async function GET() {
  const token   = config.airtable.pedidosCoreToken;
  const baseId  = config.airtable.pedidosCoreBaseId;
  const tableId = config.airtable.pedidosCorePedidosTable;

  if (!token || !baseId || !tableId) {
    return NextResponse.json(
      { error: 'Faltan AIRTABLE_PEDIDOS_CORE_TOKEN / AIRTABLE_PEDIDOS_CORE_BASE_ID / AIRTABLE_PEDIDOS_CORE_PEDIDOS_TABLE_ID' },
      { status: 500 }
    );
  }

  // Airtable Metadata API — devuelve el schema completo de todas las tablas
  const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metaData = await metaRes.json();

  if (!metaRes.ok) {
    return NextResponse.json({ error: 'Error al llamar Metadata API', details: metaData }, { status: metaRes.status });
  }

  // Buscar la tabla de pedidos por ID
  const table = (metaData.tables ?? []).find(
    (t: { id: string; name: string }) => t.id === tableId
  );

  if (!table) {
    const available = (metaData.tables ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }));
    return NextResponse.json({ error: `Tabla ${tableId} no encontrada`, available }, { status: 404 });
  }

  // Buscar el campo Estado
  const estadoField = (table.fields ?? []).find(
    (f: { name: string }) => f.name === 'Estado'
  );

  if (!estadoField) {
    const fieldNames = (table.fields ?? []).map((f: { name: string }) => f.name);
    return NextResponse.json({ error: 'Campo Estado no encontrado', fieldNames }, { status: 404 });
  }

  return NextResponse.json({
    table: table.name,
    field: estadoField.name,
    type: estadoField.type,
    options: estadoField.options?.choices ?? estadoField.options ?? null,
  });
}

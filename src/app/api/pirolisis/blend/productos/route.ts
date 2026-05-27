import { NextResponse } from 'next/server';

// Sirius Product Core — base independiente
const PRODUCTS_BASE_ID = process.env.AIRTABLE_PRODUCTS_BASE_ID;
const PRODUCTS_TABLE_ID = process.env.AIRTABLE_PRODUCTS_TABLE_ID;
const PRODUCTS_TOKEN =
  process.env.AIRTABLE_PRODUCTS_TOKEN ||
  process.env.AIRTABLE_CLIENTES_TOKEN ||
  process.env.AIRTABLE_TOKEN;

function headers() {
  return {
    Authorization: `Bearer ${PRODUCTS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// GET /api/pirolisis/blend/productos
// Devuelve productos activos del área Pirolisis en Sirius Product Core
export async function GET() {
  if (!PRODUCTS_TOKEN || !PRODUCTS_BASE_ID || !PRODUCTS_TABLE_ID) {
    const missing = [
      !PRODUCTS_TOKEN && 'AIRTABLE_PRODUCTS_TOKEN',
      !PRODUCTS_BASE_ID && 'AIRTABLE_PRODUCTS_BASE_ID',
      !PRODUCTS_TABLE_ID && 'AIRTABLE_PRODUCTS_TABLE_ID',
    ].filter(Boolean).join(', ');
    return NextResponse.json(
      { error: 'Configuración de Sirius Product Core incompleta', details: `Faltan: ${missing}` },
      { status: 500 }
    );
  }

  try {
    const filter = encodeURIComponent(`AND({Activo}='Sí', {Area}='Pirolisis')`);
    const fields = [
      'Nombre Comercial',
      'Codigo Producto',
      'Precio Venta Unitario',
      'Unidad Base',
      'Categoria Producto',
      'Tipo Producto',
      'Abreviatura',
    ]
      .map(f => `fields%5B%5D=${encodeURIComponent(f)}`)
      .join('&');

    let allRecords: unknown[] = [];
    let offset: string | undefined;

    do {
      const offsetParam = offset ? `&offset=${encodeURIComponent(offset)}` : '';
      const url = `https://api.airtable.com/v0/${PRODUCTS_BASE_ID}/${PRODUCTS_TABLE_ID}?filterByFormula=${filter}&${fields}&sort%5B0%5D%5Bfield%5D=Nombre%20Comercial&sort%5B0%5D%5Bdirection%5D=asc${offsetParam}`;

      const res = await fetch(url, { headers: headers() });
      const data = await res.json();

      if (!res.ok) {
        console.error('❌ Error Airtable GET blend_productos:', data);
        return NextResponse.json(
          { error: data?.error?.message || 'Airtable error', details: data },
          { status: res.status }
        );
      }

      allRecords = allRecords.concat(data.records ?? []);
      offset = data.offset;
    } while (offset);

    const productos = allRecords.map((r: any) => ({
      recordId: r.id,
      nombre: String(r.fields?.['Nombre Comercial'] ?? ''),
      codigo: String(r.fields?.['Codigo Producto'] ?? ''),
      precioUnitario: Number(r.fields?.['Precio Venta Unitario'] ?? 0),
      unidadBase: String(r.fields?.['Unidad Base'] ?? ''),
      categoria: String(r.fields?.['Categoria Producto'] ?? ''),
      tipo: String(r.fields?.['Tipo Producto'] ?? ''),
      abreviatura: String(r.fields?.['Abreviatura'] ?? ''),
    }));

    console.log(`🌱 blend_productos (Pirolisis): ${productos.length} productos activos`);
    return NextResponse.json({ productos }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en GET blend/productos:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

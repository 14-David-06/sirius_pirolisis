import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

export async function GET() {
  try {
    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.inventarioTableId) {
      return NextResponse.json({
        error: 'Configuración incompleta',
        details: 'Faltan credenciales de Airtable'
      }, { status: 500 });
    }

    // Obtener la estructura de la tabla (solo metadata, sin registros)
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${config.airtable.baseId}/tables`, {
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`
      }
    });

    if (!response.ok) {
      return NextResponse.json({
        error: 'Error al consultar Airtable',
        details: await response.text()
      }, { status: response.status });
    }

    const data = await response.json();

    // Encontrar la tabla de inventario
    const inventarioTable = data.tables.find((table: any) =>
      table.id === config.airtable.inventarioTableId
    );

    if (!inventarioTable) {
      return NextResponse.json({
        error: 'Tabla no encontrada',
        tables: data.tables.map((t: any) => ({ id: t.id, name: t.name }))
      }, { status: 404 });
    }

    // Mostrar campos de la tabla
    const fields = inventarioTable.fields.map((field: any) => ({
      id: field.id,
      name: field.name,
      type: field.type
    }));

    return NextResponse.json({
      tableName: inventarioTable.name,
      tableId: inventarioTable.id,
      fields: fields
    });

  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json({
      error: 'Error interno',
      details: error.message
    }, { status: 500 });
  }
}
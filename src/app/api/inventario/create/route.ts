import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el ID de la tabla de Inventario Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.inventarioTableId;

export async function POST(request: Request) {
  // Verificar si la variable de entorno está configurada
  if (!TABLE_ID) {
    console.warn('⚠️ AIRTABLE_INVENTARIO_TABLE_ID no está configurado en .env.local');
    return NextResponse.json({
      error: 'AIRTABLE_INVENTARIO_TABLE_ID no está configurado. Revisa tu archivo .env.local',
      details: 'Para activar el módulo de inventario, configura AIRTABLE_INVENTARIO_TABLE_ID en .env.local'
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        error: 'Configuración de Airtable incompleta',
        details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID'
      }, { status: 500 });
    }

    const body = await request.json();
    const { insumo, categoria, cantidad, unidad, descripcion, stockMinimo } = body;

    // Validar campos requeridos
    if (!insumo || !categoria || cantidad === undefined) {
      return NextResponse.json({
        error: 'Campos requeridos faltantes',
        details: 'Se requieren: insumo, categoria, cantidad'
      }, { status: 400 });
    }

    // Preparar los campos para Airtable
    const fields: any = {
      'Insumo': insumo,
      'Categoria': categoria,
      'Presentacion Insumo': parseInt(cantidad) || 0,
    };

    if (unidad) fields['Unidad'] = unidad;
    if (descripcion) fields['Descripción'] = descripcion;
    if (stockMinimo !== undefined) fields['Stock Minimo'] = parseInt(stockMinimo) || 0;

    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields
        }]
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Airtable al crear:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error('❌ Error en API crear inventario:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
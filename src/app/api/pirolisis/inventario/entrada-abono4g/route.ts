import { NextResponse } from 'next/server';
import { config } from '../../../../../lib/config';



export async function POST(request: Request) {
  if (!config.airtable.inventarioTableId) {
    console.warn('⚠️ AIRTABLE_INVENTARIO_TABLE_ID no está configurado en .env.local');
    return NextResponse.json({
      error: 'AIRTABLE_INVENTARIO_TABLE_ID no está configurado. Revisa tu archivo .env.local',
      details: 'Para activar el módulo de inventario, configura AIRTABLE_INVENTARIO_TABLE_ID en .env.local',
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        error: 'Configuración de Airtable incompleta',
        details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID',
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('📥 Datos recibidos en entrada-abono4g:', body);

    const { cantidad_kg, realiza_registro } = body as {
      cantidad_kg: number;
      realiza_registro?: string;
    };

    if (cantidad_kg === undefined || cantidad_kg === null) {
      return NextResponse.json({
        error: 'Campo requerido faltante',
        details: 'Se requiere: cantidad_kg',
      }, { status: 400 });
    }

    const cantidadNumerica = parseFloat(String(cantidad_kg));
    if (isNaN(cantidadNumerica) || cantidadNumerica <= 0) {
      return NextResponse.json({
        error: 'Cantidad inválida',
        details: 'cantidad_kg debe ser un número positivo',
      }, { status: 400 });
    }

    const fields: Record<string, unknown> = {};
    fields[config.airtable.entradasFields.cantidadIngresa || 'Cantidad Ingresa'] = cantidadNumerica;
    fields[config.airtable.entradasFields.inventarioInsumos || 'Inventario Insumos Pirolisis'] = [config.airtable.blendAbono4gRecordId];

    if (realiza_registro) {
      fields[config.airtable.entradasFields.realizaRegistro || 'Realiza Registro'] = realiza_registro;
    }

    console.log('📤 Campos a crear en Entrada Insumos Pirolisis (Abono 4G):', fields);

    const response = await fetch(
      `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.entradasTableId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: [{ fields }] }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Airtable al crear entrada Abono 4G:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
    }

    console.log('✅ Entrada Abono 4G registrada:', data.records?.[0]?.id);

    return NextResponse.json({
      success: true,
      message: `Entrada de Abono 4G registrada exitosamente. Cantidad: ${cantidadNumerica} kg`,
      data,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en POST entrada-abono4g:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

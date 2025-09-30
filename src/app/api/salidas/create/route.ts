import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      cantidadSale,
      presentacionInsumo,
      observaciones,
      tipoSalida,
      documentoSoporte,
      realizaRegistro,
      inventarioInsumosId,
      turnoId,
      mantenimientoId
    } = body;

    const baseId = config.airtable.baseId;
    const tableId = config.airtable.salidasTableId;
    const apiKey = config.airtable.token;

    if (!apiKey || !baseId || !tableId) {
      return NextResponse.json({
        error: 'Missing required environment variables for Airtable configuration'
      }, { status: 500 });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;

    // Preparar campos
    const fields: any = {};

    if (cantidadSale) fields['Cantidad Sale'] = cantidadSale;
    if (presentacionInsumo) fields['Presentacion Insumo'] = presentacionInsumo;
    if (observaciones) fields['Observaciones'] = observaciones;
    if (tipoSalida) fields['Tipo de Salida'] = tipoSalida;
    if (documentoSoporte && documentoSoporte.length > 0) fields['Documento Soporte'] = documentoSoporte;
    if (realizaRegistro) fields['Realiza Registro'] = realizaRegistro;
    if (inventarioInsumosId) fields['Inventario Insumos Pirolisis'] = [inventarioInsumosId];
    if (turnoId) fields['Turno Pirolisis'] = [turnoId];
    if (mantenimientoId) {
      console.log('Relacionando salida con mantenimiento:', mantenimientoId);
      fields[config.airtable.salidasFields.mantenimiento || 'Mantenimientos'] = [mantenimientoId];
    }

    console.log('Creando salida con campos:', fields);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: fields
        }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Airtable API error:', response.status, errorText);
      console.error('Campos enviados:', fields);
      console.error('URL:', url);
      return NextResponse.json({
        error: `Airtable API error: ${response.status}`,
        details: errorText,
        fields: fields
      }, { status: 500 });
    }

    const data = await response.json();
    console.log('Salida creada:', data);
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error creating salida:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}
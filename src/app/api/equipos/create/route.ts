import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      nombre,
      ubicacion,
      funcionPrincipal,
      anoInstalacion,
      fabricanteModelo,
      capacidadOperacional,
      tipoInsumoRecibido,
      cantidadPromedio,
      fuenteInsumos,
      medioTransporteInsumo,
      observacionesOperativas,
      notasAdicionales,
      realizaRegistro
    } = body;

    const baseId = config.airtable.baseId;
    const tableId = config.airtable.equiposTableId;
    const apiKey = config.airtable.token;

    if (!apiKey || !baseId || !tableId) {
      return NextResponse.json({
        error: 'Missing required environment variables'
      }, { status: 500 });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: {
            'Nombre del equipo': nombre,
            'Ubicación': ubicacion,
            'Función principal': funcionPrincipal,
            'Año de instalación': anoInstalacion,
            'Fabricante/Modelo': fabricanteModelo,
            'Capacidad operacional': capacidadOperacional,
            'Tipo de insumo recibido': tipoInsumoRecibido,
            'Cantidad promedio (día/mes)': cantidadPromedio,
            'Fuente de insumos': fuenteInsumos,
            'Medio de transporte del insumo': medioTransporteInsumo,
            'Observaciones operativas': observacionesOperativas,
            'Notas adicionales': notasAdicionales,
            'Realiza Registro': realizaRegistro
          }
        }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Airtable API error:', response.status, errorText);
      return NextResponse.json({
        error: `Airtable API error: ${response.status}`,
        details: errorText
      }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error creating equipo:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}
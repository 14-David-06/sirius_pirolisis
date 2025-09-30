import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: NextRequest) {
  console.log('🔧 [equipos/create] Iniciando creación de equipo');
  
  try {
    const body = await request.json();
    console.log('📥 [equipos/create] Datos recibidos:', body);
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

    console.log('Configuración Airtable:', {
      baseId: baseId ? 'Presente' : 'Ausente',
      tableId: tableId ? 'Presente' : 'Ausente',
      apiKey: apiKey ? 'Presente' : 'Ausente',
      url: `https://api.airtable.com/v0/${baseId}/${tableId}`
    });

    if (!apiKey || !baseId || !tableId) {
      console.error('Missing required environment variables');
      return NextResponse.json({
        error: 'Missing required environment variables'
      }, { status: 500 });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;

    // Preparar campos, filtrando valores vacíos o 'N/A'
    const fields: any = {};

    if (nombre && nombre.trim()) fields['Nombre del equipo'] = nombre.trim();
    if (ubicacion && ubicacion.trim()) fields['Ubicación'] = ubicacion.trim();
    if (funcionPrincipal && funcionPrincipal.trim()) fields['Función principal'] = funcionPrincipal.trim();
    if (anoInstalacion && anoInstalacion !== '' && anoInstalacion !== 'N/A') {
      const year = parseInt(anoInstalacion.toString(), 10);
      if (!isNaN(year)) {
        fields['Año de instalación'] = year;
      }
    }
    if (fabricanteModelo && fabricanteModelo.trim() && fabricanteModelo !== 'N/A') fields['Fabricante/Modelo'] = fabricanteModelo.trim();
    if (capacidadOperacional && capacidadOperacional.trim() && capacidadOperacional !== 'N/A') fields['Capacidad operacional'] = capacidadOperacional.trim();
    if (tipoInsumoRecibido && tipoInsumoRecibido.trim() && tipoInsumoRecibido !== 'N/A') fields['Tipo de insumo recibido'] = tipoInsumoRecibido.trim();
    if (cantidadPromedio && cantidadPromedio.trim() && cantidadPromedio !== 'N/A') fields['Cantidad promedio (día/mes)'] = cantidadPromedio.trim();
    if (fuenteInsumos && fuenteInsumos.trim() && fuenteInsumos !== 'N/A') fields['Fuente de insumos'] = fuenteInsumos.trim();
    if (medioTransporteInsumo && medioTransporteInsumo.trim() && medioTransporteInsumo !== 'N/A') fields['Medio de transporte del insumo'] = medioTransporteInsumo.trim();
    if (observacionesOperativas && observacionesOperativas.trim() && observacionesOperativas !== 'N/A') fields['Observaciones operativas'] = observacionesOperativas.trim();
    if (notasAdicionales && notasAdicionales.trim() && notasAdicionales !== 'N/A') fields['Notas adicionales'] = notasAdicionales.trim();
    if (realizaRegistro && realizaRegistro.trim()) fields['Realiza Registro'] = realizaRegistro.trim();

    console.log('Campos a enviar a Airtable:', fields);
    console.log('Campo "Realiza Registro":', fields['Realiza Registro']);

    // Validar que al menos el nombre del equipo esté presente
    if (!fields['Nombre del equipo']) {
      return NextResponse.json({
        error: 'El nombre del equipo es requerido'
      }, { status: 400 });
    }

    // Validar que al menos el nombre del equipo esté presente
    if (!fields['Nombre del equipo']) {
      return NextResponse.json({
        error: 'El nombre del equipo es requerido'
      }, { status: 400 });
    }

    console.log('🚀 [equipos/create] Realizando petición a Airtable...');
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

    console.log('📡 [equipos/create] Respuesta de Airtable - Status:', response.status);
    console.log('📡 [equipos/create] Respuesta de Airtable - StatusText:', response.statusText);
    console.log('📡 [equipos/create] Respuesta de Airtable - OK:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Airtable API error:', response.status, errorText);
      return NextResponse.json({
        error: `Airtable API error: ${response.status}`,
        details: errorText
      }, { status: 500 });
    }

    const data = await response.json();
    console.log('Respuesta de Airtable para creación de equipo:', data);
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error creating equipo:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}
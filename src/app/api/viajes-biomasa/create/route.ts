import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar la variable de entorno para el ID de la tabla
const TABLE_ID = process.env.AIRTABLE_VIAJES_BIOMASA_TABLE_ID;

export async function POST(req: NextRequest) {
  try {
    if (!TABLE_ID) {
      return NextResponse.json({ 
        error: 'ID de tabla de Viajes de Biomasa no configurado' 
      }, { status: 500 });
    }

    const body = await req.json();

    console.log('📝 Datos recibidos para crear registro:', body);

    const fields = {
      'Nombre Entrega': body.NombreEntrega,
      'Punto Recoleccion': body.PuntoRecoleccion,
      'Punto Entrega': body.PuntoEntrega,
      'Distancia Metros': body.DistanciaMetros,
      'Peso Biomasa Fresca': body.PesoBiomasaFresca,
      'Combustible': body.Combustible || '',
      'Tipo Vehiculo': body.TipoVehiculo,
      'Realiza Registro': body.RealizaRegistro,
      'ID_Turno': Array.isArray(body.ID_Turno) ? body.ID_Turno : [],
    };

    console.log('📝 Campos a enviar a Airtable:', fields);
    
    const records = [{ fields }];

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Configuración de Airtable faltante' }, { status: 500 });
    }

    const res = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records }),
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: json?.error || 'Error de Airtable', details: json }, { status: res.status });
    }

    return NextResponse.json(json, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}

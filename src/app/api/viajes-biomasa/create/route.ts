import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el nombre de la tabla en lugar del ID
const TABLE_NAME = process.env.AIRTABLE_VIAJES_BIOMASA_TABLE || 'Viajes Biomasa';

export async function POST(req: NextRequest) {
  try {
    if (!TABLE_NAME) {
      return NextResponse.json({ 
        error: 'Nombre de tabla de Viajes de Biomasa no configurado' 
      }, { status: 500 });
    }

    const body = await req.json();

    console.log('📝 Datos recibidos para crear registro:', body);

    const fields = {
      'Nombre Quien Entrega': body['Nombre Quien Entrega'],
      'Tipo Biomasa': body['Tipo Biomasa'],
      'Peso entregado de masa fresca': body['Peso entregado de masa fresca'],
      'Tipo Combustible': body['Tipo Combustible'],
      'Tipo Vehículo': body['Tipo Vehículo'],
      'Realiza Registro': body['Realiza Registro'],
      'ID_Turno': Array.isArray(body['ID_Turno']) ? body['ID_Turno'] : [],
    };

    console.log('📝 Campos a enviar a Airtable:', fields);
    
    const records = [{ fields }];

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Configuración de Airtable faltante' }, { status: 500 });
    }

    const res = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${encodeURIComponent(TABLE_NAME)}`, {
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

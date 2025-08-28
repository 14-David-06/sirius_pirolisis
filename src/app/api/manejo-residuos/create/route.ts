import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el nombre de la tabla en lugar del ID
const TABLE_NAME = process.env.AIRTABLE_RESIDUOS_TABLE || 'Manejo Residuos';

export async function POST(req: NextRequest) {
  if (!TABLE_NAME) {
    return NextResponse.json({ 
      error: 'Nombre de tabla de Manejo de Residuos no configurado' 
    }, { status: 500 });
  }
  try {
    const body = await req.json();

    // Basic validation
    console.log('Datos a guardar:', body);

    console.log('📝 Datos recibidos para crear registro:', body);

    const fields = {
      'Cantidad Residuos Aprovechables Kg': body.CantidadResiduosAprovechablesKg,
      'Cantidad Residuos Peligrosos Kg': body.CantidadResiduosPeligrososKg,
      'Cantidad Residuos No Aprovechables Kg': body.CantidadResiduosNoAprovechablesKg,
      'Cantidad Residuos Organicos Kg': body.CantidadResiduosOrganicosKg,
      'Entregado a': body.EntregadoA,
      'Observaciones': body.Observaciones || '',
      'Realiza Registro': body.RealizaRegistro,
      'ID_Turno': Array.isArray(body.ID_Turno) ? body.ID_Turno : [],
    };

    console.log('📝 Campos a enviar a Airtable:', fields);
    
    const records = [{ fields }];

    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
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
      return NextResponse.json({ error: json?.error || 'Airtable error', details: json }, { status: res.status });
    }

    return NextResponse.json(json, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}

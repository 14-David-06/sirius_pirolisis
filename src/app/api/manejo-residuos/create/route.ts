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

    // Verificar si es un array de registros o un solo registro
    let records = [];
    if (body.records && Array.isArray(body.records)) {
      // Nuevo formato: array de registros con subtipos
      records = body.records.map(record => ({
        fields: {
          'Residuo': record.Residuo,
          'Cantidad Residuo KG': record['Cantidad Residuo KG'],
          'Tipo Residuo': record['Tipo Residuo'],
          'Entregado a': record['Entregado a'],
          'Observaciones': record.Observaciones || '',
          'Realiza Registro': record['Realiza Registro'],
          'ID_Turno': record.ID_Turno ? [record.ID_Turno] : [], // Convertir string a array para Airtable
        }
      }));
    } else {
      // Para compatibilidad con el formato anterior
      records = [{
        fields: {
          'Residuo': body.Residuo || 'Sin especificar',
          'Cantidad Residuo KG': body['Cantidad Residuo KG'] || 0,
          'Tipo Residuo': body['Tipo Residuo'] || '♻️ Residuos Aprovechables',
          'Entregado a': body.EntregadoA || body['Entregado a'],
          'Observaciones': body.Observaciones || '',
          'Realiza Registro': body.RealizaRegistro || body['Realiza Registro'],
          'ID_Turno': body.ID_Turno ? [body.ID_Turno] : [], // Convertir string a array para Airtable
        }
      }];
    }

    console.log('📝 Registros a enviar a Airtable:', JSON.stringify(records, null, 2));
    
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({ error: 'Airtable config missing' }, { status: 500 });
    }

    console.log('🔗 URL de Airtable:', `https://api.airtable.com/v0/${config.airtable.baseId}/${encodeURIComponent(TABLE_NAME)}`);
    console.log('🔑 Token presente:', !!config.airtable.token);

    const res = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${encodeURIComponent(TABLE_NAME)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records }),
    });

    const json = await res.json();
    console.log('📡 Respuesta de Airtable - Status:', res.status);
    console.log('📡 Respuesta de Airtable - Headers:', Object.fromEntries(res.headers.entries()));
    console.log('📡 Respuesta de Airtable - Body:', JSON.stringify(json, null, 2));
    
    if (!res.ok) {
      console.error('❌ Error de Airtable:', json);
      return NextResponse.json({ error: json?.error || 'Airtable error', details: json }, { status: res.status });
    }

    return NextResponse.json(json, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}

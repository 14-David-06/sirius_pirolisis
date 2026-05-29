import { NextRequest, NextResponse } from 'next/server';

const NOMINA_BASE_ID = process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE;
const NOMINA_TOKEN  = process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE;
const NOMINA_TABLE  = process.env.AIRTABLE_TABLE_NOMINA_PERSONAL;

export async function POST(request: NextRequest) {
  try {
    const { cedula } = await request.json();

    if (!cedula) {
      return NextResponse.json({ message: 'Cédula es requerida' }, { status: 400 });
    }

    if (!NOMINA_BASE_ID || !NOMINA_TOKEN || !NOMINA_TABLE) {
      return NextResponse.json({ message: 'Error de configuración del servidor' }, { status: 500 });
    }

    const tableEncoded = encodeURIComponent(NOMINA_TABLE);
    const formula      = encodeURIComponent(`{Numero Documento}="${cedula}"`);
    const url = `https://api.airtable.com/v0/${NOMINA_BASE_ID}/${tableEncoded}?filterByFormula=${formula}&maxRecords=1`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${NOMINA_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ message: 'Error al conectar con la base de datos' }, { status: 500 });
    }

    const data = await response.json();

    if (!data.records || data.records.length === 0) {
      return NextResponse.json({ exists: false, message: 'Usuario no encontrado' }, { status: 404 });
    }

    const userRecord = data.records[0];
    const f = userRecord.fields;

    const hasPassword = !!(f.Password && f.Password.trim() !== '');

    return NextResponse.json({
      exists: true,
      hasPassword,
      user: {
        id:       userRecord.id,
        Cedula:   String(f['Numero Documento'] ?? cedula),
        Nombre:   f['Nombre completo']    || '',
        Apellido: '',
        Email:    f['Correo electrónico'] || '',
        Telefono: f['Teléfono']           || '',
        Cargo:    (f['Rol (from Rol)'] as string[])?.[0] || '',
      }
    });

  } catch (error) {
    console.error('💥 [validate-cedula] Error:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

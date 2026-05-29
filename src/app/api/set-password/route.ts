import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { config } from '@/lib/config';

const NOMINA_BASE_ID = process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE;
const NOMINA_TOKEN  = process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE;
const NOMINA_TABLE  = process.env.AIRTABLE_TABLE_NOMINA_PERSONAL;

export async function POST(request: NextRequest) {
  try {
    const { cedula, password } = await request.json();

    if (!cedula || !password) {
      return NextResponse.json({ message: 'Cédula y contraseña son requeridas' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ message: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    if (!NOMINA_BASE_ID || !NOMINA_TOKEN || !NOMINA_TABLE) {
      return NextResponse.json({ message: 'Error de configuración del servidor' }, { status: 500 });
    }

    // Buscar usuario por Numero Documento
    const tableEncoded = encodeURIComponent(NOMINA_TABLE);
    const formula      = encodeURIComponent(`{Numero Documento}="${cedula}"`);
    const searchUrl = `https://api.airtable.com/v0/${NOMINA_BASE_ID}/${tableEncoded}?filterByFormula=${formula}&maxRecords=1`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${NOMINA_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchRes.ok) {
      return NextResponse.json({ message: 'Error al conectar con la base de datos' }, { status: 500 });
    }

    const data = await searchRes.json();

    if (!data.records || data.records.length === 0) {
      return NextResponse.json({ success: false, message: 'Usuario no encontrado' }, { status: 404 });
    }

    const userRecord = data.records[0];
    const f = userRecord.fields;

    // Generar hash bcrypt y guardar en campo Password
    const hashedPassword = await bcrypt.hash(password, config.security.bcryptSaltRounds);

    const updateUrl = `https://api.airtable.com/v0/${NOMINA_BASE_ID}/${tableEncoded}/${userRecord.id}`;
    const updateRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${NOMINA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: { Password: hashedPassword } }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => '');
      console.error(`❌ [set-password] ${updateRes.status}: ${errText}`);
      return NextResponse.json({ message: 'Error al actualizar la contraseña' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Contraseña establecida correctamente',
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
    console.error('💥 [set-password] Error:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

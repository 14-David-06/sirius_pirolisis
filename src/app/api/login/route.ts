import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ServerSessionManager } from '@/lib/serverSession';

const NOMINA_BASE_ID = process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE;
const NOMINA_TOKEN  = process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE;
const NOMINA_TABLE  = process.env.AIRTABLE_TABLE_NOMINA_PERSONAL;

const PIROLISIS_TOKEN  = process.env.AIRTABLE_TOKEN;
const PIROLISIS_BASE_ID = process.env.AIRTABLE_BASE_ID;
const USUARIOS_TABLE   = process.env.AIRTABLE_USUARIOS_TABLE_ID;

async function lookupPirolisisUserId(idPersonalCore: string): Promise<string> {
  if (!PIROLISIS_TOKEN || !PIROLISIS_BASE_ID || !USUARIOS_TABLE || !idPersonalCore) return '';
  try {
    const formula = encodeURIComponent(`{ID Usuario Core}="${idPersonalCore}"`);
    const url = `https://api.airtable.com/v0/${PIROLISIS_BASE_ID}/${USUARIOS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${PIROLISIS_TOKEN}` },
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.records?.[0]?.id || '';
  } catch {
    return '';
  }
}


export async function POST(request: NextRequest) {
  console.log('🔐 [login] Sirius Nomina Core');

  try {
    const { cedula, password } = await request.json();

    if (!cedula || !password) {
      return NextResponse.json(
        { message: 'Cédula y contraseña son requeridas' },
        { status: 400 }
      );
    }

    if (!NOMINA_BASE_ID || !NOMINA_TOKEN || !NOMINA_TABLE) {
      console.error('❌ [login] Variables de Nomina Core no configuradas');
      return NextResponse.json(
        { message: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Buscar usuario por Numero Documento en Nomina Core
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
      const errorText = await response.text().catch(() => 'desconocido');
      console.error(`❌ [login] Airtable ${response.status}: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al conectar con la base de datos' },
        { status: 500 }
      );
    }

    const data = await response.json();

    if (!data.records || data.records.length === 0) {
      console.log(`❌ [login] No encontrado: ${cedula}`);
      return NextResponse.json(
        { success: false, message: 'Usuario no encontrado' },
        { status: 404 }
      );
    }

    const userRecord = data.records[0];
    const f = userRecord.fields;

    // Verificar que el usuario está activo
    if (f['Estado de actividad'] !== 'Activo') {
      console.log(`❌ [login] Usuario inactivo: ${cedula}`);
      return NextResponse.json(
        { success: false, message: 'Usuario inactivo. Contacta al administrador.' },
        { status: 403 }
      );
    }

    // Verificar que tiene contraseña configurada
    if (!f.Password) {
      return NextResponse.json(
        { success: false, message: 'El usuario no tiene contraseña establecida' },
        { status: 400 }
      );
    }

    // Comparar contraseña con bcrypt
    const passwordMatch = await bcrypt.compare(password, f.Password);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: 'Contraseña incorrecta' },
        { status: 401 }
      );
    }

    const idPersonalCore = f['ID Empleado'] || '';
    const idPirolisis = await lookupPirolisisUserId(idPersonalCore);

    const userInfo = {
      id:             userRecord.id,
      Cedula:         String(f['Numero Documento'] ?? cedula),
      Nombre:         f['Nombre completo']     || '',
      Apellido:       '',
      Email:          f['Correo electrónico']  || '',
      Telefono:       f['Teléfono']            || '',
      Cargo:          (f['Rol (from Rol)'] as string[])?.[0] || '',
      idPersonalCore,
      idPirolisis,
    };

    await ServerSessionManager.createSecureSession(userInfo);

    console.log(`✅ [login] OK — ${userInfo.Nombre} (${userInfo.idPersonalCore})`);
    return NextResponse.json({ success: true, user: userInfo });

  } catch (error) {
    console.error('💥 [login] Error:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

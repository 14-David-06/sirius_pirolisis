import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

if (!AIRTABLE_TOKEN) {
  throw new Error('AIRTABLE_TOKEN environment variable is required');
}

if (!AIRTABLE_BASE_ID) {
  throw new Error('AIRTABLE_BASE_ID environment variable is required');
}

if (!AIRTABLE_TABLE_NAME) {
  throw new Error('AIRTABLE_TABLE_NAME environment variable is required');
}

export async function POST(request: NextRequest) {
  console.log('🔐 [login] Iniciando proceso de login');
  
  try {
    console.log('📥 [login] Parseando request body...');
    const { cedula, password } = await request.json();
    console.log(`📋 [login] Cédula recibida: ${cedula}`);
    console.log(`🔑 [login] Password recibida: ${password ? '[PRESENTE]' : '[AUSENTE]'}`);

    if (!cedula || !password) {
      console.log('❌ [login] Error: Faltan campos requeridos');
      return NextResponse.json(
        { message: 'Cédula y contraseña son requeridas' },
        { status: 400 }
      );
    }

    console.log('🔧 [login] Verificando configuración...');
    console.log(`📊 [login] Base ID: ${AIRTABLE_BASE_ID}`);
    console.log(`📋 [login] Table: ${AIRTABLE_TABLE_NAME}`);
    console.log(`🔑 [login] Token existe: ${AIRTABLE_TOKEN ? 'Sí' : 'No'}`);

    // Buscar usuario en Airtable por cédula
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?filterByFormula={Cedula}="${cedula}"`;
    console.log(`🌐 [login] URL de Airtable: ${airtableUrl}`);

    console.log('🚀 [login] Realizando petición a Airtable...');
    const response = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [login] Respuesta de Airtable - Status: ${response.status}`);

    console.log(`📡 [login] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      console.error(`💥 [login] Airtable API error: ${response.status} ${response.statusText}`);
      try {
        const errorText = await response.text();
        console.error(`💥 [login] Error body: ${errorText}`);
      } catch (e) {
        console.error(`💥 [login] No se pudo leer el error body`);
      }
      return NextResponse.json(
        { message: 'Error al conectar con la base de datos' },
        { status: 500 }
      );
    }

    console.log('📊 [login] Parseando respuesta de Airtable...');
    const data = await response.json();
    console.log(`📊 [login] Datos recibidos:`, JSON.stringify(data, null, 2));

    if (data.records && data.records.length > 0) {
      console.log(`✅ [login] Usuario encontrado`);
      const userRecord = data.records[0];
      const userData = userRecord.fields;

      // Verificar contraseña usando bcrypt
      const storedHash = userData.Hash;
      const storedSalt = userData.Salt;
      console.log(`🔐 [login] Hash almacenado existe: ${storedHash ? 'Sí' : 'No'}`);
      console.log(`🧂 [login] Salt almacenado existe: ${storedSalt ? 'Sí' : 'No'}`);
      
      if (!storedHash) {
        console.log('❌ [login] El usuario no tiene contraseña establecida');
        return NextResponse.json({
          success: false,
          message: 'El usuario no tiene contraseña establecida'
        }, { status: 400 });
      }

      // Comparar contraseña usando bcrypt
      console.log('🔍 [login] Comparando contraseña con bcrypt...');
      const passwordMatch = await bcrypt.compare(password, storedHash);
      console.log(`🔍 [login] Contraseñas coinciden: ${passwordMatch}`);
      
      if (passwordMatch) {
        const result = {
          success: true,
          user: {
            id: userRecord.id,
            Cedula: userData.Cedula,
            Nombre: userData.Nombre,
            Cargo: userData.Cargo,
          }
        };
        console.log(`✅ [login] Login exitoso:`, JSON.stringify(result, null, 2));
        return NextResponse.json(result);
      } else {
        console.log('❌ [login] Contraseña incorrecta');
        return NextResponse.json({
          success: false,
          message: 'Contraseña incorrecta'
        }, { status: 401 });
      }
    } else {
      console.log(`❌ [login] Usuario no encontrado para cédula: ${cedula}`);
      return NextResponse.json({
        success: false,
        message: 'Usuario no encontrado'
      }, { status: 404 });
    }

  } catch (error) {
    console.error('💥 [login] Error general:', error);
    console.error('💥 [login] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

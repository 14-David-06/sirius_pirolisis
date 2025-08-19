import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');

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
  console.log('🔧 [set-password] Iniciando configuración de contraseña');
  
  try {
    console.log('📥 [set-password] Parseando request body...');
    const { cedula, password } = await request.json();
    console.log(`📋 [set-password] Cédula recibida: ${cedula}`);
    console.log(`🔑 [set-password] Password recibida: ${password ? '[PRESENTE]' : '[AUSENTE]'}`);

    if (!cedula || !password) {
      console.log('❌ [set-password] Error: Faltan campos requeridos');
      return NextResponse.json(
        { message: 'Cédula y contraseña son requeridas' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      console.log('❌ [set-password] Error: Contraseña muy corta');
      return NextResponse.json(
        { message: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      );
    }

    console.log('🔧 [set-password] Verificando configuración...');
    console.log(`📊 [set-password] Base ID: ${AIRTABLE_BASE_ID}`);
    console.log(`📋 [set-password] Table: ${AIRTABLE_TABLE_NAME}`);
    console.log(`🔑 [set-password] Token existe: ${AIRTABLE_TOKEN ? 'Sí' : 'No'}`);

    // Buscar usuario en Airtable por cédula
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}?filterByFormula={Cedula}="${cedula}"`;
    console.log(`🌐 [set-password] URL de búsqueda: ${airtableUrl}`);

    console.log('🚀 [set-password] Buscando usuario en Airtable...');
    const response = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`📡 [set-password] Respuesta de búsqueda - Status: ${response.status}`);

    console.log(`📡 [set-password] Respuesta de búsqueda - Status: ${response.status}`);

    if (!response.ok) {
      console.error(`💥 [set-password] Error en búsqueda: ${response.status} ${response.statusText}`);
      try {
        const errorText = await response.text();
        console.error(`💥 [set-password] Error body: ${errorText}`);
      } catch (e) {
        console.error(`💥 [set-password] No se pudo leer el error body`);
      }
      return NextResponse.json(
        { message: 'Error al conectar con la base de datos' },
        { status: 500 }
      );
    }

    console.log('📊 [set-password] Parseando respuesta de búsqueda...');
    const data = await response.json();
    console.log(`📊 [set-password] Datos de búsqueda:`, JSON.stringify(data, null, 2));

    if (data.records && data.records.length > 0) {
      console.log(`✅ [set-password] Usuario encontrado`);
      const userRecord = data.records[0];
      const userData = userRecord.fields;
      console.log(`👤 [set-password] ID del usuario: ${userRecord.id}`);

      // Generar salt y hash de la contraseña
      console.log('🔐 [set-password] Generando salt...');
      const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
      console.log(`🧂 [set-password] Salt generado: ${salt.substring(0, 15)}...`);

      console.log('🔐 [set-password] Generando hash de la contraseña...');
      const hashedPassword = await bcrypt.hash(password, salt);
      console.log(`🔒 [set-password] Hash generado: ${hashedPassword.substring(0, 20)}...`);

      // Actualizar la contraseña en Airtable
      const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}/${userRecord.id}`;
      console.log(`🌐 [set-password] URL de actualización: ${updateUrl}`);

      const updatePayload = {
        fields: {
          Hash: hashedPassword, // Hash seguro de la contraseña
          Salt: salt // Salt utilizado para el hash
        }
      };
      console.log(`📦 [set-password] Payload de actualización:`, {
        fields: {
          Hash: `${hashedPassword.substring(0, 20)}...`,
          Salt: `${salt.substring(0, 20)}...`
        }
      });

      console.log('🚀 [set-password] Actualizando contraseña en Airtable...');
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload)
      });

      console.log(`📡 [set-password] Respuesta de actualización - Status: ${updateResponse.status}`);

      if (!updateResponse.ok) {
        console.error(`💥 [set-password] Error actualizando: ${updateResponse.status} ${updateResponse.statusText}`);
        try {
          const errorText = await updateResponse.text();
          console.error(`💥 [set-password] Error body: ${errorText}`);
        } catch (e) {
          console.error(`💥 [set-password] No se pudo leer el error body`);
        }
        return NextResponse.json(
          { message: 'Error al actualizar la contraseña' },
          { status: 500 }
        );
      }

      console.log('📊 [set-password] Parseando respuesta de actualización...');
      const updatedData = await updateResponse.json();
      console.log(`📊 [set-password] Datos actualizados:`, JSON.stringify(updatedData, null, 2));

      const result = {
        success: true,
        message: 'Contraseña establecida correctamente',
        user: {
          id: userRecord.id,
          Cedula: userData.Cedula,
          Nombre: userData.Nombre,
          Cargo: userData.Cargo,
        }
      };

      console.log(`✅ [set-password] Proceso completado exitosamente:`, JSON.stringify(result, null, 2));
      return NextResponse.json(result);
    } else {
      console.log(`❌ [set-password] Usuario no encontrado para cédula: ${cedula}`);
      return NextResponse.json({
        success: false,
        message: 'Usuario no encontrado'
      }, { status: 404 });
    }

  } catch (error) {
    console.error('💥 [set-password] Error general:', error);
    console.error('💥 [set-password] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

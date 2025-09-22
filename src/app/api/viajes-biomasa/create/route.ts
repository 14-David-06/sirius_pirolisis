import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { z } from 'zod';
import { getS3Client, awsServerConfig } from '../../../../lib/aws-config.server';
import { PutObjectCommand } from '@aws-sdk/client-s3';

// Usar el nombre de la tabla en lugar del ID
const TABLE_NAME = process.env.AIRTABLE_VIAJES_BIOMASA_TABLE || 'Viajes Biomasa';
const RUTAS_TABLE_NAME = process.env.AIRTABLE_RUTAS_BIOMASA_TABLE || 'Rutas Biomasa';

// Esquema de validación
const viajeSchema = z.object({
  'Nombre Quien Entrega': z.string().min(1, 'Nombre requerido'),
  'Tipo Biomasa': z.string().optional(),
  'Peso entregado de masa fresca': z.number().positive('Peso debe ser mayor a 0'),
  'Tipo Combustible': z.string().optional(),
  'Tipo Vehículo': z.string().min(1, 'Tipo de vehículo requerido'),
  'Realiza Registro': z.string().min(1, 'Realiza registro requerido'),
  'ID_Turno': z.array(z.string()).min(1, 'Turno requerido'),
  'ID_Ruta': z.string().optional(),
  'Nueva Ruta Nombre': z.string().optional(),
  'Nueva Ruta Distancia Metros': z.string().optional(),
});

// Función para subir archivo a S3
async function uploadFileToS3(file: File, rutaNombre: string, tipoArchivo: string): Promise<string> {
  const s3Client = getS3Client();
  
  // Generar nombre único para el archivo
  const timestamp = Date.now();
  const extension = file.name.split('.').pop() || 'bin';
  const fileName = `${rutaNombre}_${tipoArchivo}_${timestamp}.${extension}`;
  const key = `${awsServerConfig.routesPrefix}${fileName}`;
  
  // Convertir File a Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  const command = new PutObjectCommand({
    Bucket: awsServerConfig.bucketName,
    Key: key,
    Body: buffer,
    ContentType: file.type || 'application/octet-stream',
  });
  
  await s3Client.send(command);
  
  // Retornar la URL del archivo
  return `https://${awsServerConfig.bucketName}.s3.${awsServerConfig.region}.amazonaws.com/${key}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!TABLE_NAME) {
      return NextResponse.json({ 
        error: 'Nombre de tabla de Viajes de Biomasa no configurado' 
      }, { status: 500 });
    }

    const formData = await req.formData();

    console.log('📝 Datos recibidos para crear registro:', Object.fromEntries(formData));

    const body = Object.fromEntries(formData);

    // Preparar datos para validación
    const validationData = {
      'Nombre Quien Entrega': body['Nombre Quien Entrega'],
      'Tipo Biomasa': body['Tipo Biomasa'],
      'Peso entregado de masa fresca': parseFloat(body['Peso entregado de masa fresca'] as string),
      'Tipo Combustible': body['Tipo Combustible'],
      'Tipo Vehículo': body['Tipo Vehículo'],
      'Realiza Registro': body['Realiza Registro'],
      'ID_Turno': body['ID_Turno'] ? JSON.parse(body['ID_Turno'] as string) : undefined,
      'ID_Ruta': body['ID_Ruta'] as string || undefined,
      'Nueva Ruta Nombre': body['Nueva Ruta Nombre'] as string || undefined,
      'Nueva Ruta Distancia Metros': body['Nueva Ruta Distancia Metros'] as string || undefined,
    };

    // Validar datos
    const validationResult = viajeSchema.safeParse(validationData);
    if (!validationResult.success) {
      console.error('❌ Errores de validación:', validationResult.error.errors);
      return NextResponse.json({ 
        error: 'Datos inválidos', 
        details: validationResult.error.errors 
      }, { status: 400 });
    }

    // Validaciones adicionales para nueva ruta
    if (validationData['Nueva Ruta Nombre']) {
      const distancia = parseFloat(validationData['Nueva Ruta Distancia Metros'] || '0');
      if (distancia <= 0) {
        return NextResponse.json({ error: 'Distancia de nueva ruta debe ser mayor a 0' }, { status: 400 });
      }
    }

    let idRuta = body['ID_Ruta'] as string || null;
    let nombreRuta = '';

    // Si hay ID_Ruta, obtener el nombre de la ruta y subir archivos a S3
    if (idRuta) {
      console.log('📍 Obteniendo nombre de ruta existente y subiendo archivos');
      const rutaRes = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${encodeURIComponent(RUTAS_TABLE_NAME)}/${idRuta}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
        },
      });
      const rutaJson = await rutaRes.json();
      if (rutaRes.ok) {
        nombreRuta = rutaJson.fields?.['Ruta'] || 'Ruta sin nombre';
        console.log('✅ Nombre de ruta obtenido:', nombreRuta);
        
        // Subir archivos de la ruta a S3 si existen
        const archivoCoordenadas = rutaJson.fields?.['Archivo Coordenadas'];
        const imagenRuta = rutaJson.fields?.['Imagen Ruta'];
        
        if (archivoCoordenadas && archivoCoordenadas.length > 0) {
          try {
            const url = archivoCoordenadas[0].url;
            const response = await fetch(url);
            const buffer = Buffer.from(await response.arrayBuffer());
            const fileName = `${nombreRuta}_coordenadas_${Date.now()}.${url.split('.').pop() || 'bin'}`;
            const key = `${awsServerConfig.routesPrefix}${fileName}`;
            
            const command = new PutObjectCommand({
              Bucket: awsServerConfig.bucketName,
              Key: key,
              Body: buffer,
              ContentType: response.headers.get('content-type') || 'application/octet-stream',
            });
            
            await getS3Client().send(command);
            console.log('✅ Archivo coordenadas subido a S3:', `https://${awsServerConfig.bucketName}.s3.${awsServerConfig.region}.amazonaws.com/${key}`);
          } catch (error) {
            console.error('Error subiendo coordenadas de ruta existente:', error);
          }
        }
        
        if (imagenRuta && imagenRuta.length > 0) {
          try {
            const url = imagenRuta[0].url;
            const response = await fetch(url);
            const buffer = Buffer.from(await response.arrayBuffer());
            const fileName = `${nombreRuta}_imagen_${Date.now()}.${url.split('.').pop() || 'bin'}`;
            const key = `${awsServerConfig.routesPrefix}${fileName}`;
            
            const command = new PutObjectCommand({
              Bucket: awsServerConfig.bucketName,
              Key: key,
              Body: buffer,
              ContentType: response.headers.get('content-type') || 'application/octet-stream',
            });
            
            await getS3Client().send(command);
            console.log('✅ Imagen de ruta subida a S3:', `https://${awsServerConfig.bucketName}.s3.${awsServerConfig.region}.amazonaws.com/${key}`);
          } catch (error) {
            console.error('Error subiendo imagen de ruta existente:', error);
          }
        }
      } else {
        console.error('Error obteniendo ruta:', rutaJson);
        nombreRuta = 'Ruta sin nombre';
      }
    }

    // Si hay nueva ruta, crearla primero
    if (body['Nueva Ruta Nombre']) {
      console.log('📍 Creando nueva ruta');
      nombreRuta = body['Nueva Ruta Nombre'] as string;
      
      const nuevaRutaFields: any = {
        'Ruta': nombreRuta,
        'Distancia Metros': parseFloat(body['Nueva Ruta Distancia Metros'] as string)
      };

      // Subir archivos si existen
      const coordenadasFile = formData.get('nuevaRutaCoordenadas') as File | null;
      const imagenFile = formData.get('nuevaRutaImagen') as File | null;

      if (coordenadasFile) {
        try {
          const coordenadasUrl = await uploadFileToS3(coordenadasFile, nombreRuta, 'coordenadas');
          nuevaRutaFields['Archivo Coordenadas'] = [{ url: coordenadasUrl }];
          console.log('✅ Coordenadas subidas:', coordenadasUrl);
        } catch (error) {
          console.error('Error subiendo coordenadas:', error);
        }
      }

      if (imagenFile) {
        try {
          const imagenUrl = await uploadFileToS3(imagenFile, nombreRuta, 'imagen');
          nuevaRutaFields['Imagen Ruta'] = [{ url: imagenUrl }];
          console.log('✅ Imagen subida:', imagenUrl);
        } catch (error) {
          console.error('Error subiendo imagen:', error);
        }
      }

      const rutasRes = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${encodeURIComponent(RUTAS_TABLE_NAME)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: [{ fields: nuevaRutaFields }] }),
      });

      const rutasJson = await rutasRes.json();
      if (!rutasRes.ok) {
        return NextResponse.json({ error: `Error creando ruta: ${rutasJson?.error || 'Error de Airtable'}`, details: rutasJson }, { status: rutasRes.status });
      }

      idRuta = rutasJson.records[0].id;
      console.log('✅ Nueva ruta creada con ID:', idRuta);
    }

    const fields: any = {
      'Nombre Quien Entrega': body['Nombre Quien Entrega'],
      'Tipo Biomasa': body['Tipo Biomasa'],
      'Peso entregado de masa fresca': parseFloat(body['Peso entregado de masa fresca'] as string),
      'Tipo Combustible': body['Tipo Combustible'],
      'Tipo Vehículo': body['Tipo Vehículo'],
      'Realiza Registro': body['Realiza Registro'],
      'ID_Turno': body['ID_Turno'] ? JSON.parse(body['ID_Turno'] as string) : [],
    };

    // Agregar Ruta Biomasa si existe
    if (idRuta) {
      fields['Ruta Biomasa'] = [idRuta];
    }

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
      console.error('❌ Error de Airtable:', json);
      return NextResponse.json({ error: json?.error || 'Error de Airtable', details: json }, { status: res.status });
    }

    return NextResponse.json(json, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}

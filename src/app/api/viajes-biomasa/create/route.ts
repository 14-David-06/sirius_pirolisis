import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import { z } from 'zod';

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

    // Si hay nueva ruta, crearla primero
    if (body['Nueva Ruta Nombre']) {
      console.log('📍 Creando nueva ruta');
      
      const nuevaRutaFields: any = {
        'Ruta': body['Nueva Ruta Nombre'],
        'Distancia Metros': parseFloat(body['Nueva Ruta Distancia Metros'] as string)
      };

      // Subir archivos si existen
      const coordenadasFile = formData.get('nuevaRutaCoordenadas') as File | null;
      const imagenFile = formData.get('nuevaRutaImagen') as File | null;

      if (coordenadasFile) {
        // Subir coordenadas a S3
        const coordenadasFormData = new FormData();
        coordenadasFormData.append('file', coordenadasFile);
        const s3ResCoordenadas = await fetch(`${req.nextUrl.origin}/api/s3/upload`, {
          method: 'POST',
          body: coordenadasFormData,
        });
        const s3DataCoordenadas = await s3ResCoordenadas.json();
        if (s3ResCoordenadas.ok) {
          nuevaRutaFields['Archivo Coordenadas'] = [{ url: s3DataCoordenadas.url }];
        } else {
          console.error('Error subiendo coordenadas:', s3DataCoordenadas);
        }
      }

      if (imagenFile) {
        // Subir imagen a S3
        const imagenFormData = new FormData();
        imagenFormData.append('file', imagenFile);
        const s3ResImagen = await fetch(`${req.nextUrl.origin}/api/s3/upload`, {
          method: 'POST',
          body: imagenFormData,
        });
        const s3DataImagen = await s3ResImagen.json();
        if (s3ResImagen.ok) {
          nuevaRutaFields['Imagen Ruta'] = [{ url: s3DataImagen.url }];
        } else {
          console.error('Error subiendo imagen:', s3DataImagen);
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

    let fields: any = {
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

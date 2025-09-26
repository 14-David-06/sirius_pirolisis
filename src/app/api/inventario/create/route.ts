import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el ID de la tabla de Inventario Pirolisis desde variables de entorno
const TABLE_ID = config.airtable.inventarioTableId;

// ✅ BUENA PRÁCTICA: Los field IDs se obtienen de variables de entorno
// Los valores reales se configuran en .env.local para evitar hardcodear
// IDs sensibles en el código fuente, facilitando el mantenimiento

export async function POST(request: Request) {
  // Verificar si la variable de entorno está configurada
  if (!TABLE_ID) {
    console.warn('⚠️ AIRTABLE_INVENTARIO_TABLE_ID no está configurado en .env.local');
    return NextResponse.json({
      error: 'AIRTABLE_INVENTARIO_TABLE_ID no está configurado. Revisa tu archivo .env.local',
      details: 'Para activar el módulo de inventario, configura AIRTABLE_INVENTARIO_TABLE_ID en .env.local'
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        error: 'Configuración de Airtable incompleta',
        details: 'Faltan AIRTABLE_TOKEN o AIRTABLE_BASE_ID'
      }, { status: 500 });
    }

    // Validar que los field IDs requeridos estén configurados
    // Por ahora usamos nombres de campos, no field IDs
    // if (!config.airtable.inventarioFields.insumo || !config.airtable.inventarioFields.categoria) {
    //   return NextResponse.json({
    //     error: 'Configuración de field IDs incompleta',
    //     details: 'Faltan field IDs requeridos para inventario. Revisa AIRTABLE_INVENTARIO_*_FIELD_ID en .env.local'
    //   }, { status: 500 });
    // }

    const body = await request.json();
    console.log('📥 Datos recibidos en API:', body);
    const { 'Nombre del Insumo': nombreInsumo, 'Categoría': categoria, 'Realiza Registro': realizaRegistro, 'Presentación': presentacion, 'Cantidad Presentacion Insumo': cantidadPresentacion, 'Ficha Seguridad URL': fichaSeguridadUrl, 'Ficha Seguridad S3 Path': fichaSeguridadS3Path } = body;

    // Validar campos requeridos
    if (!nombreInsumo || !categoria) {
      return NextResponse.json({
        error: 'Campos requeridos faltantes',
        details: 'Se requieren: Nombre del Insumo y Categoría'
      }, { status: 400 });
    }

    // Preparar los campos para Airtable usando nombres de campos (por simplicidad)
    const fields: any = {};
    fields['Insumo'] = nombreInsumo;
    fields['Categoría'] = categoria;

    if (realizaRegistro) {
      fields['Realiza Registro'] = realizaRegistro;
    }
    
    if (presentacion) {
      fields['Presentacion Insumo'] = presentacion;
    }
    
    if (cantidadPresentacion !== undefined && cantidadPresentacion !== '') {
      fields['Cantidad Presentacion Insumo'] = parseFloat(cantidadPresentacion) || 0;
    }

    // Ficha de seguridad (solo para químicos)
    if (fichaSeguridadUrl && categoria === 'Químicos') {
      // Extraer el nombre del archivo del S3 path (última parte después del último '/')
      const fileName = fichaSeguridadS3Path ? fichaSeguridadS3Path.split('/').pop() : `ficha-seguridad-${nombreInsumo.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      fields['Ficha Seguridad'] = [
        {
          url: fichaSeguridadUrl,
          filename: fileName
        }
      ];
    }

    console.log('📤 Campos a enviar a Airtable:', fields);
    console.log('🔗 Field IDs usados:', {
      insumo: config.airtable.inventarioFields.insumo,
      categoria: config.airtable.inventarioFields.categoria,
      fichaSeguridad: config.airtable.inventarioFields.fichaSeguridad
    });

    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields
        }]
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Airtable al crear:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error('❌ Error en API crear inventario:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
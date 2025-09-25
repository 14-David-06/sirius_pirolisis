import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el ID de la tabla de Salidas de Insumos desde variables de entorno
// Si no está configurado, usar el nombre de la tabla
const SALIDAS_TABLE_ID = config.airtable.salidasTableId || 'Salida Insumos Pirolisis';

export async function POST(request: Request) {
  // Verificar si la variable de entorno está configurada
  if (!config.airtable.inventarioTableId) {
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

    const body = await request.json();
    console.log('📥 Datos recibidos en API remove-quantity:', body);
    const { itemId, cantidad, tipoSalida, observaciones, documentoSoporteUrl, 'Realiza Registro': realizaRegistro } = body;

    // Validar campos requeridos
    if (!itemId || !cantidad || !tipoSalida) {
      return NextResponse.json({
        error: 'Campos requeridos faltantes',
        details: 'Se requieren: itemId, cantidad y tipoSalida'
      }, { status: 400 });
    }

    const cantidadNumerica = parseFloat(cantidad);
    if (isNaN(cantidadNumerica) || cantidadNumerica <= 0) {
      return NextResponse.json({
        error: 'Cantidad inválida',
        details: 'La cantidad debe ser un número positivo'
      }, { status: 400 });
    }

    // Validar tipo de salida
    const tiposValidos = ['Consumo en Proceso', 'Devolución a Proveedor', 'Ajuste', 'Traslado a Otro Almacén', 'Otro'];
    if (!tiposValidos.includes(tipoSalida)) {
      return NextResponse.json({
        error: 'Tipo de salida inválido',
        details: `El tipo de salida debe ser uno de: ${tiposValidos.join(', ')}`
      }, { status: 400 });
    }

    // Obtener el turno actual abierto
    console.log('🔍 Obteniendo turno actual abierto...');
    const turnoResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/turno/check?userId=any`, {
      method: 'GET',
    });

    let turnoActual = null;
    if (turnoResponse.ok) {
      const turnoData = await turnoResponse.json();
      if (turnoData.hasTurnoAbierto && turnoData.turnoAbierto) {
        turnoActual = turnoData.turnoAbierto;
        console.log('⚠️ Turno abierto encontrado:', turnoActual.id);
      } else {
        console.log('ℹ️ No hay turno abierto actualmente');
      }
    } else {
      console.log('⚠️ No se pudo obtener información del turno');
    }

    // Obtener información del item para la presentación
    console.log('🔍 Obteniendo información del item...');
    const itemResponse = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.inventarioTableId}/${itemId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
      },
    });

    let presentacionInsumo = '';
    if (itemResponse.ok) {
      const itemData = await itemResponse.json();
      presentacionInsumo = itemData.fields['Presentacion Insumo'] || itemData.fields['Presentación'] || 'Unidades';
      console.log('📦 Presentación del insumo:', presentacionInsumo);
    } else {
      console.log('⚠️ No se pudo obtener información del item, usando "Unidades" por defecto');
      presentacionInsumo = 'Unidades';
    }

    // Preparar los campos para crear el registro de salida
    const fields: any = {};
    fields[config.airtable.salidasFields.cantidadSale || 'Cantidad Sale'] = cantidadNumerica;
    fields[config.airtable.salidasFields.presentacionInsumo || 'Presentacion Insumo'] = presentacionInsumo;
    fields[config.airtable.salidasFields.tipoSalida || 'Tipo de Salida'] = tipoSalida;

    if (realizaRegistro) {
      fields[config.airtable.salidasFields.realizaRegistro || 'Realiza Registro'] = realizaRegistro;
    }

    if (observaciones && observaciones.trim()) {
      fields[config.airtable.salidasFields.observaciones || 'Observaciones'] = observaciones.trim();
    }

    // Link al item del inventario
    fields[config.airtable.salidasFields.inventarioInsumos || 'Inventario Insumos Pirolisis'] = [itemId];

    // Link al turno actual si existe
    if (turnoActual) {
      fields[config.airtable.salidasFields.turnoPirolisis || 'Turno Pirolisis'] = [turnoActual.id];
    }

    // Documento soporte si se proporciona
    if (documentoSoporteUrl) {
      fields[config.airtable.salidasFields.documentoSoporte || 'Documento Soporte'] = [
        {
          url: documentoSoporteUrl,
          filename: `documento-soporte-salida-${itemId}-${Date.now()}.pdf`
        }
      ];
    }

    console.log('📤 Campos a crear en tabla de salidas:', fields);
    console.log('🔗 Tabla de salidas:', SALIDAS_TABLE_ID);

    // Crear el registro de salida en Airtable
    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${SALIDAS_TABLE_ID}`, {
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
      console.error('❌ Error de Airtable al crear salida:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      message: `Salida registrada exitosamente. Cantidad: ${cantidadNumerica} ${presentacionInsumo}, Tipo: ${tipoSalida}`,
      data: data
    }, { status: 201 });

  } catch (err: any) {
    console.error('❌ Error en API remove-quantity:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
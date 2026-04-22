import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

// Usar el ID de la tabla de Entradas de Insumos desde variables de entorno
// Si no está configurado, usar el nombre de la tabla
const ENTRADAS_TABLE_ID = config.airtable.entradasTableId || 'Entrada Insumos Pirolisis';

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
    console.log('📥 Datos recibidos en API add-quantity:', body);
    const { itemId, cantidad, notas, 'Realiza Registro': realizaRegistro, tipo } = body;

    // Validar campos requeridos
    if (!itemId || !cantidad) {
      return NextResponse.json({
        error: 'Campos requeridos faltantes',
        details: 'Se requieren: itemId y cantidad'
      }, { status: 400 });
    }

    const cantidadNumerica = parseFloat(cantidad);
    if (isNaN(cantidadNumerica) || cantidadNumerica <= 0) {
      return NextResponse.json({
        error: 'Cantidad inválida',
        details: 'La cantidad debe ser un número positivo'
      }, { status: 400 });
    }

    // Obtener el turno actual abierto (sin filtrar por usuario específico).
    // Asociar el turno es OPCIONAL: si la consulta falla (p.ej. self-fetch en
    // producción), continuamos sin vincular el turno en lugar de romper la
    // operación completa.
    console.log('🔍 Obteniendo turno actual abierto...');
    let turnoActual: { id: string } | null = null;
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        new URL(request.url).origin ||
        'http://localhost:3000';
      const turnoResponse = await fetch(`${baseUrl}/api/turno/check?userId=any`, {
        method: 'GET',
      });

      if (turnoResponse.ok) {
        const turnoData = await turnoResponse.json();
        if (turnoData.hasTurnoAbierto && turnoData.turnoAbierto) {
          turnoActual = turnoData.turnoAbierto;
          console.log('⚠️ Turno abierto encontrado:', turnoActual?.id);
        } else {
          console.log('ℹ️ No hay turno abierto actualmente');
        }
      } else {
        console.log('⚠️ No se pudo obtener información del turno (status):', turnoResponse.status);
      }
    } catch (turnoErr) {
      console.warn('⚠️ Error consultando turno (no crítico, se continúa sin vinculación):', turnoErr);
    }

    // Preparar los campos para crear el registro de entrada
    const fields: any = {};
    fields[config.airtable.entradasFields.cantidadIngresa || 'Cantidad Ingresada'] = cantidadNumerica;

    if (realizaRegistro) {
      fields[config.airtable.entradasFields.realizaRegistro || 'Realiza Registro'] = realizaRegistro;
    }

    // Link al item del inventario
    fields[config.airtable.entradasFields.inventarioInsumos || 'Inventario Insumos Pirolisis'] = [itemId];

    // Link al turno actual si existe
    if (turnoActual) {
      fields[config.airtable.entradasFields.turnoPirolisis || 'Turno Pirolisis'] = [turnoActual.id];
    }

    console.log('📤 Campos a crear en tabla de entradas:', fields);
    console.log('🔗 Tabla de entradas:', ENTRADAS_TABLE_ID);

    // Crear el registro de entrada en Airtable
    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${ENTRADAS_TABLE_ID}`, {
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
      console.error('❌ Error de Airtable al crear entrada:', data);
      return NextResponse.json({ error: data?.error || 'Airtable error', details: data }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      message: `Entrada registrada exitosamente. Cantidad: ${cantidadNumerica}`,
      data: data
    }, { status: 201 });

  } catch (err: any) {
    console.error('❌ Error en API add-quantity:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}
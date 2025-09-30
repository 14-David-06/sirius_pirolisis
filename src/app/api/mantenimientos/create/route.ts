import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Datos recibidos en mantenimientos/create:', body);
    const {
      tipoMantenimiento,
      descripcion,
      prioridad,
      realizaRegistro,
      turnoId,
      equipoId, // Para compatibilidad hacia atrás
      equiposIds = [], // Nuevo campo para múltiples equipos
      insumosIds = [], // Para compatibilidad hacia atrás
      insumosUtilizados = [] // Nuevo campo con cantidades
    } = body;

    // Usar insumosUtilizados si está disponible, sino usar insumosIds para compatibilidad
    const insumosFinal = insumosUtilizados.length > 0 ? insumosUtilizados : insumosIds.map((id: string) => ({ id, cantidad: 1 }));

    // Si se envía equiposIds, usarlo; si no, usar equipoId para compatibilidad
    const equiposIdsFinal = equiposIds.length > 0 ? equiposIds : (equipoId ? [equipoId] : []);
    console.log('equiposIdsFinal:', equiposIdsFinal);

    const baseId = config.airtable.baseId;
    const tableId = config.airtable.mantenimientosTableId;
    const apiKey = config.airtable.token;

    if (!apiKey || !baseId || !tableId) {
      return NextResponse.json({
        error: 'Missing required environment variables'
      }, { status: 500 });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;

    // Preparar los campos base
    const baseFields: any = {
      'Tipo Mantenimiento': tipoMantenimiento,
      'Descripción': descripcion,
      'Prioridad': prioridad,
      'Realiza Registro': realizaRegistro,
    };

    console.log('Campos base del mantenimiento:', baseFields);
    console.log('Campo "Realiza Registro":', baseFields['Realiza Registro']);

    // Agregar links si existen
    if (turnoId) {
      baseFields['Turno Pirolisis'] = [turnoId];
    }

    if (insumosIds.length > 0) {
      baseFields['Insumos Utilizados'] = insumosIds;
    }

    // Crear registros para cada equipo
    let records;
    if (equiposIdsFinal.length === 1) {
      // Un solo registro para un equipo
      records = [{
        fields: {
          ...baseFields,
          'Equipo Pirolisis': equiposIdsFinal
        }
      }];
      console.log('Creando mantenimiento para 1 equipo:', {
        equipoId: equiposIdsFinal[0],
        fields: records[0].fields
      });
    } else {
      // Un solo registro para múltiples equipos (Mantenimiento a todos los equipos)
      records = [{
        fields: {
          ...baseFields,
          'Equipo Pirolisis': equiposIdsFinal
        }
      }];
      console.log('Creando mantenimiento para múltiples equipos:', {
        equiposIds: equiposIdsFinal,
        fields: records[0].fields
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: records
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Airtable API error:', response.status, errorText);
      return NextResponse.json({
        error: `Airtable API error: ${response.status}`,
        details: errorText
      }, { status: 500 });
    }

    const data = await response.json();
    console.log('Mantenimiento creado:', data);

    // Crear salidas de insumos si hay insumos utilizados
    if (insumosFinal.length > 0 && data.records && data.records.length > 0) {
      const mantenimientoId = data.records[0].id;
      console.log('Creando salidas para mantenimiento:', mantenimientoId);

      try {
        // Crear una salida para cada insumo utilizado
        for (const insumo of insumosFinal) {
          const salidaResponse = await fetch('http://localhost:3000/api/salidas/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              cantidadSale: insumo.cantidad,
              presentacionInsumo: 'Unidad', // Valor por defecto, podría mejorarse
              observaciones: `Utilizado en mantenimiento: ${descripcion}`,
              tipoSalida: 'Mantenimiento',
              realizaRegistro: realizaRegistro,
              inventarioInsumosId: insumo.id,
              turnoId: turnoId,
              mantenimientoId: mantenimientoId
            }),
          });

          if (!salidaResponse.ok) {
            const errorText = await salidaResponse.text();
            console.error('Error creando salida para insumo:', insumo.id, errorText);
            // No fallar el mantenimiento completo por error en una salida
          } else {
            const salidaData = await salidaResponse.json();
            console.log('Salida creada para insumo:', insumo.id, salidaData);
          }
        }
      } catch (error) {
        console.error('Error creando salidas de insumos:', error);
        // No fallar el mantenimiento completo por error en salidas
      }
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error creating mantenimiento:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
}

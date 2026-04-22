import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import {
  removeQuantitySchema,
  TIPO_USO_PRODUCTIVO,
  TIPO_USO_VALUES,
  type TipoUso,
} from '../../../../domain/entities/Inventario';

// Usar el ID de la tabla de Salidas de Insumos desde variables de entorno
// Si no está configurado, usar el nombre de la tabla
const SALIDAS_TABLE_ID = config.airtable.salidasTableId || 'Salida Insumos Pirolisis';

export async function POST(request: Request) {
  // Verificar si la variable de entorno está configurada
  if (!config.airtable.inventarioTableId) {
    console.warn('⚠️ AIRTABLE_INVENTARIO_TABLE_ID no está configurado en .env.local');
    return NextResponse.json({
      success: false,
      error: 'AIRTABLE_INVENTARIO_TABLE_ID no está configurado. Revisa tu archivo .env.local',
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de Airtable incompleta',
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('📥 Datos recibidos en API remove-quantity:', body);

    // Normalizar: aceptar tanto el formato nuevo (tipo_uso) como el legacy (tipoSalida)
    const normalizedBody = {
      itemId: body.itemId || body.insumo_id,
      cantidad: typeof body.cantidad === 'string' ? parseFloat(body.cantidad) : body.cantidad,
      tipo_uso: body.tipo_uso || mapLegacyTipoSalida(body.tipoSalida),
      balance_masa_id: body.balance_masa_id || null,
      observaciones: body.observaciones,
      documentoSoporteUrl: body.documentoSoporteUrl,
      'Realiza Registro': body['Realiza Registro'],
    };

    // Validar con Zod
    const validation = removeQuantitySchema.safeParse(normalizedBody);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Datos inválidos',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const validData = validation.data;
    const esProductivo = TIPO_USO_PRODUCTIVO[validData.tipo_uso];

    // Obtener el turno actual abierto (sin filtrar por usuario específico)
    console.log('🔍 Obteniendo turno actual abierto...');
    const requestOrigin = new URL(request.url).origin;
    const turnoCheckUrl = new URL('/api/turno/check', requestOrigin);
    turnoCheckUrl.searchParams.set('userId', 'any');

    let turnoActual = null;
    try {
      const turnoResponse = await fetch(turnoCheckUrl.toString(), {
        method: 'GET',
      });

      if (turnoResponse.ok) {
        const turnoData = await turnoResponse.json();
        if (turnoData.hasTurnoAbierto && turnoData.turnoAbierto) {
          turnoActual = turnoData.turnoAbierto;
          console.log('⚠️ Turno abierto encontrado:', turnoActual.id);
        } else {
          console.log('ℹ️ No hay turno abierto actualmente');
        }
      } else {
        const turnoErr = await turnoResponse.text();
        console.log('⚠️ No se pudo obtener información del turno:', turnoErr);
      }
    } catch (turnoFetchError) {
      // No bloquear salidas por un fallo en la consulta de turno.
      console.warn('⚠️ Error consultando turno actual (continuando sin turno):', turnoFetchError);
    }

    // Obtener información del item para la presentación y validación de stock
    console.log('🔍 Obteniendo información del item...');
    const itemResponse = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.inventarioTableId}/${validData.itemId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
      },
    });

    let presentacionInsumo = '';
    let stockDisponible = 0;
    if (itemResponse.ok) {
      const itemData = await itemResponse.json();
      presentacionInsumo = itemData.fields['Presentacion Insumo'] || itemData.fields['Presentación'] || 'Unidades';
      stockDisponible = itemData.fields['Total Cantidad Stock'] || 0;
      console.log('📦 Presentación del insumo:', presentacionInsumo);
      console.log('📦 Stock disponible:', stockDisponible);
    } else {
      console.log('⚠️ No se pudo obtener información del item, usando "Unidades" por defecto');
      presentacionInsumo = 'Unidades';
    }

    // Validar que la cantidad a remover no sea mayor al stock disponible
    if (validData.cantidad > stockDisponible) {
      return NextResponse.json({
        success: false,
        error: 'Cantidad insuficiente en stock',
        details: `No puedes remover ${validData.cantidad} unidades. Solo hay ${stockDisponible} unidades disponibles en stock.`,
      }, { status: 400 });
    }

    // Preparar los campos para crear el registro de salida
    const fields: Record<string, unknown> = {};
    fields[config.airtable.salidasFields.cantidadSale || 'Cantidad Sale'] = validData.cantidad;
    fields[config.airtable.salidasFields.presentacionInsumo || 'Presentacion Insumo'] = presentacionInsumo;

    // Tipo de uso (nuevo campo singleSelect)
    if (config.airtable.salidasFields.tipoUso) {
      fields[config.airtable.salidasFields.tipoUso] = validData.tipo_uso;
    }
    // Mantener compatibilidad con el campo Tipo de Salida existente
    fields[config.airtable.salidasFields.tipoSalida || 'Tipo de Salida'] = validData.tipo_uso;

    // Es Productivo (calculado automáticamente)
    if (config.airtable.salidasFields.esProductivo) {
      fields[config.airtable.salidasFields.esProductivo] = esProductivo;
    }

    if (validData['Realiza Registro']) {
      fields[config.airtable.salidasFields.realizaRegistro || 'Realiza Registro'] = validData['Realiza Registro'];
    }

    if (validData.observaciones && validData.observaciones.trim()) {
      fields[config.airtable.salidasFields.observaciones || 'Observaciones'] = validData.observaciones.trim();
    }

    // Link al item del inventario
    fields[config.airtable.salidasFields.inventarioInsumos || 'Inventario Insumos Pirolisis'] = [validData.itemId];

    // Link al turno actual si existe
    if (turnoActual) {
      fields[config.airtable.salidasFields.turnoPirolisis || 'Turno Pirolisis'] = [turnoActual.id];
    }

    // Link al balance de masa si se proporcionó y tipo_uso es balance_de_masa
    if (validData.balance_masa_id && validData.tipo_uso === 'balance_de_masa') {
      if (config.airtable.salidasFields.balanceMasaId) {
        fields[config.airtable.salidasFields.balanceMasaId] = [validData.balance_masa_id];
      } else {
        fields['Balance Masa'] = [validData.balance_masa_id];
      }
    }

    // Documento soporte si se proporciona
    if (validData.documentoSoporteUrl) {
      fields[config.airtable.salidasFields.documentoSoporte || 'Documento Soporte'] = [
        {
          url: validData.documentoSoporteUrl,
          filename: `documento-soporte-salida-${validData.itemId}-${Date.now()}.pdf`,
        },
      ];
    }

    console.log('📤 Campos a crear en tabla de salidas:', fields);
    console.log('🔗 Tabla de salidas:', SALIDAS_TABLE_ID);
    console.log('📊 Es productivo:', esProductivo);

    // Crear el registro de salida en Airtable
    const response = await fetch(`https://api.airtable.com/v0/${config.airtable.baseId}/${SALIDAS_TABLE_ID}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields,
        }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Airtable al crear salida:', data);
      return NextResponse.json({
        success: false,
        error: data?.error?.message || 'Error de Airtable',
        details: data,
      }, { status: response.status });
    }

    const salidaRecordId = data.records?.[0]?.id || '';

    // --- Lógica de Paquete de Lonas ---
    // Cada salida de lonas para producción representa la entrada de un nuevo paquete físico:
    // se RETIRA automáticamente el paquete activo previo y se crea uno nuevo activo.
    // Esto evita depender de una acción manual en Airtable.
    let paqueteAnteriorId: string | null = null;
    let paqueteAnteriorDiasUso: number | null = null;
    let paqueteNuevoId: string | null = null;
    const LONAS_INSUMO_ID = process.env.AIRTABLE_LONA_INSUMO_ID;
    const PAQUETES_TABLE_ID = config.airtable.paquetesLonasTableId;

    if (
      LONAS_INSUMO_ID &&
      PAQUETES_TABLE_ID &&
      validData.itemId === LONAS_INSUMO_ID &&
      validData.tipo_uso === 'balance_de_masa'
    ) {
      try {
        // 1. Buscar paquete activo previo
        const paqUrl = new URL(`https://api.airtable.com/v0/${config.airtable.baseId}/${PAQUETES_TABLE_ID}`);
        paqUrl.searchParams.set('filterByFormula', `{Estado} = 'activo'`);
        paqUrl.searchParams.set('maxRecords', '1');

        const paqRes = await fetch(paqUrl.toString(), {
          headers: { 'Authorization': `Bearer ${config.airtable.token}` },
        });
        const paqData = await paqRes.json();
        const paqueteActivo = paqData.records?.[0];

        // 2. Retirar paquete previo (si existe)
        if (paqueteActivo) {
          paqueteAnteriorId = paqueteActivo.id;
          const fechaActivacion = new Date(paqueteActivo.fields['Fecha Activacion']);
          paqueteAnteriorDiasUso = Math.floor(
            (Date.now() - fechaActivacion.getTime()) / (1000 * 60 * 60 * 24)
          );

          const retirarRes = await fetch(
            `https://api.airtable.com/v0/${config.airtable.baseId}/${PAQUETES_TABLE_ID}/${paqueteActivo.id}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${config.airtable.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: { 'Estado': 'retirado' },
              }),
            }
          );
          if (retirarRes.ok) {
            console.log(
              `✅ Paquete anterior ${paqueteActivo.id} retirado tras ${paqueteAnteriorDiasUso} días de uso`
            );
          } else {
            console.warn('⚠️ Error retirando paquete anterior:', await retirarRes.text());
          }
        }

        // 3. Crear nuevo paquete activo
        const hoy = new Date().toISOString().split('T')[0];
        const nuevoRes = await fetch(
          `https://api.airtable.com/v0/${config.airtable.baseId}/${PAQUETES_TABLE_ID}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.airtable.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              records: [{
                fields: {
                  'Fecha Activacion': hoy,
                  'Cantidad Lonas': validData.cantidad,
                  'Estado': 'activo',
                  'ID Salida Origen': salidaRecordId,
                  'Realiza Registro': validData['Realiza Registro'] || '',
                },
              }],
            }),
          }
        );
        if (nuevoRes.ok) {
          const nuevoData = await nuevoRes.json();
          paqueteNuevoId = nuevoData.records?.[0]?.id || null;
          console.log(`✅ Nuevo paquete de lonas creado: ${paqueteNuevoId}`);
        } else {
          console.warn('⚠️ Error creando paquete de lonas (no crítico):', await nuevoRes.text());
        }
      } catch (lonaErr) {
        console.warn('⚠️ Error en lógica de paquete de lonas (no crítico):', lonaErr);
      }
    }

    const responsePayload: Record<string, unknown> = {
      success: true,
      data: data,
      message: `Salida registrada exitosamente. Cantidad: ${validData.cantidad} ${presentacionInsumo}, Tipo: ${validData.tipo_uso}, Productivo: ${esProductivo}`,
    };

    if (paqueteNuevoId || paqueteAnteriorId) {
      responsePayload.paquete_lonas = {
        nuevo_id: paqueteNuevoId,
        anterior_id: paqueteAnteriorId,
        anterior_dias_uso: paqueteAnteriorDiasUso,
      };
    }

    return NextResponse.json(responsePayload, { status: 201 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API remove-quantity:', message);
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 });
  }
}

/**
 * Mapea los valores legacy de Tipo de Salida al nuevo ENUM tipo_uso.
 * Permite retrocompatibilidad con llamadas existentes.
 */
function mapLegacyTipoSalida(legacyValue?: string): TipoUso | undefined {
  if (!legacyValue) return undefined;
  const mapping: Record<string, TipoUso> = {
    'Consumo en Proceso': 'balance_de_masa',
    'Devolución a Proveedor': 'ajuste_inventario',
    'Ajuste': 'ajuste_inventario',
    'Traslado a Otro Almacén': 'ajuste_inventario',
    'Mantenimiento': 'limpieza_mantenimiento',
    'Otro': 'otro',
  };
  return mapping[legacyValue] || 'otro';
}
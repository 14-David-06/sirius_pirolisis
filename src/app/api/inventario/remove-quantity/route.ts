import { NextResponse } from 'next/server';
import { config } from '../../../../lib/config';
import {
  removeQuantitySchema,
  TIPO_USO_PRODUCTIVO,
  type TipoUso,
} from '../../../../domain/entities/Inventario';
import {
  appendMovimientoToStock,
  findStockByInsumo,
  getStockActual,
} from '../../../../lib/stock-insumos';

/**
 * POST /api/inventario/remove-quantity
 *
 * Registra una salida de insumo en Sirius Insumos Core.
 *
 * MIGRADO (2026-07-27): Antes creaba en Salida Insumos Pirolisis (local).
 * Ahora crea Movimiento Insumos (tipo="Salida") y actualiza Stock Insumos del Core.
 *
 * Body esperado:
 * - itemId (string, requerido): record ID del insumo en Sirius Insumos Core
 * - cantidad (number, requerido): cantidad a retirar
 * - tipo_uso (string, requerido): uno de los valores de TIPO_USO_VALUES
 * - observaciones (string, opcional)
 * - documentoSoporteUrl (string, opcional)
 * - Realiza Registro (string, opcional)
 * - balance_masa_id (string, opcional): DEPRECATED - se guarda en Notas
 * - mantenimiento_id (string, opcional): DEPRECATED - se guarda en Notas
 */
export async function POST(request: Request) {
  // Validar configuración
  if (!config.airtable.insumosCoreBaseId || !config.airtable.movimientosInsumosTableId) {
    console.warn('⚠️ Configuración de Sirius Insumos Core incompleta');
    return NextResponse.json({
      success: false,
      error: 'Configuración de Sirius Insumos Core incompleta',
    }, { status: 400 });
  }

  try {
    const token = config.airtable.insumosCoreToken;
    const coreBaseId = config.airtable.insumosCoreBaseId;
    const movimientosTableId = config.airtable.movimientosInsumosTableId;
    const pirolisisAreaCode = config.airtable.pirolisisAreaCode;
    const movFields = config.airtable.movimientoFields;

    if (!token) {
      return NextResponse.json({
        success: false,
        error: 'Token de Airtable no configurado',
      }, { status: 500 });
    }

    const body = await request.json();
    console.log('📥 Datos recibidos en API remove-quantity:', body);

    // Normalizar formato
    const normalizedBody = {
      itemId: body.itemId || body.insumo_id,
      cantidad: typeof body.cantidad === 'string' ? parseFloat(body.cantidad) : body.cantidad,
      tipo_uso: body.tipo_uso || mapLegacyTipoSalida(body.tipoSalida),
      balance_masa_id: body.balance_masa_id || null,
      mantenimiento_id: body.mantenimiento_id || body.mantenimientoId || null,
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

    // ═══════════════════════════════════════════════════════════════════════════
    // OPCIONAL: Obtener turno actual abierto (para guardarlo en Notas)
    // ═══════════════════════════════════════════════════════════════════════════
    let turnoActual: { id: string } | null = null;
    try {
      const requestOrigin = new URL(request.url).origin;
      const turnoCheckUrl = new URL('/api/turno/check', requestOrigin);
      turnoCheckUrl.searchParams.set('userId', 'any');

      const turnoResponse = await fetch(turnoCheckUrl.toString(), {
        method: 'GET',
      });

      if (turnoResponse.ok) {
        const turnoData = await turnoResponse.json();
        if (turnoData.hasTurnoAbierto && turnoData.turnoAbierto) {
          turnoActual = turnoData.turnoAbierto;
          console.log('📋 Turno abierto encontrado:', turnoActual?.id);
        }
      }
    } catch (turnoErr) {
      console.warn('⚠️ Error consultando turno (no crítico):', turnoErr);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 1: Validar stock disponible en Stock Insumos
    // NOTA: No filtramos por área porque el campo "Area" no existe en Stock Insumos
    // NOTA 2: Insumo ID es multipleRecordLinks; el match se hace en JS sobre los
    //         record IDs (filterByFormula no puede comparar contra record IDs).
    //         Ver src/lib/stock-insumos.ts
    // ═══════════════════════════════════════════════════════════════════════════
    const { record: stockRecord } = await findStockByInsumo(validData.itemId);

    if (!stockRecord) {
      return NextResponse.json({
        success: false,
        error: 'No existe registro de stock para este insumo',
        details: `El insumo ${validData.itemId} no tiene stock en el área Pirólisis`,
      }, { status: 404 });
    }

    const stockDisponible = getStockActual(stockRecord);
    console.log('📦 Stock disponible:', stockDisponible);

    // Validar cantidad
    if (validData.cantidad > stockDisponible) {
      return NextResponse.json({
        success: false,
        error: 'Cantidad insuficiente en stock',
        details: `No puedes remover ${validData.cantidad} unidades. Solo hay ${stockDisponible} unidades disponibles en stock.`,
      }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 2: Crear movimiento de salida en Movimientos Insumos
    // ═══════════════════════════════════════════════════════════════════════════
    const movimientoFields: Record<string, any> = {};

    // Link al insumo
    if (movFields.insumo) {
      movimientoFields[movFields.insumo] = [validData.itemId];
    }

    // Cantidad
    if (movFields.cantidad) {
      movimientoFields[movFields.cantidad] = validData.cantidad;
    }

    // Tipo movimiento = "Salida"
    if (movFields.tipoMovimiento) {
      movimientoFields[movFields.tipoMovimiento] = 'Salida';
    }

    // Subtipo: DEJAR VACÍO (campo existe pero no está en uso, no inventar valores)
    // if (movFields.subtipo) {
    //   movimientoFields[movFields.subtipo] = '';
    // }

    // Área origen = Pirólisis
    if (movFields.idAreaOrigen) {
      movimientoFields[movFields.idAreaOrigen] = pirolisisAreaCode;
    }

    // Responsable
    if (validData['Realiza Registro'] && movFields.idResponsable) {
      movimientoFields[movFields.idResponsable] = validData['Realiza Registro'];
    }

    // Notas: concatenar observaciones + referencias deprecadas (turno, mantenimiento, balance)
    if (movFields.notas) {
      let notasCompletas = '';

      if (validData.observaciones) {
        notasCompletas += validData.observaciones;
      }

      // Tipo de uso (deprecated en Core, guardar como texto)
      if (validData.tipo_uso) {
        if (notasCompletas) notasCompletas += '\n';
        notasCompletas += `Tipo uso: ${validData.tipo_uso}`;
        if (esProductivo) {
          notasCompletas += ' (productivo)';
        }
      }

      if (turnoActual) {
        if (notasCompletas) notasCompletas += '\n';
        notasCompletas += `Salida vinculada a Turno ${turnoActual.id}`;
      }

      if (validData.mantenimiento_id) {
        if (notasCompletas) notasCompletas += '\n';
        notasCompletas += `Mantenimiento ${validData.mantenimiento_id}`;
      }

      if (validData.balance_masa_id) {
        if (notasCompletas) notasCompletas += '\n';
        notasCompletas += `Balance Masa ${validData.balance_masa_id}`;
      }

      if (notasCompletas) {
        movimientoFields[movFields.notas] = notasCompletas;
      }
    }

    console.log('📤 Creando movimiento de salida en Core:', movimientoFields);

    const createMovResponse = await fetch(
      `https://api.airtable.com/v0/${coreBaseId}/${movimientosTableId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{
            fields: movimientoFields
          }]
        }),
      }
    );

    const movimientoData = await createMovResponse.json();

    if (!createMovResponse.ok) {
      console.error('❌ Error al crear movimiento de salida en Core:', movimientoData);
      return NextResponse.json({
        success: false,
        error: movimientoData?.error || 'Error al crear movimiento',
        details: movimientoData
      }, { status: createMovResponse.status });
    }

    const nuevoMovimientoId = movimientoData.records[0].id;
    console.log(`✅ Movimiento de salida creado: ${nuevoMovimientoId}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 3: Actualizar Stock Insumos agregando el movimiento al link
    // ═══════════════════════════════════════════════════════════════════════════
    const stockInsumoId = stockRecord.id;

    try {
      // Preserva los movimientos ya vinculados: el PATCH de un campo link
      // reemplaza el array completo.
      await appendMovimientoToStock(stockInsumoId, nuevoMovimientoId);
    } catch (linkErr: any) {
      console.error('❌ Error al actualizar Stock Insumos:', linkErr);
      return NextResponse.json({
        success: false,
        error: 'Movimiento creado pero faltó vincular al stock',
        details: String(linkErr?.message || linkErr)
      }, { status: 500 });
    }

    console.log(`✅ Stock Insumos actualizado con nuevo movimiento`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PASO 4: Lógica de Paquete de Lonas (tabla local, IDs de insumos del Core)
    // ═══════════════════════════════════════════════════════════════════════════
    // Si es salida de lonas para producción, rotar paquete de lonas activo
    let paqueteAnteriorId: string | null = null;
    let paqueteAnteriorDiasUso: number | null = null;
    let paqueteNuevoId: string | null = null;
    const LONAS_INSUMO_ID = config.airtable.lonaInsumoId;  // Nuevo ID del Core
    const PAQUETES_TABLE_ID = config.airtable.paquetesLonasTableId;

    if (
      LONAS_INSUMO_ID &&
      PAQUETES_TABLE_ID &&
      validData.itemId === LONAS_INSUMO_ID &&
      validData.tipo_uso === 'balance_de_masa'
    ) {
      try {
        // Buscar paquete activo previo (tabla local en la base principal)
        const baseLocal = config.airtable.baseId;
        const tokenLocal = config.airtable.token;
        const paqUrl = new URL(`https://api.airtable.com/v0/${baseLocal}/${PAQUETES_TABLE_ID}`);
        paqUrl.searchParams.set('filterByFormula', `{Estado} = 'activo'`);
        paqUrl.searchParams.set('maxRecords', '1');

        const paqRes = await fetch(paqUrl.toString(), {
          headers: { 'Authorization': `Bearer ${tokenLocal}` },
        });
        const paqData = await paqRes.json();
        const paqueteActivo = paqData.records?.[0];

        // Retirar paquete previo (si existe)
        if (paqueteActivo) {
          paqueteAnteriorId = paqueteActivo.id;
          const fechaActivacion = new Date(paqueteActivo.fields['Fecha Activacion']);
          paqueteAnteriorDiasUso = Math.floor(
            (Date.now() - fechaActivacion.getTime()) / (1000 * 60 * 60 * 24)
          );

          const retirarRes = await fetch(
            `https://api.airtable.com/v0/${baseLocal}/${PAQUETES_TABLE_ID}/${paqueteActivo.id}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${tokenLocal}`,
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

        // Crear nuevo paquete activo
        const hoy = new Date().toISOString().split('T')[0];
        const nuevoRes = await fetch(
          `https://api.airtable.com/v0/${baseLocal}/${PAQUETES_TABLE_ID}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenLocal}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              records: [{
                fields: {
                  'Fecha Activacion': hoy,
                  'Cantidad Lonas': validData.cantidad,
                  'Estado': 'activo',
                  'ID Salida Origen': nuevoMovimientoId,  // Ahora es el ID del movimiento en Core
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

    // ═══════════════════════════════════════════════════════════════════════════
    // Respuesta
    // ═══════════════════════════════════════════════════════════════════════════
    const responsePayload: Record<string, unknown> = {
      success: true,
      data: movimientoData,
      message: `Salida registrada exitosamente. Cantidad: ${validData.cantidad}, Tipo: ${validData.tipo_uso}, Productivo: ${esProductivo}`,
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
 * Mapea valores legacy de Tipo de Salida al nuevo ENUM tipo_uso.
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

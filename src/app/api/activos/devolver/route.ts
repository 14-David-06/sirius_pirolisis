import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ASIGNACIONES_FIELD_IDS, ACTIVOS_FIELD_IDS } from '@/lib/activos.fields';

const BASE_ID = config.airtable.activosCoreBaseId;
const ASIGNACIONES_TABLE_ID = config.airtable.asignacionesTableId;
const ACTIVOS_TABLE_ID = config.airtable.activosFijosTableId;

export async function POST(request: NextRequest) {
  // Verificar configuración
  if (!BASE_ID || !ASIGNACIONES_TABLE_ID || !ACTIVOS_TABLE_ID) {
    return NextResponse.json({
      error: 'Módulo de Activos Fijos no configurado'
    }, { status: 400 });
  }

  try {
    if (!config.airtable.token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado'
      }, { status: 500 });
    }

    const body = await request.json();

    // Validar campos requeridos
    if (!body.asignacionId) {
      return NextResponse.json({
        error: 'El ID de la asignación es requerido'
      }, { status: 400 });
    }

    if (!body.fechaDevolucion) {
      return NextResponse.json({
        error: 'La fecha de devolución es requerida'
      }, { status: 400 });
    }

    if (!body.condicionAlDevolver) {
      return NextResponse.json({
        error: 'La condición del activo al devolver es requerida'
      }, { status: 400 });
    }

    // Paso 1: Verificar que la asignación exista y esté activa
    const asignacionUrl = `https://api.airtable.com/v0/${BASE_ID}/${ASIGNACIONES_TABLE_ID}/${body.asignacionId}`;
    const asignacionResponse = await fetch(asignacionUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!asignacionResponse.ok) {
      return NextResponse.json({
        error: 'Asignación no encontrada'
      }, { status: 404 });
    }

    const asignacionData = await asignacionResponse.json();
    const fechaDevolucionActual = asignacionData.fields[ASIGNACIONES_FIELD_IDS.fechaDevolucion];

    if (fechaDevolucionActual) {
      return NextResponse.json({
        error: 'Esta asignación ya fue devuelta',
        details: `Fecha de devolución: ${fechaDevolucionActual}`
      }, { status: 400 });
    }

    // Obtener el ID del activo desde la asignación
    const activoIds = asignacionData.fields[ASIGNACIONES_FIELD_IDS.activo];
    if (!activoIds || !Array.isArray(activoIds) || activoIds.length === 0) {
      return NextResponse.json({
        error: 'No se pudo determinar el activo de esta asignación'
      }, { status: 400 });
    }
    const activoId = activoIds[0];

    // Paso 2: Actualizar registro de asignación con datos de devolución
    const updateAsignacionFields: Record<string, unknown> = {
      [ASIGNACIONES_FIELD_IDS.fechaDevolucion]: body.fechaDevolucion,
      [ASIGNACIONES_FIELD_IDS.condicionAlDevolver]: body.condicionAlDevolver,
      [ASIGNACIONES_FIELD_IDS.usuarioQueRecibe]: body.usuarioQueRecibe || 'Sistema',
    };

    if (body.observacionesDevolucion) {
      updateAsignacionFields[ASIGNACIONES_FIELD_IDS.observacionesDevolucion] = body.observacionesDevolucion;
    }

    if (body.requiereMantenimiento !== undefined) {
      updateAsignacionFields[ASIGNACIONES_FIELD_IDS.requiereMantenimiento] = body.requiereMantenimiento;
    }

    const updateAsignacionResponse = await fetch(asignacionUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: updateAsignacionFields }),
    });

    const updateAsignacionData = await updateAsignacionResponse.json();

    if (!updateAsignacionResponse.ok) {
      console.error('❌ Error actualizando asignación:', updateAsignacionData);
      return NextResponse.json({
        error: 'Error al registrar la devolución',
        details: updateAsignacionData
      }, { status: updateAsignacionResponse.status });
    }

    // Paso 3: Limpiar el responsable del activo
    const activoUrl = `https://api.airtable.com/v0/${BASE_ID}/${ACTIVOS_TABLE_ID}/${activoId}`;
    const updateActivoFields: Record<string, unknown> = {
      [ACTIVOS_FIELD_IDS.responsableAsignado]: '', // Limpiar responsable
    };

    // Si requiere mantenimiento, cambiar estado del activo
    if (body.requiereMantenimiento === true) {
      updateActivoFields[ACTIVOS_FIELD_IDS.estadoOperativo] = 'En Mantenimiento';
    }

    const updateActivoResponse = await fetch(activoUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: updateActivoFields }),
    });

    if (!updateActivoResponse.ok) {
      console.error('⚠️ Devolución registrada pero error al actualizar activo');
      // La devolución ya se registró, retornar éxito parcial
    }

    console.log('✅ Devolución registrada exitosamente:', body.asignacionId);

    return NextResponse.json({
      success: true,
      data: updateAsignacionData,
      message: 'Devolución registrada correctamente'
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/devolver:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

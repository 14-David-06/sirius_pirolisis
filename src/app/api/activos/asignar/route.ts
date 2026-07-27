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
    if (!body.activoId) {
      return NextResponse.json({
        error: 'El ID del activo es requerido'
      }, { status: 400 });
    }

    if (!body.responsable) {
      return NextResponse.json({
        error: 'El responsable es requerido'
      }, { status: 400 });
    }

    if (!body.fechaAsignacion) {
      return NextResponse.json({
        error: 'La fecha de asignación es requerida'
      }, { status: 400 });
    }

    if (!body.condicionAlAsignar) {
      return NextResponse.json({
        error: 'La condición del activo al asignar es requerida'
      }, { status: 400 });
    }

    // Paso 1: Verificar que el activo no esté ya asignado
    const activoUrl = `https://api.airtable.com/v0/${BASE_ID}/${ACTIVOS_TABLE_ID}/${body.activoId}`;
    const activoResponse = await fetch(activoUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!activoResponse.ok) {
      return NextResponse.json({
        error: 'Activo no encontrado'
      }, { status: 404 });
    }

    const activoData = await activoResponse.json();
    const responsableActual = activoData.fields[ACTIVOS_FIELD_IDS.responsableAsignado];

    if (responsableActual && responsableActual.trim() !== '') {
      return NextResponse.json({
        error: `Este activo ya está asignado a: ${responsableActual}`,
        details: 'Debes registrar la devolución antes de asignarlo nuevamente'
      }, { status: 400 });
    }

    // Paso 2: Crear registro de asignación
    const asignacionFields: Record<string, unknown> = {
      [ASIGNACIONES_FIELD_IDS.responsable]: body.responsable,
      [ASIGNACIONES_FIELD_IDS.activo]: [body.activoId],
      [ASIGNACIONES_FIELD_IDS.fechaAsignacion]: body.fechaAsignacion,
      [ASIGNACIONES_FIELD_IDS.condicionAlAsignar]: body.condicionAlAsignar,
      [ASIGNACIONES_FIELD_IDS.usuarioQueAsigna]: body.usuarioQueAsigna || 'Sistema',
    };

    // Campos opcionales de asignación
    if (body.areaResponsable) {
      asignacionFields[ASIGNACIONES_FIELD_IDS.areaResponsable] = body.areaResponsable;
    }
    if (body.ubicacionDestino && Array.isArray(body.ubicacionDestino)) {
      asignacionFields[ASIGNACIONES_FIELD_IDS.ubicacionDestino] = body.ubicacionDestino;
    }
    if (body.propositoUso) {
      asignacionFields[ASIGNACIONES_FIELD_IDS.propositoUso] = body.propositoUso;
    }
    if (body.observacionesAsignacion) {
      asignacionFields[ASIGNACIONES_FIELD_IDS.observacionesAsignacion] = body.observacionesAsignacion;
    }

    const asignacionUrl = `https://api.airtable.com/v0/${BASE_ID}/${ASIGNACIONES_TABLE_ID}`;
    const asignacionResponse = await fetch(asignacionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: asignacionFields }),
    });

    const asignacionData = await asignacionResponse.json();

    if (!asignacionResponse.ok) {
      console.error('❌ Error creando asignación:', asignacionData);
      return NextResponse.json({
        error: 'Error al crear la asignación',
        details: asignacionData
      }, { status: asignacionResponse.status });
    }

    // Paso 3: Actualizar el activo con el responsable asignado
    const updateActivoFields: Record<string, unknown> = {
      [ACTIVOS_FIELD_IDS.responsableAsignado]: body.responsable,
    };

    // Si se especificó área responsable, también actualizar
    if (body.areaResponsable) {
      updateActivoFields[ACTIVOS_FIELD_IDS.areaResponsable] = body.areaResponsable;
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
      console.error('⚠️ Asignación creada pero error al actualizar activo');
      // La asignación ya se creó, retornar éxito parcial
    }

    console.log('✅ Activo asignado exitosamente:', body.activoId, '→', body.responsable);

    return NextResponse.json({
      success: true,
      data: asignacionData,
      message: 'Activo asignado exitosamente'
    }, { status: 201 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/asignar:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

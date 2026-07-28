import { NextRequest, NextResponse } from 'next/server';
import {
  ACTIVOS_FIELD_IDS,
  ACTIVOS_TABLE_IDS,
  ASIGNACIONES_FIELD_IDS,
  assertActivosFieldIds,
} from '@/lib/activos.fields';
import { MENSAJES } from '@/lib/activos.constants';
import { validarCondicion } from '@/lib/activos.payload';
import {
  ActivosError,
  assertActivosConfig,
  assertTabla,
  createRecord,
  getActivoRaw,
  normalizarAsignacion,
  responsableDe,
  updateRecord,
} from '@/lib/activos.server';

/**
 * POST /api/activos/asignar — entrega un activo a un responsable.
 *
 * Dos escrituras: crea el registro en Asignaciones (historial) y marca el
 * responsable en el activo (estado actual). Si la segunda falla se revierte la
 * primera, porque un activo con historial de entrega pero sin responsable —o al
 * revés— rompe la trazabilidad y la guarda de reasignación.
 */
export async function POST(request: NextRequest) {
  try {
    assertActivosConfig();
    assertActivosFieldIds();

    const asignacionesTable = assertTabla(
      ACTIVOS_TABLE_IDS.asignaciones,
      'AIRTABLE_ASIGNACIONES_TABLE_ID'
    );
    const activosTable = ACTIVOS_TABLE_IDS.activosFijos as string;

    const body = (await request.json()) as Record<string, unknown>;

    const activoId = String(body.activoId || '');
    const responsable = String(body.responsable || '').trim();
    const condicion = validarCondicion(body.condicionAlAsignar);

    if (!activoId) {
      return NextResponse.json({ error: MENSAJES.ERROR.SELECCIONAR_ACTIVO }, { status: 400 });
    }
    if (!responsable) {
      return NextResponse.json({ error: MENSAJES.ERROR.ESPECIFICAR_RESPONSABLE }, { status: 400 });
    }
    if (!condicion) {
      return NextResponse.json({ error: MENSAJES.ERROR.CONDICION_REQUERIDA }, { status: 400 });
    }

    // La fecha de asignación es un dateTime; si el cliente no la manda, el
    // momento de la petición es la mejor aproximación disponible.
    const fechaAsignacion = String(body.fechaAsignacion || '') || new Date().toISOString();

    // Guarda de doble asignación: leer por field ID (ver activos.server.ts).
    const actuales = await getActivoRaw(activoId);
    const responsableActual = responsableDe(actuales);

    if (responsableActual) {
      return NextResponse.json(
        {
          error: `${MENSAJES.ERROR.ACTIVO_YA_ASIGNADO}: ${responsableActual}`,
          details: 'Registra la devolución antes de asignarlo de nuevo.',
        },
        { status: 409 }
      );
    }

    if (actuales[ACTIVOS_FIELD_IDS.estadoOperativo] === 'Dado de Baja') {
      return NextResponse.json(
        { error: 'No se puede asignar un activo dado de baja' },
        { status: 409 }
      );
    }

    const areaResponsable = String(body.areaResponsable || '').trim();
    const propositoUso = String(body.propositoUso || '').trim();
    const observaciones = String(body.observacionesAsignacion || '').trim();
    const ubicacionDestino = Array.isArray(body.ubicacionDestino)
      ? (body.ubicacionDestino as string[]).filter((id) => id.startsWith('rec'))
      : [];

    const asignacionFields: Record<string, unknown> = {
      [ASIGNACIONES_FIELD_IDS.responsable]: responsable,
      [ASIGNACIONES_FIELD_IDS.activo]: [activoId],
      [ASIGNACIONES_FIELD_IDS.fechaAsignacion]: fechaAsignacion,
      [ASIGNACIONES_FIELD_IDS.condicionAlAsignar]: condicion,
      [ASIGNACIONES_FIELD_IDS.usuarioQueAsigna]: String(body.usuarioQueAsigna || 'Sistema'),
    };

    if (areaResponsable) asignacionFields[ASIGNACIONES_FIELD_IDS.areaResponsable] = areaResponsable;
    if (propositoUso) asignacionFields[ASIGNACIONES_FIELD_IDS.propositoUso] = propositoUso;
    if (observaciones) {
      asignacionFields[ASIGNACIONES_FIELD_IDS.observacionesAsignacion] = observaciones;
    }
    if (ubicacionDestino.length > 0) {
      asignacionFields[ASIGNACIONES_FIELD_IDS.ubicacionDestino] = ubicacionDestino;
    }

    const creada = await createRecord(asignacionesTable, asignacionFields);

    // Reflejar la entrega en el activo.
    const activoFields: Record<string, unknown> = {
      [ACTIVOS_FIELD_IDS.responsableAsignado]: responsable,
    };
    if (areaResponsable) activoFields[ACTIVOS_FIELD_IDS.areaResponsable] = areaResponsable;
    if (ubicacionDestino.length > 0) {
      activoFields[ACTIVOS_FIELD_IDS.ubicacionActual] = ubicacionDestino;
    }

    try {
      await updateRecord(activosTable, activoId, activoFields);
    } catch (error) {
      // Compensar: sin esto el activo queda "disponible" con una asignación
      // abierta, y la próxima asignación pasaría la guarda sin problema.
      await updateRecord(asignacionesTable, creada.id, {
        [ASIGNACIONES_FIELD_IDS.fechaDevolucion]: new Date().toISOString(),
        [ASIGNACIONES_FIELD_IDS.observacionesDevolucion]:
          'Anulada automáticamente: no se pudo actualizar el activo.',
      }).catch(() => undefined);

      throw error;
    }

    console.log('✅ Activo asignado:', activoId, '→', responsable);

    return NextResponse.json(
      {
        success: true,
        data: normalizarAsignacion({
          id: creada.id,
          fields: creada.fields,
          createdTime: creada.createdTime,
        }),
        message: MENSAJES.EXITO.ASIGNACION_CREADA,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      const status = err.status === 404 ? 404 : err.status;
      const error = status === 404 ? MENSAJES.ERROR.ACTIVO_NO_ENCONTRADO : err.message;
      return NextResponse.json({ success: false, error, details: err.details }, { status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/asignar:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

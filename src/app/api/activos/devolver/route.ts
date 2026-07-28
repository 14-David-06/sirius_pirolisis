import { NextRequest, NextResponse } from 'next/server';
import {
  ACTIVOS_FIELD_IDS,
  ACTIVOS_TABLE_IDS,
  ASIGNACIONES_FIELD_IDS,
  assertActivosFieldIds,
} from '@/lib/activos.fields';
import { CONDICIONES_REQUIEREN_MANTENIMIENTO, MENSAJES } from '@/lib/activos.constants';
import { validarCondicion } from '@/lib/activos.payload';
import {
  ActivosError,
  assertActivosConfig,
  assertTabla,
  buscarAsignacionAbierta,
  getActivoRaw,
  getAsignacionRaw,
  responsableDe,
  updateRecord,
} from '@/lib/activos.server';

/**
 * POST /api/activos/devolver — registra la devolución de un activo.
 *
 * Acepta `asignacionId` o `activoId`. Desde la UI lo natural es lo segundo (el
 * operario ve activos, no registros de asignación), así que la ruta resuelve la
 * asignación abierta del activo.
 *
 * Si el activo tiene responsable pero no existe una asignación abierta —caso de
 * los activos cargados a mano— se libera igualmente y se avisa en la respuesta:
 * bloquear ahí dejaría el activo asignado para siempre.
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

    const condicion = validarCondicion(body.condicionAlDevolver);
    if (!condicion) {
      return NextResponse.json({ error: MENSAJES.ERROR.CONDICION_REQUERIDA }, { status: 400 });
    }

    const fechaDevolucion = String(body.fechaDevolucion || '') || new Date().toISOString();
    const usuarioQueRecibe = String(body.usuarioQueRecibe || 'Sistema');
    const observaciones = String(body.observacionesDevolucion || '').trim();

    // `requiereMantenimiento` puede llegar del formulario o deducirse de una
    // condición que deja el activo inservible.
    const requiereMantenimiento =
      body.requiereMantenimiento === undefined
        ? (CONDICIONES_REQUIEREN_MANTENIMIENTO as readonly string[]).includes(condicion)
        : Boolean(body.requiereMantenimiento);

    let asignacionId = String(body.asignacionId || '');
    let activoId = String(body.activoId || '');

    if (!asignacionId && !activoId) {
      return NextResponse.json({ error: MENSAJES.ERROR.SELECCIONAR_ACTIVO }, { status: 400 });
    }

    // — Resolver la asignación —
    if (asignacionId) {
      const asignacion = await getAsignacionRaw(asignacionId);

      if (asignacion[ASIGNACIONES_FIELD_IDS.fechaDevolucion]) {
        return NextResponse.json(
          {
            error: 'Esta asignación ya fue devuelta',
            details: `Fecha de devolución: ${asignacion[ASIGNACIONES_FIELD_IDS.fechaDevolucion]}`,
          },
          { status: 409 }
        );
      }

      const vinculados = asignacion[ASIGNACIONES_FIELD_IDS.activo];
      if (Array.isArray(vinculados) && typeof vinculados[0] === 'string') {
        activoId = vinculados[0];
      }

      if (!activoId) {
        return NextResponse.json(
          { error: 'No se pudo determinar el activo de esta asignación' },
          { status: 422 }
        );
      }
    } else {
      const abierta = await buscarAsignacionAbierta(activoId);
      asignacionId = abierta?.id || '';
    }

    // — Verificar que el activo esté realmente asignado —
    const activoActual = await getActivoRaw(activoId);
    const responsable = responsableDe(activoActual);

    if (!responsable && !asignacionId) {
      return NextResponse.json(
        { error: 'Este activo no está asignado a nadie' },
        { status: 409 }
      );
    }

    // — Cerrar la asignación (si existe) —
    if (asignacionId) {
      const cierre: Record<string, unknown> = {
        [ASIGNACIONES_FIELD_IDS.fechaDevolucion]: fechaDevolucion,
        [ASIGNACIONES_FIELD_IDS.condicionAlDevolver]: condicion,
        [ASIGNACIONES_FIELD_IDS.usuarioQueRecibe]: usuarioQueRecibe,
        [ASIGNACIONES_FIELD_IDS.requiereMantenimiento]: requiereMantenimiento,
      };
      if (observaciones) {
        cierre[ASIGNACIONES_FIELD_IDS.observacionesDevolucion] = observaciones;
      }

      await updateRecord(asignacionesTable, asignacionId, cierre);
    }

    // — Liberar el activo —
    const liberacion: Record<string, unknown> = {
      [ACTIVOS_FIELD_IDS.responsableAsignado]: '',
    };
    if (requiereMantenimiento) {
      liberacion[ACTIVOS_FIELD_IDS.estadoOperativo] = 'En Mantenimiento';
    }

    await updateRecord(activosTable, activoId, liberacion);

    console.log('✅ Devolución registrada:', activoId, asignacionId ? `(${asignacionId})` : '(sin asignación previa)');

    return NextResponse.json(
      {
        success: true,
        data: { activoId, asignacionId: asignacionId || null, requiereMantenimiento },
        message: MENSAJES.EXITO.DEVOLUCION_REGISTRADA,
        aviso: asignacionId
          ? undefined
          : 'El activo se liberó, pero no existía una asignación abierta que cerrar.',
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      const status = err.status === 404 ? 404 : err.status;
      const error = status === 404 ? MENSAJES.ERROR.ACTIVO_NO_ENCONTRADO : err.message;
      return NextResponse.json({ success: false, error, details: err.details }, { status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/devolver:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { ACTIVOS_TABLE_IDS, assertActivosFieldIds } from '@/lib/activos.fields';
import { MENSAJES } from '@/lib/activos.constants';
import { construirCamposActivo } from '@/lib/activos.payload';
import {
  ActivosError,
  assertActivosConfig,
  getCatalogos,
  normalizarActivo,
  updateRecord,
} from '@/lib/activos.server';

/**
 * PATCH /api/activos/update/[id] — actualiza los campos enviados de un activo.
 *
 * Solo se escriben las claves presentes en el cuerpo, así el formulario de
 * edición puede mandar el activo completo y el cambio rápido de estado puede
 * mandar únicamente `Estado Operativo`.
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  try {
    assertActivosConfig();
    assertActivosFieldIds();

    const body = (await request.json()) as Record<string, unknown>;
    const { fields, errores } = construirCamposActivo(body, 'editar');

    if (errores.length > 0) {
      return NextResponse.json({ error: errores[0], details: { errores } }, { status: 400 });
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: MENSAJES.ERROR.SIN_CAMBIOS }, { status: 400 });
    }

    const actualizado = await updateRecord(ACTIVOS_TABLE_IDS.activosFijos as string, id, fields);
    const catalogos = await getCatalogos();
    const activo = normalizarActivo(
      { id: actualizado.id, fields: actualizado.fields, createdTime: actualizado.createdTime },
      catalogos
    );

    console.log('✅ Activo actualizado:', activo.fields.codigo || id);

    return NextResponse.json(
      { success: true, data: activo, message: MENSAJES.EXITO.ACTIVO_ACTUALIZADO },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      const status = err.status === 404 ? 404 : err.status;
      return NextResponse.json(
        { success: false, error: err.message, details: err.details },
        { status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/update:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

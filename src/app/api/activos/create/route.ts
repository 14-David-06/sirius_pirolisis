import { NextRequest, NextResponse } from 'next/server';
import { ACTIVOS_TABLE_IDS, assertActivosFieldIds } from '@/lib/activos.fields';
import { construirCamposActivo } from '@/lib/activos.payload';
import {
  ActivosError,
  assertActivosConfig,
  createRecord,
  getCatalogos,
  normalizarActivo,
} from '@/lib/activos.server';

/**
 * POST /api/activos/create — registra un activo nuevo.
 *
 * Exige nombre, tipo, ubicación y estado: sin tipo el activo no hereda categoría
 * ni vida útil, y sin ubicación no se puede encontrar. Los activos heredados que
 * ya están incompletos se completan desde el formulario de edición.
 */
export async function POST(request: NextRequest) {
  try {
    assertActivosConfig();
    assertActivosFieldIds();

    const body = (await request.json()) as Record<string, unknown>;
    const { fields, errores } = construirCamposActivo(body, 'crear');

    if (errores.length > 0) {
      return NextResponse.json({ error: errores[0], details: { errores } }, { status: 400 });
    }

    const creado = await createRecord(ACTIVOS_TABLE_IDS.activosFijos as string, fields);
    const catalogos = await getCatalogos();
    const activo = normalizarActivo(
      { id: creado.id, fields: creado.fields, createdTime: creado.createdTime },
      catalogos
    );

    console.log('✅ Activo creado:', activo.fields.codigo || creado.id);

    return NextResponse.json(
      { success: true, data: activo, message: 'Activo registrado exitosamente' },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      return NextResponse.json(
        { success: false, error: err.message, details: err.details },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/create:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

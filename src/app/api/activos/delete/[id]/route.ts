import { NextRequest, NextResponse } from 'next/server';
import { ACTIVOS_FIELD_IDS, ACTIVOS_TABLE_IDS, assertActivosFieldIds } from '@/lib/activos.fields';
import { MENSAJES } from '@/lib/activos.constants';
import {
  ActivosError,
  assertActivosConfig,
  getActivoRaw,
  getCatalogos,
  normalizarActivo,
  responsableDe,
  updateRecord,
} from '@/lib/activos.server';

/**
 * DELETE /api/activos/delete/[id] — baja lógica de un activo.
 *
 * No borra el registro: cambia el estado a "Dado de Baja" y deja el motivo en
 * las notas. Un activo es un bien contable, su historial de asignaciones y
 * mantenimientos tiene que sobrevivir a la baja.
 *
 * Guarda: no se puede dar de baja un activo que está asignado a alguien.
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  try {
    assertActivosConfig();
    assertActivosFieldIds();

    let motivoBaja = '';
    let usuario = '';
    try {
      const body = (await request.json()) as { motivoBaja?: string; usuario?: string };
      motivoBaja = (body.motivoBaja || '').trim();
      usuario = (body.usuario || '').trim();
    } catch {
      // El cuerpo es opcional.
    }

    // Se leen los campos por field ID (`returnFieldsByFieldId`): con las claves
    // por nombre esta guarda nunca detectaba al responsable y permitía dar de
    // baja activos que estaban en manos de alguien.
    const actuales = await getActivoRaw(id);
    const responsable = responsableDe(actuales);

    if (responsable) {
      return NextResponse.json(
        {
          error: 'No se puede dar de baja un activo que está asignado',
          details: `Actualmente asignado a ${responsable}. Registra la devolución primero.`,
        },
        { status: 409 }
      );
    }

    if (actuales[ACTIVOS_FIELD_IDS.estadoOperativo] === 'Dado de Baja') {
      return NextResponse.json(
        { error: 'Este activo ya está dado de baja' },
        { status: 409 }
      );
    }

    const fields: Record<string, unknown> = {
      [ACTIVOS_FIELD_IDS.estadoOperativo]: 'Dado de Baja',
    };

    if (motivoBaja) {
      const notasActuales = String(actuales[ACTIVOS_FIELD_IDS.notas] || '');
      const fecha = new Date().toISOString().split('T')[0];
      const firma = usuario ? ` (${usuario})` : '';
      fields[ACTIVOS_FIELD_IDS.notas] = `${notasActuales}\n\n[BAJA ${fecha}${firma}] ${motivoBaja}`.trim();
    }

    const actualizado = await updateRecord(ACTIVOS_TABLE_IDS.activosFijos as string, id, fields);
    const catalogos = await getCatalogos();
    const activo = normalizarActivo(
      { id: actualizado.id, fields: actualizado.fields, createdTime: actualizado.createdTime },
      catalogos
    );

    console.log('✅ Activo dado de baja:', activo.fields.codigo || id);

    return NextResponse.json(
      { success: true, data: activo, message: MENSAJES.EXITO.ACTIVO_DADO_DE_BAJA },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof ActivosError) {
      const status = err.status === 404 ? 404 : err.status;
      const error = status === 404 ? MENSAJES.ERROR.ACTIVO_NO_ENCONTRADO : err.message;
      return NextResponse.json({ success: false, error, details: err.details }, { status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/delete:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/activos/delete/[id] — alias de DELETE.
 * Existe porque algunos clientes (y proxies) no envían cuerpo en un DELETE.
 */
export function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  return DELETE(request, props);
}

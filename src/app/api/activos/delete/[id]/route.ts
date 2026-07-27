import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ACTIVOS_FIELD_IDS } from '@/lib/activos.fields';

const BASE_ID = config.airtable.activosCoreBaseId;
const TABLE_ID = config.airtable.activosFijosTableId;

/**
 * DELETE - Dar de baja un activo (soft delete)
 * No elimina el registro, solo cambia su estado a "Dado de Baja"
 */
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;

  // Verificar configuración
  if (!BASE_ID || !TABLE_ID) {
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

    const { id } = params;

    // Leer datos opcionales del body (motivo de baja, etc.)
    let motivoBaja = '';
    try {
      const body = await request.json();
      motivoBaja = body.motivoBaja || '';
    } catch {
      // Body opcional, continuar
    }

    // Paso 1: Verificar que el activo no esté asignado
    const getUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`;
    const getResponse = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!getResponse.ok) {
      return NextResponse.json({
        error: 'Activo no encontrado'
      }, { status: 404 });
    }

    const activoData = await getResponse.json();
    const responsable = activoData.fields[ACTIVOS_FIELD_IDS.responsableAsignado];

    if (responsable && responsable.trim() !== '') {
      return NextResponse.json({
        error: 'No se puede dar de baja un activo que está asignado',
        details: `Actualmente asignado a: ${responsable}. Registra la devolución primero.`
      }, { status: 400 });
    }

    // Paso 2: Cambiar estado a "Dado de Baja" (soft delete)
    const updateFields: Record<string, unknown> = {
      [ACTIVOS_FIELD_IDS.estadoOperativo]: 'Dado de Baja',
    };

    // Agregar motivo a las notas
    if (motivoBaja) {
      const notasActuales = activoData.fields[ACTIVOS_FIELD_IDS.notas] || '';
      const fechaBaja = new Date().toISOString().split('T')[0];
      const nuevasNotas = `${notasActuales}\n\n[BAJA ${fechaBaja}] ${motivoBaja}`.trim();
      updateFields[ACTIVOS_FIELD_IDS.notas] = nuevasNotas;
    }

    const updateUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: updateFields }),
    });

    const updateData = await updateResponse.json();

    if (!updateResponse.ok) {
      console.error('❌ Error dando de baja activo:', updateData);
      return NextResponse.json({
        error: 'Error al dar de baja el activo',
        details: updateData
      }, { status: updateResponse.status });
    }

    console.log('✅ Activo dado de baja:', id);

    return NextResponse.json({
      success: true,
      data: updateData,
      message: 'Activo dado de baja exitosamente'
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/delete:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST - Alternativa al DELETE para dar de baja
 * Permite enviar datos en el body más fácilmente
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  return DELETE(request, { params: Promise.resolve(params) });
}

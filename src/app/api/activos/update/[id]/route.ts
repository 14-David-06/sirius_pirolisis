import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ACTIVOS_FIELD_IDS } from '@/lib/activos.fields';

const BASE_ID = config.airtable.activosCoreBaseId;
const TABLE_ID = config.airtable.activosFijosTableId;

export async function PATCH(
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
    const body = await request.json();

    // Construir campos a actualizar
    const fields: Record<string, unknown> = {};

    // Mapear campos del body a Field IDs
    if (body['Nombre del Activo'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.nombreActivo] = body['Nombre del Activo'];
    }
    if (body['Descripción'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.descripcion] = body['Descripción'];
    }
    if (body['Tipo de Activo'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.tipoActivo] = body['Tipo de Activo'];
    }
    if (body['Número de Serie'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.numeroSerie] = body['Número de Serie'];
    }
    if (body['Código Interno'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.codigoInterno] = body['Código Interno'];
    }
    if (body['Estado Operativo'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.estadoOperativo] = body['Estado Operativo'];
    }
    if (body['Ubicación Actual'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.ubicacionActual] = body['Ubicación Actual'];
    }
    if (body['Área Responsable'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.areaResponsable] = body['Área Responsable'];
    }
    if (body['Responsable Asignado'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.responsableAsignado] = body['Responsable Asignado'];
    }
    if (body['Fecha de Adquisición'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.fechaAdquisicion] = body['Fecha de Adquisición'];
    }
    if (body['Valor de Adquisición'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.valorAdquisicion] = body['Valor de Adquisición'];
    }
    if (body['Proveedor'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.proveedor] = body['Proveedor'];
    }
    if (body['Marca'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.marca] = body['Marca'];
    }
    if (body['Modelo'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.modelo] = body['Modelo'];
    }
    if (body['Fecha de Vencimiento'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.fechaVencimiento] = body['Fecha de Vencimiento'];
    }
    if (body['Próximo Mantenimiento'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.proximoMantenimiento] = body['Próximo Mantenimiento'];
    }
    if (body['Notas'] !== undefined) {
      fields[ACTIVOS_FIELD_IDS.notas] = body['Notas'];
    }

    // Verificar que hay al menos un campo para actualizar
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({
        error: 'No hay campos para actualizar'
      }, { status: 400 });
    }

    // Actualizar registro en Airtable
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${id}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error actualizando activo:', data);
      return NextResponse.json({
        error: data?.error?.type || 'Error actualizando activo',
        details: data
      }, { status: response.status });
    }

    console.log('✅ Activo actualizado:', id);

    return NextResponse.json({
      success: true,
      data,
      message: 'Activo actualizado correctamente'
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/update:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

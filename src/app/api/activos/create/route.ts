import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ACTIVOS_FIELD_IDS } from '@/lib/activos.fields';

const BASE_ID = config.airtable.activosCoreBaseId;
const TABLE_ID = config.airtable.activosFijosTableId;

export async function POST(request: NextRequest) {
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

    const body = await request.json();

    // Validar campos requeridos
    if (!body['Nombre del Activo']) {
      return NextResponse.json({
        error: 'El nombre del activo es requerido'
      }, { status: 400 });
    }

    if (!body['Tipo de Activo'] || !Array.isArray(body['Tipo de Activo']) || body['Tipo de Activo'].length === 0) {
      return NextResponse.json({
        error: 'Debes seleccionar al menos un tipo de activo'
      }, { status: 400 });
    }

    if (!body['Estado Operativo']) {
      return NextResponse.json({
        error: 'El estado operativo es requerido'
      }, { status: 400 });
    }

    if (!body['Ubicación Actual'] || !Array.isArray(body['Ubicación Actual']) || body['Ubicación Actual'].length === 0) {
      return NextResponse.json({
        error: 'Debes seleccionar una ubicación'
      }, { status: 400 });
    }

    // Construir el registro a crear
    const fields: Record<string, unknown> = {
      [ACTIVOS_FIELD_IDS.nombreActivo]: body['Nombre del Activo'],
      [ACTIVOS_FIELD_IDS.tipoActivo]: body['Tipo de Activo'],
      [ACTIVOS_FIELD_IDS.estadoOperativo]: body['Estado Operativo'],
      [ACTIVOS_FIELD_IDS.ubicacionActual]: body['Ubicación Actual'],
    };

    // Campos opcionales
    if (body['Descripción']) {
      fields[ACTIVOS_FIELD_IDS.descripcion] = body['Descripción'];
    }
    if (body['Número de Serie']) {
      fields[ACTIVOS_FIELD_IDS.numeroSerie] = body['Número de Serie'];
    }
    if (body['Código Interno']) {
      fields[ACTIVOS_FIELD_IDS.codigoInterno] = body['Código Interno'];
    }
    if (body['Área Responsable']) {
      fields[ACTIVOS_FIELD_IDS.areaResponsable] = body['Área Responsable'];
    }
    if (body['Fecha de Adquisición']) {
      fields[ACTIVOS_FIELD_IDS.fechaAdquisicion] = body['Fecha de Adquisición'];
    }
    if (body['Valor de Adquisición'] !== undefined && body['Valor de Adquisición'] !== null) {
      fields[ACTIVOS_FIELD_IDS.valorAdquisicion] = body['Valor de Adquisición'];
    }
    if (body['Proveedor']) {
      fields[ACTIVOS_FIELD_IDS.proveedor] = body['Proveedor'];
    }
    if (body['Marca']) {
      fields[ACTIVOS_FIELD_IDS.marca] = body['Marca'];
    }
    if (body['Modelo']) {
      fields[ACTIVOS_FIELD_IDS.modelo] = body['Modelo'];
    }
    if (body['Fecha de Vencimiento']) {
      fields[ACTIVOS_FIELD_IDS.fechaVencimiento] = body['Fecha de Vencimiento'];
    }
    if (body['Próximo Mantenimiento']) {
      fields[ACTIVOS_FIELD_IDS.proximoMantenimiento] = body['Próximo Mantenimiento'];
    }
    if (body['Notas']) {
      fields[ACTIVOS_FIELD_IDS.notas] = body['Notas'];
    }

    // Crear registro en Airtable
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error creando activo:', data);
      return NextResponse.json({
        error: data?.error?.type || 'Error creando activo',
        details: data
      }, { status: response.status });
    }

    console.log('✅ Activo creado:', data.id);

    return NextResponse.json({
      success: true,
      data,
      message: 'Activo registrado exitosamente'
    }, { status: 201 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API activos/create:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars, validateLaboratoriosFields } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
validateEnvVars();
validateLaboratoriosFields();

export async function PUT(request: NextRequest) {
  try {
    console.log('🔬 [laboratorios] Iniciando actualización de laboratorio');

    const { id, fields } = await request.json();

    if (!id) {
      console.error('❌ [laboratorios] ID del laboratorio no proporcionado');
      return NextResponse.json(
        { message: 'ID del laboratorio es requerido' },
        { status: 400 }
      );
    }

    if (!fields || typeof fields !== 'object') {
      console.error('❌ [laboratorios] Campos del laboratorio no válidos');
      return NextResponse.json(
        { message: 'Campos del laboratorio son requeridos' },
        { status: 400 }
      );
    }

    // Validar que el nombre del laboratorio no esté vacío
    if (!fields.nombreLaboratorio || fields.nombreLaboratorio.trim() === '') {
      console.error('❌ [laboratorios] Nombre del laboratorio es requerido');
      return NextResponse.json(
        { message: 'El nombre del laboratorio es obligatorio' },
        { status: 400 }
      );
    }

    // Crear el objeto de campos usando field IDs
    const airtableFields: any = {};

    // Mapear campos del frontend a field IDs de Airtable
    if (fields.nombreLaboratorio && config.airtable.laboratoriosFields.nombreLaboratorio) {
      airtableFields[config.airtable.laboratoriosFields.nombreLaboratorio] = fields.nombreLaboratorio.trim();
    }
    if (fields.tipoLaboratorio && config.airtable.laboratoriosFields.tipoLaboratorio) {
      airtableFields[config.airtable.laboratoriosFields.tipoLaboratorio] = fields.tipoLaboratorio.trim();
    }
    if (fields.responsable && config.airtable.laboratoriosFields.responsable) {
      airtableFields[config.airtable.laboratoriosFields.responsable] = fields.responsable.trim();
    }
    if (fields.telefono && config.airtable.laboratoriosFields.telefono) {
      airtableFields[config.airtable.laboratoriosFields.telefono] = fields.telefono.trim();
    }
    if (fields.correoElectronico && config.airtable.laboratoriosFields.correoElectronico) {
      airtableFields[config.airtable.laboratoriosFields.correoElectronico] = fields.correoElectronico.trim();
    }
    if (fields.direccion && config.airtable.laboratoriosFields.direccion) {
      airtableFields[config.airtable.laboratoriosFields.direccion] = fields.direccion.trim();
    }
    if (fields.ciudad && config.airtable.laboratoriosFields.ciudad) {
      airtableFields[config.airtable.laboratoriosFields.ciudad] = fields.ciudad.trim();
    }
    if (fields.pais && config.airtable.laboratoriosFields.pais) {
      airtableFields[config.airtable.laboratoriosFields.pais] = fields.pais.trim();
    }
    if (fields.certificaciones && config.airtable.laboratoriosFields.certificaciones) {
      airtableFields[config.airtable.laboratoriosFields.certificaciones] = fields.certificaciones.trim();
    }
    if (fields.acreditaciones && config.airtable.laboratoriosFields.acreditaciones) {
      airtableFields[config.airtable.laboratoriosFields.acreditaciones] = fields.acreditaciones.trim();
    }
    if (fields.metodosAnaliticos && config.airtable.laboratoriosFields.metodosAnaliticos) {
      airtableFields[config.airtable.laboratoriosFields.metodosAnaliticos] = fields.metodosAnaliticos.trim();
    }
    if (fields.fechaVigenciaCertificaciones && config.airtable.laboratoriosFields.fechaVigenciaCertificaciones) {
      airtableFields[config.airtable.laboratoriosFields.fechaVigenciaCertificaciones] = fields.fechaVigenciaCertificaciones.trim();
    }
    if (fields.realizaRegistro && config.airtable.laboratoriosFields.realizaRegistro) {
      airtableFields[config.airtable.laboratoriosFields.realizaRegistro] = fields.realizaRegistro.trim();
    }
    if (fields.observaciones && config.airtable.laboratoriosFields.observaciones) {
      airtableFields[config.airtable.laboratoriosFields.observaciones] = fields.observaciones.trim();
    }

    const tableName = config.airtable.laboratoriosTableId;
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}`;
    console.log(`🌐 [laboratorios] URL de Airtable: ${airtableUrl}`);

    // Actualizar el registro en Airtable
    const response = await fetch(airtableUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          id: id,
          fields: airtableFields
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [laboratorios] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [laboratorios] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al actualizar laboratorio en la base de datos' },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log('✅ [laboratorios] Laboratorio actualizado exitosamente:', result.records[0].id);

    return NextResponse.json({
      message: 'Laboratorio actualizado exitosamente',
      laboratorio: {
        id: result.records[0].id,
        fields: result.records[0].fields
      }
    });

  } catch (error: any) {
    console.error('❌ [laboratorios] Error al actualizar laboratorio:', error);

    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
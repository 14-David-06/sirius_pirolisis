import { NextRequest, NextResponse } from 'next/server';
import { config, validateEnvVars, validateLaboratoriosFields } from '@/lib/config';

// Validar variables de entorno al cargar el módulo
validateEnvVars();
validateLaboratoriosFields();

export async function POST(request: NextRequest) {
  console.log('🔬 [laboratorios] Iniciando creación de laboratorio');

  try {
    console.log('📥 [laboratorios] Parseando request body...');
    const { records } = await request.json();
    console.log(`🔬 [laboratorios] Registros a crear:`, JSON.stringify(records, null, 2));

    if (!records || !Array.isArray(records) || records.length === 0) {
      console.log('❌ [laboratorios] Error: No se proporcionaron registros válidos');
      return NextResponse.json(
        { message: 'Se requieren registros válidos para crear laboratorio' },
        { status: 400 }
      );
    }

    // Crear registros en Airtable
    const tableName = config.airtable.laboratoriosTableId; // ID de la tabla Laboratorios desde configuración
    const airtableUrl = `https://api.airtable.com/v0/${config.airtable.baseId}/${tableName}`;
    console.log(`🌐 [laboratorios] URL de Airtable: ${airtableUrl}`);

    // Transformar los registros para usar field IDs en lugar de nombres de campo
    const transformedRecords = records.map((record: any) => {
      const transformedFields: any = {};

      // Mapear campos del frontend a field IDs de Airtable
      if (record.fields['Nombre Laboratorio'] && config.airtable.laboratoriosFields.nombreLaboratorio) {
        transformedFields[config.airtable.laboratoriosFields.nombreLaboratorio] = record.fields['Nombre Laboratorio'];
      }
      if (record.fields['Tipo Laboratorio'] && config.airtable.laboratoriosFields.tipoLaboratorio) {
        transformedFields[config.airtable.laboratoriosFields.tipoLaboratorio] = record.fields['Tipo Laboratorio'];
      }
      if (record.fields['Responsable'] && config.airtable.laboratoriosFields.responsable) {
        transformedFields[config.airtable.laboratoriosFields.responsable] = record.fields['Responsable'];
      }
      if (record.fields['Teléfono'] && config.airtable.laboratoriosFields.telefono) {
        transformedFields[config.airtable.laboratoriosFields.telefono] = record.fields['Teléfono'];
      }
      if (record.fields['Correo Electrónico'] && config.airtable.laboratoriosFields.correoElectronico) {
        transformedFields[config.airtable.laboratoriosFields.correoElectronico] = record.fields['Correo Electrónico'];
      }
      if (record.fields['Dirección'] && config.airtable.laboratoriosFields.direccion) {
        transformedFields[config.airtable.laboratoriosFields.direccion] = record.fields['Dirección'];
      }
      if (record.fields['Ciudad'] && config.airtable.laboratoriosFields.ciudad) {
        transformedFields[config.airtable.laboratoriosFields.ciudad] = record.fields['Ciudad'];
      }
      if (record.fields['País'] && config.airtable.laboratoriosFields.pais) {
        transformedFields[config.airtable.laboratoriosFields.pais] = record.fields['País'];
      }
      if (record.fields['Certificaciones'] && config.airtable.laboratoriosFields.certificaciones) {
        transformedFields[config.airtable.laboratoriosFields.certificaciones] = record.fields['Certificaciones'];
      }
      if (record.fields['Acreditaciones'] && config.airtable.laboratoriosFields.acreditaciones) {
        transformedFields[config.airtable.laboratoriosFields.acreditaciones] = record.fields['Acreditaciones'];
      }
      if (record.fields['Métodos Analíticos'] && config.airtable.laboratoriosFields.metodosAnaliticos) {
        transformedFields[config.airtable.laboratoriosFields.metodosAnaliticos] = record.fields['Métodos Analíticos'];
      }
      // if (record.fields['Fecha Vigencia Certificaciones'] && config.airtable.laboratoriosFields.fechaVigenciaCertificaciones) {
      //   transformedFields[config.airtable.laboratoriosFields.fechaVigenciaCertificaciones] = record.fields['Fecha Vigencia Certificaciones'];
      // }
      if (record.fields['Realiza Registro'] && config.airtable.laboratoriosFields.realizaRegistro) {
        transformedFields[config.airtable.laboratoriosFields.realizaRegistro] = record.fields['Realiza Registro'];
      }
      if (record.fields['Observaciones'] && config.airtable.laboratoriosFields.observaciones) {
        transformedFields[config.airtable.laboratoriosFields.observaciones] = record.fields['Observaciones'];
      }

      return {
        fields: transformedFields
      };
    });

    console.log('🚀 [laboratorios] Enviando datos transformados a Airtable...');
    const response = await fetch(airtableUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records: transformedRecords })
    });

    console.log(`📡 [laboratorios] Respuesta de Airtable - Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`💥 [laboratorios] Error de Airtable: ${response.status} ${response.statusText}`);
      console.error(`💥 [laboratorios] Error body: ${errorText}`);
      return NextResponse.json(
        { message: 'Error al crear laboratorio en la base de datos' },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log(`✅ [laboratorios] Laboratorio creado: ${result.records?.length || 0} registros`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('💥 [laboratorios] Error interno:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ACTIVOS_TABLE_IDS } from '@/lib/activos.fields';

const BASE_ID = ACTIVOS_TABLE_IDS.base;
const TABLE_ID = ACTIVOS_TABLE_IDS.tiposActivo;

export async function GET() {
  // Verificar configuración
  if (!BASE_ID || !TABLE_ID) {
    return NextResponse.json({
      error: 'Tabla de Tipos de Activo no configurada'
    }, { status: 400 });
  }

  try {
    const token = config.airtable.token;
    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado'
      }, { status: 500 });
    }

    // Obtener todos los tipos de activo activos
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=OR({Estado}='Activo',{Estado}=BLANK())`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error obteniendo tipos de activo:', data);
      return NextResponse.json({
        error: data?.error?.type || 'Error obteniendo tipos de activo',
        details: data
      }, { status: response.status });
    }

    // DEBUG: Retornar el primer registro raw para ver los campos
    if (data.records && data.records.length > 0) {
      const firstRecord = data.records[0];
      console.log('🔍 DEBUG - Primer registro completo:', JSON.stringify(firstRecord, null, 2));
      console.log('🔍 DEBUG - Campos disponibles:', Object.keys(firstRecord.fields));
    }

    // Transformar para respuesta más limpia - forzar valores primitivos
    const tipos = data.records.map((record: any) => {
      const fields = record.fields;

      // Extraer descripción del objeto wrapper si es necesario
      let descripcion = fields['Descripción'] || fields['Descripcion'] || '';
      if (typeof descripcion === 'object' && descripcion !== null && 'value' in descripcion) {
        descripcion = descripcion.value;
      }

      return {
        id: String(record.id),
        nombre: String(fields['Nombre Tipo'] || fields['Nombre'] || fields['Nombre del Tipo'] || fields['Name'] || ''),
        categoria: String(fields['Categoría'] || fields['Categoria'] || ''),
        descripcion: String(descripcion),
        requiereVencimiento: Boolean(fields['Requiere Vencimiento']),
        requiereMantenimiento: Boolean(fields['Requiere Mantenimiento Preventivo']),
        vidaUtil: fields['Vida Útil Estimada (años)'] ? Number(fields['Vida Útil Estimada (años)']) : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: tipos,
      total: tipos.length,
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API tipos-activo/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

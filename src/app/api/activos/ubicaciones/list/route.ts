import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ACTIVOS_TABLE_IDS } from '@/lib/activos.fields';

const BASE_ID = ACTIVOS_TABLE_IDS.base;
const TABLE_ID = ACTIVOS_TABLE_IDS.ubicaciones;

export async function GET() {
  // Verificar configuración
  if (!BASE_ID || !TABLE_ID) {
    return NextResponse.json({
      error: 'Tabla de Ubicaciones no configurada'
    }, { status: 400 });
  }

  try {
    const token = config.airtable.token;
    if (!token) {
      return NextResponse.json({
        error: 'Token de Airtable no configurado'
      }, { status: 500 });
    }

    // Obtener todas las ubicaciones activas
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=OR({Estado}='Activa',{Estado}=BLANK())`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error obteniendo ubicaciones:', data);
      return NextResponse.json({
        error: data?.error?.type || 'Error obteniendo ubicaciones',
        details: data
      }, { status: response.status });
    }

    // Transformar para respuesta más limpia - forzar valores primitivos
    const ubicaciones = data.records.map((record: any) => {
      const fields = record.fields;
      return {
        id: String(record.id),
        nombre: String(fields['Nombre Ubicación'] || fields['Nombre'] || fields['Name'] || ''),
        tipo: String(fields['Tipo Ubicación'] || fields['Tipo'] || ''),
        descripcion: String(fields['Descripción'] || fields['Descripcion'] || ''),
        area: String(fields['Área'] || fields['Area'] || ''),
        direccion: String(fields['Dirección'] || fields['Direccion'] || ''),
      };
    });

    return NextResponse.json({
      success: true,
      data: ubicaciones,
      total: ubicaciones.length,
    }, { status: 200 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Error en API ubicaciones/list:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

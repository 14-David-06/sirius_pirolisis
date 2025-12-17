import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

const AIRTABLE_TOKEN = config.airtable.token;
const AIRTABLE_BASE_ID = config.airtable.baseId;
const AIRTABLE_TURNOS_TABLE = config.airtable.turnosTableId;

export async function GET(request: NextRequest) {
  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TURNOS_TABLE) {
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    // Obtener parámetros de la URL
    const { searchParams } = new URL(request.url);
    const maxRecords = parseInt(searchParams.get('maxRecords') || '100');

    let allRecords: any[] = [];
    let offset: string | undefined = undefined;
    
    // Hacer solicitudes paginadas hasta obtener todos los registros
    do {
      let url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TURNOS_TABLE}?pageSize=100&sort%5B0%5D%5Bfield%5D=Fecha%20Creacion%20Registro&sort%5B0%5D%5Bdirection%5D=desc`;
      
      if (offset) {
        url += `&offset=${offset}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Error de Airtable:', data);
        return NextResponse.json(
          { error: data?.error || 'Error de Airtable', details: data },
          { status: response.status }
        );
      }

      // Agregar los registros de esta página
      if (data.records) {
        allRecords = allRecords.concat(data.records);
      }

      // Obtener el offset para la siguiente página
      offset = data.offset;

      console.log(`📄 Página cargada: ${data.records?.length || 0} registros. Total acumulado: ${allRecords.length}`);

      // Continuar si hay más páginas y no hemos alcanzado el límite
      if (!offset || allRecords.length >= maxRecords) {
        break;
      }

    } while (offset);

    // Limitar a maxRecords si se superó
    if (allRecords.length > maxRecords) {
      allRecords = allRecords.slice(0, maxRecords);
    }

    console.log(`✅ Total turnos obtenidos: ${allRecords.length}`);

    return NextResponse.json({ records: allRecords }, { status: 200 });
  } catch (err: any) {
    console.error('❌ Error en API turnos list:', err);
    return NextResponse.json(
      { error: String(err.message || err) },
      { status: 500 }
    );
  }
}
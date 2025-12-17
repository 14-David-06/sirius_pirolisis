import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

const AIRTABLE_TOKEN = config.airtable.token;
const AIRTABLE_BASE_ID = config.airtable.baseId;
const AIRTABLE_TURNOS_TABLE = config.airtable.turnosTableId || 'tblYr3dFToC8Fj6sH';

export async function GET() {
  try {
    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return NextResponse.json(
        { error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    // Obtener todos los turnos, ordenados por fecha de creación descendente
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TURNOS_TABLE}?sort%5B0%5D%5Bfield%5D=Fecha%20Creacion%20Registro&sort%5B0%5D%5Bdirection%5D=desc`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error de Airtable:', data);
      return NextResponse.json(
        { error: data?.error || 'Error de Airtable', details: data },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('❌ Error en API turnos list:', err);
    return NextResponse.json(
      { error: String(err.message || err) },
      { status: 500 }
    );
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID del bache es requerido' },
        { status: 400 }
      );
    }

    // Verificar variables de entorno requeridas
    if (!config.airtable.token || !config.airtable.baseId || !config.airtable.bachesTableId) {
      console.error('Variables de entorno de Airtable faltantes');
      return NextResponse.json(
        { error: 'Configuración del servidor incompleta' },
        { status: 500 }
      );
    }

    // Obtener el bache específico de Airtable
    const airtableResponse = await fetch(
      `https://api.airtable.com/v0/${config.airtable.baseId}/${config.airtable.bachesTableId}/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!airtableResponse.ok) {
      if (airtableResponse.status === 404) {
        return NextResponse.json(
          { error: 'Bache no encontrado' },
          { status: 404 }
        );
      }
      
      throw new Error(`Error de Airtable: ${airtableResponse.status}`);
    }

    const bache = await airtableResponse.json();

    // Agregar headers para cache corto (datos en tiempo real)
    return NextResponse.json(bache, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('Error fetching bache:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

const PAQUETES_TABLE_ID = config.airtable.paquetesLonasTableId;

export async function GET() {
  try {
    if (!PAQUETES_TABLE_ID || !config.airtable.token || !config.airtable.baseId) {
      return NextResponse.json({
        success: false,
        error: 'Configuración de paquetes de lonas no disponible',
      }, { status: 500 });
    }

    const url = new URL(`https://api.airtable.com/v0/${config.airtable.baseId}/${PAQUETES_TABLE_ID}`);
    url.searchParams.set('filterByFormula', `{Estado} = 'activo'`);
    url.searchParams.set('maxRecords', '1');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${config.airtable.token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Error consultando paquete activo:', errText);
      return NextResponse.json({
        success: false,
        error: 'Error consultando Airtable',
      }, { status: response.status });
    }

    const data = await response.json();
    const paquete = data.records?.[0];

    if (!paquete) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No hay paquete de lonas activo',
      });
    }

    const fechaActivacion = paquete.fields['Fecha Activacion'] as string;
    const cantidadLonas = (paquete.fields['Cantidad Lonas'] as number) || 0;
    const balancesVinculados = (paquete.fields['Balances Masa'] as string[]) || [];

    const diasEnUso = Math.floor(
      (Date.now() - new Date(fechaActivacion).getTime()) / (1000 * 60 * 60 * 24)
    );

    return NextResponse.json({
      success: true,
      data: {
        paquete_id: paquete.id,
        fecha_activacion: fechaActivacion,
        cantidad_lonas: cantidadLonas,
        dias_en_uso: diasEnUso,
        total_balances_vinculados: balancesVinculados.length,
      },
    });
  } catch (err) {
    console.error('❌ Error en GET /api/inventario/lonas/paquete-activo:', err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Error interno',
    }, { status: 500 });
  }
}

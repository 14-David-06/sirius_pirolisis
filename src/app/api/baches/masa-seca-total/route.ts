import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

const TABLE_ID = config.airtable.bachesTableId;
const MASA_SECA_FIELD = 'Masa Seca (DM kg) (from Monitoreo Baches)';
const FECHA_FIELD = 'Fecha Creacion';

export async function POST(request: NextRequest) {
  try {
    const { fecha_inicio, fecha_fin } = await request.json();

    if (!fecha_inicio || !fecha_fin) {
      return NextResponse.json({ error: 'fecha_inicio y fecha_fin son requeridos' }, { status: 400 });
    }

    if (!config.airtable.token || !config.airtable.baseId || !TABLE_ID) {
      return NextResponse.json({ error: 'Configuración de Airtable incompleta' }, { status: 500 });
    }

    // Incluye fecha_inicio y fecha_fin (ambos inclusive)
    const formula = `AND(NOT(IS_BEFORE({${FECHA_FIELD}}, '${fecha_inicio}')), NOT(IS_AFTER({${FECHA_FIELD}}, '${fecha_fin}')))`;

    let masaSecaKg = 0;
    let bachesCount = 0;
    let offset: string | undefined;

    do {
      let url = `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`;
      url += `?filterByFormula=${encodeURIComponent(formula)}`;
      url += `&fields[]=${encodeURIComponent(MASA_SECA_FIELD)}`;
      if (offset) url += `&offset=${encodeURIComponent(offset)}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.airtable.token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || `Airtable error: ${response.status}`);
      }

      for (const record of data.records ?? []) {
        const masaSeca = record.fields[MASA_SECA_FIELD];
        if (Array.isArray(masaSeca)) {
          masaSecaKg += masaSeca.reduce((sum: number, v: unknown) => sum + (Number(v) || 0), 0);
        } else if (typeof masaSeca === 'number') {
          masaSecaKg += masaSeca;
        }
        bachesCount++;
      }

      offset = data.offset;
    } while (offset);

    return NextResponse.json({
      success: true,
      masaSecaKg,
      masaSecaTon: masaSecaKg / 1000,
      bachesCount,
      fecha_inicio,
      fecha_fin,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

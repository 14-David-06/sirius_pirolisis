import { NextRequest, NextResponse } from 'next/server';
import { config } from '../../../../lib/config';

const TABLE_ID = config.airtable.blendRemisionesTableId;
const KG_BIOCHAR_PURO_FIELD = 'KG Biochar Puro';
const FECHA_FIELD = 'Fecha Evento';

// Returns biochar seco (kg) from blend_remisiones in the given date range.
// KG Biochar Puro is already 20% of total blend kg — used as MRV denominator.
export async function POST(request: NextRequest) {
  try {
    const { fecha_inicio, fecha_fin } = await request.json();

    if (!fecha_inicio || !fecha_fin) {
      return NextResponse.json({ error: 'fecha_inicio y fecha_fin son requeridos' }, { status: 400 });
    }

    if (!config.airtable.token || !config.airtable.baseId || !TABLE_ID) {
      return NextResponse.json({ error: 'Configuración de Airtable incompleta' }, { status: 500 });
    }

    const formula = [
      `NOT(IS_BEFORE({${FECHA_FIELD}}, '${fecha_inicio}'))`,
      `NOT(IS_AFTER({${FECHA_FIELD}}, '${fecha_fin}'))`,
    ].join(', ');

    let biocharSecoKg = 0;
    let bachesCount = 0;
    let offset: string | undefined;

    do {
      let url = `https://api.airtable.com/v0/${config.airtable.baseId}/${TABLE_ID}`;
      url += `?filterByFormula=${encodeURIComponent(`AND(${formula})`)}`;
      url += `&fields[]=${encodeURIComponent(KG_BIOCHAR_PURO_FIELD)}`;
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
        const kgBiocharPuro = record.fields[KG_BIOCHAR_PURO_FIELD];
        if (typeof kgBiocharPuro === 'number') {
          biocharSecoKg += kgBiocharPuro;
        }
        bachesCount++;
      }

      offset = data.offset;
    } while (offset);

    return NextResponse.json({
      success: true,
      biocharSecoKg,
      biocharSecoTon: biocharSecoKg / 1000,
      bachesCount,
      fecha_inicio,
      fecha_fin,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

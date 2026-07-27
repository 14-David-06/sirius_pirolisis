import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { ACTIVOS_TABLE_IDS } from '@/lib/activos.fields';

export async function GET() {
  const BASE_ID = ACTIVOS_TABLE_IDS.base;
  const TABLE_ID = ACTIVOS_TABLE_IDS.tiposActivo;

  try {
    const token = config.airtable.token;
    const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?maxRecords=1`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.records && data.records.length > 0) {
      const record = data.records[0];
      return NextResponse.json({
        recordId: record.id,
        availableFields: Object.keys(record.fields),
        rawFields: record.fields,
      }, { status: 200 });
    }

    return NextResponse.json({ error: 'No records found' }, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

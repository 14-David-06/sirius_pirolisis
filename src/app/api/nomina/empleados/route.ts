import { NextResponse } from 'next/server';
import { config } from '@/lib/config';

const BASE = config.airtable.novedadesNominaBaseId;
const TOKEN = config.airtable.novedadesNominaToken;
const TABLE = config.airtable.novedadesNominaSiriusTable;

export async function GET() {
  try {
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?pageSize=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[nomina/empleados] Airtable error:', err);
      return NextResponse.json({ error: 'Error al obtener empleados' }, { status: 500 });
    }

    const data = await res.json();

    const empleados = (data.records ?? []).map((r: any) => ({
      id: r.id,
      nombre: r.fields['Nombre'] ?? '',
      cedula: r.fields['Cedula'] ?? 0,
      cargo: r.fields['Cargo'] ?? '',
      area: r.fields['Area'] ?? '',
      salarioMensual: r.fields['Salario Mensual'] ?? 0,
      valorHora: r.fields['Valor Hora Trabajo'] ?? 0,
      horasDia: r.fields['Total Horas Trabajo Dia'] ?? 7.67,
      auxilioDia: r.fields['Auxilio Transporte Dia'] ?? 0,
    }));

    return NextResponse.json({ empleados });
  } catch (e) {
    console.error('[nomina/empleados]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

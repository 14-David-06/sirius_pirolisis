import { NextRequest, NextResponse } from 'next/server';
import { esRecordId } from '@/lib/airtable-escape';
import { PESO_BIOCHAR_LONA_KG, resolverTurnoAbierto } from '@/lib/balance-desde-registro';

/**
 * GET /api/balance-masa/conteo-turno[?turnoId=recXXX] — lonas registradas en el turno.
 *
 * Sin `turnoId` resuelve el turno abierto en el servidor. Es el modo normal: el
 * `turnoActivo` del localStorage no es una fuente confiable —`TurnoProtection` lo
 * borra cuando no hay turno abierto y no lo escribe cuando el turno es de otro
 * operador—, así que una pantalla que dependa de él se queda sin datos justo cuando
 * más se notan.
 *
 * Cuenta el link `Balances Masa` del turno en vez de filtrar la tabla de balances:
 * en una `filterByFormula` un campo link se evalúa como el texto del campo primario
 * del registro vinculado, no como su record ID, así que `FIND(recXXX, ARRAYJOIN(...))`
 * no encuentra nada. Leer el turno es además una sola petición en vez de un barrido.
 */

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_GLOBAL_TOKEN;
const AIRTABLE_TURNOS_TABLE = process.env.AIRTABLE_TURNOS_TABLE_ID || 'Turno Pirolisis';

export async function GET(request: NextRequest) {
  try {
    const solicitado = new URL(request.url).searchParams.get('turnoId');

    if (solicitado && !esRecordId(solicitado)) {
      return NextResponse.json(
        { success: false, error: 'turnoId debe ser un record ID de Airtable' },
        { status: 400 }
      );
    }

    if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Configuración de Airtable incompleta' },
        { status: 500 }
      );
    }

    const turnoId = solicitado ?? (await resolverTurnoAbierto())?.id ?? null;

    // Sin turno abierto no es un error: la planta puede estar entre turnos. Se
    // responde 200 con `hayTurno: false` para que la UI lo diga, en vez de mostrar
    // un fallo que el operador no puede resolver.
    if (!turnoId) {
      return NextResponse.json({
        success: true,
        hayTurno: false,
        lonas: 0,
        kgBiochar: 0,
        operador: null,
        fechaInicioTurno: null,
        turnoCerrado: false,
      });
    }

    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TURNOS_TABLE)}/${turnoId}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ success: false, error: 'Turno no encontrado' }, { status: 404 });
      }
      return NextResponse.json(
        { success: false, error: `Error de Airtable: ${res.status}` },
        { status: res.status }
      );
    }

    const turno = await res.json();
    const balances: unknown = turno.fields?.['Balances Masa'];
    const lonas = Array.isArray(balances) ? balances.length : 0;

    return NextResponse.json({
      success: true,
      hayTurno: true,
      turnoId,
      lonas,
      kgBiochar: lonas * PESO_BIOCHAR_LONA_KG,
      operador: turno.fields?.Operador ?? null,
      fechaInicioTurno: turno.fields?.['Fecha Inicio Turno'] ?? null,
      turnoCerrado: Boolean(turno.fields?.['Fecha Fin Turno']),
    });
  } catch (error) {
    console.error('❌ Error en GET /api/balance-masa/conteo-turno:', error);
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}

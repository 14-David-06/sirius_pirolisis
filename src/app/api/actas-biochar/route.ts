import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { crearActaEntrega } from '@/lib/actas-biochar';
import { ACTA_FIELDS, CATEGORIAS_USO, TIPO_BIOCHAR, esTipoBiochar } from '@/lib/actas-biochar.constants';
import type { BacheEntregado } from '@/lib/actas-biochar';

/**
 * Actas de Entrega de Biochar — entregas SIN contraprestación comercial.
 *
 * GET  → últimas actas registradas (para la tabla de la pantalla).
 * POST → crea el acta y descuenta el inventario. Ver `src/lib/actas-biochar.ts`.
 *
 * Esto NO genera remisión ni pedido: no es facturable. El descuento va al libro
 * mayor que corresponda según el tipo (Insumos Core por bache para el puro,
 * Inventario Production Core para el blend), con el código del acta como llave de
 * idempotencia.
 *
 * Respuestas del POST:
 *   200 — acta creada e inventario descontado
 *   207 — acta creada pero algún paso de trazabilidad falló (queda en Borrador si
 *         el que falló fue el descuento; reintentar es seguro)
 *   400 — body inválido
 *   409 — no hay stock suficiente
 *   500 — configuración incompleta u error inesperado
 */

const AT = 'https://api.airtable.com/v0';

export async function GET() {
  const { token, baseId, actasBiocharTableId } = config.airtable;
  if (!token || !baseId || !actasBiocharTableId) {
    return NextResponse.json(
      { success: false, error: 'Falta AIRTABLE_ACTAS_BIOCHAR_TABLE_ID' },
      { status: 500 }
    );
  }

  try {
    const url = new URL(`${AT}/${baseId}/${actasBiocharTableId}`);
    url.searchParams.set('pageSize', '50');
    url.searchParams.set('sort[0][field]', ACTA_FIELDS.idActa);
    url.searchParams.set('sort[0][direction]', 'desc');

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, error: JSON.stringify(data) }, { status: res.status });
    }

    const actas = (data.records ?? []).map((rec: { id: string; fields: Record<string, unknown> }) => ({
      id: rec.id,
      codigo: rec.fields[ACTA_FIELDS.idActa] ?? '',
      fecha: rec.fields[ACTA_FIELDS.fechaEntrega] ?? '',
      estado: rec.fields[ACTA_FIELDS.estado] ?? '',
      tipoBiochar: rec.fields[ACTA_FIELDS.tipoBiochar] ?? '',
      lote: rec.fields[ACTA_FIELDS.loteEntregado] ?? '',
      kgSeca: rec.fields[ACTA_FIELDS.cantidadSeca] ?? 0,
      proyecto: rec.fields[ACTA_FIELDS.nombreProyecto] ?? '',
      co2: rec.fields[ACTA_FIELDS.co2] ?? 0,
      urlDocumento: rec.fields[ACTA_FIELDS.urlDocumentoActa] ?? '',
    }));

    return NextResponse.json({ success: true, actas });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 });
  }

  const b = body as Record<string, any>;

  if (!esTipoBiochar(b.tipoBiochar)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Tipo de biochar inválido',
        details: `Debe ser "${TIPO_BIOCHAR.puro}" o "${TIPO_BIOCHAR.blend}".`,
      },
      { status: 400 }
    );
  }
  if (!CATEGORIAS_USO.includes(b.categoriaUso)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Categoría de uso previsto inválida',
        details: `Debe ser una de: ${CATEGORIAS_USO.join(' | ')}`,
      },
      { status: 400 }
    );
  }
  for (const [campo, etiqueta] of [
    ['nombreProyecto', 'nombre del proyecto o ensayo'],
    ['ubicacionAplicacion', 'ubicación de la aplicación'],
  ] as const) {
    if (!String(b[campo] ?? '').trim()) {
      return NextResponse.json(
        { success: false, error: `Falta el ${etiqueta}: el acta lo exige para declarar el uso previsto.` },
        { status: 400 }
      );
    }
  }
  if (!b.receptor || typeof b.receptor !== 'object') {
    return NextResponse.json({ success: false, error: 'Falta la identificación del receptor' }, { status: 400 });
  }

  const baches: BacheEntregado[] = Array.isArray(b.baches)
    ? b.baches
        .map((x: any) => ({ bache: String(x?.bache ?? x?.id ?? ''), kg: Number(x?.kg ?? 0) }))
        .filter((x: BacheEntregado) => x.bache && x.kg > 0)
    : [];

  try {
    const resultado = await crearActaEntrega({
      tipoBiochar: b.tipoBiochar,
      baches,
      lote: b.lote,
      kg: b.kg,
      humedadPct: b.humedadPct,
      receptor: b.receptor,
      nombreProyecto: String(b.nombreProyecto).trim(),
      ubicacionAplicacion: String(b.ubicacionAplicacion).trim(),
      coordenadasGps: b.coordenadasGps,
      categoriaUso: b.categoriaUso,
      categoriaUsoOtro: b.categoriaUsoOtro,
      fechaEstimadaAplicacion: b.fechaEstimadaAplicacion,
      duracionEnsayo: b.duracionEnsayo,
      fechaEntrega: b.fechaEntrega,
      elaboradoPor: String(b.elaboradoPor ?? '').trim() || 'Sistema',
      cargoElaboradoPor: b.cargoElaboradoPor,
      idResponsableCore: b.idResponsableCore,
      observaciones: b.observaciones,
      fotos: Array.isArray(b.fotos) ? b.fotos.filter((u: unknown) => typeof u === 'string') : [],
      origenUrl: new URL(request.url).origin,
      dryRun: b.dryRun === true,
    });

    const fallidos = resultado.steps.filter((paso) => !paso.ok);

    // La humedad se muestra porque no se digita: la trae el monitoreo del bache, y
    // el operador debe poder verla antes de que quede impresa en el acta.
    const humedad = resultado.cantidad.humedadPct
      ? ` Humedad del lote: ${resultado.cantidad.humedadPct}% (del monitoreo).`
      : ' El lote no tiene humedad monitoreada.';

    const mensaje = resultado.dryRun
      ? `Ensayo del acta ${resultado.codigoActa}: se descontarían ${resultado.cantidad.kg} kg de ${resultado.loteEntregado}.${humedad} No se escribió nada.`
      : resultado.ok
        ? `Acta ${resultado.codigoActa} generada: ${resultado.cantidad.kg} kg de ${resultado.loteEntregado} entregados a ${resultado.receptor.nombre}.${humedad}`
        : `El acta ${resultado.codigoActa} quedó en Borrador: el descuento de inventario falló. Reintentar es seguro.`;

    return NextResponse.json(
      { success: resultado.ok, message: mensaje, ...resultado },
      { status: fallidos.length ? 207 : 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ [actas-biochar] Error:', message);

    // Errores de validación del servicio: son del cliente, no del servidor.
    const status = /Solo hay|solo tiene|no tiene biochar/.test(message)
      ? 409
      : /No existe|No se encontró|Selecciona|Indica|necesita/.test(message)
        ? 400
        : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

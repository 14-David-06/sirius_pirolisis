// POST /api/carbon/total/dashboard
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Container } from '../../../../../infrastructure/container';

export const dynamic = 'force-dynamic';

const schema = z.object({
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
});

type StageKey = 'eBiomas' | 'epirolisis' | 'etransporte' | 'euse';

interface MonthBucket {
  key: string;
  label: string;
  fecha_inicio: string;
  fecha_fin: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function buildMonthBuckets(start: string, end: string): MonthBucket[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const buckets: MonthBucket[] = [];
  let year = sy, month = sm;
  while (year < ey || (year === ey && month <= em)) {
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay  = new Date(Date.UTC(year, month, 0));
    buckets.push({
      key: `${year}-${pad(month)}`,
      label: firstDay.toLocaleDateString('es-CO', {
        month: 'short', year: 'numeric', timeZone: 'UTC',
      }),
      fecha_inicio: toIso(firstDay),
      fecha_fin:    toIso(lastDay),
    });
    month++;
    if (month > 12) { month = 1; year++; }
  }
  return buckets;
}

async function computeMonth(bucket: MonthBucket) {
  const safe = <T>(p: Promise<T>) => p.catch(() => null);
  const [resBiomas, resPiro, resTransp, resUse] = await Promise.all([
    safe(Container.getPrevieweBiomasUseCase().ejecutar(bucket.fecha_inicio, bucket.fecha_fin, null)),
    safe(Container.getPreviewEPirolisisUseCase().ejecutar(bucket.fecha_inicio, bucket.fecha_fin, null)),
    safe(Container.getPreviewETransporteUseCase().ejecutar(bucket.fecha_inicio, bucket.fecha_fin)),
    safe(Container.getPreviewEUseUseCase().ejecutar(bucket.fecha_inicio, bucket.fecha_fin)),
  ]);
  return {
    month:              bucket.key,
    label:              bucket.label,
    fecha_inicio:       bucket.fecha_inicio,
    fecha_fin:          bucket.fecha_fin,
    eBiomas:            resBiomas?.emisiones_total_ton ?? 0,
    epirolisis:         resPiro?.emisiones_total_ton ?? 0,
    etransporte:        resTransp?.emisiones_total_ton ?? 0,
    etransporte_baches: resTransp?.total_baches ?? 0,
    euse:               resUse?.resumen?.emisiones_total_ton ?? 0,
    has_data: Boolean(
      (resBiomas  && (resBiomas.total_viajes ?? 0)        > 0) ||
      (resPiro    && (resPiro.turnos_analizados ?? 0)      > 0) ||
      (resTransp  && (resTransp.total_baches ?? 0)         > 0) ||
      (resUse     && (resUse.remisiones_analizadas ?? 0)   > 0)
    ),
  };
}

export async function POST(request: NextRequest) {
  let bodyRaw: unknown;
  try { bodyRaw = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = schema.safeParse(bodyRaw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { fecha_inicio, fecha_fin } = parsed.data;
  if (new Date(fecha_inicio) > new Date(fecha_fin)) {
    return NextResponse.json(
      { error: 'Fecha inicio debe ser anterior a fecha fin' },
      { status: 400 }
    );
  }

  const buckets = buildMonthBuckets(fecha_inicio, fecha_fin);
  if (buckets.length > 36) {
    return NextResponse.json(
      { error: 'Rango demasiado amplio (máx. 36 meses)' },
      { status: 400 }
    );
  }

  try {
    const monthly = await Promise.all(buckets.map(computeMonth));

    const totals: Record<StageKey, number> = {
      eBiomas: 0, epirolisis: 0, etransporte: 0, euse: 0,
    };
    for (const m of monthly) {
      totals.eBiomas     += m.eBiomas;
      totals.epirolisis  += m.epirolisis;
      totals.etransporte += m.etransporte;
      totals.euse        += m.euse;
    }

    // Recalculate transport over the full period to avoid floor(baches/10) accumulation error
    const resTranspFull = await Container.getPreviewETransporteUseCase()
      .ejecutar(fecha_inicio, fecha_fin).catch(() => null);
    if (resTranspFull) totals.etransporte = resTranspFull.emisiones_total_ton;

    const total_ton = totals.eBiomas + totals.epirolisis + totals.etransporte + totals.euse;

    return NextResponse.json({
      success: true,
      data: {
        range:        { fecha_inicio, fecha_fin },
        months_count: buckets.length,
        monthly,
        totals:       { ...totals, total_ton },
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

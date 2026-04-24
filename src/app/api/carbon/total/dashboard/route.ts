// POST /api/carbon/total/dashboard
// Dashboard consolidado de Carbono Total — calcula EN VIVO los 4 stages
// (eBiomas, ePirólisis, eTransporte, eUse) usando los Preview Use Cases reales,
// segmentado mes a mes en el rango solicitado. NO persiste resultados.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Container } from '../../../../../infrastructure/container';
import { handleApiError } from '../../../../../middleware/error-handler';

const schema = z.object({
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
});

type StageKey = 'ebiomas' | 'epirolisis' | 'etransporte' | 'euse';

interface MonthBucket {
  key: string;            // YYYY-MM
  label: string;          // localized
  fecha_inicio: string;   // YYYY-MM-DD
  fecha_fin: string;      // YYYY-MM-DD
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function buildMonthBuckets(start: string, end: string): MonthBucket[] {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);

  const buckets: MonthBucket[] = [];
  let year = sy;
  let month = sm; // 1-12

  while (year < ey || (year === ey && month <= em)) {
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0));
    const key = `${year}-${pad(month)}`;
    const label = firstDay.toLocaleDateString('es-CO', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    buckets.push({
      key,
      label,
      fecha_inicio: toIso(firstDay),
      fecha_fin: toIso(lastDay),
    });

    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }

  return buckets;
}

async function computeMonth(bucket: MonthBucket) {
  const ebiomas = Container.getPreviewEBiomasUseCase();
  const epirolisis = Container.getPreviewEPirolisisUseCase();
  const etransporte = Container.getPreviewETransporteUseCase();
  const euse = Container.getPreviewEUseUseCase();

  const safe = async <T>(p: Promise<T>): Promise<T | null> => {
    try { return await p; } catch { return null; }
  };

  const [resBiomas, resPiro, resTransp, resUse] = await Promise.all([
    safe(ebiomas.ejecutar(bucket.fecha_inicio, bucket.fecha_fin, null)),
    safe(epirolisis.ejecutar(bucket.fecha_inicio, bucket.fecha_fin, null)),
    safe(etransporte.ejecutar(bucket.fecha_inicio, bucket.fecha_fin)),
    safe(euse.ejecutar(bucket.fecha_inicio, bucket.fecha_fin)),
  ]);

  const tonBiomas = resBiomas?.emisiones_total_ton ?? 0;
  const tonPiro = resPiro?.emisiones_total_ton ?? 0;
  const tonTransp = resTransp?.emisiones_total_ton ?? 0;
  const tonUse = (resUse?.resumen?.emisiones_total_ton) ?? 0;

  return {
    month: bucket.key,
    label: bucket.label,
    fecha_inicio: bucket.fecha_inicio,
    fecha_fin: bucket.fecha_fin,
    ebiomas: tonBiomas,
    epirolisis: tonPiro,
    etransporte: tonTransp,
    euse: tonUse,
    has_data: Boolean(
      (resBiomas && (resBiomas.total_viajes ?? 0) > 0) ||
      (resPiro && (resPiro.turnos_analizados ?? 0) > 0) ||
      (resTransp && (resTransp.total_baches ?? 0) > 0) ||
      (resUse && (resUse.remisiones_analizadas ?? 0) > 0)
    ),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = schema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Datos de entrada inválidos',
        details: validation.error.issues,
      }, { status: 400 });
    }

    const { fecha_inicio, fecha_fin } = validation.data;

    if (new Date(fecha_inicio) > new Date(fecha_fin)) {
      return NextResponse.json({
        success: false,
        error: 'La fecha de inicio debe ser anterior o igual a la fecha de fin',
      }, { status: 400 });
    }

    const buckets = buildMonthBuckets(fecha_inicio, fecha_fin);

    // Limit safeguard — 36 months max
    if (buckets.length > 36) {
      return NextResponse.json({
        success: false,
        error: 'Rango demasiado amplio (máx. 36 meses)',
      }, { status: 400 });
    }

    // Serialize month-by-month to evitar rate-limit de Airtable (5 req/s por base).
    // Cada mes ya hace 4 requests internos en paralelo; encadenar meses con un
    // pequeño delay mantiene el throughput bajo el límite.
    const monthly: Awaited<ReturnType<typeof computeMonth>>[] = [];
    for (let i = 0; i < buckets.length; i++) {
      monthly.push(await computeMonth(buckets[i]));
      if (i < buckets.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    const totals: Record<StageKey, number> = {
      ebiomas: 0, epirolisis: 0, etransporte: 0, euse: 0,
    };
    for (const m of monthly) {
      totals.ebiomas += m.ebiomas;
      totals.epirolisis += m.epirolisis;
      totals.etransporte += m.etransporte;
      totals.euse += m.euse;
    }
    const total_ton = totals.ebiomas + totals.epirolisis + totals.etransporte + totals.euse;

    return NextResponse.json({
      success: true,
      data: {
        range: { fecha_inicio, fecha_fin },
        months_count: buckets.length,
        monthly,
        totals: {
          ...totals,
          total_ton,
        },
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'POST /api/carbon/total/dashboard');
  }
}

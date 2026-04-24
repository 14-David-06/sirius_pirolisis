"use client";

import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

export type CarbonStageKey = 'ebiomas' | 'epirolisis' | 'euse' | 'etransporte';
export type CarbonPeriodPreset = 'all' | '3m' | '6m' | '1y' | 'custom';

export interface CarbonStageConfig {
  key: CarbonStageKey;
  label: string;
  color: string;
}

export interface CarbonSummaryCard {
  key: CarbonStageKey;
  label: string;
  color: string;
  totalTon: number;
  percentage: number;
  enabled: boolean;
}

export interface CarbonMonthlyPoint {
  month: string;
  label: string;
  ebiomas: number;
  epirolisis: number;
  euse: number;
  etransporte: number;
}

export interface CarbonDonutPoint {
  key: CarbonStageKey;
  name: string;
  value: number;
  color: string;
}

const STAGES: CarbonStageConfig[] = [
  { key: 'ebiomas', label: 'eBiomas', color: '#3B6D11' },
  { key: 'epirolisis', label: 'ePirólisis', color: '#854F0B' },
  { key: 'euse', label: 'eUse', color: '#185FA5' },
  { key: 'etransporte', label: 'eTransporte', color: '#533AB7' },
];

const monthlyPointSchema = z.object({
  month: z.string(),
  label: z.string(),
  fecha_inicio: z.string(),
  fecha_fin: z.string(),
  ebiomas: z.coerce.number(),
  epirolisis: z.coerce.number(),
  etransporte: z.coerce.number(),
  euse: z.coerce.number(),
  has_data: z.boolean().optional(),
});

const dashboardSchema = z.object({
  success: z.boolean(),
  data: z.object({
    range: z.object({ fecha_inicio: z.string(), fecha_fin: z.string() }),
    months_count: z.number(),
    monthly: z.array(monthlyPointSchema),
    totals: z.object({
      ebiomas: z.coerce.number(),
      epirolisis: z.coerce.number(),
      etransporte: z.coerce.number(),
      euse: z.coerce.number(),
      total_ton: z.coerce.number(),
    }),
    generated_at: z.string(),
  }),
});

type DashboardData = z.infer<typeof dashboardSchema>['data'];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1);

function buildRangeFromPreset(preset: CarbonPeriodPreset, customMonth: string): { start: Date; end: Date } {
  const now = new Date();

  if (preset === 'custom' && /^\d{4}-\d{2}$/.test(customMonth)) {
    const [year, month] = customMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    return { start, end: endOfMonth(start) };
  }

  const end = endOfMonth(now);
  const monthsBackMap: Record<Exclude<CarbonPeriodPreset, 'custom'>, number> = {
    all: 24,
    '3m': 3,
    '6m': 6,
    '1y': 12,
  };

  const key: Exclude<CarbonPeriodPreset, 'custom'> =
    preset === 'custom' ? '1y' : preset;
  const months = monthsBackMap[key];
  const start = addMonths(startOfMonth(now), -(months - 1));
  return { start, end };
}

const formatRangeLabel = (start: Date, end: Date) => {
  const startLabel = start.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
  const endLabel = end.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
  return `${startLabel} - ${endLabel}`;
};

export interface UseCarbonoTotalResult {
  loading: boolean;
  error: string | null;
  statusLabel: 'Calculando...' | 'Actualizado';
  stageConfigs: CarbonStageConfig[];
  periodPreset: CarbonPeriodPreset;
  setPeriodPreset: (value: CarbonPeriodPreset) => void;
  customMonth: string;
  setCustomMonth: (value: string) => void;
  enabledStages: Record<CarbonStageKey, boolean>;
  toggleStage: (stage: CarbonStageKey) => void;
  totalTon: number;
  dateRangeLabel: string;
  summaryCards: CarbonSummaryCard[];
  monthlySeries: CarbonMonthlyPoint[];
  donutData: CarbonDonutPoint[];
  periodsCount: number;
  lastUpdatedLabel: string;
  filterSignature: string;
  refresh: () => void;
}

export function useCarbonoTotal(): UseCarbonoTotalResult {
  const [periodPreset, setPeriodPreset] = useState<CarbonPeriodPreset>('1y');
  const [customMonth, setCustomMonth] = useState('');
  const [enabledStages, setEnabledStages] = useState<Record<CarbonStageKey, boolean>>({
    ebiomas: true,
    epirolisis: true,
    euse: true,
    etransporte: true,
  });

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const range = buildRangeFromPreset(periodPreset, customMonth);
    return { rangeStart: range.start, rangeEnd: range.end };
  }, [periodPreset, customMonth]);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/carbon/total/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
          body: JSON.stringify({
            fecha_inicio: toIso(rangeStart),
            fecha_fin: toIso(rangeEnd),
          }),
        });

        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error || `HTTP ${response.status}`);
        }

        const parsed = dashboardSchema.safeParse(json);
        if (!parsed.success || !parsed.data.success) {
          throw new Error('Respuesta inválida del servidor.');
        }

        setData(parsed.data.data);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        const text = err instanceof Error ? err.message : 'No fue posible cargar el consolidado de carbono.';
        setError(text);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [rangeStart, rangeEnd, reloadKey]);

  const totalsByStage = useMemo<Record<CarbonStageKey, number>>(() => {
    if (!data) return { ebiomas: 0, epirolisis: 0, euse: 0, etransporte: 0 };
    return {
      ebiomas: data.totals.ebiomas,
      epirolisis: data.totals.epirolisis,
      euse: data.totals.euse,
      etransporte: data.totals.etransporte,
    };
  }, [data]);

  const allStagesTon = useMemo(() => (
    STAGES.reduce((acc, stage) => acc + totalsByStage[stage.key], 0)
  ), [totalsByStage]);

  const totalEnabledTon = useMemo(() => (
    STAGES.reduce((acc, stage) => acc + (enabledStages[stage.key] ? totalsByStage[stage.key] : 0), 0)
  ), [enabledStages, totalsByStage]);

  const summaryCards = useMemo<CarbonSummaryCard[]>(() => (
    STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      color: stage.color,
      totalTon: totalsByStage[stage.key],
      percentage: allStagesTon > 0 ? (totalsByStage[stage.key] / allStagesTon) * 100 : 0,
      enabled: enabledStages[stage.key],
    }))
  ), [totalsByStage, allStagesTon, enabledStages]);

  const monthlySeries = useMemo<CarbonMonthlyPoint[]>(() => {
    if (!data) return [];
    return data.monthly.map((m) => ({
      month: m.month,
      label: m.label,
      ebiomas: enabledStages.ebiomas ? m.ebiomas : 0,
      epirolisis: enabledStages.epirolisis ? m.epirolisis : 0,
      euse: enabledStages.euse ? m.euse : 0,
      etransporte: enabledStages.etransporte ? m.etransporte : 0,
    }));
  }, [data, enabledStages]);

  const donutData = useMemo<CarbonDonutPoint[]>(() => (
    STAGES
      .filter((stage) => enabledStages[stage.key])
      .map((stage) => ({
        key: stage.key,
        name: stage.label,
        value: totalsByStage[stage.key],
        color: stage.color,
      }))
      .filter((item) => item.value > 0)
  ), [enabledStages, totalsByStage]);

  const lastUpdatedLabel = useMemo(() => {
    if (!data) return 'Sin datos';
    const d = new Date(data.generated_at);
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [data]);

  const toggleStage = (stage: CarbonStageKey) => {
    setEnabledStages((prev) => ({ ...prev, [stage]: !prev[stage] }));
  };

  const filterSignature = `${periodPreset}|${customMonth}|${Object.values(enabledStages).join('-')}`;

  return {
    loading,
    error,
    statusLabel: loading ? 'Calculando...' : 'Actualizado',
    stageConfigs: STAGES,
    periodPreset,
    setPeriodPreset,
    customMonth,
    setCustomMonth,
    enabledStages,
    toggleStage,
    totalTon: totalEnabledTon,
    dateRangeLabel: formatRangeLabel(rangeStart, rangeEnd),
    summaryCards,
    monthlySeries,
    donutData,
    periodsCount: monthlySeries.length,
    lastUpdatedLabel,
    filterSignature,
    refresh: () => setReloadKey((k) => k + 1),
  };
}

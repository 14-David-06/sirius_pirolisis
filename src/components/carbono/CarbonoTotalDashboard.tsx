"use client";

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform, type Variants } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CarbonPeriodPreset,
  CarbonStageConfig,
  CarbonStageKey,
  CarbonSummaryCard,
  CarbonMonthlyPoint,
  CarbonDonutPoint,
} from '../../hooks/useCarbonoTotal';

interface CarbonoTotalDashboardProps {
  loading: boolean;
  error: string | null;
  statusLabel: 'Calculando...' | 'Actualizado';
  stageConfigs: CarbonStageConfig[];
  periodPreset: CarbonPeriodPreset;
  setPeriodPreset: (value: CarbonPeriodPreset) => void;
  customMonthStart: string;
  setCustomMonthStart: (value: string) => void;
  customMonthEnd: string;
  setCustomMonthEnd: (value: string) => void;
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
  masaSecaTon: number;
  masaSecaBaches: number;
  huellaIntensidad: number | null;
  biocharAplicadoTon: number;
  biocharAplicadoBaches: number;
}

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut', delay: 0 },
  },
};

const cardContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const cardItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: 'easeOut' },
  },
};

const periodOptions: { key: CarbonPeriodPreset; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '1y', label: '1 año' },
  { key: 'custom', label: 'Rango personalizado (mes)' },
];

function formatTon(value: number, maxDigits = 3) {
  return value.toLocaleString('es-CO', {
    maximumFractionDigits: maxDigits,
  });
}

function AnimatedCount({ value, className, suffix }: { value: number; className?: string; suffix?: string }) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) => Number(latest).toLocaleString('es-CO', { maximumFractionDigits: 3 }));
  const [display, setDisplay] = useState(() => formatTon(value));
  const first = useRef(true);

  useEffect(() => {
    const unsubscribe = rounded.on('change', (latest) => {
      setDisplay(latest);
    });
    return unsubscribe;
  }, [rounded]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      motionValue.set(value);
      return;
    }

    const controls = animate(motionValue, value, {
      duration: 0.6,
      ease: 'easeOut',
    });

    return () => controls.stop();
  }, [motionValue, value]);

  return (
    <span className={className}>
      {display}
      {suffix ? <span className="ml-1 text-sm text-white/65">{suffix}</span> : null}
    </span>
  );
}

const E_STORED = 2.6;

export default function CarbonoTotalDashboard(props: CarbonoTotalDashboardProps) {
  const {
    loading,
    error,
    statusLabel,
    stageConfigs,
    periodPreset,
    setPeriodPreset,
    customMonthStart,
    setCustomMonthStart,
    customMonthEnd,
    setCustomMonthEnd,
    enabledStages,
    toggleStage,
    totalTon,
    dateRangeLabel,
    summaryCards,
    monthlySeries,
    donutData,
    periodsCount,
    lastUpdatedLabel,
    filterSignature,
    masaSecaTon,
    masaSecaBaches,
    huellaIntensidad,
    biocharAplicadoTon,
    biocharAplicadoBaches,
  } = props;

  const E_STORED_PER_TON = E_STORED; // 2.6 tCO₂eq / ton biochar aplicado
  const allStagesTon = summaryCards.reduce((acc, c) => acc + c.totalTon, 0);
  const hasApplied = biocharAplicadoTon > 0;
  const remoccionBruta = E_STORED_PER_TON * biocharAplicadoTon;
  const netCorcs = remoccionBruta - allStagesTon;
  const netCorcsPositive = netCorcs >= 0;
  const totalEmisionesPorTon = hasApplied ? allStagesTon / biocharAplicadoTon : null;
  const factorCorcNeto = totalEmisionesPorTon !== null ? E_STORED_PER_TON - totalEmisionesPorTon : null;

  return (
    <div
      style={{
        ['--stage-ebiomas' as string]: '#3B6D11',
        ['--stage-epirolisis' as string]: '#854F0B',
        ['--stage-euse' as string]: '#185FA5',
        ['--stage-etransporte' as string]: '#533AB7',
      }}
      className="space-y-6"
    >
      {/* ── CASCADA DE REMOCIÓN NETA ─────────────────────────────────────── */}
      <motion.section
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-white/20 bg-white/10 p-5 sm:p-7 backdrop-blur-md"
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base sm:text-lg font-bold uppercase tracking-[0.16em] text-white">
              Cascada de Remoción Neta
            </h2>
            <p className="mt-1 text-sm font-medium text-white/55">MRV estimado · Período: {dateRangeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              loading
                ? 'border-amber-300/70 bg-amber-500/20 text-amber-200'
                : 'border-emerald-300/70 bg-emerald-500/20 text-emerald-200'
            }`}>{statusLabel}</span>
            <span className={`inline-flex rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              netCorcsPositive
                ? 'border-emerald-300/70 bg-emerald-500/20 text-emerald-200'
                : 'border-red-300/70 bg-red-500/20 text-red-200'
            }`}>{netCorcsPositive ? 'Net Positivo' : 'Net Negativo'}</span>
          </div>
        </div>

        {/* Biochar context strip */}
        {hasApplied ? (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/15 bg-white/5 px-5 py-3">
            <span className="text-sm font-medium text-white/65">Biochar seco aplicado en el período</span>
            <span className="ml-auto text-lg font-bold text-white">{formatTon(biocharAplicadoTon, 3)} t</span>
            <span className="text-sm text-white/45">· {biocharAplicadoBaches} remisiones</span>
          </div>
        ) : !loading ? (
          <div className="mb-4 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm italic text-white/45">
            Sin remisiones de biochar aplicado en este período — solo se muestran emisiones.
          </div>
        ) : null}

        {/* Column headers */}
        <div className="mb-1.5 grid grid-cols-[1fr_minmax(120px,auto)] sm:grid-cols-[1fr_minmax(130px,auto)_minmax(150px,auto)] gap-x-5 px-5 text-[11px] font-bold uppercase tracking-widest text-white/45">
          <span>Concepto</span>
          <span className="text-right">tCO₂eq (período)</span>
          <span className="hidden text-right sm:block">tCO₂eq / ton aplicada</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/15 divide-y divide-white/10">

          {/* ── (+) REMOCIÓN BRUTA ──────────────────────────────────────────── */}
          <div className="grid grid-cols-[1fr_minmax(120px,auto)] sm:grid-cols-[1fr_minmax(130px,auto)_minmax(150px,auto)] items-center gap-x-5 bg-emerald-500/10 px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="shrink-0 rounded-md bg-emerald-400/20 px-2 py-0.5 text-sm font-bold text-emerald-300">+</span>
                <span className="text-base font-bold text-white">Remoción bruta del período</span>
              </div>
              <p className="mt-1 pl-9 text-sm leading-snug text-white/50">
                2.6 tCO₂/t × {hasApplied ? formatTon(biocharAplicadoTon, 3) : '0'} t aplicadas
                <span className="block text-white/35">relación H/Corg + factor permanencia (Woolf)</span>
              </p>
            </div>
            <div className="text-right tabular-nums">
              <span className="text-2xl font-extrabold text-emerald-300">+{formatTon(remoccionBruta, 3)}</span>
            </div>
            <div className="hidden text-right tabular-nums sm:block">
              <span className="text-xl font-bold text-emerald-300/80">+{formatTon(E_STORED_PER_TON, 4)}</span>
            </div>
          </div>

          {/* ── (−) EMISIONES DEL PERÍODO ──────────────────────────────────── */}
          <div className="bg-red-500/10 px-5 py-3.5">
            <div className="grid grid-cols-[1fr_minmax(120px,auto)] sm:grid-cols-[1fr_minmax(130px,auto)_minmax(150px,auto)] items-center gap-x-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="shrink-0 rounded-md bg-red-400/20 px-2 py-0.5 text-sm font-bold text-red-300">−</span>
                  <span className="text-base font-bold text-white">Emisiones del período</span>
                </div>
                <p className="mt-1 pl-9 text-sm text-white/50">Huella total consolidada</p>
              </div>
              <div className="text-right tabular-nums">
                <span className="text-2xl font-extrabold text-red-300">−{formatTon(allStagesTon, 3)}</span>
              </div>
              <div className="hidden text-right tabular-nums sm:block">
                <span className="text-xl font-bold text-red-300/80">
                  {totalEmisionesPorTon !== null ? `−${formatTon(totalEmisionesPorTon, 4)}` : '—'}
                </span>
              </div>
            </div>

            {/* Sub-filas por rubro */}
            <div className="mt-2.5 space-y-1.5 border-l-2 border-white/15 pl-4 ml-9">
              {summaryCards.map((card) => (
                <div
                  key={card.key}
                  className="grid grid-cols-[1fr_minmax(120px,auto)] sm:grid-cols-[1fr_minmax(130px,auto)_minmax(150px,auto)] items-center gap-x-5 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: card.color }} />
                    <span className="font-medium" style={{ color: `${card.color}E6` }}>{card.label}</span>
                  </span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: `${card.color}CC` }}>
                    −{formatTon(card.totalTon, 3)}
                  </span>
                  <span className="hidden text-right font-medium tabular-nums sm:block" style={{ color: `${card.color}99` }}>
                    {hasApplied ? `−${formatTon(card.totalTon / biocharAplicadoTon, 4)}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Separador doble */}
          <div className="h-[3px] bg-gradient-to-r from-white/5 via-white/30 to-white/5" />

          {/* ── (=) REMOCIÓN NETA — CORCs ──────────────────────────────────── */}
          <div className={`px-5 py-4 ${netCorcsPositive ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
            <div className="grid grid-cols-[1fr_minmax(120px,auto)] sm:grid-cols-[1fr_minmax(130px,auto)_minmax(150px,auto)] items-center gap-x-5">
              <div className="flex items-center gap-2.5">
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-bold ${
                  netCorcsPositive ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'
                }`}>=</span>
                <span className="text-lg font-extrabold text-white">Remoción neta — CORCs</span>
              </div>
              <div className="text-right tabular-nums">
                <AnimatedCount
                  value={netCorcs}
                  className={`text-4xl font-extrabold leading-none ${netCorcsPositive ? 'text-emerald-300' : 'text-red-300'}`}
                />
                <p className="mt-1 text-sm font-medium text-white/45">tCO₂eq</p>
              </div>
              <div className="hidden text-right tabular-nums sm:block">
                {factorCorcNeto !== null ? (
                  <>
                    <span className={`text-2xl font-extrabold ${factorCorcNeto >= 0 ? 'text-emerald-300/90' : 'text-red-300/90'}`}>
                      {formatTon(factorCorcNeto, 4)}
                    </span>
                    <p className="mt-1 text-sm font-medium text-white/45">Factor CORC neto</p>
                  </>
                ) : <span className="text-xl text-white/30">—</span>}
              </div>
            </div>

            {/* Nota puente: der. × ton = izq. */}
            {factorCorcNeto !== null && hasApplied && (
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-base">
                <span className="font-medium text-white/50">Factor neto</span>
                <span className={`font-bold tabular-nums ${factorCorcNeto >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {formatTon(factorCorcNeto, 4)}
                </span>
                <span className="text-white/30">×</span>
                <span className="font-semibold tabular-nums text-white/70">{formatTon(biocharAplicadoTon, 3)} t</span>
                <span className="text-white/30">=</span>
                <span className={`text-lg font-extrabold tabular-nums ${netCorcsPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                  {formatTon(netCorcs, 3)} CORCs
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.section>

      <section className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-md">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Filtros</h3>
        <div className="mb-4 flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.key}
              onClick={() => setPeriodPreset(option.key)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                periodPreset === option.key
                  ? 'border-white/70 bg-white/20 text-white'
                  : 'border-white/30 bg-white/5 text-white/75 hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {periodPreset === 'custom' && (
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/70">Mes inicio</label>
              <input
                type="month"
                value={customMonthStart}
                onChange={(event) => setCustomMonthStart(event.target.value)}
                className="w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#3B6D11]"
              />
            </div>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/70">Mes fin</label>
              <input
                type="month"
                value={customMonthEnd}
                onChange={(event) => setCustomMonthEnd(event.target.value)}
                className="w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#3B6D11]"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {stageConfigs.map((stage) => {
            const enabled = enabledStages[stage.key];
            return (
              <button
                key={stage.key}
                onClick={() => toggleStage(stage.key)}
                className="rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-150"
                style={{
                  borderColor: stage.color,
                  backgroundColor: enabled ? stage.color : 'transparent',
                  color: enabled ? '#FFFFFF' : stage.color,
                  opacity: enabled ? 1 : 0.55,
                }}
              >
                {stage.label}
              </button>
            );
          })}
        </div>
      </section>

      <motion.section
        key={filterSignature}
        variants={cardContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {summaryCards.map((card) => (
          <motion.article
            key={card.key}
            variants={cardItem}
            whileHover={{ scale: 1.02, transition: { type: 'spring', stiffness: 260, damping: 20 } }}
            className="rounded-2xl border bg-white/10 p-4 backdrop-blur-sm"
            style={{
              borderColor: `${card.color}AA`,
              opacity: card.enabled ? 1 : 0.55,
            }}
          >
            <p className="text-sm font-semibold" style={{ color: card.color }}>{card.label}</p>
            <div className="mt-2 text-2xl font-bold text-white">
              <AnimatedCount value={card.totalTon} suffix="tCO2eq" />
            </div>
            <p className="mt-1 text-sm text-white/70">{formatTon(card.percentage, 1)}% del total</p>
          </motion.article>
        ))}
      </motion.section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Evolución mensual por etapa</h3>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={monthlySeries} margin={{ top: 12, right: 8, left: -20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.7)" tick={{ fontSize: 12 }} />
                <YAxis stroke="rgba(255,255,255,0.7)" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(12,17,24,0.92)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 12,
                  }}
                  formatter={(value) => [`${formatTon(Number(value))} tCO2eq`, ''] as [string, string]}
                />
                <Bar dataKey="ebiomas" stackId="total" fill="#3B6D11" radius={[4, 4, 0, 0]} />
                <Bar dataKey="epirolisis" stackId="total" fill="#854F0B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="euse" stackId="total" fill="#185FA5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="etransporte" stackId="total" fill="#533AB7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Proporción por etapa</h3>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={2}
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(12,17,24,0.92)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 12,
                  }}
                  formatter={(value) => `${formatTon(Number(value))} tCO2eq`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {summaryCards.map((card) => (
              <div key={card.key} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/80">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: card.color }} />
                <span className="ml-2">{card.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="rounded-2xl border border-white/20 bg-white/10 p-4 text-sm text-white/75 backdrop-blur-md">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <p>Períodos: <span className="font-semibold text-white">{periodsCount}</span></p>
          <p>Última actualización: <span className="font-semibold text-white">{lastUpdatedLabel}</span></p>
          <p>Total sin biogénicos: <span className="font-semibold text-white">excluidos</span></p>
        </div>
      </footer>

      {error && (
        <div className="rounded-xl border border-red-400/60 bg-red-500/20 p-3 text-sm text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
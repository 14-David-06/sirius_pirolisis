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

export default function CarbonoTotalDashboard(props: CarbonoTotalDashboardProps) {
  const {
    loading,
    error,
    statusLabel,
    stageConfigs,
    periodPreset,
    setPeriodPreset,
    customMonth,
    setCustomMonth,
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
  } = props;

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
      <motion.section
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center backdrop-blur-md"
      >
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
            loading
              ? 'border-amber-300/70 bg-amber-500/20 text-amber-200'
              : 'border-emerald-300/70 bg-emerald-500/20 text-emerald-200'
          }`}
        >
          {statusLabel}
        </span>
        <h2 className="mt-3 text-sm font-medium uppercase tracking-[0.18em] text-white/75">Huella total consolidada</h2>
        <div className="mt-2 text-5xl font-bold text-white sm:text-6xl">
          <AnimatedCount value={totalTon} suffix="tCO2eq" />
        </div>
        <p className="mt-2 text-sm text-white/70">Período activo: {dateRangeLabel}</p>
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
          <div className="mb-4 max-w-xs">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/70">Mes</label>
            <input
              type="month"
              value={customMonth}
              onChange={(event) => setCustomMonth(event.target.value)}
              className="w-full rounded-lg border border-white/30 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#3B6D11]"
            />
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
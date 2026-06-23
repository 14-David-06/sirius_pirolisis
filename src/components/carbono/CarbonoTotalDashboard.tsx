"use client";

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform, type Variants } from 'framer-motion';
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
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

function formatTon(value: number, maxDigits = 2) {
  return value.toLocaleString('es-CO', {
    minimumFractionDigits: maxDigits,
    maximumFractionDigits: maxDigits,
  });
}

function AnimatedCount({ 
  value, 
  className, 
  suffix, 
  maxDigits = 3, 
  style 
}: { 
  value: number; 
  className?: string; 
  suffix?: string; 
  maxDigits?: number; 
  style?: React.CSSProperties 
}) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) => 
    Number(latest).toLocaleString('es-CO', { 
      minimumFractionDigits: maxDigits,
      maximumFractionDigits: maxDigits 
    })
  );
  const [display, setDisplay] = useState(() => formatTon(value, maxDigits));
  const first = useRef(true);

  useEffect(() => {
    const unsubscribe = rounded.on('change', (latest) => {
      setDisplay(latest);
    });
    return unsubscribe;
  }, [rounded, maxDigits]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      motionValue.set(value);
      return;
    }

    const controls = animate(motionValue, value, {
      duration: 0.65,
      ease: 'easeOut',
    });

    return () => controls.stop();
  }, [motionValue, value]);

  return (
    <span className={className} style={style}>
      {display}
      {suffix ? <span className="ml-1 text-sm text-white/60">{suffix}</span> : null}
    </span>
  );
}

const E_STORED = 2.6;

const periodOptions: { key: CarbonPeriodPreset; label: string }[] = [
  { key: '3m', label: '3 meses' },
  { key: '6m', label: '6 meses' },
  { key: '1y', label: '1 año' },
  { key: 'all', label: 'Todo' },
  { key: 'custom', label: 'Personalizado' },
];

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
    totalTon, // represents the sum of emissions for enabled stages
    dateRangeLabel,
    summaryCards,
    monthlySeries,
    donutData,
    periodsCount,
    lastUpdatedLabel,
    filterSignature,
    biocharAplicadoTon,
    biocharAplicadoBaches,
  } = props;

  const hasApplied = biocharAplicadoTon > 0;
  const biocharAppliedNum = biocharAplicadoTon || 0;

  // 1. Period Totals (Left Column)
  const brutaPeriod = E_STORED * biocharAppliedNum;
  const emisPeriod = totalTon;
  const netPeriod = brutaPeriod - emisPeriod;
  const netPositive = netPeriod >= 0;

  // 2. Per Ton Applied (Right Column)
  const brutaPerTon = E_STORED;
  const emisPerTon = hasApplied ? totalTon / biocharAppliedNum : 0;
  const factorNeto = hasApplied ? brutaPerTon - emisPerTon : 0;

  // Styles for the Net Badge
  const netBadgeBorder = netPositive ? 'rgba(232, 213, 183, 0.28)' : 'rgba(231, 76, 60, 0.5)';
  const netBadgeBg = netPositive ? 'rgba(255, 255, 255, 0.04)' : 'rgba(231, 76, 60, 0.14)';
  const netBadgeColor = netPositive ? '#e8d5b7' : '#f0a097';
  const netLabel = netPositive ? 'Net positivo' : 'Net negativo';
  const netColor = netPositive ? '#5ccd95' : '#f0706a';
  const netGlow = netPositive ? 'rgba(46, 204, 113, 0.26)' : 'rgba(231, 76, 60, 0.26)';

  // Helper to find Stage Color
  const getColor = (key: CarbonStageKey) => {
    return stageConfigs.find((s) => s.key === key)?.color || '#ffffff';
  };

  // Conic gradient for Donut Chart
  let acc = 0;
  const segments: string[] = [];
  summaryCards.forEach((c) => {
    if (!c.enabled) return;
    const pct = totalTon > 0 ? (c.totalTon / totalTon) * 100 : 0;
    if (pct <= 0) return;
    segments.push(`${c.color} ${acc.toFixed(2)}% ${(acc + pct).toFixed(2)}%`);
    acc += pct;
  });
  const donutGradient = segments.length ? `conic-gradient(${segments.join(',')})` : '#1a1a3e';

  // Heights for Monthly Bars
  const H = 230; // Max height in pixels
  const maxMonthlyVal = Math.max(
    ...monthlySeries.map((m) => m.eBiomas + m.epirolisis + m.euse + m.etransporte),
    0.001
  );

  return (
    <div className="space-y-6 animate-sir-rise">
      {/* ── HERO: CASCADA DE REMOCIÓN NETA ─────────────────────────────────── */}
      <motion.section
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="border border-white/9 rounded-2xl bg-[#0d121a]/72 backdrop-blur-[6px] shadow-[0_8px_40px_rgba(0,0,0,0.45)] overflow-hidden"
      >
        <div className="p-6.5 sm:p-7.5 pb-6">
          {/* Top strip */}
          <div className="flex flex-wrap items-start justify-between gap-3.5 mb-4.5">
            <div>
              <p className="m-0 text-xs font-semibold tracking-[0.2em] uppercase text-[#6a6a7a]">
                Cascada de remoción neta
              </p>
              <p className="mt-1 text-[13px] text-[#8a8a9a]">
                Remoción bruta − Emisiones = CORCs · Biochar seco aplicado:{' '}
                <span className="text-[#e8d5b7] font-bold">{formatTon(biocharAplicadoTon, 3)} t</span> ·{' '}
                {biocharAplicadoBaches} remisiones
              </p>
            </div>
            <span
              className="rounded-full px-3.5 py-1 text-[11px] font-bold tracking-[0.08em] uppercase whitespace-nowrap border transition-all duration-300"
              style={{
                borderColor: netBadgeBorder,
                backgroundColor: netBadgeBg,
                color: netBadgeColor,
              }}
            >
              {netLabel}
            </span>
          </div>

          {/* Two parallel columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-0">
            {/* ───────── LEFT · totales del período ───────── */}
            <div className="md:pr-6 pb-6 md:pb-0 md:border-r border-white/8">
              <p className="mb-3 text-[11px] font-bold tracking-[0.16em] uppercase text-[#7e8794]">
                tCO₂eq · totales del período
              </p>

              {/* (+) Remoción Bruta */}
              <div className="flex items-start justify-between gap-3 p-3 sm:p-3.5 rounded-lg bg-emerald-500/6 border border-emerald-500/18 mb-2">
                <div className="flex gap-2.5">
                  <span className="w-6 h-6 flex shrink-0 items-center justify-center rounded-md bg-emerald-500/16 text-[#5ccd95] font-black text-sm">
                    +
                  </span>
                  <div>
                    <p className="m-0 text-[14px] font-bold text-[#cdd3da]">
                      Remoción bruta del período
                    </p>
                    <p className="mt-1 text-[11px] sm:text-[12px] leading-snug text-[#7e8794]">
                      2,6 tCO₂ removidas por t × {formatTon(biocharAplicadoTon, 3)} t aplicadas. El 2,6 sale de la relación H/Corg + factor de permanencia (Woolf).
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[20px] sm:text-[22px] font-bold text-[#5ccd95] whitespace-nowrap">
                  +{formatTon(brutaPeriod, 3)}
                </span>
              </div>

              {/* (−) Emisiones */}
              <div className="p-3 sm:p-3.5 rounded-lg bg-red-500/7 border border-red-500/18 mb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2.5">
                    <span className="w-6 h-6 flex shrink-0 items-center justify-center rounded-md bg-red-500/18 text-[#f0706a] font-black text-sm">
                      −
                  </span>
                    <div>
                      <p className="m-0 text-[14px] font-bold text-[#cdd3da]">
                        Emisiones del período
                      </p>
                      <p className="mt-1 text-[11px] sm:text-[12px] text-[#7e8794]">
                        Huella total consolidada del proceso.
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[20px] sm:text-[22px] font-bold text-[#f0706a] whitespace-nowrap">
                    -{formatTon(emisPeriod, 3)}
                  </span>
                </div>
                {/* Breakdown of stages */}
                <div className="mt-2.5 pl-3 border-l-2 border-white/10 flex flex-col gap-1.5 ml-6">
                  {summaryCards.map((c) => (
                    <div
                      key={c.key}
                      className="flex items-center justify-between gap-2.5 transition-opacity duration-200"
                      style={{ opacity: c.enabled ? 1 : 0.4 }}
                    >
                      <span className="flex items-center gap-2 text-[14px] text-[#bdb8ad]">
                        ↳ {c.label}
                      </span>
                      <span className="font-mono text-[20px] sm:text-[22px] font-bold text-[#bdb8ad]">
                        -{formatTon(c.totalTon, 3)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* (=) Remoción Neta */}
              <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex gap-2.5 items-center">
                  <span className="w-5 h-5 flex shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-[#5ccd95] font-black text-xs">
                    =
                  </span>
                  <p className="m-0 text-[11px] sm:text-[12px] font-bold text-[#e8d5b7]">
                    Remoción neta — CORCs
                  </p>
                </div>
                <AnimatedCount
                  value={netPeriod}
                  maxDigits={3}
                  className="font-mono text-[20px] sm:text-[22px] font-bold whitespace-nowrap transition-all duration-300"
                  style={{
                    color: netColor,
                    textShadow: `0 0 10px ${netGlow}`,
                  }}
                />
              </div>
            </div>

            {/* ───────── RIGHT · por tonelada aplicada ───────── */}
            <div className="md:pl-6 pt-6 md:pt-0">
              <p className="mb-3 text-[11px] font-bold tracking-[0.16em] uppercase text-[#7e8794]">
                tCO₂eq · por tonelada aplicada
              </p>

              {/* (+) Bruta por tonelada */}
              <div className="flex items-start justify-between gap-3 p-3 sm:p-3.5 rounded-lg bg-emerald-500/6 border border-emerald-500/18 mb-2">
                <div className="flex gap-2.5">
                  <span className="w-6 h-6 flex shrink-0 items-center justify-center rounded-md bg-emerald-500/16 text-[#5ccd95] font-black text-sm">
                    +
                  </span>
                  <div>
                    <p className="m-0 text-[14px] font-bold text-[#cdd3da]">
                      Remoción bruta
                    </p>
                    <p className="mt-1 text-[11px] sm:text-[12px] leading-snug text-[#7e8794]">
                      Relación H/Corg + factor de permanencia.
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[20px] sm:text-[22px] font-bold text-[#5ccd95] whitespace-nowrap">
                  +{formatTon(brutaPerTon, 1)}
                </span>
              </div>

              {/* (−) Emisiones por tonelada */}
              <div className="p-3 sm:p-3.5 rounded-lg bg-red-500/7 border border-red-500/18 mb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-2.5">
                    <span className="w-6 h-6 flex shrink-0 items-center justify-center rounded-md bg-red-500/18 text-[#f0706a] font-black text-sm">
                      −
                    </span>
                    <div>
                      <p className="m-0 text-[14px] font-bold text-[#cdd3da]">
                        Emisiones
                      </p>
                      <p className="mt-1 text-[11px] sm:text-[12px] text-[#7e8794]">
                        Huella consolidada por unidad.
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-[20px] sm:text-[22px] font-bold text-[#f0706a] whitespace-nowrap">
                    -{formatTon(emisPerTon, 4)}
                  </span>
                </div>
                {/* Breakdown of stages */}
                <div className="mt-2.5 pl-3 border-l-2 border-white/10 flex flex-col gap-1.5 ml-6">
                  {summaryCards.map((c) => {
                    const stagePerTon = hasApplied ? c.totalTon / biocharAppliedNum : 0;
                    return (
                      <div
                        key={c.key}
                        className="flex items-center justify-between gap-2.5 transition-opacity duration-200"
                        style={{ opacity: c.enabled ? 1 : 0.4 }}
                      >
                        <span className="flex items-center gap-2 text-[14px] text-[#bdb8ad]">
                          ↳ {c.label}
                        </span>
                        <span className="font-mono text-[20px] sm:text-[22px] font-bold text-[#bdb8ad]">
                          -{formatTon(stagePerTon, 4)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* (=) Factor Neto */}
              <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex gap-2.5 items-center">
                  <span className="w-5 h-5 flex shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-[#5ccd95] font-black text-xs">
                    =
                  </span>
                  <p className="m-0 text-[11px] sm:text-[12px] font-bold text-[#e8d5b7]">
                    Factor CORC neto
                  </p>
                </div>
                <AnimatedCount
                  value={factorNeto}
                  maxDigits={4}
                  className="font-mono text-[20px] sm:text-[22px] font-bold text-[#5ccd95] whitespace-nowrap"
                />
              </div>
            </div>
          </div>

          {/* Bridge Section */}
          {hasApplied && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 border border-dashed border-white/16 rounded-xl bg-black/22 p-3 sm:p-3.5 text-[15px]">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#7e8794] mr-2">
                El puente
              </span>
              <span className="text-[#8a8a9a]">Factor neto</span>
              <span className="font-mono font-bold text-[#cdd3da]">
                {formatTon(factorNeto, 4)}
              </span>
              <span className="text-[#6a6a7a]">×</span>
              <span className="font-mono font-bold text-[#cdd3da]">
                {formatTon(biocharAplicadoTon, 3)} t
              </span>
              <span className="text-[#6a6a7a]">=</span>
              <span className="font-mono font-bold text-[#5ccd95]">
                {formatTon(netPeriod, 3)} CORCs
              </span>
            </div>
          )}
        </div>
      </motion.section>

      {/* ── FILTERS ──────────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-4 border border-white/9 rounded-xl bg-[#0d121a]/72 backdrop-blur-[6px] p-4.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#6a6a7a] mr-1">
            Período
          </span>
          {periodOptions.map((o) => {
            const isSelected = periodPreset === o.key;
            return (
              <button
                key={o.key}
                onClick={() => setPeriodPreset(o.key)}
                className={`cursor-pointer font-inherit rounded-[9px] px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-150 border ${
                  isSelected
                    ? 'border-white/45 bg-white/10 text-[#e8d5b7]'
                    : 'border-white/12 bg-white/2 text-[#9a968d] hover:border-white/30 hover:bg-white/5'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-[#6a6a7a] mr-1">
            Etapas
          </span>
          {stageConfigs.map((s) => {
            const isEnabled = enabledStages[s.key];
            return (
              <button
                key={s.key}
                onClick={() => toggleStage(s.key)}
                className={`cursor-pointer font-inherit flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-150 border ${
                  isEnabled
                    ? 'border-white/28 bg-white/7 text-[#e8d5b7] opacity-100'
                    : 'border-white/12 bg-transparent text-[#7e8794] opacity-75 hover:opacity-90'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Custom Month Range selector */}
      {periodPreset === 'custom' && (
        <section className="flex flex-wrap gap-4 border border-white/9 rounded-xl bg-[#0d121a]/72 backdrop-blur-[6px] p-4.5">
          <div className="min-w-[160px] flex-1 sm:flex-initial">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a8a9a]">
              Mes inicio
            </label>
            <input
              type="month"
              value={customMonthStart}
              onChange={(e) => setCustomMonthStart(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-[#06080d]/80 px-3.5 py-2 text-sm text-[#e8d5b7] focus:border-[#bdb8ad] focus:outline-none transition-colors"
            />
          </div>
          <div className="min-w-[160px] flex-1 sm:flex-initial">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a8a9a]">
              Mes fin
            </label>
            <input
              type="month"
              value={customMonthEnd}
              onChange={(e) => setCustomMonthEnd(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-[#06080d]/80 px-3.5 py-2 text-sm text-[#e8d5b7] focus:border-[#bdb8ad] focus:outline-none transition-colors"
            />
          </div>
        </section>
      )}

      {/* ── SUMMARY CARDS ────────────────────────────────────────────────── */}
      <motion.section
        key={filterSignature}
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {summaryCards.map((card) => {
          const totalStr = formatTon(card.totalTon, 3);
          const pctStr = card.percentage.toFixed(1);
          return (
            <article
              key={card.key}
              className="border rounded-2xl bg-[#0d121a]/72 backdrop-blur-[6px] p-5 pb-4.5 transition-all duration-250 hover:-translate-y-[3px] hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
              style={{
                borderTop: `3px solid ${card.color}`,
                borderColor: card.enabled ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)',
                opacity: card.enabled ? 1 : 0.4,
              }}
            >
              <div className="flex items-center gap-2 mb-3.5">
                <span
                  className="w-2.5 h-2.5 rounded-[3px] inline-block"
                  style={{
                    backgroundColor: card.color,
                    boxShadow: `0 0 8px ${card.color}55`,
                  }}
                />
                <span className="text-[14px] font-bold" style={{ color: card.color }}>
                  {card.label}
                </span>
              </div>
              <p className="m-0 font-mono text-[30px] font-bold text-[#e8d5b7] leading-none">
                {totalStr}
              </p>
              <p className="mt-1.5 mb-3.5 text-[12px] text-[#8a8a9a]">
                tCO₂eq · <span className="font-semibold text-[#cdd3da]">{pctStr}%</span> del total
              </p>
              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-400 ease-out"
                  style={{
                    width: `${pctStr}%`,
                    background: `linear-gradient(90deg, ${card.color}, ${card.color}88)`,
                  }}
                />
              </div>
            </article>
          );
        })}
      </motion.section>

      {/* ── CHARTS ───────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Monthly Bars */}
        <div className="border border-white/9 rounded-2xl bg-[#0d121a]/72 backdrop-blur-[6px] p-5.5 sm:p-6">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="m-0 text-[13px] font-bold tracking-[0.16em] uppercase text-[#e8d5b7]">
              Evolución mensual por etapa
            </h3>
            <span className="text-xs text-[#6a6a7a]">tCO₂eq</span>
          </div>

          <div className="flex items-end gap-2.5 h-[240px] pb-1 border-b border-[#e8d5b7]/10">
            {monthlySeries.map((m, idx) => {
              const total = m.eBiomas + m.epirolisis + m.euse + m.etransporte;
              const ebH = maxMonthlyVal > 0 ? (m.eBiomas / maxMonthlyVal) * H : 0;
              const epH = maxMonthlyVal > 0 ? (m.epirolisis / maxMonthlyVal) * H : 0;
              const euH = maxMonthlyVal > 0 ? (m.euse / maxMonthlyVal) * H : 0;
              const etH = maxMonthlyVal > 0 ? (m.etransporte / maxMonthlyVal) * H : 0;

              return (
                <div
                  key={idx}
                  className="group relative flex-1 flex flex-col justify-end items-center h-full min-w-0 cursor-pointer"
                >
                  {/* Custom interactive tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-30 bg-[#0c1118]/95 border border-white/20 rounded-xl p-3 shadow-2xl text-xs text-left min-w-[160px] pointer-events-none transition-all duration-150">
                    <p className="font-bold text-[#e8d5b7] mb-1.5 border-b border-white/10 pb-1">
                      {m.label}
                    </p>
                    <div className="space-y-1.5">
                      {stageConfigs.map((s) => {
                        const val = m[s.key as CarbonStageKey] || 0;
                        return (
                          <div key={s.key} className="flex justify-between items-center gap-4">
                            <span className="flex items-center gap-1.5 text-white/60">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                              {s.label}
                            </span>
                            <span className="font-mono font-bold" style={{ color: s.color }}>
                              {formatTon(val, 2)} t
                            </span>
                          </div>
                        );
                      })}
                      <div className="border-t border-white/15 pt-1.5 mt-1.5 flex justify-between font-bold text-white">
                        <span>Total</span>
                        <span className="font-mono">{formatTon(total, 2)} t</span>
                      </div>
                    </div>
                  </div>

                  {/* Vertical bar stack */}
                  <div className="w-full max-w-[26px] flex flex-col justify-end rounded-t-[4px] overflow-hidden transition-all duration-200 group-hover:brightness-110">
                    <div
                      style={{ height: `${etH.toFixed(1)}px`, backgroundColor: getColor('etransporte') }}
                      className="w-full transition-all duration-300"
                    />
                    <div
                      style={{ height: `${euH.toFixed(1)}px`, backgroundColor: getColor('euse') }}
                      className="w-full transition-all duration-300"
                    />
                    <div
                      style={{ height: `${epH.toFixed(1)}px`, backgroundColor: getColor('epirolisis') }}
                      className="w-full transition-all duration-300"
                    />
                    <div
                      style={{ height: `${ebH.toFixed(1)}px`, backgroundColor: getColor('eBiomas') }}
                      className="w-full transition-all duration-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Month labels */}
          <div className="flex gap-2.5 mt-2">
            {monthlySeries.map((m, idx) => (
              <span
                key={idx}
                className="flex-1 text-center text-[10px] sm:text-xs text-[#6a6a7a] min-w-0 truncate"
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>

        {/* Donut Chart */}
        <div className="border border-white/9 rounded-2xl bg-[#0d121a]/72 backdrop-blur-[6px] p-5.5 sm:p-6 flex flex-col">
          <h3 className="m-0 mb-4 text-[13px] font-bold tracking-[0.16em] uppercase text-[#e8d5b7]">
            Proporción de emisiones
          </h3>

          <div className="flex items-center justify-center flex-1 py-4">
            <div className="relative w-[180px] h-[180px] shrink-0">
              {/* Conic Gradient Circle */}
              <div
                className="absolute inset-0 rounded-full transition-all duration-500"
                style={{ background: donutGradient }}
              />
              {/* Center hole overlay */}
              <div className="absolute inset-[26px] rounded-full bg-[#0a0a1a] flex flex-col items-center justify-center shadow-inner">
                <span className="font-mono text-[26px] sm:text-[30px] font-bold text-[#e8d5b7] leading-none">
                  {formatTon(totalTon, 2)}
                </span>
                <span className="text-[11px] text-[#6a6a7a] mt-1.5">
                  tCO₂eq total
                </span>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 mt-4.5">
            {summaryCards.map((card) => (
              <div
                key={card.key}
                className="flex items-center justify-between gap-1.5 border border-[#e8d5b7]/10 rounded-[9px] px-2.5 py-1.5 bg-white/2 transition-opacity duration-200"
                style={{ opacity: card.enabled ? 1 : 0.4 }}
              >
                <span className="flex items-center gap-1.5 text-xs text-[#c8c4bb] truncate">
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: card.color }}
                  />
                  {card.label}
                </span>
                <span className="text-xs font-bold text-[#e8d5b7] shrink-0">
                  {card.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="mt-6 flex flex-wrap gap-y-4 gap-x-10 border-t border-[#e8d5b7]/8 pt-4.5 text-[13px] text-[#8a8a9a] items-center">
        <span>
          Períodos analizados:{' '}
          <span className="text-[#e8d5b7] font-semibold">{periodsCount}</span>
        </span>
        <span>
          Última actualización:{' '}
          <span className="text-[#e8d5b7] font-semibold">{lastUpdatedLabel}</span>
        </span>
        <span>
          Metodología:{' '}
          <span className="text-[#e8d5b7] font-semibold">Woolf et al. · permanencia 100a</span>
        </span>
        <span className="sm:ml-auto text-[#6a6a7a]">
          Barranca de Upía · Biofábrica Sirius
        </span>
      </footer>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200 backdrop-blur-md">
          {error}
        </div>
      )}
    </div>
  );
}
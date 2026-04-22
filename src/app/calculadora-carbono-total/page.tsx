"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

// ── Types for each preview response ──────────────────────────────

interface EBiomasPreview {
  periodo: { fecha_inicio: string; fecha_fin: string };
  total_viajes: number;
  litros_diesel: number;
  kg_diesel: number;
  emisiones_produccion_kg: number;
  emisiones_combustion_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose: {
    factor_produccion_usado: number;
    factor_combustion_usado: number;
    consumo_diesel_por_viaje: number;
    densidad_diesel: number;
  };
}

interface EPirolisisComponentes {
  electricidad_kg: number;
  electricidad_suma_al_total: boolean;
  co2_biogenico_kg: number;
  co2_biogenico_suma_al_total: boolean;
  ch4_kg: number;
  n2o_kg: number;
  big_bags_masa_total_kg: number;
  big_bags_pp_no_tejido_kg: number;
  big_bags_fibra_tejida_kg: number;
  big_bags_film_ldpe_kg: number;
  big_bags_descarte_pp_kg: number;
  big_bags_total_kg: number;
  big_bags_factor_pendiente: boolean;
  lonas_masa_total_kg: number;
  lonas_pp_no_tejido_kg: number;
  lonas_fibra_tejida_kg: number;
  lonas_total_kg: number;
  lonas_factor_pendiente: boolean;
  residuos_lubricants_kg: number;
  residuos_used_oil_kg: number;
  residuos_paint_cans_kg: number;
  residuos_ppe_kg: number;
  chimenea_co_kg: number;
  chimenea_co_suma_al_total: boolean;
  chimenea_co2_kg: number;
  chimenea_co2_suma_al_total: boolean;
  chimenea_ch4_kg: number;
  chimenea_ch4_co2eq_kg: number;
  chimenea_n2o_kg: number;
  chimenea_n2o_co2eq_kg: number;
}

interface EPirolisisPreview {
  periodo: { fecha_inicio: string; fecha_fin: string };
  turnos_analizados: number;
  horas_producidas: number;
  kwh_total: number;
  m3_biogas_total: number;
  total_big_bags: number;
  total_lonas: number;
  residuos_lubricants_kg: number;
  residuos_used_oil_kg: number;
  residuos_paint_cans_kg: number;
  residuos_ppe_kg: number;
  componentes: EPirolisisComponentes;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose: {
    factores_usados: Record<string, number>;
    factores_pendientes: string[];
  };
}

interface ETransportePreview {
  periodo: { fecha_inicio: string; fecha_fin: string };
  total_baches: number;
  total_viajes: number;
  distancia_total_km: number;
  litros_diesel: number;
  kg_diesel: number;
  emisiones_combustion_kg: number;
  emisiones_upstream_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose: {
    distancia_km_viaje: number;
    consumo_L_km: number;
    densidad_diesel: number;
    fe_combustion: number;
    fe_upstream: number;
  };
}

interface EUseRemisionDetalle {
  remision_id: string;
  remision_numero: string;
  cliente: string;
  cliente_match: string;
  fecha_evento: string;
  kg_despachados: number;
  ton_despachados: number;
  distancia_km: number;
  tipo_vehiculo: 'liviano' | 'pesado';
  factor_emision_usado: number;
  emisiones_kg: number;
}

interface EUsePreview {
  periodo: { fecha_inicio: string; fecha_fin: string };
  remisiones_analizadas: number;
  desglose_por_remision: EUseRemisionDetalle[];
  resumen: {
    remisiones_liviano: number;
    remisiones_pesado: number;
    emisiones_liviano_kg: number;
    emisiones_pesado_kg: number;
    emisiones_total_kg: number;
    emisiones_total_ton: number;
  };
  constantes_usadas: {
    fe_euse_liviano: number;
    fe_euse_pesado: number;
    umbral_ton: number;
  };
}

interface AllPreviews {
  ebiomas: EBiomasPreview | null;
  epirolisis: EPirolisisPreview | null;
  etransporte: ETransportePreview | null;
  euse: EUsePreview | null;
}

// ── Main Page ────────────────────────────────────────────────────

export default function CalculadoraCarbonoTotalPage() {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [previews, setPreviews] = useState<AllPreviews>({ ebiomas: null, epirolisis: null, etransporte: null, euse: null });
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [errors, setErrors] = useState<{ ebiomas?: string; epirolisis?: string; etransporte?: string; euse?: string }>({});
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const hasAnyPreview = previews.ebiomas || previews.epirolisis || previews.etransporte || previews.euse;

  const grandTotalKg = (previews.ebiomas?.emisiones_total_kg ?? 0)
    + (previews.epirolisis?.emisiones_total_kg ?? 0)
    + (previews.etransporte?.emisiones_total_kg ?? 0)
    + (previews.euse?.resumen.emisiones_total_kg ?? 0);
  const grandTotalTon = grandTotalKg / 1000;

  const handlePreview = async () => {
    if (!fechaInicio || !fechaFin) {
      setMensaje({ tipo: 'error', texto: 'Selecciona fecha de inicio y fecha de fin' });
      return;
    }
    if (new Date(fechaInicio) > new Date(fechaFin)) {
      setMensaje({ tipo: 'error', texto: 'La fecha de inicio debe ser anterior a la fecha de fin' });
      return;
    }

    setLoadingPreview(true);
    setMensaje(null);
    setErrors({});
    setPreviews({ ebiomas: null, epirolisis: null, etransporte: null, euse: null });

    const body = JSON.stringify({ fecha_inicio: fechaInicio, fecha_fin: fechaFin });
    const headers = { 'Content-Type': 'application/json' };

    const [resBiomas, resPirolisis, resTransporte, resEUse] = await Promise.allSettled([
      fetch('/api/carbon/ebiomas/preview', { method: 'POST', headers, body }),
      fetch('/api/carbon/epirolisis/preview', { method: 'POST', headers, body }),
      fetch('/api/carbon/etransporte/preview', { method: 'POST', headers, body }),
      fetch('/api/carbon/euse/preview', { method: 'POST', headers, body }),
    ]);

    const newPreviews: AllPreviews = { ebiomas: null, epirolisis: null, etransporte: null, euse: null };
    const newErrors: typeof errors = {};

    // eBiomass
    if (resBiomas.status === 'fulfilled') {
      const data = await resBiomas.value.json();
      if (data.success) newPreviews.ebiomas = data.data;
      else newErrors.ebiomas = data.error || 'Error eBiomass';
    } else {
      newErrors.ebiomas = 'Error de conexión eBiomass';
    }

    // eProduction
    if (resPirolisis.status === 'fulfilled') {
      const data = await resPirolisis.value.json();
      if (data.success) newPreviews.epirolisis = data.data;
      else newErrors.epirolisis = data.error || 'Error eProduction';
    } else {
      newErrors.epirolisis = 'Error de conexión eProduction';
    }

    // eTransporte
    if (resTransporte.status === 'fulfilled') {
      const data = await resTransporte.value.json();
      if (data.success) newPreviews.etransporte = data.data;
      else newErrors.etransporte = data.error || 'Error eTransporte';
    } else {
      newErrors.etransporte = 'Error de conexión eTransporte';
    }

    // eUse
    if (resEUse.status === 'fulfilled') {
      const data = await resEUse.value.json();
      if (data.success) newPreviews.euse = data.data;
      else newErrors.euse = data.error || 'Error eUse';
    } else {
      newErrors.euse = 'Error de conexión eUse';
    }

    setPreviews(newPreviews);
    setErrors(newErrors);
    setLoadingPreview(false);

    const errCount = Object.keys(newErrors).length;
    if (errCount === 4) {
      setMensaje({ tipo: 'error', texto: 'No se pudo obtener ningún cálculo. Revisa la conexión.' });
    } else if (errCount > 0) {
      setMensaje({ tipo: 'error', texto: `Algunos cálculos fallaron: ${Object.values(newErrors).join('; ')}` });
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const fmt = (n: number) => {
    if (Math.abs(n) >= 1) return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
    return n.toLocaleString('es-CO', { maximumSignificantDigits: 4 });
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/textura-biochar.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative z-10">
        <Navbar />

        <main className="container mx-auto px-4 sm:px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 sm:p-8 max-w-5xl mx-auto border border-white/30">
            {/* Logos */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <Image src="/logo.png" alt="Sirius" width={200} height={80} className="h-20 w-auto drop-shadow-lg" priority />
              <span className="text-white/40 text-2xl font-light select-none">×</span>
              <Image src="/logo-earth-blanco.png" alt="Puro Earth" width={200} height={80} className="h-20 w-auto drop-shadow-lg" priority />
            </div>

            <h1 className="text-3xl font-bold text-white mb-2 text-center drop-shadow-lg">
              Calculadora de Carbono — Total
            </h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Etapas 1 + 2 + 3 + 4: eBiomass + eProduction + eTransporte + eUse
            </p>

            {/* Mensaje */}
            {mensaje && (
              <div className={`mb-6 p-4 rounded-lg text-center font-semibold backdrop-blur-sm ${
                mensaje.tipo === 'success'
                  ? 'bg-green-500/80 text-white border border-green-400/50 shadow-lg'
                  : 'bg-red-500/80 text-white border border-red-400/50 shadow-lg'
              }`}>
                {mensaje.texto}
              </div>
            )}

            {/* ── Form ── */}
            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">Período de análisis</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">Fecha inicio *</label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => { setFechaInicio(e.target.value); setPreviews({ ebiomas: null, epirolisis: null, etransporte: null, euse: null }); }}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">Fecha fin *</label>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => { setFechaFin(e.target.value); setPreviews({ ebiomas: null, epirolisis: null, etransporte: null, euse: null }); }}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 font-medium"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={handlePreview}
                  disabled={loadingPreview || !fechaInicio || !fechaFin}
                  className="px-8 py-3 bg-white/20 hover:bg-white/30 text-white border-2 border-white/40 rounded-lg font-semibold backdrop-blur-sm drop-shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loadingPreview ? (
                    <><Spinner /> Calculando 4 etapas...</>
                  ) : (
                    'Calcular Todo (Preview)'
                  )}
                </button>
              </div>
            </div>

            {/* ── Loading indicator ── */}
            {loadingPreview && (
              <div className="text-center py-12 text-white/70">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
                <p className="drop-shadow">Consultando datos para las 4 etapas...</p>
              </div>
            )}

            {/* ── Results ── */}
            {!loadingPreview && hasAnyPreview && (
              <div className="space-y-4">

                {/* ═══ Grand Total ═══ */}
                <div className="bg-green-500/20 border-2 border-green-400/50 rounded-lg p-6 shadow-lg">
                  <h2 className="text-lg font-bold text-green-300 mb-2 drop-shadow">Total Emisiones (4 Etapas)</h2>
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <span className="text-4xl font-bold text-white drop-shadow-lg">{fmt(grandTotalKg)}</span>
                    <span className="text-sm text-white/80">kg CO₂eq</span>
                    <span className="text-white/40 text-2xl">|</span>
                    <span className="text-3xl font-bold text-green-300 drop-shadow-lg">{fmt(Math.round(grandTotalTon * 1000000) / 1000000)}</span>
                    <span className="text-sm text-white/80">ton CO₂eq</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <MiniSummary
                      label="eBiomass"
                      kg={previews.ebiomas?.emisiones_total_kg}
                      error={errors.ebiomas}
                    />
                    <MiniSummary
                      label="eProduction"
                      kg={previews.epirolisis?.emisiones_total_kg}
                      error={errors.epirolisis}
                    />
                    <MiniSummary
                      label="eTransporte"
                      kg={previews.etransporte?.emisiones_total_kg}
                      error={errors.etransporte}
                    />
                    <MiniSummary
                      label="eUse"
                      kg={previews.euse?.resumen.emisiones_total_kg}
                      error={errors.euse}
                    />
                  </div>
                </div>

                {/* ═══ eBiomass Accordion ═══ */}
                <AccordionSection
                  title="Etapa 1 — eBiomass"
                  subtitle="Emisiones transporte de biomasa"
                  totalKg={previews.ebiomas?.emisiones_total_kg}
                  error={errors.ebiomas}
                  isOpen={expandedSection === 'ebiomas'}
                  onToggle={() => toggleSection('ebiomas')}
                >
                  {previews.ebiomas && (
                    <div className="space-y-3">
                      <DetailRow label="Total viajes" value={previews.ebiomas.total_viajes} unit="viajes"
                        formula={`COUNT(viajes del ${previews.ebiomas.periodo.fecha_inicio} al ${previews.ebiomas.periodo.fecha_fin})`} />
                      <DetailRow label="Litros diésel" value={previews.ebiomas.litros_diesel} unit="L"
                        formula={`${previews.ebiomas.total_viajes} viajes × ${previews.ebiomas.desglose.consumo_diesel_por_viaje} L/viaje`} />
                      <DetailRow label="Kg diésel" value={previews.ebiomas.kg_diesel} unit="kg"
                        formula={`${fmt(previews.ebiomas.litros_diesel)} L × ${previews.ebiomas.desglose.densidad_diesel} kg/L`} />
                      <DetailRow label="Emisiones producción (upstream)" value={previews.ebiomas.emisiones_produccion_kg} unit="kg CO₂"
                        formula={`${fmt(previews.ebiomas.kg_diesel)} kg × ${previews.ebiomas.desglose.factor_produccion_usado}`} color="yellow" />
                      <DetailRow label="Emisiones combustión" value={previews.ebiomas.emisiones_combustion_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.ebiomas.kg_diesel)} kg × ${previews.ebiomas.desglose.factor_combustion_usado}`} color="orange" />
                      <TotalRow label="Total eBiomass" kg={previews.ebiomas.emisiones_total_kg} ton={previews.ebiomas.emisiones_total_ton} />
                    </div>
                  )}
                </AccordionSection>

                {/* ═══ eProduction Accordion ═══ */}
                <AccordionSection
                  title="Etapa 2 — eProduction"
                  subtitle="Emisiones proceso de pirólisis"
                  totalKg={previews.epirolisis?.emisiones_total_kg}
                  error={errors.epirolisis}
                  isOpen={expandedSection === 'epirolisis'}
                  onToggle={() => toggleSection('epirolisis')}
                >
                  {previews.epirolisis && (
                    <div className="space-y-3">
                      {/* Informational rows (not in total) */}
                      <DetailRow label="Electricidad" value={previews.epirolisis.componentes.electricidad_kg} unit="kg CO₂"
                        formula={`${fmt(previews.epirolisis.kwh_total)} kWh × FE electricidad`} color="blue" badge="Informativo" />
                      <DetailRow label="CO₂ biogénico" value={previews.epirolisis.componentes.co2_biogenico_kg} unit="kg CO₂"
                        formula={`${fmt(previews.epirolisis.m3_biogas_total)} m³ biogás × FE CO₂`} color="blue" badge="Informativo" />

                      {/* Rows that count toward total */}
                      <DetailRow label="CH₄ biogás" value={previews.epirolisis.componentes.ch4_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.m3_biogas_total)} m³ biogás × FE CH₄`} />
                      <DetailRow label="N₂O biogás" value={previews.epirolisis.componentes.n2o_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.m3_biogas_total)} m³ biogás × FE N₂O`} />
                      <DetailRow label="Big Bags (total)" value={previews.epirolisis.componentes.big_bags_total_kg} unit="kg CO₂eq"
                        formula={`${previews.epirolisis.total_big_bags} big bags × 0.08 kg × (3.361 + 0.490 + 3.304 + 0.101)`} />
                      <DetailRow label="  └ PP no tejido" value={previews.epirolisis.componentes.big_bags_pp_no_tejido_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.big_bags_masa_total_kg)} kg × 3.361`} color="blue" badge="Sub-comp A" />
                      <DetailRow label="  └ Fibra tejida" value={previews.epirolisis.componentes.big_bags_fibra_tejida_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.big_bags_masa_total_kg)} kg × 0.490`} color="blue" badge="Sub-comp B" />
                      <DetailRow label="  └ Film LDPE" value={previews.epirolisis.componentes.big_bags_film_ldpe_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.big_bags_masa_total_kg)} kg × 3.304`} color="blue" badge="Sub-comp C" />
                      <DetailRow label="  └ Descarte PP" value={previews.epirolisis.componentes.big_bags_descarte_pp_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.big_bags_masa_total_kg)} kg × 0.101`} color="blue" badge="Sub-comp D" />
                      <DetailRow label="Lonas (total)" value={previews.epirolisis.componentes.lonas_total_kg} unit="kg CO₂eq"
                        formula={`${previews.epirolisis.total_lonas} lonas × 0.0501 kg × (3.361 + 0.490)`} />
                      <DetailRow label="  └ PP no tejido" value={previews.epirolisis.componentes.lonas_pp_no_tejido_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.lonas_masa_total_kg)} kg × 3.361`} color="blue" badge="Sub-comp A" />
                      <DetailRow label="  └ Fibra tejida" value={previews.epirolisis.componentes.lonas_fibra_tejida_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.lonas_masa_total_kg)} kg × 0.490`} color="blue" badge="Sub-comp B" />

                      {/* Residuos */}
                      <div className="border-t border-white/10 pt-2 mt-2">
                        <p className="text-xs text-white/50 mb-2 font-semibold uppercase tracking-wide">Residuos (Alcance 3)</p>
                      </div>
                      <DetailRow label="Lubricantes" value={previews.epirolisis.componentes.residuos_lubricants_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.residuos_lubricants_kg)} kg × FE lubricantes`} />
                      <DetailRow label="Aceite usado" value={previews.epirolisis.componentes.residuos_used_oil_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.residuos_used_oil_kg)} kg × FE aceite usado`} />
                      <DetailRow label="Latas de pintura" value={previews.epirolisis.componentes.residuos_paint_cans_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.residuos_paint_cans_kg)} kg × FE latas pintura`} />
                      <DetailRow label="EPP" value={previews.epirolisis.componentes.residuos_ppe_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.residuos_ppe_kg)} kg × FE EPP`} />

                      {/* Chimenea */}
                      <div className="border-t border-white/10 pt-2 mt-2">
                        <p className="text-xs text-white/50 mb-2 font-semibold uppercase tracking-wide">Gases de chimenea</p>
                      </div>
                      <DetailRow label="Chimenea CO" value={previews.epirolisis.componentes.chimenea_co_kg} unit="kg CO"
                        formula={`${fmt(previews.epirolisis.horas_producidas)} hrs × chimenea CO kg/hr`} color="blue" badge="Informativo" />
                      <DetailRow label="Chimenea CO₂" value={previews.epirolisis.componentes.chimenea_co2_kg} unit="kg CO₂"
                        formula={`${fmt(previews.epirolisis.horas_producidas)} hrs × chimenea CO₂ kg/hr`} color="blue" badge="Informativo" />
                      <DetailRow label="Chimenea CH₄" value={previews.epirolisis.componentes.chimenea_ch4_co2eq_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.chimenea_ch4_kg)} kg CH₄ × GWP CH₄`} />
                      <DetailRow label="Chimenea N₂O" value={previews.epirolisis.componentes.chimenea_n2o_co2eq_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.epirolisis.componentes.chimenea_n2o_kg)} kg N₂O × GWP N₂O`} />

                      <TotalRow label="Total eProduction" kg={previews.epirolisis.emisiones_total_kg} ton={previews.epirolisis.emisiones_total_ton} />
                    </div>
                  )}
                </AccordionSection>

                {/* ═══ eTransporte Accordion ═══ */}
                <AccordionSection
                  title="Etapa 3 — eTransporte"
                  subtitle="Emisiones transporte de biochar"
                  totalKg={previews.etransporte?.emisiones_total_kg}
                  error={errors.etransporte}
                  isOpen={expandedSection === 'etransporte'}
                  onToggle={() => toggleSection('etransporte')}
                >
                  {previews.etransporte && (
                    <div className="space-y-3">
                      <DetailRow label="Total baches despachados" value={previews.etransporte.total_baches} unit="baches"
                        formula={`COUNT(baches con Salida confirmada en período)`} />
                      <DetailRow label="Total viajes" value={previews.etransporte.total_viajes} unit="viajes"
                        formula={`SUM(cantidad_viajes de baches)`} />
                      <DetailRow label="Distancia total" value={previews.etransporte.distancia_total_km} unit="km"
                        formula={`${previews.etransporte.total_viajes} viajes × ${previews.etransporte.desglose.distancia_km_viaje} km/viaje`} />
                      <DetailRow label="Litros diésel" value={previews.etransporte.litros_diesel} unit="L"
                        formula={`${fmt(previews.etransporte.distancia_total_km)} km × ${previews.etransporte.desglose.consumo_L_km} L/km`} />
                      <DetailRow label="Kg diésel" value={previews.etransporte.kg_diesel} unit="kg"
                        formula={`${fmt(previews.etransporte.litros_diesel)} L × ${previews.etransporte.desglose.densidad_diesel} kg/L`} />
                      <DetailRow label="Emisiones combustión" value={previews.etransporte.emisiones_combustion_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.etransporte.kg_diesel)} kg × ${previews.etransporte.desglose.fe_combustion}`} color="orange" />
                      <DetailRow label="Emisiones upstream" value={previews.etransporte.emisiones_upstream_kg} unit="kg CO₂eq"
                        formula={`${fmt(previews.etransporte.kg_diesel)} kg × ${previews.etransporte.desglose.fe_upstream}`} color="yellow" />
                      <TotalRow label="Total eTransporte" kg={previews.etransporte.emisiones_total_kg} ton={previews.etransporte.emisiones_total_ton} />
                    </div>
                  )}
                </AccordionSection>

                {/* ═══ eUse Accordion ═══ */}
                <AccordionSection
                  title="Etapa 4 — eUse"
                  subtitle="Emisiones transporte de biochar a clientes"
                  totalKg={previews.euse?.resumen.emisiones_total_kg}
                  error={errors.euse}
                  isOpen={expandedSection === 'euse'}
                  onToggle={() => toggleSection('euse')}
                >
                  {previews.euse && (
                    <div className="space-y-3">
                      <DetailRow label="Remisiones analizadas" value={previews.euse.remisiones_analizadas} unit="remisiones"
                        formula={`COUNT(remisiones con Fecha Evento del ${previews.euse.periodo.fecha_inicio} al ${previews.euse.periodo.fecha_fin})`} />
                      <DetailRow label="Remisiones liviano (≤ 3.5 ton)" value={previews.euse.resumen.remisiones_liviano} unit="remisiones"
                        formula={`FE = ${previews.euse.constantes_usadas.fe_euse_liviano} kg CO₂/ton·km`} color="blue" />
                      <DetailRow label="Remisiones pesado (> 3.5 ton)" value={previews.euse.resumen.remisiones_pesado} unit="remisiones"
                        formula={`FE = ${previews.euse.constantes_usadas.fe_euse_pesado} kg CO₂/ton·km`} color="orange" />
                      <DetailRow label="Emisiones liviano" value={previews.euse.resumen.emisiones_liviano_kg} unit="kg CO₂eq"
                        formula={`SUM(ton × km × ${previews.euse.constantes_usadas.fe_euse_liviano})`} color="yellow" />
                      <DetailRow label="Emisiones pesado" value={previews.euse.resumen.emisiones_pesado_kg} unit="kg CO₂eq"
                        formula={`SUM(ton × km × ${previews.euse.constantes_usadas.fe_euse_pesado})`} color="orange" />

                      {previews.euse.desglose_por_remision.length > 0 && (
                        <div className="border-t border-white/10 pt-2 mt-2">
                          <p className="text-xs text-white/50 mb-2 font-semibold uppercase tracking-wide">Desglose por remisión</p>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {previews.euse.desglose_por_remision.map((d) => (
                              <div key={d.remision_id} className="bg-white/5 border border-white/15 rounded-lg p-3">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <span className="text-sm font-semibold text-white/90 truncate">{d.remision_numero || d.remision_id}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                                    d.tipo_vehiculo === 'liviano'
                                      ? 'bg-blue-400/20 text-blue-300 border-blue-400/30'
                                      : 'bg-orange-400/20 text-orange-300 border-orange-400/30'
                                  }`}>{d.tipo_vehiculo}</span>
                                </div>
                                <p className="text-xs text-white/70 mb-1">{d.cliente} → <span className="text-white/50">{d.cliente_match}</span> · {d.fecha_evento}</p>
                                <p className="text-xs text-white/60 font-mono">{fmt(d.ton_despachados)} ton × {d.distancia_km} km × {d.factor_emision_usado} = <span className="text-white font-bold">{fmt(d.emisiones_kg)} kg CO₂eq</span></p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <TotalRow label="Total eUse" kg={previews.euse.resumen.emisiones_total_kg} ton={previews.euse.resumen.emisiones_total_ton} />
                    </div>
                  )}
                </AccordionSection>

              </div>
            )}

            {/* Empty state */}
            {!loadingPreview && !hasAnyPreview && (
              <div className="text-center py-12 text-white/60">
                <p className="drop-shadow text-lg mb-2">Selecciona un período y presiona &quot;Calcular Todo&quot;</p>
                <p className="drop-shadow text-sm">Se ejecutarán las 4 etapas de cálculo en paralelo</p>
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function Spinner() {
  return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />;
}

function MiniSummary({ label, kg, error }: { label: string; kg?: number; error?: string }) {
  const fmt = (n: number) => {
    if (Math.abs(n) >= 1) return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
    return n.toLocaleString('es-CO', { maximumSignificantDigits: 4 });
  };

  return (
    <div className="bg-white/10 rounded-lg p-3 border border-white/20 text-center">
      <p className="text-xs text-white/60 mb-1">{label}</p>
      {error ? (
        <p className="text-sm text-red-300 font-semibold">Error</p>
      ) : kg !== undefined ? (
        <p className="text-lg font-bold text-white drop-shadow">{fmt(kg)} <span className="text-xs text-white/60">kg</span></p>
      ) : (
        <p className="text-sm text-white/40">—</p>
      )}
    </div>
  );
}

function AccordionSection({
  title,
  subtitle,
  totalKg,
  error,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  totalKg?: number;
  error?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const fmt = (n: number) => {
    if (Math.abs(n) >= 1) return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
    return n.toLocaleString('es-CO', { maximumSignificantDigits: 4 });
  };

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-lg border border-white/20 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white drop-shadow">{title}</h3>
          <p className="text-sm text-white/60">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {error ? (
            <span className="text-sm text-red-300 font-semibold bg-red-500/20 px-3 py-1 rounded-full">Error</span>
          ) : totalKg !== undefined ? (
            <span className="text-lg font-bold text-white drop-shadow">{fmt(totalKg)} <span className="text-xs text-white/60">kg CO₂eq</span></span>
          ) : (
            <span className="text-sm text-white/40">Sin datos</span>
          )}
          <svg
            className={`w-5 h-5 text-white/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="px-4 sm:px-5 pb-5 border-t border-white/10">
          <div className="pt-4">
            {error ? (
              <p className="text-red-300 text-center py-4">{error}</p>
            ) : (
              children
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  unit,
  formula,
  color,
  badge,
}: {
  label: string;
  value: number;
  unit: string;
  formula: string;
  color?: string;
  badge?: string;
}) {
  const fmt = (n: number) => {
    if (Math.abs(n) >= 1) return n.toLocaleString('es-CO', { maximumFractionDigits: 6 });
    return n.toLocaleString('es-CO', { maximumSignificantDigits: 4 });
  };

  const borderColor =
    color === 'yellow' ? 'border-yellow-400/40 bg-yellow-500/10' :
    color === 'orange' ? 'border-orange-400/40 bg-orange-500/10' :
    color === 'blue' ? 'border-blue-400/40 bg-blue-500/10' :
    'border-white/15 bg-white/5';

  return (
    <div className={`rounded-lg p-3 border backdrop-blur-sm ${borderColor}`}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-sm font-semibold text-white/90 drop-shadow">{label}</span>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              badge === 'Informativo'
                ? 'bg-blue-400/20 text-blue-300 border border-blue-400/30'
                : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
            }`}>
              {badge}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white drop-shadow-lg">{fmt(value)}</span>
        <span className="text-xs text-white/70">{unit}</span>
      </div>
      <p className="text-xs text-white/50 mt-1 font-mono">{formula}</p>
    </div>
  );
}

function TotalRow({ label, kg, ton }: { label: string; kg: number; ton: number }) {
  const fmt = (n: number) => {
    if (Math.abs(n) >= 1) return n.toLocaleString('es-CO', { maximumFractionDigits: 4 });
    return n.toLocaleString('es-CO', { maximumSignificantDigits: 4 });
  };

  return (
    <div className="bg-green-500/20 border border-green-400/50 rounded-lg p-4 shadow-lg mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-green-300 drop-shadow">{label}</span>
      </div>
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-2xl font-bold text-white drop-shadow-lg">{fmt(kg)}</span>
        <span className="text-sm text-white/80">kg CO₂eq</span>
        <span className="text-white/40">|</span>
        <span className="text-xl font-bold text-green-300 drop-shadow-lg">{fmt(ton)}</span>
        <span className="text-sm text-white/80">ton CO₂eq</span>
      </div>
    </div>
  );
}

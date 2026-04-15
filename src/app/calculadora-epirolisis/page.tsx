"use client";

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

interface EPirolisisComponentes {
  electricidad_kg: number;
  electricidad_suma_al_total: boolean;
  co2_biogenico_kg: number;
  co2_biogenico_suma_al_total: boolean;
  ch4_kg: number;
  n2o_kg: number;
  big_bags_kg: number;
  big_bags_factor_pendiente: boolean;
  lonas_kg: number;
  lonas_factor_pendiente: boolean;
  // Residuos por categoría (Alcance 3)
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

interface EPirolisisResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  turno_id: string | null;
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
  emisiones_electricidad_kg: number;
  emisiones_co2_biogenico_kg: number;
  emisiones_ch4_kg: number;
  emisiones_n2o_kg: number;
  emisiones_big_bags_kg: number;
  emisiones_lonas_kg: number;
  emisiones_residuos_lubricants_kg: number;
  emisiones_residuos_used_oil_kg: number;
  emisiones_residuos_paint_cans_kg: number;
  emisiones_residuos_ppe_kg: number;
  emisiones_residuos_total_kg: number;
  emisiones_chimenea_co_kg: number;
  emisiones_chimenea_co2_kg: number;
  emisiones_chimenea_ch4_kg: number;
  emisiones_chimenea_ch4_co2eq_kg: number;
  emisiones_chimenea_n2o_kg: number;
  emisiones_chimenea_n2o_co2eq_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  constantes_usadas: Record<string, number>;
  factores_pendientes: string[];
  calculado_por: string;
  created_at: string;
}

export default function CalculadoraEPirolisisPage() {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [turnoId, setTurnoId] = useState('');
  const [preview, setPreview] = useState<EPirolisisPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCalculo, setLoadingCalculo] = useState(false);
  const [resultados, setResultados] = useState<EPirolisisResultado[]>([]);
  const [loadingResultados, setLoadingResultados] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'calculadora' | 'historial'>('calculadora');
  const [userName, setUserName] = useState('Sistema');

  useEffect(() => {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      try {
        const session = JSON.parse(userSession);
        const nombre = session.Nombre || session.nombre || '';
        const apellido = session.Apellido || session.apellido || '';
        setUserName(`${nombre} ${apellido}`.trim() || 'Sistema');
      } catch { /* ignore */ }
    }
  }, []);

  const cargarResultados = useCallback(async (page: number = 1) => {
    setLoadingResultados(true);
    try {
      const res = await fetch(`/api/carbon/epirolisis/resultados?page=${page}&pageSize=10`);
      const data = await res.json();
      if (data.success) {
        setResultados(data.data || []);
        setPagination(data.pagination || { page: 1, totalPages: 1, total: 0 });
      }
    } catch (err) {
      console.error('Error cargando resultados:', err);
    } finally {
      setLoadingResultados(false);
    }
  }, []);

  useEffect(() => {
    cargarResultados();
  }, [cargarResultados]);

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
    try {
      const res = await fetch('/api/carbon/epirolisis/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          turno_id: turnoId || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error al obtener preview' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexion al servidor' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCalcular = async () => {
    if (!fechaInicio || !fechaFin) {
      setMensaje({ tipo: 'error', texto: 'Selecciona fecha de inicio y fecha de fin' });
      return;
    }

    setLoadingCalculo(true);
    setMensaje(null);
    try {
      const res = await fetch('/api/carbon/epirolisis/calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          turno_id: turnoId || null,
          calculado_por: userName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
        setMensaje({ tipo: 'success', texto: `Calculo guardado exitosamente (ID: ${data.registro_id})` });
        cargarResultados();
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error al calcular' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexion al servidor' });
    } finally {
      setLoadingCalculo(false);
    }
  };

  const exportarJSON = (resultado: EPirolisisResultado) => {
    const blob = new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epirolisis_reporte_${resultado.fecha_inicio_periodo}_${resultado.fecha_fin_periodo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarCSV = (resultado: EPirolisisResultado) => {
    const rows = [
      ['Campo', 'Valor', 'Unidad', 'Nota'],
      ['Periodo inicio', resultado.fecha_inicio_periodo, '', ''],
      ['Periodo fin', resultado.fecha_fin_periodo, '', ''],
      ['Turnos analizados', String(resultado.turnos_analizados), 'turnos', ''],
      ['Horas producidas', String(resultado.horas_producidas), 'horas', 'Solo turnos con balances de masa'],
      ['kWh total', String(resultado.kwh_total), 'kWh', ''],
      ['m3 biogas total', String(resultado.m3_biogas_total), 'm3', ''],
      ['Big bags', String(resultado.total_big_bags), 'unidades', ''],
      ['Lonas', String(resultado.total_lonas), 'unidades', ''],
      ['Residuos lubricants', String(resultado.residuos_lubricants_kg), 'kg', ''],
      ['Residuos used oil', String(resultado.residuos_used_oil_kg), 'kg', ''],
      ['Residuos paint cans', String(resultado.residuos_paint_cans_kg), 'kg', ''],
      ['Residuos PPE', String(resultado.residuos_ppe_kg), 'kg', ''],
      ['Emisiones electricidad', String(resultado.emisiones_electricidad_kg), 'kg CO2', 'Informativo'],
      ['Emisiones CO2 biogenico', String(resultado.emisiones_co2_biogenico_kg), 'kg CO2', 'Informativo'],
      ['Emisiones CH4', String(resultado.emisiones_ch4_kg), 'kg CO2eq', 'Suma al total'],
      ['Emisiones N2O', String(resultado.emisiones_n2o_kg), 'kg CO2eq', 'Suma al total'],
      ['Emisiones big bags', String(resultado.emisiones_big_bags_kg), 'kg CO2eq', 'Factor pendiente'],
      ['Emisiones lonas', String(resultado.emisiones_lonas_kg), 'kg CO2eq', 'Factor pendiente'],
      ['Emisiones residuos lubricants', String(resultado.emisiones_residuos_lubricants_kg), 'kg CO2eq', 'Alcance 3'],
      ['Emisiones residuos used oil', String(resultado.emisiones_residuos_used_oil_kg), 'kg CO2eq', 'Alcance 3'],
      ['Emisiones residuos paint cans', String(resultado.emisiones_residuos_paint_cans_kg), 'kg CO2eq', 'Alcance 3'],
      ['Emisiones residuos PPE', String(resultado.emisiones_residuos_ppe_kg), 'kg CO2eq', 'Alcance 3'],
      ['Emisiones residuos total', String(resultado.emisiones_residuos_total_kg), 'kg CO2eq', 'Suma al total'],
      ['Chimenea CO (masa)', String(resultado.emisiones_chimenea_co_kg), 'kg', 'Informativo'],
      ['Chimenea CO2 (masa)', String(resultado.emisiones_chimenea_co2_kg), 'kg', 'Informativo - biogenico'],
      ['Chimenea CH4 (masa)', String(resultado.emisiones_chimenea_ch4_kg), 'kg', ''],
      ['Chimenea CH4 (CO2eq)', String(resultado.emisiones_chimenea_ch4_co2eq_kg), 'kg CO2eq', 'Suma al total'],
      ['Chimenea N2O (masa)', String(resultado.emisiones_chimenea_n2o_kg), 'kg', ''],
      ['Chimenea N2O (CO2eq)', String(resultado.emisiones_chimenea_n2o_co2eq_kg), 'kg CO2eq', 'Suma al total'],
      ['Emisiones totales', String(resultado.emisiones_total_kg), 'kg CO2eq', ''],
      ['Emisiones totales', String(resultado.emisiones_total_ton), 'ton CO2eq', ''],
      ['Calculado por', resultado.calculado_por, '', ''],
      ['Fecha calculo', resultado.created_at, '', ''],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `epirolisis_reporte_${resultado.fecha_inicio_periodo}_${resultado.fecha_fin_periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/textura-biochar.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/70"></div>

      <div className="relative z-10">
        <Navbar />

        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-5xl mx-auto border border-white/30">
            {/* Partner Logos */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <Image src="/logo.png" alt="Sirius" width={200} height={80} className="h-20 w-auto drop-shadow-lg" priority />
              <span className="text-white/40 text-2xl font-light select-none">&times;</span>
              <Image src="/logo-earth-blanco.png" alt="Puro Earth" width={200} height={80} className="h-20 w-auto drop-shadow-lg" priority />
            </div>

            <h1 className="text-3xl font-bold text-white mb-2 text-center drop-shadow-lg">
              Calculadora de Carbono &mdash; eProduction
            </h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Etapa 2: Emisiones de CO&#x2082;eq del proceso de produccion de biochar
            </p>

            {/* Tabs */}
            <div className="flex justify-center mb-8">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-1 flex gap-1 border border-white/20">
                <button
                  onClick={() => setActiveTab('calculadora')}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    activeTab === 'calculadora'
                      ? 'bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Calculadora
                </button>
                <button
                  onClick={() => { setActiveTab('historial'); cargarResultados(); }}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    activeTab === 'historial'
                      ? 'bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Historial ({pagination.total})
                </button>
              </div>
            </div>

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

            {activeTab === 'calculadora' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Formulario */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">
                      Periodo
                    </h2>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                            Fecha inicio *
                          </label>
                          <input
                            type="date"
                            value={fechaInicio}
                            onChange={(e) => { setFechaInicio(e.target.value); setPreview(null); }}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                            Fecha fin *
                          </label>
                          <input
                            type="date"
                            value={fechaFin}
                            onChange={(e) => { setFechaFin(e.target.value); setPreview(null); }}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 font-medium"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                        <button
                          onClick={handlePreview}
                          disabled={loadingPreview || !fechaInicio || !fechaFin}
                          className="px-8 py-3 bg-white/20 hover:bg-white/30 text-white border-2 border-white/40 rounded-lg font-semibold backdrop-blur-sm drop-shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {loadingPreview ? (
                            <>
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                              Calculando...
                            </>
                          ) : (
                            'Preview'
                          )}
                        </button>
                        <button
                          onClick={handleCalcular}
                          disabled={loadingCalculo || !fechaInicio || !fechaFin}
                          className="px-8 py-3 bg-gradient-to-r from-[#5A7836] to-[#4a6429] hover:from-[#4a6429] hover:to-[#3d5422] text-white border-2 border-[#5A7836]/60 rounded-lg font-semibold backdrop-blur-sm drop-shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {loadingCalculo ? (
                            <>
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                              Guardando...
                            </>
                          ) : (
                            'Calcular y guardar'
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Metodología */}
                    <div className="mt-6 p-4 bg-green-500/20 border border-green-400/50 rounded-lg">
                      <h3 className="text-sm font-bold text-white mb-2 drop-shadow">Metodología de cálculo</h3>
                      <ol className="text-xs text-white/80 space-y-1 list-decimal list-inside">
                        <li>Sumar kWh, m&#xB3; biogas y horas de turnos del periodo</li>
                        <li>Electricidad = kWh x FE (informativo, no suma)</li>
                        <li>CO&#x2082; biogenico = m&#xB3; x FE (informativo, no suma)</li>
                        <li>CH&#x2084; = m&#xB3; x FE (suma al total)</li>
                        <li>N&#x2082;O = m&#xB3; x FE (suma al total)</li>
                        <li>Big Bags, Lonas (factores pendientes)</li>
                        <li>Residuos por categoria (Alcance 3, 4 EF)</li>
                        <li>Gases chimenea: horas x kg/hr x GWP</li>
                        <li>Total = CH&#x2084; + N&#x2082;O + pendientes + residuos + chimenea</li>
                      </ol>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">
                      Desglose del cálculo de emisiones
                    </h2>

                    {!preview && !loadingPreview && (
                      <div className="text-center py-12 text-white/60">
                        <p className="drop-shadow">Selecciona un periodo y presiona &quot;Preview&quot; para ver el desglose</p>
                      </div>
                    )}

                    {loadingPreview && (
                      <div className="text-center py-12 text-white/70">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                        <p className="drop-shadow">Consultando turnos de pirolisis...</p>
                      </div>
                    )}

                    {preview && (
                      <div className="space-y-3">
                        {/* Datos fuente */}
                        <div className="bg-white/5 rounded-lg p-3 border border-white/20 backdrop-blur-sm">
                          <span className="text-xs font-bold text-white/80 drop-shadow">Datos del periodo</span>
                          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                            <div><span className="text-white/60">Turnos:</span> <span className="text-white font-bold">{preview.turnos_analizados}</span></div>
                            <div><span className="text-white/60">Horas:</span> <span className="text-white font-bold">{preview.horas_producidas}</span></div>
                            <div><span className="text-white/60">kWh:</span> <span className="text-white font-bold">{preview.kwh_total}</span></div>
                            <div><span className="text-white/60">m&#xB3; biogas:</span> <span className="text-white font-bold">{preview.m3_biogas_total}</span></div>
                            <div><span className="text-white/60">Big Bags:</span> <span className="text-white font-bold">{preview.total_big_bags}</span></div>
                            <div><span className="text-white/60">Lonas:</span> <span className="text-white font-bold">{preview.total_lonas}</span></div>
                            <div><span className="text-white/60">Res. Lubricants:</span> <span className="text-white font-bold">{preview.residuos_lubricants_kg} kg</span></div>
                            <div><span className="text-white/60">Res. Used Oil:</span> <span className="text-white font-bold">{preview.residuos_used_oil_kg} kg</span></div>
                            <div><span className="text-white/60">Res. Paint Cans:</span> <span className="text-white font-bold">{preview.residuos_paint_cans_kg} kg</span></div>
                            <div><span className="text-white/60">Res. PPE:</span> <span className="text-white font-bold">{preview.residuos_ppe_kg} kg</span></div>
                          </div>
                        </div>

                        {/* Componente 1 — Electricidad (informativo) */}
                        <ComponentCard
                          numero={1}
                          titulo="Electricidad (biogas propio)"
                          valor={preview.componentes.electricidad_kg}
                          unidad="kg CO&#x2082;"
                          formula={`${preview.kwh_total} kWh x ${preview.desglose.factores_usados.fe_electricidad}`}
                          tipo="informativo"
                        />

                        {/* Componente 2 — CO₂ biogénico (informativo) */}
                        <ComponentCard
                          numero={2}
                          titulo="CO&#x2082; biogenico del biogas"
                          valor={preview.componentes.co2_biogenico_kg}
                          unidad="kg CO&#x2082;"
                          formula={`${preview.m3_biogas_total} m&#xB3; x ${preview.desglose.factores_usados.fe_co2_biogas}`}
                          tipo="informativo"
                        />

                        {/* Componente 3 — CH₄ (activo) */}
                        <ComponentCard
                          numero={3}
                          titulo="CH&#x2084; del biogas"
                          valor={preview.componentes.ch4_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.m3_biogas_total} m&#xB3; x ${preview.desglose.factores_usados.fe_ch4_biogas}`}
                          tipo="activo"
                        />

                        {/* Componente 4 — N₂O (activo) */}
                        <ComponentCard
                          numero={4}
                          titulo="N&#x2082;O del biogas"
                          valor={preview.componentes.n2o_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.m3_biogas_total} m&#xB3; x ${preview.desglose.factores_usados.fe_n2o_biogas}`}
                          tipo="activo"
                        />

                        {/* Componente 5 — Big Bags (pendiente) */}
                        <ComponentCard
                          numero={5}
                          titulo="Big Bags usados"
                          valor={preview.componentes.big_bags_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.total_big_bags} unidades x ${preview.desglose.factores_usados.fe_big_bag}`}
                          tipo={preview.componentes.big_bags_factor_pendiente ? 'pendiente' : 'activo'}
                        />

                        {/* Componente 6 — Lonas (pendiente) */}
                        <ComponentCard
                          numero={6}
                          titulo="Lonas usadas"
                          valor={preview.componentes.lonas_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.total_lonas} unidades x ${preview.desglose.factores_usados.fe_lona}`}
                          tipo={preview.componentes.lonas_factor_pendiente ? 'pendiente' : 'activo'}
                        />

                        {/* Separador — Residuos por categoría (Alcance 3) */}
                        <div className="border-t border-white/20 pt-2 mt-1">
                          <span className="text-xs font-bold text-white/60 uppercase tracking-wider drop-shadow">Residuos operacionales (Alcance 3)</span>
                        </div>

                        {/* Componente 7 — Lubricants */}
                        <ComponentCard
                          numero={7}
                          titulo="Residuos — Lubricants"
                          valor={preview.componentes.residuos_lubricants_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.residuos_lubricants_kg} kg x ${preview.desglose.factores_usados.fe_residuo_lubricants}`}
                          tipo="activo"
                        />

                        {/* Componente 8 — Used Oil */}
                        <ComponentCard
                          numero={8}
                          titulo="Residuos — Used Oil"
                          valor={preview.componentes.residuos_used_oil_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.residuos_used_oil_kg} kg x ${preview.desglose.factores_usados.fe_residuo_used_oil}`}
                          tipo="activo"
                        />

                        {/* Componente 9 — Paint Cans */}
                        <ComponentCard
                          numero={9}
                          titulo="Residuos — Paint Cans"
                          valor={preview.componentes.residuos_paint_cans_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.residuos_paint_cans_kg} kg x ${preview.desglose.factores_usados.fe_residuo_paint_cans}`}
                          tipo="activo"
                        />

                        {/* Componente 10 — PPE */}
                        <ComponentCard
                          numero={10}
                          titulo="Residuos — PPE"
                          valor={preview.componentes.residuos_ppe_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.residuos_ppe_kg} kg x ${preview.desglose.factores_usados.fe_residuo_ppe}`}
                          tipo="activo"
                        />

                        {/* Separador — Gases de chimenea */}
                        <div className="border-t border-white/20 pt-2 mt-1">
                          <span className="text-xs font-bold text-white/60 uppercase tracking-wider drop-shadow">Gases de chimenea (Flue Gases)</span>
                        </div>

                        {/* Componente 11 — Chimenea CO (informativo) */}
                        <ComponentCard
                          numero={11}
                          titulo="CO chimenea"
                          valor={preview.componentes.chimenea_co_kg}
                          unidad="kg CO"
                          formula={`${preview.horas_producidas} hrs x ${preview.desglose.factores_usados.chimenea_co_kg_hr} kg/hr`}
                          tipo="informativo"
                        />

                        {/* Componente 12 — Chimenea CO₂ (informativo, biogénico) */}
                        <ComponentCard
                          numero={12}
                          titulo="CO&#x2082; chimenea (biogenico)"
                          valor={preview.componentes.chimenea_co2_kg}
                          unidad="kg CO&#x2082;"
                          formula={`${preview.horas_producidas} hrs x ${preview.desglose.factores_usados.chimenea_co2_kg_hr} kg/hr`}
                          tipo="informativo"
                        />

                        {/* Componente 13 — Chimenea CH₄ (activo) */}
                        <ComponentCard
                          numero={13}
                          titulo="CH&#x2084; chimenea"
                          valor={preview.componentes.chimenea_ch4_co2eq_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.horas_producidas} hrs x ${preview.desglose.factores_usados.chimenea_ch4_kg_hr} kg/hr x ${preview.desglose.factores_usados.gwp_ch4} GWP = ${preview.componentes.chimenea_ch4_kg} kg x ${preview.desglose.factores_usados.gwp_ch4}`}
                          tipo="activo"
                        />

                        {/* Componente 14 — Chimenea N₂O (activo) */}
                        <ComponentCard
                          numero={14}
                          titulo="N&#x2082;O chimenea"
                          valor={preview.componentes.chimenea_n2o_co2eq_kg}
                          unidad="kg CO&#x2082;eq"
                          formula={`${preview.horas_producidas} hrs x ${preview.desglose.factores_usados.chimenea_n2o_kg_hr} kg/hr x ${preview.desglose.factores_usados.gwp_n2o} GWP = ${preview.componentes.chimenea_n2o_kg} kg x ${preview.desglose.factores_usados.gwp_n2o}`}
                          tipo="activo"
                        />

                        {/* Total */}
                        <div className="bg-green-500/20 border border-green-400/50 rounded-lg p-4 shadow-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-green-300 drop-shadow">Total eProduction</span>
                            <span className="text-xs text-white/60">CH&#x2084; + N&#x2082;O + pendientes + residuos + chimenea</span>
                          </div>
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-3xl font-bold text-white drop-shadow-lg">{preview.emisiones_total_kg}</span>
                            <span className="text-sm text-white/80">kg CO&#x2082;eq</span>
                            <span className="text-white/40">|</span>
                            <span className="text-2xl font-bold text-green-300 drop-shadow-lg">{preview.emisiones_total_ton}</span>
                            <span className="text-sm text-white/80">ton CO&#x2082;eq</span>
                          </div>
                          {preview.desglose.factores_pendientes.length > 0 && (
                            <p className="text-xs text-amber-300/80 mt-2">
                              * {preview.desglose.factores_pendientes.length} factor(es) pendiente(s) de confirmacion
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'historial' && (
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-white drop-shadow">Historial de calculos</h2>
                  <button
                    onClick={() => cargarResultados(pagination.page)}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm font-medium transition-all duration-200 drop-shadow"
                  >
                    Actualizar
                  </button>
                </div>

                {loadingResultados && (
                  <div className="text-center py-12 text-white/70">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <p className="drop-shadow">Cargando historial...</p>
                  </div>
                )}

                {!loadingResultados && resultados.length === 0 && (
                  <div className="text-center py-12 text-white/60">
                    <p className="drop-shadow">No hay calculos guardados aun</p>
                  </div>
                )}

                {!loadingResultados && resultados.length > 0 && (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/20">
                            <th className="text-left py-3 px-2 text-white/80 font-medium drop-shadow">Periodo</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">Turnos</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">kg CO&#x2082;eq</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">ton CO&#x2082;eq</th>
                            <th className="text-left py-3 px-2 text-white/80 font-medium drop-shadow">Calculado por</th>
                            <th className="text-left py-3 px-2 text-white/80 font-medium drop-shadow">Fecha</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">Exportar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultados.map((r) => (
                            <tr key={r.id} className="border-b border-white/10 hover:bg-white/10 transition-colors">
                              <td className="py-3 px-2">
                                <span className="text-white drop-shadow">{r.fecha_inicio_periodo}</span>
                                <span className="text-white/50"> &rarr; </span>
                                <span className="text-white drop-shadow">{r.fecha_fin_periodo}</span>
                              </td>
                              <td className="text-right py-3 px-2 text-white font-mono drop-shadow">{r.turnos_analizados}</td>
                              <td className="text-right py-3 px-2 text-white font-mono drop-shadow">{r.emisiones_total_kg}</td>
                              <td className="text-right py-3 px-2 text-green-300 font-mono font-bold drop-shadow">{r.emisiones_total_ton}</td>
                              <td className="py-3 px-2 text-white/80 drop-shadow">{r.calculado_por}</td>
                              <td className="py-3 px-2 text-white/60 text-xs drop-shadow">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO') : '\u2014'}
                              </td>
                              <td className="text-right py-3 px-2">
                                <div className="flex gap-1 justify-end">
                                  <button
                                    onClick={() => exportarJSON(r)}
                                    className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-xs font-medium border border-white/20 transition-all"
                                    title="Exportar JSON"
                                  >
                                    JSON
                                  </button>
                                  <button
                                    onClick={() => exportarCSV(r)}
                                    className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-xs font-medium border border-white/20 transition-all"
                                    title="Exportar CSV"
                                  >
                                    CSV
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-4">
                      {resultados.map((r) => (
                        <div key={r.id} className="bg-white/10 rounded-lg p-4 border border-white/20">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-white font-medium text-sm drop-shadow">
                                {r.fecha_inicio_periodo} &rarr; {r.fecha_fin_periodo}
                              </p>
                              <p className="text-white/60 text-xs">{r.calculado_por} &middot; {r.turnos_analizados} turnos</p>
                            </div>
                            <div className="text-right">
                              <p className="text-green-300 font-bold drop-shadow">{r.emisiones_total_ton} ton</p>
                              <p className="text-white/60 text-xs">{r.emisiones_total_kg} kg</p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => exportarJSON(r)}
                              className="flex-1 bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-xs font-medium border border-white/20 transition-all"
                            >
                              JSON
                            </button>
                            <button
                              onClick={() => exportarCSV(r)}
                              className="flex-1 bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-xs font-medium border border-white/20 transition-all"
                            >
                              CSV
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Paginacion */}
                    {pagination.totalPages > 1 && (
                      <div className="flex justify-center gap-2 mt-6">
                        <button
                          onClick={() => cargarResultados(pagination.page - 1)}
                          disabled={pagination.page <= 1}
                          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          &larr; Anterior
                        </button>
                        <span className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm border border-white/20 drop-shadow">
                          {pagination.page} / {pagination.totalPages}
                        </span>
                        <button
                          onClick={() => cargarResultados(pagination.page + 1)}
                          disabled={pagination.page >= pagination.totalPages}
                          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          Siguiente &rarr;
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

function ComponentCard({
  numero,
  titulo,
  valor,
  unidad,
  formula,
  tipo,
}: {
  numero: number;
  titulo: string;
  valor: number;
  unidad: string;
  formula: string;
  tipo: 'activo' | 'informativo' | 'pendiente';
}) {
  const styles = {
    activo: 'border-white/20 bg-white/5',
    informativo: 'border-blue-400/50 bg-blue-500/10',
    pendiente: 'border-amber-400/50 bg-amber-500/10',
  };

  const badge = {
    activo: null,
    informativo: (
      <span className="text-[10px] bg-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full border border-blue-400/30">
        No suma al total
      </span>
    ),
    pendiente: (
      <span className="text-[10px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full border border-amber-400/30">
        Factor pendiente
      </span>
    ),
  };

  return (
    <div className={`rounded-lg p-3 border backdrop-blur-sm ${styles[tipo]}`}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-xs font-bold text-white/80 drop-shadow">
          {numero}. {titulo}
        </span>
        {badge[tipo]}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white drop-shadow-lg">{valor}</span>
        <span className="text-xs text-white/70" dangerouslySetInnerHTML={{ __html: unidad }}></span>
      </div>
      <p className="text-xs text-white/50 mt-1 font-mono" dangerouslySetInnerHTML={{ __html: formula }}></p>
    </div>
  );
}

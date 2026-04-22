"use client";

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

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

interface EUseResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  remisiones_analizadas: number;
  remisiones_liviano: number;
  remisiones_pesado: number;
  emisiones_liviano_kg: number;
  emisiones_pesado_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  desglose_remisiones: EUseRemisionDetalle[];
  constantes_usadas: { fe_euse_liviano: number; fe_euse_pesado: number; umbral_ton: number };
  calculado_por: string;
  created_at: string;
}

interface RemisionSinDistancia {
  remision_id: string;
  remision_numero: string;
  cliente: string;
}

const fmt = (n: number) => {
  if (Math.abs(n) >= 1) return n.toLocaleString('es-CO', { maximumFractionDigits: 6 });
  return n.toLocaleString('es-CO', { maximumSignificantDigits: 4 });
};

export default function CalculadoraEUsePage() {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [preview, setPreview] = useState<EUsePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCalculo, setLoadingCalculo] = useState(false);
  const [resultados, setResultados] = useState<EUseResultado[]>([]);
  const [loadingResultados, setLoadingResultados] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  const [remisionesSinDistancia, setRemisionesSinDistancia] = useState<RemisionSinDistancia[] | null>(null);
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
      const res = await fetch(`/api/carbon/euse/resultados?page=${page}&pageSize=10`);
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

  useEffect(() => { cargarResultados(); }, [cargarResultados]);

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
    setRemisionesSinDistancia(null);
    try {
      const res = await fetch('/api/carbon/euse/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_inicio: fechaInicio, fecha_fin: fechaFin }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error al obtener preview' });
        if (data.remisiones_sin_distancia) setRemisionesSinDistancia(data.remisiones_sin_distancia);
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al servidor' });
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
    setRemisionesSinDistancia(null);
    try {
      const res = await fetch('/api/carbon/euse/calcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          calculado_por: userName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
        setMensaje({ tipo: 'success', texto: `Cálculo guardado exitosamente (ID: ${data.registro_id})` });
        cargarResultados();
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error al calcular' });
        if (data.remisiones_sin_distancia) setRemisionesSinDistancia(data.remisiones_sin_distancia);
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al servidor' });
    } finally {
      setLoadingCalculo(false);
    }
  };

  const exportarJSON = (resultado: EUseResultado) => {
    const blob = new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `euse_reporte_${resultado.fecha_inicio_periodo}_${resultado.fecha_fin_periodo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarCSV = (resultado: EUseResultado) => {
    const header = ['remision_numero', 'cliente', 'cliente_match', 'fecha_evento',
      'kg_despachados', 'ton_despachados', 'distancia_km', 'tipo_vehiculo',
      'factor_emision_usado', 'emisiones_kg'];
    const rows = [
      header.join(','),
      ...(resultado.desglose_remisiones || []).map(d => [
        d.remision_numero, `"${d.cliente}"`, `"${d.cliente_match}"`, d.fecha_evento,
        d.kg_despachados, d.ton_despachados, d.distancia_km, d.tipo_vehiculo,
        d.factor_emision_usado, d.emisiones_kg,
      ].join(',')),
      '',
      `Total kg CO2eq,${resultado.emisiones_total_kg}`,
      `Total ton CO2eq,${resultado.emisiones_total_ton}`,
      `Calculado por,${resultado.calculado_por}`,
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `euse_reporte_${resultado.fecha_inicio_periodo}_${resultado.fecha_fin_periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/textura-biochar.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative z-10">
        <Navbar />

        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-5xl mx-auto border border-white/30">
            <div className="flex items-center justify-center gap-6 mb-4">
              <Image src="/logo.png" alt="Sirius" width={200} height={80} className="h-20 w-auto drop-shadow-lg" priority />
              <span className="text-white/40 text-2xl font-light select-none">×</span>
              <Image src="/logo-earth-blanco.png" alt="Puro Earth" width={200} height={80} className="h-20 w-auto drop-shadow-lg" priority />
            </div>

            <h1 className="text-3xl font-bold text-white mb-2 text-center drop-shadow-lg">
              Calculadora de Carbono — eUse
            </h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Etapa 4: Emisiones de CO₂eq por transporte de biochar a clientes
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
                >Calculadora</button>
                <button
                  onClick={() => { setActiveTab('historial'); cargarResultados(); }}
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    activeTab === 'historial'
                      ? 'bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white shadow-lg'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >Historial ({pagination.total})</button>
              </div>
            </div>

            {/* Mensaje */}
            {mensaje && (
              <div className={`mb-6 p-4 rounded-lg text-center font-semibold backdrop-blur-sm ${
                mensaje.tipo === 'success'
                  ? 'bg-green-500/80 text-white border border-green-400/50 shadow-lg'
                  : 'bg-red-500/80 text-white border border-red-400/50 shadow-lg'
              }`}>{mensaje.texto}</div>
            )}

            {/* Remisiones sin distancia */}
            {remisionesSinDistancia && remisionesSinDistancia.length > 0 && (
              <div className="mb-6 p-4 rounded-lg bg-orange-500/20 border border-orange-400/50 backdrop-blur-sm">
                <h3 className="text-sm font-bold text-orange-300 mb-2 drop-shadow">
                  ⚠ Remisiones sin distancia registrada en Clientes ({remisionesSinDistancia.length})
                </h3>
                <ul className="text-xs text-white/80 space-y-1">
                  {remisionesSinDistancia.map((r) => (
                    <li key={r.remision_id} className="font-mono">
                      [{r.remision_numero || r.remision_id}] cliente: <span className="text-orange-200">&quot;{r.cliente}&quot;</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-white/60 mt-2">
                  Registra la distancia de estos clientes en la tabla Clientes (campo distancia_bodega_km) y vuelve a intentar.
                </p>
              </div>
            )}

            {activeTab === 'calculadora' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Form */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">Período de análisis</h2>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-white mb-2 drop-shadow">Fecha inicio *</label>
                          <input
                            type="date"
                            value={fechaInicio}
                            onChange={(e) => { setFechaInicio(e.target.value); setPreview(null); setRemisionesSinDistancia(null); }}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white mb-2 drop-shadow">Fecha fin *</label>
                          <input
                            type="date"
                            value={fechaFin}
                            onChange={(e) => { setFechaFin(e.target.value); setPreview(null); setRemisionesSinDistancia(null); }}
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
                            <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Calculando...</>
                          ) : 'Preview'}
                        </button>
                        <button
                          onClick={handleCalcular}
                          disabled={loadingCalculo || !fechaInicio || !fechaFin}
                          className="px-8 py-3 bg-gradient-to-r from-[#5A7836] to-[#4a6429] hover:from-[#4a6429] hover:to-[#3d5422] text-white border-2 border-[#5A7836]/60 rounded-lg font-semibold backdrop-blur-sm drop-shadow-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {loadingCalculo ? (
                            <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Guardando...</>
                          ) : 'Calcular y guardar'}
                        </button>
                      </div>
                    </div>

                    {/* Metodología */}
                    <div className="mt-6 p-4 bg-green-500/20 border border-green-400/50 rounded-lg">
                      <h3 className="text-sm font-bold text-white mb-2 drop-shadow">Metodología de cálculo</h3>
                      <ol className="text-xs text-white/80 space-y-1 list-decimal list-inside">
                        <li>Listar remisiones con Fecha Evento dentro del período</li>
                        <li>Por remisión: ton = SUM(Cantidad Especificada KG) / 1000</li>
                        <li>Si ton ≤ 3.5 → vehículo liviano (FE = 1.679 kg CO₂/ton·km)</li>
                        <li>Si ton &gt; 3.5 → vehículo pesado (FE = 0.204 kg CO₂/ton·km)</li>
                        <li>distancia_km = Clientes.distancia_bodega_km (cruce por nombre)</li>
                        <li>Si no hay match → error, nunca se calcula con 0</li>
                        <li>emisiones_remision_kg = ton × km × FE</li>
                        <li>Total = SUM(emisiones_remision_kg)</li>
                      </ol>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">Resumen del cálculo</h2>

                    {!preview && !loadingPreview && (
                      <div className="text-center py-12 text-white/60">
                        <p className="drop-shadow">Selecciona un período y presiona &quot;Preview&quot; para ver el desglose</p>
                      </div>
                    )}

                    {loadingPreview && (
                      <div className="text-center py-12 text-white/70">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                        <p className="drop-shadow">Consultando remisiones y clientes...</p>
                      </div>
                    )}

                    {preview && (
                      <div className="space-y-3">
                        <StepCard paso={1} titulo="Remisiones analizadas" valor={preview.remisiones_analizadas} unidad="remisiones"
                          formula={`COUNT(remisiones del ${preview.periodo.fecha_inicio} al ${preview.periodo.fecha_fin})`} />
                        <StepCard paso={2} titulo="Remisiones liviano (≤ 3.5 ton)" valor={preview.resumen.remisiones_liviano} unidad="remisiones"
                          formula={`FE = ${preview.constantes_usadas.fe_euse_liviano} kg CO₂/ton·km`} color="blue" />
                        <StepCard paso={3} titulo="Remisiones pesado (> 3.5 ton)" valor={preview.resumen.remisiones_pesado} unidad="remisiones"
                          formula={`FE = ${preview.constantes_usadas.fe_euse_pesado} kg CO₂/ton·km`} color="orange" />
                        <StepCard paso={4} titulo="Emisiones liviano" valor={preview.resumen.emisiones_liviano_kg} unidad="kg CO₂eq"
                          formula={`SUM(ton × km × ${preview.constantes_usadas.fe_euse_liviano})`} color="yellow" />
                        <StepCard paso={5} titulo="Emisiones pesado" valor={preview.resumen.emisiones_pesado_kg} unidad="kg CO₂eq"
                          formula={`SUM(ton × km × ${preview.constantes_usadas.fe_euse_pesado})`} color="orange" />

                        <div className="bg-green-500/20 border border-green-400/50 rounded-lg p-4 shadow-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-green-300 drop-shadow">Paso 6 — Total eUse</span>
                            <span className="text-xs text-white/60">liviano + pesado</span>
                          </div>
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-3xl font-bold text-white drop-shadow-lg">{fmt(preview.resumen.emisiones_total_kg)}</span>
                            <span className="text-sm text-white/80">kg CO₂eq</span>
                            <span className="text-white/40">|</span>
                            <span className="text-2xl font-bold text-green-300 drop-shadow-lg">{fmt(preview.resumen.emisiones_total_ton)}</span>
                            <span className="text-sm text-white/80">ton CO₂eq</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Desglose por remisión */}
                {preview && preview.desglose_por_remision.length > 0 && (
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">Desglose por remisión</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/20">
                            <th className="text-left py-2 px-2 text-white/80 font-medium drop-shadow">Remisión</th>
                            <th className="text-left py-2 px-2 text-white/80 font-medium drop-shadow">Cliente</th>
                            <th className="text-left py-2 px-2 text-white/80 font-medium drop-shadow">Fecha</th>
                            <th className="text-right py-2 px-2 text-white/80 font-medium drop-shadow">ton</th>
                            <th className="text-right py-2 px-2 text-white/80 font-medium drop-shadow">km</th>
                            <th className="text-center py-2 px-2 text-white/80 font-medium drop-shadow">Vehículo</th>
                            <th className="text-right py-2 px-2 text-white/80 font-medium drop-shadow">FE</th>
                            <th className="text-right py-2 px-2 text-white/80 font-medium drop-shadow">kg CO₂eq</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.desglose_por_remision.map((d) => (
                            <tr key={d.remision_id} className="border-b border-white/10 hover:bg-white/10 transition-colors">
                              <td className="py-2 px-2 text-white font-mono drop-shadow">{d.remision_numero || d.remision_id}</td>
                              <td className="py-2 px-2 text-white/90 drop-shadow">
                                {d.cliente}
                                {d.cliente.trim().toLowerCase() !== d.cliente_match.trim().toLowerCase() && (
                                  <span className="block text-white/40 text-[10px]">→ {d.cliente_match}</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-white/70 drop-shadow">{d.fecha_evento}</td>
                              <td className="text-right py-2 px-2 text-white font-mono drop-shadow">{fmt(d.ton_despachados)}</td>
                              <td className="text-right py-2 px-2 text-white font-mono drop-shadow">{d.distancia_km}</td>
                              <td className="text-center py-2 px-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                                  d.tipo_vehiculo === 'liviano'
                                    ? 'bg-blue-400/20 text-blue-300 border-blue-400/30'
                                    : 'bg-orange-400/20 text-orange-300 border-orange-400/30'
                                }`}>{d.tipo_vehiculo}</span>
                              </td>
                              <td className="text-right py-2 px-2 text-white/70 font-mono drop-shadow">{d.factor_emision_usado}</td>
                              <td className="text-right py-2 px-2 text-green-300 font-mono font-bold drop-shadow">{fmt(d.emisiones_kg)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'historial' && (
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-white drop-shadow">Historial de cálculos</h2>
                  <button
                    onClick={() => cargarResultados(pagination.page)}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm font-medium transition-all duration-200 drop-shadow"
                  >Actualizar</button>
                </div>

                {loadingResultados && (
                  <div className="text-center py-12 text-white/70">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <p className="drop-shadow">Cargando historial...</p>
                  </div>
                )}

                {!loadingResultados && resultados.length === 0 && (
                  <div className="text-center py-12 text-white/60">
                    <p className="drop-shadow">No hay cálculos guardados aún</p>
                  </div>
                )}

                {!loadingResultados && resultados.length > 0 && (
                  <>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/20">
                            <th className="text-left py-3 px-2 text-white/80 font-medium drop-shadow">Período</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">Remisiones</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">Liviano</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">Pesado</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">kg CO₂eq</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">ton CO₂eq</th>
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
                                <span className="text-white/50"> → </span>
                                <span className="text-white drop-shadow">{r.fecha_fin_periodo}</span>
                              </td>
                              <td className="text-right py-3 px-2 text-white font-mono drop-shadow">{r.remisiones_analizadas}</td>
                              <td className="text-right py-3 px-2 text-blue-300 font-mono drop-shadow">{r.remisiones_liviano}</td>
                              <td className="text-right py-3 px-2 text-orange-300 font-mono drop-shadow">{r.remisiones_pesado}</td>
                              <td className="text-right py-3 px-2 text-white font-mono drop-shadow">{fmt(r.emisiones_total_kg)}</td>
                              <td className="text-right py-3 px-2 text-green-300 font-mono font-bold drop-shadow">{fmt(r.emisiones_total_ton)}</td>
                              <td className="py-3 px-2 text-white/80 drop-shadow">{r.calculado_por}</td>
                              <td className="py-3 px-2 text-white/60 text-xs drop-shadow">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO') : '—'}
                              </td>
                              <td className="text-right py-3 px-2">
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => exportarJSON(r)} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-xs font-medium border border-white/20 transition-all">JSON</button>
                                  <button onClick={() => exportarCSV(r)} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded text-xs font-medium border border-white/20 transition-all">CSV</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="md:hidden space-y-4">
                      {resultados.map((r) => (
                        <div key={r.id} className="bg-white/10 rounded-lg p-4 border border-white/20">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-white font-medium text-sm drop-shadow">{r.fecha_inicio_periodo} → {r.fecha_fin_periodo}</p>
                              <p className="text-white/60 text-xs">{r.calculado_por}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-green-300 font-bold drop-shadow">{fmt(r.emisiones_total_ton)} ton</p>
                              <p className="text-white/60 text-xs">{r.remisiones_analizadas} remisiones</p>
                            </div>
                          </div>
                          <p className="text-xs text-white/70 mb-2">
                            <span className="text-blue-300">{r.remisiones_liviano} liviano</span> · <span className="text-orange-300">{r.remisiones_pesado} pesado</span>
                          </p>
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => exportarJSON(r)} className="flex-1 bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-xs font-medium border border-white/20 transition-all">JSON</button>
                            <button onClick={() => exportarCSV(r)} className="flex-1 bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-xs font-medium border border-white/20 transition-all">CSV</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {pagination.totalPages > 1 && (
                      <div className="flex justify-center gap-2 mt-6">
                        <button onClick={() => cargarResultados(pagination.page - 1)} disabled={pagination.page <= 1}
                          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all">← Anterior</button>
                        <span className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm border border-white/20 drop-shadow">{pagination.page} / {pagination.totalPages}</span>
                        <button onClick={() => cargarResultados(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all">Siguiente →</button>
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

function StepCard({
  paso, titulo, valor, unidad, formula, color = 'gray',
}: {
  paso: number; titulo: string; valor: number; unidad: string; formula: string; color?: string;
}) {
  const borderColor =
    color === 'yellow' ? 'border-yellow-400/50 bg-yellow-500/10' :
    color === 'orange' ? 'border-orange-400/50 bg-orange-500/10' :
    color === 'blue' ? 'border-blue-400/50 bg-blue-500/10' :
    'border-white/20 bg-white/5';

  return (
    <div className={`rounded-lg p-3 border backdrop-blur-sm ${borderColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-white/80 drop-shadow">Paso {paso} — {titulo}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white drop-shadow-lg">{fmt(valor)}</span>
        <span className="text-xs text-white/70">{unidad}</span>
      </div>
      <p className="text-xs text-white/50 mt-1 font-mono">{formula}</p>
    </div>
  );
}

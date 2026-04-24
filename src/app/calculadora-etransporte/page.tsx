"use client";

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';

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

interface ETransporteResultado {
  id: string;
  fecha_inicio_periodo: string;
  fecha_fin_periodo: string;
  total_baches: number;
  total_viajes: number;
  distancia_total_km: number;
  litros_diesel: number;
  kg_diesel: number;
  emisiones_combustion_kg: number;
  emisiones_upstream_kg: number;
  emisiones_total_kg: number;
  emisiones_total_ton: number;
  constantes_usadas: Record<string, number>;
  calculado_por: string;
  created_at: string;
}

export default function CalculadoraETransportePage() {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [preview, setPreview] = useState<ETransportePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCalculo, setLoadingCalculo] = useState(false);
  const [resultados, setResultados] = useState<ETransporteResultado[]>([]);
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
      const res = await fetch(`/api/carbon/etransporte/resultados?page=${page}&pageSize=10`);
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
      const res = await fetch('/api/carbon/etransporte/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
      } else {
        setMensaje({ tipo: 'error', texto: data.error || 'Error al obtener preview' });
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
    try {
      const res = await fetch('/api/carbon/etransporte/calcular', {
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
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de conexión al servidor' });
    } finally {
      setLoadingCalculo(false);
    }
  };

  const exportarJSON = (resultado: ETransporteResultado) => {
    const blob = new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etransporte_reporte_${resultado.fecha_inicio_periodo}_${resultado.fecha_fin_periodo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarCSV = (resultado: ETransporteResultado) => {
    const rows = [
      ['Campo', 'Valor', 'Unidad'],
      ['Período inicio', resultado.fecha_inicio_periodo, ''],
      ['Período fin', resultado.fecha_fin_periodo, ''],
      ['Total baches', String(resultado.total_baches), 'baches'],
      ['Total viajes', String(resultado.total_viajes), 'viajes'],
      ['Distancia total', String(resultado.distancia_total_km), 'km'],
      ['Litros diésel', String(resultado.litros_diesel), 'L'],
      ['Kg diésel', String(resultado.kg_diesel), 'kg'],
      ['Emisiones combustión', String(resultado.emisiones_combustion_kg), 'kg CO₂eq'],
      ['Emisiones upstream', String(resultado.emisiones_upstream_kg), 'kg CO₂eq'],
      ['Emisiones totales', String(resultado.emisiones_total_kg), 'kg CO₂eq'],
      ['Emisiones totales', String(resultado.emisiones_total_ton), 'ton CO₂eq'],
      ['Calculado por', resultado.calculado_por, ''],
      ['Fecha cálculo', resultado.created_at, ''],
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etransporte_reporte_${resultado.fecha_inicio_periodo}_${resultado.fecha_fin_periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('/textura-biochar.jpg')"
      }}
    >
      {/* Overlay oscuro */}
      <div className="absolute inset-0 bg-black/70"></div>
      
      <div className="relative z-10">
        <Navbar />
        
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-5xl mx-auto border border-white/30">
            {/* Partner Logos */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <Image
                src="/logo.png"
                alt="Sirius"
                width={200}
                height={80}
                className="h-20 w-auto drop-shadow-lg"
                priority
              />
              <span className="text-white/40 text-2xl font-light select-none">×</span>
              <Image
                src="/logo-earth-blanco.png"
                alt="Puro Earth"
                width={200}
                height={80}
                className="h-20 w-auto drop-shadow-lg"
                priority
              />
            </div>

            <h1 className="text-3xl font-bold text-white mb-2 text-center drop-shadow-lg">
              Calculadora de Carbono — eTransporte
            </h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Etapa 3: Emisiones de CO₂eq por transporte interno de biochar
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
                      Período de análisis
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
                      </div>
                    </div>

                    {/* Metodología */}
                    <div className="mt-6 p-4 bg-green-500/20 border border-green-400/50 rounded-lg">
                      <h3 className="text-sm font-bold text-white mb-2 drop-shadow">Metodología de cálculo</h3>
                      <ol className="text-xs text-white/80 space-y-1 list-decimal list-inside">
                        <li>Contar baches de pirólisis en el período</li>
                        <li>Viajes = FLOOR(baches / 10)</li>
                        <li>Distancia total = viajes × 0.5 km/viaje</li>
                        <li>Litros diésel = distancia × 0.3 L/km</li>
                        <li>Kg diésel = litros × 0.85 kg/L</li>
                        <li>Emisiones combustión = kg × FE combustión</li>
                        <li>Emisiones upstream = kg × FE upstream</li>
                        <li>Total eTransporte = combustión + upstream</li>
                      </ol>
                    </div>
                  </div>

                  {/* Preview del cálculo */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">
                      Desglose del cálculo
                    </h2>

                    {!preview && !loadingPreview && (
                      <div className="text-center py-12 text-white/60">
                        <p className="drop-shadow">Selecciona un período y presiona &quot;Preview&quot; para ver el desglose</p>
                      </div>
                    )}

                    {loadingPreview && (
                      <div className="text-center py-12 text-white/70">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                        <p className="drop-shadow">Consultando baches de pirólisis...</p>
                      </div>
                    )}

                    {preview && (
                      <div className="space-y-3">
                        <StepCard paso={1} titulo="Baches en el período" valor={preview.total_baches} unidad="baches"
                          formula={`COUNT(Baches Pirolisis del ${preview.periodo.fecha_inicio} al ${preview.periodo.fecha_fin})`} />
                        <StepCard paso={2} titulo="Viajes de transporte" valor={preview.total_viajes} unidad="viajes"
                          formula={`FLOOR(${preview.total_baches} / 10) = ${preview.total_viajes} viajes`} />
                        <StepCard paso={3} titulo="Distancia total recorrida" valor={preview.distancia_total_km} unidad="km"
                          formula={`${preview.total_viajes} viajes × ${preview.desglose.distancia_km_viaje} km/viaje`} />
                        <StepCard paso={4} titulo="Litros de diésel consumidos" valor={preview.litros_diesel} unidad="L"
                          formula={`${preview.distancia_total_km} km × ${preview.desglose.consumo_L_km} L/km`} />
                        <StepCard paso={5} titulo="Kilogramos de diésel" valor={preview.kg_diesel} unidad="kg"
                          formula={`${preview.litros_diesel} L × ${preview.desglose.densidad_diesel} kg/L`} />
                        <StepCard paso={6} titulo="Emisiones combustión" valor={preview.emisiones_combustion_kg} unidad="kg CO₂eq"
                          formula={`${preview.kg_diesel} kg × ${preview.desglose.fe_combustion}`} color="orange" />
                        <StepCard paso={7} titulo="Emisiones upstream (producción diésel)" valor={preview.emisiones_upstream_kg} unidad="kg CO₂eq"
                          formula={`${preview.kg_diesel} kg × ${preview.desglose.fe_upstream}`} color="yellow" />
                        
                        {/* Paso 8 — Total */}
                        <div className="bg-green-500/20 border border-green-400/50 rounded-lg p-4 shadow-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-bold text-green-300 drop-shadow">Paso 8 — Total eTransporte</span>
                            <span className="text-xs text-white/60">combustión + upstream</span>
                          </div>
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-3xl font-bold text-white drop-shadow-lg">{preview.emisiones_total_kg}</span>
                            <span className="text-sm text-white/80">kg CO₂eq</span>
                            <span className="text-white/40">|</span>
                            <span className="text-2xl font-bold text-green-300 drop-shadow-lg">{preview.emisiones_total_ton}</span>
                            <span className="text-sm text-white/80">ton CO₂eq</span>
                          </div>
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
                  <h2 className="text-xl font-semibold text-white drop-shadow">Historial de cálculos</h2>
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
                    <p className="drop-shadow">No hay cálculos guardados aún</p>
                  </div>
                )}

                {!loadingResultados && resultados.length > 0 && (
                  <>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/20">
                            <th className="text-left py-3 px-2 text-white/80 font-medium drop-shadow">Período</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">Baches</th>
                            <th className="text-right py-3 px-2 text-white/80 font-medium drop-shadow">Viajes</th>
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
                              <td className="text-right py-3 px-2 text-white font-mono drop-shadow">{r.total_baches}</td>
                              <td className="text-right py-3 px-2 text-white font-mono drop-shadow">{r.total_viajes}</td>
                              <td className="text-right py-3 px-2 text-white font-mono drop-shadow">{r.emisiones_total_kg}</td>
                              <td className="text-right py-3 px-2 text-green-300 font-mono font-bold drop-shadow">{r.emisiones_total_ton}</td>
                              <td className="py-3 px-2 text-white/80 drop-shadow">{r.calculado_por}</td>
                              <td className="py-3 px-2 text-white/60 text-xs drop-shadow">
                                {r.created_at ? new Date(r.created_at).toLocaleDateString('es-CO') : '—'}
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
                                {r.fecha_inicio_periodo} → {r.fecha_fin_periodo}
                              </p>
                              <p className="text-white/60 text-xs">{r.calculado_por}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-green-300 font-bold drop-shadow">{r.emisiones_total_ton} ton</p>
                              <p className="text-white/60 text-xs">{r.total_baches} baches / {r.total_viajes} viajes</p>
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

                    {/* Paginación */}
                    {pagination.totalPages > 1 && (
                      <div className="flex justify-center gap-2 mt-6">
                        <button
                          onClick={() => cargarResultados(pagination.page - 1)}
                          disabled={pagination.page <= 1}
                          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          ← Anterior
                        </button>
                        <span className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm border border-white/20 drop-shadow">
                          {pagination.page} / {pagination.totalPages}
                        </span>
                        <button
                          onClick={() => cargarResultados(pagination.page + 1)}
                          disabled={pagination.page >= pagination.totalPages}
                          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white border border-white/30 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          Siguiente →
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

function StepCard({
  paso,
  titulo,
  valor,
  unidad,
  formula,
  color = 'gray',
}: {
  paso: number;
  titulo: string;
  valor: number;
  unidad: string;
  formula: string;
  color?: string;
}) {
  const borderColor =
    color === 'yellow' ? 'border-yellow-400/50 bg-yellow-500/10' :
    color === 'orange' ? 'border-orange-400/50 bg-orange-500/10' :
    'border-white/20 bg-white/5';

  return (
    <div className={`rounded-lg p-3 border backdrop-blur-sm ${borderColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-white/80 drop-shadow">Paso {paso} — {titulo}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-white drop-shadow-lg">{valor}</span>
        <span className="text-xs text-white/70">{unidad}</span>
      </div>
      <p className="text-xs text-white/50 mt-1 font-mono">{formula}</p>
    </div>
  );
}

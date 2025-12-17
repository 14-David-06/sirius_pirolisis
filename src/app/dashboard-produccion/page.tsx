"use client";

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useBaches } from '@/lib/useBaches';

export default function DashboardProduccion() {
  return (
    <DashboardProduccionContent />
  );
}

function DashboardProduccionContent() {
  const [bachesPirolisis, setBachesPirolisis] = useState<any[]>([]);
  const [loadingBaches, setLoadingBaches] = useState(false);
  const [turnoData, setTurnoData] = useState<any[]>([]);
  const [balanceMasaData, setBalanceMasaData] = useState<any[]>([]);
  const [loadingPromedios, setLoadingPromedios] = useState(false);
  
  // Usar el hook de baches para obtener datos reales
  const { 
    data: bachesData, 
    loading: bachesLoading, 
    getTotalBiomasaHumeda,
    getBiomasaSecaActual,
    getBacheStatus
  } = useBaches();

  // Calcular métricas totalizadoras basadas en datos reales
  const calculateMetrics = () => {
    if (!bachesData?.records || bachesData.records.length === 0) {
      return {
        totalBaches: 0,
        bachesActivos: 0,
        biocharHumedoTotal: 0,
        biocharSecoTotal: 0,
        lonasUsadasTotal: 0,
        bachesCompletos: 0,
        bachesEnProceso: 0,
        porcentajeProgreso: 0
      };
    }

    const records = bachesData.records;
    let biocharHumedoTotal = 0;
    let biocharSecoTotal = 0;
    let lonasUsadasTotal = 0;
    let bachesCompletos = 0;
    let bachesEnProceso = 0;

    records.forEach(bache => {
      // Sumar biochar húmedo
      biocharHumedoTotal += getTotalBiomasaHumeda(bache);
      
      // Sumar biochar seco actual
      biocharSecoTotal += getBiomasaSecaActual(bache);
      
      // Sumar lonas usadas
      lonasUsadasTotal += bache.fields['Recuento Lonas'] || 0;
      
      // Contar estados
      const estado = getBacheStatus(bache);
      if (estado?.includes('Completo')) {
        bachesCompletos++;
      } else if (estado?.includes('proceso')) {
        bachesEnProceso++;
      }
    });

    const totalBaches = records.length;
    const bachesActivos = bachesEnProceso + bachesCompletos;
    const porcentajeProgreso = totalBaches > 0 ? ((bachesCompletos / totalBaches) * 100) : 0;

    return {
      totalBaches,
      bachesActivos,
      biocharHumedoTotal,
      biocharSecoTotal,
      lonasUsadasTotal,
      bachesCompletos,
      bachesEnProceso,
      porcentajeProgreso
    };
  };

  const metrics = calculateMetrics();

  // Calcular promedios de producción
  const calculatePromedios = () => {
    let promedioBiomasaPorHora = 0;
    let promedioBiocharPorHora = 0;

    console.log('Calculando promedios...');
    console.log('Turnos disponibles:', turnoData?.length || 0);
    console.log('Balances disponibles:', balanceMasaData?.length || 0);

    // Promedio de ingreso de biomasa por hora (desde Turno Pirolisis)
    if (turnoData && turnoData.length > 0) {
      console.log('🔵 PROCESANDO BIOMASA - Total turnos:', turnoData.length);
      
      // Debug: mostrar todos los campos disponibles del primer turno
      if (turnoData[0]?.fields) {
        console.log('Campos disponibles en turno:', Object.keys(turnoData[0].fields));
        // Mostrar valores de campos que podrían ser biomasa
        Object.keys(turnoData[0].fields).forEach(key => {
          if (key.toLowerCase().includes('biomasa') || key.toLowerCase().includes('alimentac')) {
            console.log(`Campo potencial: "${key}" = ${turnoData[0].fields[key]}`);
          }
        });
      }
      
      const biomasaRates = turnoData
        .filter(turno => {
          // Probar diferentes variaciones del nombre del campo
          const rate = turno.fields?.['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields?.['Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields?.['🎙️ Alimentacion Biomasa Humeda Por Minuto (Kg)'] ||
                       turno.fields?.['Alimentacion Biomasa Humeda Por Minuto (Kg)'];
          
          console.log(`Turno ${turno.id}: rate = ${rate} (válido: ${rate && rate > 0})`);
          if (rate) {
            const fieldName = Object.keys(turno.fields).find(key => turno.fields[key] === rate);
            console.log(`  Campo usado: "${fieldName}"`);
          }
          
          return rate && rate > 0;
        })
        .map(turno => {
          const rate = turno.fields['🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields['Alimentación Biomasa Húmeda Por Minuto (Kg)'] ||
                       turno.fields['🎙️ Alimentacion Biomasa Humeda Por Minuto (Kg)'] ||
                       turno.fields['Alimentacion Biomasa Humeda Por Minuto (Kg)'];
          const ratePerHour = (rate || 0) * 60;
          console.log(`  ${rate}/min → ${ratePerHour}/hora`);
          return ratePerHour;
        }); // convertir a por hora
      
      console.log('Rates de biomasa válidos:', biomasaRates);
      
      if (biomasaRates.length > 0) {
        promedioBiomasaPorHora = biomasaRates.reduce((sum, rate) => sum + rate, 0) / biomasaRates.length;
        console.log(`✅ Promedio biomasa: ${promedioBiomasaPorHora.toFixed(2)} kg/h`);
      } else {
        console.log('❌ No hay datos válidos de biomasa');
      }
    }

    // Promedio de producción de biochar por hora (desde Balances Masa)
    if (balanceMasaData && balanceMasaData.length > 0) {
      console.log('🟢 PROCESANDO BIOCHAR - Total balances:', balanceMasaData.length);
      
      // Agrupar balances por turno para calcular producción por hora más precisa
      const biocharPorTurno = new Map();
      let balancesConPeso = 0;
      
      balanceMasaData.forEach((balance, index) => {
        const peso = balance.fields?.['Peso Biochar (KG)'];
        const turnoIds = balance.fields?.['Turno Pirolisis'] || [];
        
        if (peso && peso > 0) {
          balancesConPeso++;
          console.log(`Balance ${index}: ${peso}kg, turnos: ${turnoIds.length}`);
          
          if (turnoIds.length > 0) {
            turnoIds.forEach((turnoId: string) => {
              if (!biocharPorTurno.has(turnoId)) {
                biocharPorTurno.set(turnoId, []);
              }
              biocharPorTurno.get(turnoId)!.push(peso);
            });
          }
        }
      });

      console.log(`Balances con peso válido: ${balancesConPeso}`);
      console.log('Biochar por turno:', biocharPorTurno);

      if (biocharPorTurno.size > 0) {
        // Calcular promedio de biochar por turno y luego promedio general
        let totalPromedios = 0;
        let contadorTurnos = 0;

        biocharPorTurno.forEach((pesos: number[], turnoId: string) => {
          // Buscar la duración del turno correspondiente
          const turno = turnoData?.find(t => t.id === turnoId);
          let horasTurno = 8; // Valor por defecto

          if (turno && turno.fields?.['Cálculo']) {
            horasTurno = turno.fields['Cálculo'] || 8;
          }

          const totalBiocharTurno = pesos.reduce((sum, peso) => sum + peso, 0);
          const biocharPorHora = totalBiocharTurno / horasTurno;
          
          console.log(`Turno ${turnoId}: ${totalBiocharTurno}kg / ${horasTurno}h = ${biocharPorHora.toFixed(2)}kg/h`);
          
          totalPromedios += biocharPorHora;
          contadorTurnos++;
        });

        if (contadorTurnos > 0) {
          promedioBiocharPorHora = totalPromedios / contadorTurnos;
          console.log(`✅ Promedio biochar: ${promedioBiocharPorHora.toFixed(2)} kg/h`);
        }
      } else {
        console.log('⚠️ Usando fallback para biochar...');
        // Fallback: calcular basado en peso promedio por balance
        const biocharWeights = balanceMasaData
          .filter(balance => balance.fields?.['Peso Biochar (KG)'] && balance.fields['Peso Biochar (KG)'] > 0)
          .map(balance => balance.fields['Peso Biochar (KG)']);
        
        if (biocharWeights.length > 0) {
          // Asumiendo que cada balance representa aproximadamente 1 hora de producción
          promedioBiocharPorHora = biocharWeights.reduce((sum, weight) => sum + weight, 0) / biocharWeights.length;
          console.log(`✅ Promedio biochar (fallback): ${promedioBiocharPorHora.toFixed(2)} kg/h`);
        } else {
          console.log('❌ No hay datos válidos de biochar');
        }
      }
    }

    console.log('=== RESULTADO FINAL DE PROMEDIOS ===');
    console.log('promedioBiomasaPorHora (ingreso):', promedioBiomasaPorHora, 'kg/h');
    console.log('promedioBiocharPorHora (producción):', promedioBiocharPorHora, 'kg/h');
    console.log('=====================================');

    return {
      promedioBiomasaPorHora,
      promedioBiocharPorHora
    };
  };

  const promedios = calculatePromedios();

  // Cargar datos de Baches Pirolisis para la tabla detallada
  const loadBachesPirolisis = async () => {
    try {
      setLoadingBaches(true);
      const response = await fetch('/api/baches/list');
      
      if (response.ok) {
        const data = await response.json();
        setBachesPirolisis(data.records || []);
      } else {
        console.error('Error al cargar baches:', await response.text());
      }
    } catch (error) {
      console.error('Error al cargar baches:', error);
    } finally {
      setLoadingBaches(false);
    }
  };

  // Cargar datos de turnos y balances para promedios
  const loadPromediosData = async () => {
    try {
      setLoadingPromedios(true);
      
      const [turnoResponse, balanceResponse] = await Promise.all([
        fetch('/api/turno/list'),
        fetch('/api/balance-masa/list')
      ]);
      
      if (turnoResponse.ok) {
        const turnoResult = await turnoResponse.json();
        setTurnoData(turnoResult.records || []);
        console.log('Turnos cargados:', turnoResult.records?.length || 0);
      } else {
        console.error('Error al cargar turnos:', await turnoResponse.text());
      }
      
      if (balanceResponse.ok) {
        const balanceResult = await balanceResponse.json();
        setBalanceMasaData(balanceResult.records || []);
        console.log('Balances cargados:', balanceResult.records?.length || 0);
      } else {
        console.error('Error al cargar balances:', await balanceResponse.text());
      }
    } catch (error) {
      console.error('Error al cargar datos de promedios:', error);
    } finally {
      setLoadingPromedios(false);
    }
  };

  useEffect(() => {
    loadBachesPirolisis();
    loadPromediosData();
  }, []);



  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('/textura-biochar.jpg')"
      }}
    >
      {/* Overlay translúcido */}
      <div className="absolute inset-0 bg-black/30"></div>
      
      <div className="relative z-10">
        <Navbar />
        
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">Dashboard de Producción</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow text-lg">
              Monitoreo en tiempo real de las operaciones de producción y métricas clave de rendimiento
            </p>

            {/* Métricas Principales */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Métricas de Producción</h2>
              
              {/* Primera fila de métricas principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-white mb-6">
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      metrics.totalBaches
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Total Baches</div>
                </div>
                
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {metrics.biocharHumedoTotal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        <span className="text-lg ml-1 text-white/90">kg</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Biochar Húmedo Total</div>
                </div>
                
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {metrics.biocharSecoTotal.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        <span className="text-lg ml-1 text-white/90">kg</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Biochar Seco Actual</div>
                </div>
                
                <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                  <div className="text-3xl font-bold text-white mb-2">
                    {bachesLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      metrics.lonasUsadasTotal
                    )}
                  </div>
                  <div className="text-sm drop-shadow text-white/80">Lonas Utilizadas</div>
                </div>
              </div>

              {/* Sección de Promedios de Producción */}
              <div className="border-t border-white/20 pt-4">
                <h3 className="text-lg font-medium text-white mb-4">Promedios de Producción por Hora</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-white">
                  <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                    <div className="text-2xl font-bold text-indigo-400 mb-2">
                      {loadingPromedios ? (
                        <span className="inline-block animate-pulse bg-white/20 h-6 w-20 rounded"></span>
                      ) : (
                        <>
                          {promedios.promedioBiomasaPorHora.toFixed(1)}
                          <span className="text-sm ml-1 text-white/90">kg/h</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm drop-shadow text-white/80">Ingreso Biomasa</div>
                  </div>
                  
                  <div className="text-center bg-white/10 p-4 rounded-lg border border-white/20">
                    <div className="text-2xl font-bold text-teal-400 mb-2">
                      {loadingPromedios ? (
                        <span className="inline-block animate-pulse bg-white/20 h-6 w-20 rounded"></span>
                      ) : (
                        <>
                          {promedios.promedioBiocharPorHora.toFixed(1)}
                          <span className="text-sm ml-1 text-white/90">kg/h</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm drop-shadow text-white/80">Producción Biochar</div>
                  </div>
                </div>
              </div>
              
              {/* Mensaje informativo si no hay datos */}
              {!bachesLoading && metrics.totalBaches === 0 && (
                <div className="mt-4 p-3 bg-amber-500/20 border border-amber-400/30 rounded-lg">
                  <div className="text-amber-200 text-sm">
                    <strong>Aviso:</strong> No hay baches registrados en el sistema. Las métricas se actualizarán automáticamente cuando se agreguen baches.
                  </div>
                </div>
              )}
            </div>

            {/* Gráficos y Análisis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              
              {/* Production Chart */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Producción por Día
                </h3>
                <div className="h-64 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                  <div className="text-center space-y-4">
                    <h4 className="text-lg font-medium text-white/80">Gráfico de Producción</h4>
                    <p className="text-sm text-white/60">Próximamente disponible</p>
                  </div>
                </div>
              </div>

              {/* Efficiency Chart */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Eficiencia Operacional
                </h3>
                <div className="h-64 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                  <div className="text-center space-y-4">
                    <h4 className="text-lg font-medium text-white/80">Métricas de Eficiencia</h4>
                    <p className="text-sm text-white/60">Próximamente disponible</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actividad Reciente */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                Actividad Reciente
              </h3>
              <div className="space-y-3">
                {bachesLoading ? (
                  [...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-4 p-3 bg-white/10 rounded-lg">
                      <div className="bg-white/20 h-10 w-10 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="bg-white/20 h-4 w-3/4 rounded"></div>
                        <div className="bg-white/20 h-3 w-1/2 rounded"></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-center space-x-4 p-3 bg-green-500/20 border border-green-400/30 rounded-lg">
                      <div className="bg-green-500 text-white h-10 w-10 rounded-lg flex items-center justify-center">
                        <span className="text-xs font-bold">B</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">Nuevo bache iniciado</p>
                        <p className="text-sm text-white/70">Bache #B2025001 - 15:30</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 p-3 bg-blue-500/20 border border-blue-400/30 rounded-lg">
                      <div className="bg-blue-500 text-white h-10 w-10 rounded-lg flex items-center justify-center">
                        <span className="text-xs font-bold">M</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">Balance de masa actualizado</p>
                        <p className="text-sm text-white/70">+2,450 kg biomasa - 14:45</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 p-3 bg-orange-500/20 border border-orange-400/30 rounded-lg">
                      <div className="bg-orange-500 text-white h-10 w-10 rounded-lg flex items-center justify-center">
                        <span className="text-xs font-bold">T</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">Mantenimiento programado</p>
                        <p className="text-sm text-white/70">Horno principal - 13:20</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Baches Pirolisis */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white drop-shadow-lg">
                  Baches Pirolisis
                </h3>
                <button 
                  onClick={loadBachesPirolisis}
                  disabled={loadingBaches}
                  className="px-4 py-2 bg-blue-500/30 hover:bg-blue-500/50 text-white rounded-lg border border-blue-400/30 transition-all duration-200 disabled:opacity-50"
                >
                  {loadingBaches ? 'Cargando...' : 'Actualizar'}
                </button>
              </div>

              {loadingBaches ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-white/10 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <div className="bg-white/20 h-6 w-32 rounded"></div>
                        <div className="bg-white/20 h-5 w-24 rounded"></div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white/20 h-4 w-full rounded"></div>
                        <div className="bg-white/20 h-4 w-full rounded"></div>
                        <div className="bg-white/20 h-4 w-full rounded"></div>
                        <div className="bg-white/20 h-4 w-full rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : bachesPirolisis.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-lg font-medium text-white/60 mb-4">
                    Sin datos
                  </div>
                  <p className="text-white/80">No hay baches disponibles</p>
                  <p className="text-sm text-white/60">Los datos se cargarán automáticamente cuando estén disponibles</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {bachesPirolisis.map((bache, index) => (
                    <div key={bache.id} className="bg-white/10 border border-white/20 rounded-lg p-4 hover:bg-white/15 transition-all duration-200">
                      {/* Header del Bache */}
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-orange-500/30 rounded-lg flex items-center justify-center">
                            <span className="text-xs font-bold text-orange-200">B</span>
                          </div>
                          <div>
                            <h4 className="text-lg font-semibold text-white">
                              {bache.fields?.['Codigo Bache'] || `Bache #${index + 1}`}
                            </h4>
                            <div className="flex items-center space-x-4 text-sm text-white/70">
                              <span>Auto #{bache.fields?.['Auto Number'] || 'N/A'}</span>
                              <span>ID: {bache.fields?.['ID'] || bache.id.slice(-8)}</span>
                              <span>Creado: {bache.fields?.['Fecha Creacion'] ? new Date(bache.fields['Fecha Creacion']).toLocaleDateString('es-CO') : 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            bache.fields?.['Estado Bache'] === 'Bache Completo Bodega' ? 'bg-green-500/30 text-green-200 border border-green-400/50' :
                            bache.fields?.['Estado Bache'] === 'Bache en proceso' ? 'bg-yellow-500/30 text-yellow-200 border border-yellow-400/50' :
                            bache.fields?.['Estado Bache'] === 'Bache Agotado' ? 'bg-red-500/30 text-red-200 border border-red-400/50' :
                            bache.fields?.['Estado Bache'] === 'Bache Completo Planta' ? 'bg-blue-500/30 text-blue-200 border border-blue-400/50' :
                            bache.fields?.['Estado Bache'] === 'Bache Incompleto' ? 'bg-orange-500/30 text-orange-200 border border-orange-400/50' :
                            'bg-gray-500/30 text-gray-200 border border-gray-400/50'
                          }`}>
                            {bache.fields?.['Estado Bache'] || 'Sin Estado'}
                          </span>
                          <div className="mt-1">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              bache.fields?.['Monitoreado'] === 'Monitoreado' 
                                ? 'bg-green-500/30 text-green-200' 
                                : 'bg-red-500/30 text-red-200'
                            }`}>
                              {bache.fields?.['Monitoreado'] || 'No Monitoreado'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Información Principal de Biochar */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="bg-white/5 p-3 rounded">
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Biochar Húmedo</p>
                          <p className="text-lg font-bold text-orange-300">
                            {bache.fields?.['Total Biochar Humedo Bache (KG)']?.toLocaleString('es-CO') || 0} kg
                          </p>
                        </div>
                        <div className="bg-white/5 p-3 rounded">
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Biochar Referencia</p>
                          <p className="text-lg font-bold text-green-300">
                            {bache.fields?.['Total Biochar Bache Referencia (KG)']?.toLocaleString('es-CO') || 0} kg
                          </p>
                        </div>
                        <div className="bg-white/5 p-3 rounded">
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Biochar Seco Actual</p>
                          <p className="text-lg font-bold text-purple-300">
                            {bache.fields?.['Total Cantidad Actual Biochar Seco']?.toLocaleString('es-CO') || 0} kg
                          </p>
                        </div>
                        <div className="bg-white/5 p-3 rounded">
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Lonas Usadas</p>
                          <p className="text-lg font-bold text-blue-300">
                            {bache.fields?.['Recuento Lonas'] || 0}
                          </p>
                        </div>
                      </div>

                      {/* Información de Biochar Seco - Entradas y Salidas */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pt-3 border-t border-white/10">
                        <div className="bg-white/5 p-3 rounded">
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Masa Seca Total (Monitoreo)</p>
                          <p className="text-sm font-bold text-green-300">
                            {Array.isArray(bache.fields?.['Masa Seca (DM kg) (from Monitoreo Baches)']) 
                              ? bache.fields['Masa Seca (DM kg) (from Monitoreo Baches)'].reduce((sum, val) => sum + (val || 0), 0).toLocaleString('es-CO') 
                              : '0'} kg
                          </p>
                        </div>
                        <div className="bg-white/5 p-3 rounded">
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Biochar Seco Salido</p>
                          <p className="text-sm font-bold text-red-300">
                            -{bache.fields?.['Total Cantidad Biochar Seco Salio (KG)']?.toLocaleString('es-CO') || 0} kg
                          </p>
                        </div>
                      </div>

                      {/* Información del Vehículo y Transporte */}
                      {bache.fields?.['Tipo Vehiculo'] && (
                        <div className="bg-white/5 rounded-lg p-3 mb-4">
                          <h5 className="text-sm font-semibold text-white mb-2">
                            Información de Transporte
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                              <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Vehículo</p>
                              <p className="text-sm text-white font-medium">
                                {bache.fields['Tipo Vehiculo']}
                              </p>
                              <p className="text-xs text-white/70">
                                {bache.fields?.['Referencia Vehiculo'] || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Función</p>
                              <p className="text-sm text-white font-medium">
                                {bache.fields?.['Funcion Vehiculo'] || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Distancia</p>
                              <p className="text-sm text-white font-medium">
                                {bache.fields?.['Distancia Metros'] || 0}m
                              </p>
                              <p className="text-xs text-white/70">
                                ({bache.fields?.['Distancia Planta Bodega'] || 0}km total)
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Combustible</p>
                              <p className="text-sm text-white font-medium">
                                {bache.fields?.['Tipo Combustible'] || 'N/A'}
                              </p>
                              <p className="text-xs text-white/70">
                                Consumido: {bache.fields?.['Diesel Consumido Transporte'] || 0}L
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Enlaces y Relaciones */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-white/10">
                        <div>
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Balances Masa</p>
                          <p className="text-sm text-blue-300 font-medium">
                            {Array.isArray(bache.fields?.['Balances Masa']) ? bache.fields['Balances Masa'].length : 0} registros
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Monitoreo</p>
                          <p className="text-sm text-green-300 font-medium">
                            {Array.isArray(bache.fields?.['Monitoreo Baches']) ? bache.fields['Monitoreo Baches'].length : 0} registros
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Remisiones</p>
                          <p className="text-sm text-yellow-300 font-medium">
                            {Array.isArray(bache.fields?.['Remisiones Baches Pirolisis']) ? bache.fields['Remisiones Baches Pirolisis'].length : 0} registros
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-white/60 uppercase tracking-wide mb-1">Comprobantes</p>
                          <p className="text-sm text-purple-300 font-medium">
                            {Array.isArray(bache.fields?.['Comprobante Peso Bache']) ? bache.fields['Comprobante Peso Bache'].length : 0} archivos
                          </p>
                        </div>
                      </div>

                      {/* Debug: Mostrar todos los campos disponibles */}
                      {process.env.NODE_ENV === 'development' && (
                        <details className="mt-4 pt-3 border-t border-white/10">
                          <summary className="text-xs text-white/50 cursor-pointer hover:text-white/70">
                            Ver todos los campos (Debug)
                          </summary>
                          <div className="mt-2 p-2 bg-black/20 rounded text-xs text-white/60 max-h-32 overflow-y-auto">
                            <pre>{JSON.stringify(bache.fields, null, 2)}</pre>
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Acciones Rápidas */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
              <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                Acciones Rápidas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button 
                  onClick={() => window.location.href = '/sistema-baches'}
                  className="p-6 bg-white/10 hover:bg-white/20 text-white rounded-lg hover:shadow-lg transition-all duration-300 border border-white/20 hover:border-orange-400/50"
                >
                  <div className="font-medium text-base mb-1">Sistema Baches</div>
                  <div className="text-xs text-white/70">Gestión de baches</div>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/balance-masa'}
                  className="p-6 bg-white/10 hover:bg-white/20 text-white rounded-lg hover:shadow-lg transition-all duration-300 border border-white/20 hover:border-green-400/50"
                >
                  <div className="font-medium text-base mb-1">Balance Masa</div>
                  <div className="text-xs text-white/70">Control de masas</div>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/bitacora-pirolisis'}
                  className="p-6 bg-white/10 hover:bg-white/20 text-white rounded-lg hover:shadow-lg transition-all duration-300 border border-white/20 hover:border-blue-400/50"
                >
                  <div className="font-medium text-base mb-1">Bitácora</div>
                  <div className="text-xs text-white/70">Registro de eventos</div>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/mantenimientos'}
                  className="p-6 bg-white/10 hover:bg-white/20 text-white rounded-lg hover:shadow-lg transition-all duration-300 border border-white/20 hover:border-purple-400/50"
                >
                  <div className="font-medium text-base mb-1">Mantenimientos</div>
                  <div className="text-xs text-white/70">Tareas de mantenimiento</div>
                </button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
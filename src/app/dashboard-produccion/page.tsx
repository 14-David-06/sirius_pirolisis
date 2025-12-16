"use client";

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function DashboardProduccion() {
  return (
    <DashboardProduccionContent />
  );
}

function DashboardProduccionContent() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    bachesActivos: 0,
    biomasaTotal: 0,
    turnosHoy: 0,
    rendimiento: 0
  });

  useEffect(() => {
    // Simular carga de datos
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // Aquí se pueden agregar llamadas reales a las APIs
        // Por ahora, simulamos datos
        setTimeout(() => {
          setStats({
            bachesActivos: 15,
            biomasaTotal: 2450.5,
            turnosHoy: 3,
            rendimiento: 87.5
          });
          setIsLoading(false);
        }, 1000);
      } catch (error) {
        console.error('Error cargando datos:', error);
        setIsLoading(false);
      }
    };

    loadData();
  }, []);



  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752096900/DSC_3884-Mejorado-NR_ghtz72.jpg')"
      }}
    >
      {/* Overlay translúcido */}
      <div className="absolute inset-0 bg-black/30"></div>
      
      <div className="relative z-10">
        <Navbar />
        
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">📊 Dashboard de Producción</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow text-lg">
              Monitoreo en tiempo real de las operaciones de producción y métricas clave de rendimiento
            </p>

            {/* Estadísticas Principales */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">📊 Métricas de Producción</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-white">
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-4xl mb-2 opacity-80">🔥</div>
                  <div className="text-3xl font-bold text-orange-300">
                    {isLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      stats.bachesActivos
                    )}
                  </div>
                  <div className="text-sm drop-shadow">Baches Activos</div>
                </div>
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-4xl mb-2 opacity-80">🌾</div>
                  <div className="text-3xl font-bold text-green-300">
                    {isLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-20 rounded"></span>
                    ) : (
                      <>
                        {stats.biomasaTotal.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        <span className="text-xl ml-1 text-white/90">kg</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow">Biomasa Total</div>
                </div>
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-4xl mb-2 opacity-80">⏰</div>
                  <div className="text-3xl font-bold text-blue-300">
                    {isLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-12 rounded"></span>
                    ) : (
                      stats.turnosHoy
                    )}
                  </div>
                  <div className="text-sm drop-shadow">Turnos Hoy</div>
                </div>
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-4xl mb-2 opacity-80">📈</div>
                  <div className="text-3xl font-bold text-purple-300">
                    {isLoading ? (
                      <span className="inline-block animate-pulse bg-white/20 h-8 w-16 rounded"></span>
                    ) : (
                      <>
                        {stats.rendimiento}
                        <span className="text-xl ml-1 text-white/90">%</span>
                      </>
                    )}
                  </div>
                  <div className="text-sm drop-shadow">Rendimiento</div>
                </div>
              </div>
            </div>

            {/* Gráficos y Análisis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              
              {/* Production Chart */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg flex items-center">
                  <span className="mr-2">📊</span>
                  Producción por Día
                </h3>
                <div className="h-64 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                  <div className="text-center space-y-2">
                    <div className="text-4xl opacity-60">📈</div>
                    <p className="text-white/80 font-medium">Gráfico de Producción</p>
                    <p className="text-sm text-white/60">Próximamente disponible</p>
                  </div>
                </div>
              </div>

              {/* Efficiency Chart */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg flex items-center">
                  <span className="mr-2">⚡</span>
                  Eficiencia Operacional
                </h3>
                <div className="h-64 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
                  <div className="text-center space-y-2">
                    <div className="text-4xl opacity-60">⚙️</div>
                    <p className="text-white/80 font-medium">Métricas de Eficiencia</p>
                    <p className="text-sm text-white/60">Próximamente disponible</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actividad Reciente */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg flex items-center">
                <span className="mr-2">📋</span>
                Actividad Reciente
              </h3>
              <div className="space-y-3">
                {isLoading ? (
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
                      <div className="bg-green-500 text-white h-10 w-10 rounded-full flex items-center justify-center font-bold">
                        🔥
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">Nuevo bache iniciado</p>
                        <p className="text-sm text-white/70">Bache #B2025001 - 15:30</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 p-3 bg-blue-500/20 border border-blue-400/30 rounded-lg">
                      <div className="bg-blue-500 text-white h-10 w-10 rounded-full flex items-center justify-center font-bold">
                        ⚖️
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-white">Balance de masa actualizado</p>
                        <p className="text-sm text-white/70">+2,450 kg biomasa - 14:45</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 p-3 bg-orange-500/20 border border-orange-400/30 rounded-lg">
                      <div className="bg-orange-500 text-white h-10 w-10 rounded-full flex items-center justify-center font-bold">
                        🔧
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

            {/* Acciones Rápidas */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
              <h3 className="text-xl font-bold text-white mb-4 drop-shadow-lg flex items-center">
                <span className="mr-2">⚡</span>
                Acciones Rápidas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button 
                  onClick={() => window.location.href = '/sistema-baches'}
                  className="p-4 bg-orange-500/30 hover:bg-orange-500/50 text-white rounded-lg hover:shadow-lg transition-all duration-300 transform hover:scale-105 border border-orange-400/30"
                >
                  <div className="text-2xl mb-2">🔥</div>
                  <div className="font-semibold text-sm">Sistema Baches</div>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/balance-masa'}
                  className="p-4 bg-green-500/30 hover:bg-green-500/50 text-white rounded-lg hover:shadow-lg transition-all duration-300 transform hover:scale-105 border border-green-400/30"
                >
                  <div className="text-2xl mb-2">⚖️</div>
                  <div className="font-semibold text-sm">Balance Masa</div>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/bitacora-pirolisis'}
                  className="p-4 bg-blue-500/30 hover:bg-blue-500/50 text-white rounded-lg hover:shadow-lg transition-all duration-300 transform hover:scale-105 border border-blue-400/30"
                >
                  <div className="text-2xl mb-2">📋</div>
                  <div className="font-semibold text-sm">Bitácora</div>
                </button>
                
                <button 
                  onClick={() => window.location.href = '/mantenimientos'}
                  className="p-4 bg-purple-500/30 hover:bg-purple-500/50 text-white rounded-lg hover:shadow-lg transition-all duration-300 transform hover:scale-105 border border-purple-400/30"
                >
                  <div className="text-2xl mb-2">🔧</div>
                  <div className="font-semibold text-sm">Mantenimientos</div>
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
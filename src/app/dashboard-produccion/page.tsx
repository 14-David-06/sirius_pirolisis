"use client";

import { useState, useEffect } from 'react';
import TurnoProtection from '@/components/TurnoProtection';

export default function DashboardProduccion() {
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

  const StatCard = ({ title, value, unit, icon, color }: {
    title: string;
    value: string | number;
    unit?: string;
    icon: string;
    color: string;
  }) => (
    <div className={`bg-gradient-to-br ${color} p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/80 text-sm font-medium">{title}</p>
          <p className="text-white text-3xl font-bold mt-2">
            {isLoading ? (
              <div className="animate-pulse bg-white/20 h-8 w-20 rounded"></div>
            ) : (
              <>
                {value}
                {unit && <span className="text-xl ml-1 text-white/90">{unit}</span>}
              </>
            )}
          </p>
        </div>
        <div className="text-4xl opacity-80">
          {icon}
        </div>
      </div>
    </div>
  );

  return (
    <TurnoProtection>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#5A7836] via-[#4a6429] to-[#3d5422] bg-clip-text text-transparent">
              📊 Dashboard de Producción
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Monitoreo en tiempo real de las operaciones de producción y métricas clave de rendimiento
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
              title="Baches Activos"
              value={stats.bachesActivos}
              icon="🔥"
              color="from-orange-500 to-red-600"
            />
            <StatCard
              title="Biomasa Total"
              value={stats.biomasaTotal.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              unit="kg"
              icon="🌾"
              color="from-green-500 to-emerald-600"
            />
            <StatCard
              title="Turnos Hoy"
              value={stats.turnosHoy}
              icon="⏰"
              color="from-blue-500 to-indigo-600"
            />
            <StatCard
              title="Rendimiento"
              value={stats.rendimiento}
              unit="%"
              icon="📈"
              color="from-purple-500 to-pink-600"
            />
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Production Chart */}
            <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/50">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">📊</span>
                Producción por Día
              </h3>
              <div className="h-64 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="text-4xl">📈</div>
                  <p className="text-gray-600 font-medium">Gráfico de Producción</p>
                  <p className="text-sm text-gray-500">Próximamente disponible</p>
                </div>
              </div>
            </div>

            {/* Efficiency Chart */}
            <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/50">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">⚡</span>
                Eficiencia Operacional
              </h3>
              <div className="h-64 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="text-4xl">⚙️</div>
                  <p className="text-gray-600 font-medium">Métricas de Eficiencia</p>
                  <p className="text-sm text-gray-500">Próximamente disponible</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/50">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <span className="mr-2">📋</span>
              Actividad Reciente
            </h3>
            <div className="space-y-3">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center space-x-4 p-3 bg-gray-100 rounded-lg">
                    <div className="bg-gray-300 h-10 w-10 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="bg-gray-300 h-4 w-3/4 rounded"></div>
                      <div className="bg-gray-300 h-3 w-1/2 rounded"></div>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-center space-x-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="bg-green-500 text-white h-10 w-10 rounded-full flex items-center justify-center font-bold">
                      🔥
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">Nuevo bache iniciado</p>
                      <p className="text-sm text-gray-600">Bache #B2025001 - 15:30</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="bg-blue-500 text-white h-10 w-10 rounded-full flex items-center justify-center font-bold">
                      ⚖️
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">Balance de masa actualizado</p>
                      <p className="text-sm text-gray-600">+2,450 kg biomasa - 14:45</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="bg-orange-500 text-white h-10 w-10 rounded-full flex items-center justify-center font-bold">
                      🔧
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">Mantenimiento programado</p>
                      <p className="text-sm text-gray-600">Horno principal - 13:20</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/50">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <span className="mr-2">⚡</span>
              Acciones Rápidas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <button 
                onClick={() => window.location.href = '/sistema-baches'}
                className="p-4 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-105"
              >
                <div className="text-2xl mb-2">🔥</div>
                <div className="font-semibold">Sistema Baches</div>
              </button>
              
              <button 
                onClick={() => window.location.href = '/balance-masa'}
                className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-105"
              >
                <div className="text-2xl mb-2">⚖️</div>
                <div className="font-semibold">Balance Masa</div>
              </button>
              
              <button 
                onClick={() => window.location.href = '/bitacora-pirolisis'}
                className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-105"
              >
                <div className="text-2xl mb-2">📋</div>
                <div className="font-semibold">Bitácora</div>
              </button>
              
              <button 
                onClick={() => window.location.href = '/mantenimientos'}
                className="p-4 bg-gradient-to-br from-purple-500 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-105"
              >
                <div className="text-2xl mb-2">🔧</div>
                <div className="font-semibold">Mantenimientos</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </TurnoProtection>
  );
}
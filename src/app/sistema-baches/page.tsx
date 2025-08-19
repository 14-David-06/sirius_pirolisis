"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function SistemaBaches() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const userSession = localStorage.getItem('userSession');
    if (!userSession) {
      router.push('/login');
      return;
    }
    setIsAuthenticated(true);
  }, [router]);

  if (!isAuthenticated) {
    return <div>Verificando autenticación...</div>;
  }

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
      }}
    >
      {/* Overlay para mejorar la legibilidad */}
      <div className="absolute inset-0 bg-black/40"></div>
      
      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">🔥 Sistema de Baches</h1>
          <p className="text-gray-600 mb-8">
            Gestión y control de baches en el proceso de pirólisis por lotes.
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">Crear Nuevo Bache</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ID del Bache
                    </label>
                    <input
                      type="text"
                      placeholder="BAT-2025-001"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Inicio
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cantidad Biomasa (kg)
                    </label>
                    <input
                      type="number"
                      placeholder="1000"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Biomasa
                    </label>
                    <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent">
                      <option value="">Seleccionar tipo</option>
                      <option value="cascarilla_arroz">Cascarilla de Arroz</option>
                      <option value="residuos_forestales">Residuos Forestales</option>
                      <option value="residuos_agricolas">Residuos Agrícolas</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Temperatura Objetivo (°C)
                    </label>
                    <input
                      type="number"
                      placeholder="450"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duración Estimada (horas)
                    </label>
                    <input
                      type="number"
                      placeholder="8"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button className="px-6 py-3 bg-[#5A7836] text-white rounded-lg hover:bg-[#4a6429] transition-colors duration-200">
                    Crear Bache
                  </button>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-[#5A7836] mb-2">Estadísticas del Día</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Baches Activos:</span>
                    <span className="font-semibold">2</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Completados:</span>
                    <span className="font-semibold">5</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Biomasa Procesada:</span>
                    <span className="font-semibold">4,200 kg</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h4 className="font-semibold text-[#5A7836] mb-2">Bache Activo</h4>
                <div className="space-y-2 text-sm">
                  <div className="font-medium">BAT-2025-012</div>
                  <div className="flex justify-between">
                    <span>Progreso:</span>
                    <span>75%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-[#5A7836] h-2 rounded-full" style={{width: '75%'}}></div>
                  </div>
                  <div className="flex justify-between">
                    <span>Tiempo restante:</span>
                    <span>2h 15m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-[#5A7836]">Lista de Baches</h3>
              <div className="flex space-x-2">
                <select className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent">
                  <option value="">Todos los estados</option>
                  <option value="programado">Programado</option>
                  <option value="en_proceso">En Proceso</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                <input
                  type="date"
                  className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left">ID Bache</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Fecha Inicio</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Biomasa (kg)</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Temperatura</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Progreso</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Estado</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-gray-100">
                    <td className="border border-gray-300 px-4 py-2">BAT-2025-012</td>
                    <td className="border border-gray-300 px-4 py-2">2025-08-19 08:00</td>
                    <td className="border border-gray-300 px-4 py-2">1,200</td>
                    <td className="border border-gray-300 px-4 py-2">450°C</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-[#5A7836] h-2 rounded-full" style={{width: '75%'}}></div>
                      </div>
                      <span className="text-xs text-gray-600">75%</span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">En Proceso</span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <button className="text-blue-600 hover:text-blue-800 mr-2">Monitorear</button>
                      <button className="text-orange-600 hover:text-orange-800">Pausar</button>
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-100">
                    <td className="border border-gray-300 px-4 py-2">BAT-2025-011</td>
                    <td className="border border-gray-300 px-4 py-2">2025-08-19 00:00</td>
                    <td className="border border-gray-300 px-4 py-2">1,500</td>
                    <td className="border border-gray-300 px-4 py-2">445°C</td>
                    <td className="border border-gray-300 px-4 py-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{width: '100%'}}></div>
                      </div>
                      <span className="text-xs text-gray-600">100%</span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">Completado</span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <button className="text-blue-600 hover:text-blue-800 mr-2">Ver Reporte</button>
                      <button className="text-gray-600 hover:text-gray-800">Archivo</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      </div>
    </div>
  );
}

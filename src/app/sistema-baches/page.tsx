"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function SistemaBaches() {
  return (
    <TurnoProtection requiresTurno={true}>
      <SistemaBachesContent />
    </TurnoProtection>
  );
}

function SistemaBachesContent() {
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
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-4xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">Sistema de Baches</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Gestión y control de baches en el proceso de pirólisis por lotes
            </p>

            {/* Crear Nuevo Bache */}
            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                 Crear Nuevo Bache
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                     ID del Bache
                  </label>
                  <input
                    type="text"
                    placeholder="BAT-2025-001"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                     Temperatura Objetivo (°C)
                  </label>
                  <input
                    type="number"
                    placeholder="450"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                     Peso Inicial (kg)
                  </label>
                  <input
                    type="number"
                    placeholder="1000"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                     Duración Estimada (horas)
                  </label>
                  <input
                    type="number"
                    placeholder="8"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                     Tipo de Biomasa
                  </label>
                  <select className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900">
                    <option value="">Seleccionar tipo de biomasa</option>
                    <option value="residuos_forestales">Residuos Forestales</option>
                    <option value="cascara_nueces">Cáscara de Nueces</option>
                    <option value="bagazo_cana">Bagazo de Caña</option>
                    <option value="residuos_agricolas">Residuos Agrícolas</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-center mt-6">
                <button className="px-8 py-3 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white rounded-lg hover:from-[#4a6429] hover:to-[#3d5422] transition-all duration-300 transform hover:scale-105 font-semibold shadow-lg">
                   Crear Bache
                </button>
              </div>
            </div>
          </div>

          {/* Estadísticas y Estado Actual */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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

          {/* Lista de Baches */}
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30 mt-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white drop-shadow-lg">Lista de Baches</h3>
              <div className="flex space-x-2">
                <select className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent bg-white text-gray-900">
                  <option value="">Todos los estados</option>
                  <option value="programado">Programado</option>
                  <option value="en_proceso">En Proceso</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                <input
                  type="date"
                  className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent bg-white text-gray-900"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-md">
                <thead className="bg-[#5A7836] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left">ID Bache</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Tipo Biomasa</th>
                    <th className="px-4 py-3 text-left">Peso Inicial</th>
                    <th className="px-4 py-3 text-left">Temperatura</th>
                    <th className="px-4 py-3 text-left">Inicio</th>
                    <th className="px-4 py-3 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">BAT-2025-012</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                        En Proceso
                      </span>
                    </td>
                    <td className="px-4 py-3">Residuos Forestales</td>
                    <td className="px-4 py-3">1,200 kg</td>
                    <td className="px-4 py-3">450°C</td>
                    <td className="px-4 py-3">14:30</td>
                    <td className="px-4 py-3">
                      <div className="flex space-x-2">
                        <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                          Ver
                        </button>
                        <button className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">BAT-2025-011</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                        Completado
                      </span>
                    </td>
                    <td className="px-4 py-3">Cáscara de Nueces</td>
                    <td className="px-4 py-3">950 kg</td>
                    <td className="px-4 py-3">440°C</td>
                    <td className="px-4 py-3">08:15</td>
                    <td className="px-4 py-3">
                      <div className="flex space-x-2">
                        <button className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                          Ver
                        </button>
                        <button className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm">
                          Reporte
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

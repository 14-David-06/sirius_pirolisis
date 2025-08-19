"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function BitacoraPirolisis() {
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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">📋 Bitácora Pirólisis</h1>
          <p className="text-gray-600 mb-8">
            Registro detallado de eventos y parámetros del proceso de pirólisis.
          </p>
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
            <div className="xl:col-span-2">
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">Nuevo Registro</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha y Hora
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Operador
                    </label>
                    <input
                      type="text"
                      placeholder="Nombre del operador"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Temperatura Reactor (°C)
                    </label>
                    <input
                      type="number"
                      placeholder="450"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Presión (bar)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="1.2"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observaciones
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Descripción de eventos, incidencias o notas importantes..."
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    ></textarea>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button className="px-6 py-3 bg-[#5A7836] text-white rounded-lg hover:bg-[#4a6429] transition-colors duration-200">
                    Registrar Evento
                  </button>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-[#5A7836] mb-2">Estado del Sistema</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Reactor:</span>
                    <span className="text-green-600 font-semibold">Operativo</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Temperatura:</span>
                    <span>450°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Presión:</span>
                    <span>1.2 bar</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h4 className="font-semibold text-[#5A7836] mb-2">Alertas Activas</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span>Temperatura elevada en zona 3</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                    <span>Mantenimiento programado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">Historial de Eventos</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2 text-left">Fecha/Hora</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Operador</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Temperatura</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Presión</th>
                    <th className="border border-gray-300 px-4 py-2 text-left">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-gray-100">
                    <td className="border border-gray-300 px-4 py-2">2025-08-19 14:30</td>
                    <td className="border border-gray-300 px-4 py-2">Juan Pérez</td>
                    <td className="border border-gray-300 px-4 py-2">450°C</td>
                    <td className="border border-gray-300 px-4 py-2">1.2 bar</td>
                    <td className="border border-gray-300 px-4 py-2">Inicio de proceso de pirólisis</td>
                  </tr>
                  <tr className="hover:bg-gray-100">
                    <td className="border border-gray-300 px-4 py-2">2025-08-19 15:15</td>
                    <td className="border border-gray-300 px-4 py-2">María García</td>
                    <td className="border border-gray-300 px-4 py-2">465°C</td>
                    <td className="border border-gray-300 px-4 py-2">1.3 bar</td>
                    <td className="border border-gray-300 px-4 py-2">Ajuste de temperatura por protocolo</td>
                  </tr>
                  <tr className="hover:bg-gray-100">
                    <td className="border border-gray-300 px-4 py-2">2025-08-19 16:00</td>
                    <td className="border border-gray-300 px-4 py-2">Carlos López</td>
                    <td className="border border-gray-300 px-4 py-2">452°C</td>
                    <td className="border border-gray-300 px-4 py-2">1.2 bar</td>
                    <td className="border border-gray-300 px-4 py-2">Proceso estable, producción normal</td>
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

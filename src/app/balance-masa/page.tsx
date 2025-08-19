"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function BalanceMasa() {
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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">⚖️ Registrar Balance de Masa</h1>
          <p className="text-gray-600 mb-8">
            Control y registro del balance de masa en el proceso de pirólisis.
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">Materiales de Entrada</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Biomasa Inicial (kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
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
                      Humedad (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="bg-green-50 p-6 rounded-lg">
                <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">Productos de Salida</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Biochar Producido (kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bio-aceite (L)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Gases No Condensables (m³)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 bg-yellow-50 p-6 rounded-lg">
            <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">Cálculo de Balance</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">0.00 kg</div>
                <div className="text-sm text-gray-600">Total Entrada</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">0.00 kg</div>
                <div className="text-sm text-gray-600">Total Salida</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">0.0%</div>
                <div className="text-sm text-gray-600">Eficiencia</div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex justify-end space-x-4">
            <button className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200">
              Limpiar
            </button>
            <button className="px-6 py-3 bg-[#5A7836] text-white rounded-lg hover:bg-[#4a6429] transition-colors duration-200">
              Registrar Balance
            </button>
          </div>
        </div>
      </main>
      <Footer />
      </div>
    </div>
  );
}

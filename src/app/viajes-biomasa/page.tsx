"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function ViajesBiomasa() {
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
            <h1 className="text-3xl font-bold text-gray-800 mb-6">🚛 Viajes de Biomasa</h1>
          <p className="text-gray-600 mb-8">
            Registro y seguimiento de los viajes de biomasa para el proceso de pirólisis.
          </p>
          
          <div className="mb-6 flex justify-between items-center">
            <div className="flex space-x-4">
              <button className="px-4 py-2 bg-[#5A7836] text-white rounded-lg hover:bg-[#4a6429] transition-colors duration-200">
                Nuevo Viaje
              </button>
              <button className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200">
                Exportar Lista
              </button>
            </div>
            <div className="flex space-x-2">
              <input
                type="date"
                className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent"
              />
              <select className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-transparent">
                <option value="">Todos los estados</option>
                <option value="programado">Programado</option>
                <option value="en_transito">En Tránsito</option>
                <option value="entregado">Entregado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-3 text-left">ID Viaje</th>
                  <th className="border border-gray-300 px-4 py-3 text-left">Fecha</th>
                  <th className="border border-gray-300 px-4 py-3 text-left">Proveedor</th>
                  <th className="border border-gray-300 px-4 py-3 text-left">Tipo Biomasa</th>
                  <th className="border border-gray-300 px-4 py-3 text-left">Cantidad (kg)</th>
                  <th className="border border-gray-300 px-4 py-3 text-left">Estado</th>
                  <th className="border border-gray-300 px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3">VB-001</td>
                  <td className="border border-gray-300 px-4 py-3">2025-08-19</td>
                  <td className="border border-gray-300 px-4 py-3">Proveedor ABC</td>
                  <td className="border border-gray-300 px-4 py-3">Cascarilla de Arroz</td>
                  <td className="border border-gray-300 px-4 py-3">1,500</td>
                  <td className="border border-gray-300 px-4 py-3">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-sm">Entregado</span>
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <button className="text-blue-600 hover:text-blue-800 mr-2">Ver</button>
                    <button className="text-orange-600 hover:text-orange-800">Editar</button>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3">VB-002</td>
                  <td className="border border-gray-300 px-4 py-3">2025-08-19</td>
                  <td className="border border-gray-300 px-4 py-3">Proveedor XYZ</td>
                  <td className="border border-gray-300 px-4 py-3">Residuos Forestales</td>
                  <td className="border border-gray-300 px-4 py-3">2,000</td>
                  <td className="border border-gray-300 px-4 py-3">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">En Tránsito</span>
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <button className="text-blue-600 hover:text-blue-800 mr-2">Ver</button>
                    <button className="text-orange-600 hover:text-orange-800">Editar</button>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3">VB-003</td>
                  <td className="border border-gray-300 px-4 py-3">2025-08-20</td>
                  <td className="border border-gray-300 px-4 py-3">Proveedor DEF</td>
                  <td className="border border-gray-300 px-4 py-3">Residuos Agrícolas</td>
                  <td className="border border-gray-300 px-4 py-3">1,200</td>
                  <td className="border border-gray-300 px-4 py-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">Programado</span>
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <button className="text-blue-600 hover:text-blue-800 mr-2">Ver</button>
                    <button className="text-orange-600 hover:text-orange-800">Editar</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Mostrando 3 de 15 viajes
            </div>
            <div className="flex space-x-2">
              <button className="px-3 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">Anterior</button>
              <button className="px-3 py-1 bg-[#5A7836] text-white rounded hover:bg-[#4a6429]">1</button>
              <button className="px-3 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">2</button>
              <button className="px-3 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">Siguiente</button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface BalanceInfo {
  id: string;
  fechaCreacion: string;
  pesoBiochar: number;
  temperaturas: {
    reactorR1: number;
    reactorR2: number;
    reactorR3: number;
    hornoH1?: number;
    hornoH2?: number;
    hornoH3?: number;
    hornoH4?: number;
    ductoG9?: number;
  };
  realizaRegistro?: string;
  qrLona?: string;
  turnoPirolisis?: string[];
}

export default function BalanceInfoPage() {
  const params = useParams();
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadBalanceInfo = async () => {
      try {
        const response = await fetch(`/api/balance-masa/${params.id}`);
        const result = await response.json();
        
        if (result.success) {
          setBalanceInfo(result.data);
        } else {
          setError('No se pudo cargar la información del balance');
        }
      } catch (err) {
        setError('Error de conexión');
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      loadBalanceInfo();
    }
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5A7836] mx-auto mb-4"></div>
          <p>Cargando información del balance...</p>
        </div>
      </div>
    );
  }

  if (error || !balanceInfo) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
      }}
    >
      <div className="absolute inset-0 bg-black/40"></div>
      
      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-4 py-6">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-4 sm:p-8 max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">📊 Información Completa de la Lona</h1>
              <div className="bg-blue-100 p-3 rounded-lg mb-4">
                <p className="text-sm text-gray-600">ID del Balance: <strong>{balanceInfo.id}</strong></p>
                <p className="text-sm text-gray-600">Fecha de Creación: <strong>{new Date(balanceInfo.fechaCreacion).toLocaleString('es-CO')}</strong></p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
              {/* Información General */}
              <div className="bg-blue-50 p-4 sm:p-6 rounded-lg">
                <h3 className="text-lg sm:text-xl font-semibold mb-4 text-[#5A7836]">📦 Información de la Lona</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 bg-white rounded">
                    <span className="font-medium text-sm sm:text-base">Peso Biochar:</span>
                    <span className="text-lg font-bold text-green-600">{balanceInfo.pesoBiochar} KG</span>
                  </div>
                  {balanceInfo.realizaRegistro && (
                    <div className="flex justify-between items-center p-2 bg-white rounded">
                      <span className="font-medium text-sm sm:text-base">Registrado por:</span>
                      <span className="text-sm sm:text-base">{balanceInfo.realizaRegistro}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center p-2 bg-white rounded">
                    <span className="font-medium text-sm sm:text-base">Estado:</span>
                    <span className="text-sm bg-green-200 text-green-800 px-2 py-1 rounded">✅ Procesado</span>
                  </div>
                </div>
              </div>

              {/* Temperaturas de Reactores */}
              <div className="bg-orange-50 p-4 sm:p-6 rounded-lg">
                <h3 className="text-lg sm:text-xl font-semibold mb-4 text-[#5A7836]">🔥 Reactores</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white p-3 rounded text-center">
                      <div className="font-medium text-sm">Reactor R1</div>
                      <div className="text-xl font-bold text-orange-600">{balanceInfo.temperaturas.reactorR1}°C</div>
                    </div>
                    <div className="bg-white p-3 rounded text-center">
                      <div className="font-medium text-sm">Reactor R2</div>
                      <div className="text-xl font-bold text-orange-600">{balanceInfo.temperaturas.reactorR2}°C</div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded text-center">
                    <div className="font-medium text-sm">Reactor R3</div>
                    <div className="text-xl font-bold text-orange-600">{balanceInfo.temperaturas.reactorR3}°C</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Temperaturas de Hornos */}
            <div className="mt-6 sm:mt-8 bg-red-50 p-4 sm:p-6 rounded-lg">
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-[#5A7836]">🔥 Temperaturas de Hornos</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {balanceInfo.temperaturas.hornoH1 && (
                  <div className="bg-white p-4 rounded-lg text-center shadow-sm">
                    <div className="font-medium text-sm text-gray-600">Horno H1</div>
                    <div className="text-xl sm:text-2xl font-bold text-red-600">{balanceInfo.temperaturas.hornoH1}°C</div>
                  </div>
                )}
                {balanceInfo.temperaturas.hornoH2 && (
                  <div className="bg-white p-4 rounded-lg text-center shadow-sm">
                    <div className="font-medium text-sm text-gray-600">Horno H2</div>
                    <div className="text-xl sm:text-2xl font-bold text-red-600">{balanceInfo.temperaturas.hornoH2}°C</div>
                  </div>
                )}
                {balanceInfo.temperaturas.hornoH3 && (
                  <div className="bg-white p-4 rounded-lg text-center shadow-sm">
                    <div className="font-medium text-sm text-gray-600">Horno H3</div>
                    <div className="text-xl sm:text-2xl font-bold text-red-600">{balanceInfo.temperaturas.hornoH3}°C</div>
                  </div>
                )}
                {balanceInfo.temperaturas.hornoH4 && (
                  <div className="bg-white p-4 rounded-lg text-center shadow-sm">
                    <div className="font-medium text-sm text-gray-600">Horno H4</div>
                    <div className="text-xl sm:text-2xl font-bold text-red-600">{balanceInfo.temperaturas.hornoH4}°C</div>
                  </div>
                )}
              </div>
            </div>

            {/* Temperatura de Ducto */}
            {balanceInfo.temperaturas.ductoG9 && (
              <div className="mt-8 bg-gray-50 p-6 rounded-lg">
                <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">🌡️ Ducto</h3>
                <div className="text-center">
                  <div className="font-medium">Ducto G9</div>
                  <div className="text-3xl font-bold text-gray-600">{balanceInfo.temperaturas.ductoG9}°C</div>
                </div>
              </div>
            )}

            {/* Resumen de la Lona */}
            <div className="mt-6 sm:mt-8 bg-green-100 border-2 border-green-400 rounded-lg p-4 sm:p-6">
              <h3 className="text-lg sm:text-xl font-semibold mb-4 text-green-800 text-center">📋 Resumen de la Lona</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
                <div className="bg-white p-4 rounded">
                  <div className="text-2xl font-bold text-green-600">{balanceInfo.pesoBiochar} KG</div>
                  <div className="text-sm text-gray-600">Peso Total Biochar</div>
                </div>
                <div className="bg-white p-4 rounded">
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round((balanceInfo.temperaturas.reactorR1 + balanceInfo.temperaturas.reactorR2 + balanceInfo.temperaturas.reactorR3) / 3)}°C
                  </div>
                  <div className="text-sm text-gray-600">Promedio Reactores</div>
                </div>
              </div>
            </div>

            {/* Mensaje informativo */}
            <div className="mt-6 sm:mt-8 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded text-center">
              <p className="font-medium">✅ Información verificada del sistema de pirólisis SIRIUS</p>
              <p className="text-sm mt-1">Documento generado automáticamente - {new Date().toLocaleString('es-CO')}</p>
            </div>

            {/* QR Code Display */}
            {balanceInfo.qrLona && (
              <div className="mt-8 bg-blue-50 p-6 rounded-lg text-center">
                <h3 className="text-xl font-semibold mb-4 text-[#5A7836]">🔗 Código QR de la Lona</h3>
                <div className="flex justify-center mb-4">
                  <img 
                    src={balanceInfo.qrLona} 
                    alt="QR Code de la Lona" 
                    className="border-2 border-gray-300 rounded-lg"
                    style={{ maxWidth: '200px', height: 'auto' }}
                  />
                </div>
                <p className="text-sm text-gray-600">
                  Escanea este código QR para acceder a esta información
                </p>
              </div>
            )}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

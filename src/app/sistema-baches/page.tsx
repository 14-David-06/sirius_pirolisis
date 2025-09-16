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

                <div>
            {/* Estadísticas Generales */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Estadísticas Generales</h2>
              <div className="space-y-3 text-white">
                <div className="flex justify-between">
                  <span className="drop-shadow">Total de Baches:</span>
                  <span className="font-semibold">2</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Baches Activos:</span>
                  <span className="font-semibold">1</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Baches Completados:</span>
                  <span className="font-semibold">1</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Total Biochar Producido:</span>
                  <span className="font-semibold">550 kg</span>
                </div>
              </div>
            </div>

            {/* Bache Actual */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Bache Actual</h2>
              <div className="space-y-3 text-white">
                <div className="font-bold text-lg drop-shadow">S-00201</div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Estado:</span>
                  <span className="font-semibold px-2 py-1 bg-yellow-500/20 text-yellow-200 rounded-full text-xs">
                    Bache Incompleto
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Progreso:</span>
                  <span className="font-semibold">0.0%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-3">
                  <div className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] h-3 rounded-full transition-all duration-500" style={{width: '0%'}}></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="text-center">
                    <div className="text-sm drop-shadow">Total</div>
                    <div className="font-bold">50 kg</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm drop-shadow">Vendido</div>
                    <div className="font-bold">0 kg</div>
                  </div>
                </div>
                <div className="text-xs text-white/70 mt-2 drop-shadow">
                  Creado: 16/09/2025, 09:14
                </div>
              </div>
            </div>
          </div>

        </main>
        <Footer />
      </div>
    </div>
  );
}

"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useState, useEffect } from 'react';

export default function HistoricoPirolisis() {
  return (
    <TurnoProtection requiresTurno={false} allowBitacoraUsers={true}>
      <HistoricoPirolisisContent />
    </TurnoProtection>
  );
}

function HistoricoPirolisisContent() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simular carga inicial
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] flex items-center justify-center">
        <div className="text-white text-xl">Cargando Histórico de Pirolisis...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a]">
      <Navbar />

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">
              📚 Histórico de Pirolisis
            </h1>
            <p className="text-white/80 text-lg drop-shadow">
              Historial completo de procesos de pirolisis realizados
            </p>
          </div>

          {/* Contenido principal */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📚</div>
              <h2 className="text-2xl font-bold text-white mb-4 drop-shadow-lg">
                Histórico de Pirolisis
              </h2>
              <p className="text-white/70 text-lg drop-shadow">
                Esta sección mostrará el historial completo de todos los procesos de pirolisis realizados en la planta.
              </p>
              <div className="mt-8 text-white/50">
                <p>Funcionalidad en desarrollo...</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
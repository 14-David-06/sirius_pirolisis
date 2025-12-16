"use client";

import React from 'react';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function ProduccionFinal() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <ProduccionFinalContent />
    </TurnoProtection>
  );
}

function ProduccionFinalContent() {

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
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">🌱 Producción Final - Biochar Blend</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow text-lg">
              Registro y control de la producción final de biochar blend
            </p>

          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
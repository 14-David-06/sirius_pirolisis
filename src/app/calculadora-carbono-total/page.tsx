"use client";

import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import CarbonoTotalDashboard from '../../components/carbono/CarbonoTotalDashboard';
import { useCarbonoTotal } from '../../hooks/useCarbonoTotal';

export default function CalculadoraCarbonoTotalPage() {
  const carbonoTotal = useCarbonoTotal();

  return (
    <div
      className="relative min-h-screen bg-cover bg-center bg-no-repeat text-[#e0ddd5] font-['Museo_Slab',_Georgia,_serif] py-10 px-4 sm:px-8 pb-14"
      style={{
        backgroundImage: "linear-gradient(rgba(5, 6, 12, 0.94), rgba(5, 6, 12, 0.985)), url('/biochar-detail.jpg')",
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="relative z-10 max-w-[1200px] mx-auto">
        <Navbar />

        <main className="mt-9 animate-sir-rise">
          {/* HEADER DE DISEÑO PROFESIONAL */}
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-9">
            <div>
              <p className="m-0 text-[12px] font-semibold tracking-[0.2em] uppercase text-[#6a6a7a]">
                Pirólisis · MRV de remoción
              </p>
              <h1 className="m-0 mt-1 text-[26px] sm:text-[30px] font-light tracking-[0.01em] text-[#e8d5b7] leading-[1.1] font-['Museo_Slab']">
                Calculadora de Carbono Total
              </h1>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-2 border border-[#4ecdc4]/40 bg-[#4ecdc4]/10 text-[#9be9e2] rounded-[30px] px-4 py-2 text-[13px] font-semibold tracking-[0.04em]">
                <span className="w-[7px] h-[7px] rounded-full bg-[#4ecdc4] animate-sir-pulse" />
                Actualizado
              </span>
              <span className="border border-[#e8d5b7]/18 bg-white/3 text-[#8a8a9a] rounded-[30px] px-4 py-2 text-[13px]">
                {carbonoTotal.dateRangeLabel}
              </span>
            </div>
          </header>

          {/* DASHBOARD COMPONENT */}
          <CarbonoTotalDashboard {...carbonoTotal} />
        </main>

        <div className="mt-8 border-t border-[#e8d5b7]/8 pt-6">
          <Footer />
        </div>
      </div>
    </div>
  );
}

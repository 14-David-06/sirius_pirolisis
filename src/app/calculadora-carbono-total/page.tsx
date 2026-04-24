"use client";

import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import CarbonoTotalDashboard from '../../components/carbono/CarbonoTotalDashboard';
import { useCarbonoTotal } from '../../hooks/useCarbonoTotal';

export default function CalculadoraCarbonoTotalPage() {
  const carbonoTotal = useCarbonoTotal();

  return (
    <div
      className="relative min-h-screen bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/textura-biochar.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/70" />

      <div className="relative z-10">
        <Navbar />

        <main className="container mx-auto px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-2xl border border-white/25 bg-white/5 p-4 shadow-lg backdrop-blur-md sm:p-6">
            <h1 className="mb-6 text-center text-3xl font-bold text-white drop-shadow-lg sm:text-4xl">
              Calculadora de Carbono Total
            </h1>

            <CarbonoTotalDashboard {...carbonoTotal} />
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

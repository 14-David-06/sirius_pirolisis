"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    // Verificar si hay una sesión activa
    const userSession = localStorage.getItem('userSession');
    setIsLoggedIn(!!userSession);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userSession');
    setIsLoggedIn(false);
    window.location.href = '/';
  };

  const menuItems = [
    { label: "🔄 Abrir Turno", href: "/abrir-turno", icon: "🔄", description: "Gestión de turnos" },
    { label: "⚖️ Balance de Masa", href: "/balance-masa", icon: "⚖️", description: "Control de materiales" },
    { label: "🚛 Viajes de Biomasa", href: "/viajes-biomasa", icon: "🚛", description: "Logística de biomasa" },
    { label: "📋 Bitácora Pirólisis", href: "/bitacora-pirolisis", icon: "📋", description: "Registro de procesos" },
    { label: "🔥 Sistema de Baches", href: "/sistema-baches", icon: "🔥", description: "Control por lotes" },
  ];

  return (
    <header className="w-full px-6 py-4 relative z-30 bg-transparent backdrop-blur-sm">
      <nav className="max-w-7xl mx-auto flex justify-between items-center">
        <div className="px-10">
          <Link href="/" className="flex items-center space-x-2">
            <Image
              src="/logo.png"
              alt="Sirius Logo"
              width={180}
              height={200}
              priority
              className="transition-transform duration-300 hover:scale-105 cursor-pointer"
            />
          </Link>
        </div>
        
        {!isLoggedIn ? (
          // Mostrar botón de acceder si no está logueado
          <div className="flex items-center">
            <Link href="/login">
              <button className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-[#5A7836]/30 active:scale-95 flex items-center space-x-2">
                <span>🔐</span>
                <span>Acceder</span>
              </button>
            </Link>
          </div>
        ) : (
          // Mostrar menú de opciones si está logueado
          <div className="flex items-center space-x-6">
            {/* Menú desplegable para pantallas grandes */}
            <div className="hidden lg:flex items-center space-x-2">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group relative text-white hover:text-[#7fb843] px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:bg-black/20 flex items-center space-x-2 backdrop-blur-sm"
                  title={item.description}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="hidden xl:inline">{item.label.replace(/^.+?\s/, '')}</span>
                  <span className="xl:hidden">{item.label}</span>
                  
                  {/* Tooltip para pantallas grandes */}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none xl:hidden shadow-lg">
                    {item.description}
                  </div>
                </Link>
              ))}
              
              {/* Separador visual */}
              <div className="h-8 w-px bg-white/30 mx-2"></div>
              
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-red-600 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 transform hover:from-red-600 hover:to-red-700 hover:scale-105 flex items-center space-x-2"
              >
                <span>🚪</span>
                <span>Cerrar Sesión</span>
              </button>
            </div>

            {/* Menú hamburguesa para pantallas pequeñas */}
            <div className="lg:hidden relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white p-3 rounded-xl hover:from-[#4a6429] hover:to-[#3d5422] transition-all duration-200 shadow-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Menú desplegable móvil */}
              {isMenuOpen && (
                <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-3 z-50 backdrop-blur-sm">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-600">🔧 Panel de Control</p>
                  </div>
                  
                  {menuItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-4 py-3 text-gray-800 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:text-[#5A7836] transition-all duration-200 font-medium group"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <span className="text-xl mr-3 group-hover:scale-110 transition-transform duration-200">{item.icon}</span>
                      <div className="flex-1">
                        <div className="font-semibold">{item.label.replace(/^.+?\s/, '')}</div>
                        <div className="text-xs text-gray-500">{item.description}</div>
                      </div>
                    </Link>
                  ))}
                  
                  <hr className="my-2 border-gray-100" />
                  
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center px-4 py-3 text-red-600 hover:bg-red-50 transition-all duration-200 font-semibold"
                  >
                    <span className="text-xl mr-3">🚪</span>
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

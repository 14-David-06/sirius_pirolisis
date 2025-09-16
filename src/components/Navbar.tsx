"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

interface MenuItem {
  label: string;
  href: string;
  icon: string;
  description: string;
}

interface MenuCategory {
  title: string;
  icon: string;
  items: MenuItem[];
}

export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTurno, setActiveTurno] = useState<any>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    // Verificar si hay una sesión activa
    const userSession = localStorage.getItem('userSession');
    setIsLoggedIn(!!userSession);

    // Verificar si hay un turno activo
    const turnoActivo = localStorage.getItem('turnoActivo');
    if (turnoActivo) {
      setActiveTurno(JSON.parse(turnoActivo));
    }
  }, []);

  const handleLogout = () => {
    if (activeTurno) {
      alert('⚠️ Debes cerrar el turno activo antes de cerrar sesión');
      return;
    }
    
    // Confirmar logout
    const confirmar = confirm('¿Estás seguro de que quieres cerrar sesión?');
    if (!confirmar) return;
    
    // Limpiar todas las cookies y storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Limpiar cookies si las hay
    document.cookie.split(";").forEach(function(c) { 
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
    });
    
    setIsLoggedIn(false);
    setActiveTurno(null);
    window.location.href = '/login';
  };

  // Función para manejar hover en menús desplegables
  const handleMouseEnter = (category: string) => {
    setOpenDropdown(category);
  };

  const handleMouseLeave = () => {
    setOpenDropdown(null);
  };

  // Determinar qué opciones mostrar basado en el estado del turno
  const getMenuCategories = (): MenuCategory[] => {
    const turnoItem = activeTurno 
      ? { label: "🛑 Cerrar Turno", href: "/cerrar-turno", icon: "🛑", description: "Finalizar turno activo" }
      : { label: "🔄 Abrir Turno", href: "/abrir-turno", icon: "🔄", description: "Iniciar nuevo turno" };

    return [
      {
        title: "Turnos",
        icon: "⏰",
        items: [turnoItem]
      },
      {
        title: "Operaciones",
        icon: "⚙️",
        items: [
          { label: "⚖️ Balance de Masa", href: "/balance-masa", icon: "⚖️", description: "Control de materiales" },
          { label: "🚛 Viajes de Biomasa", href: "/viajes-biomasa", icon: "🚛", description: "Logística de biomasa" },
          { label: "📋 Bitácora Pirólisis", href: "/bitacora-pirolisis", icon: "📋", description: "Registro de procesos" },
        ]
      },
      {
        title: "Recursos",
        icon: "🛄",
        items: [
          { label: "📦 Inventario Pirolisis", href: "/inventario-pirolisis", icon: "📦", description: "Gestión de inventario" },
          { label: "♻️ Manejo Residuos", href: "/manejo-residuos", icon: "♻️", description: "Gestión de residuos" },
          { label: "🔥 Sistema de Baches", href: "/sistema-baches", icon: "🔥", description: "Control por lotes" },
        ]
      }
    ];
  };

  const menuCategories = getMenuCategories();

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
              {menuCategories.map((category) => (
                <div 
                  key={category.title}
                  className="relative"
                  onMouseEnter={() => handleMouseEnter(category.title)}
                  onMouseLeave={handleMouseLeave}
                >
                  <button
                    className="group relative bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white hover:from-[#4a6429] hover:to-[#3d5422] px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 flex items-center space-x-2 backdrop-blur-sm shadow-md hover:shadow-lg hover:shadow-[#5A7836]/30"
                  >
                    <span className="text-lg">{category.icon}</span>
                    <span>{category.title}</span>
                    <svg className="w-4 h-4 ml-1 transition-transform duration-200 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Menú desplegable */}
                  {openDropdown === category.title && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50 backdrop-blur-sm">
                      {category.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex items-center px-4 py-3 text-[#5A7836] hover:bg-gradient-to-r hover:from-[#5A7836] hover:to-[#4a6429] hover:text-white transition-all duration-200 font-medium group rounded-lg mx-2"
                          title={item.description}
                        >
                          <span className="text-xl mr-3 group-hover:scale-110 transition-transform duration-200">{item.icon}</span>
                          <div className="flex-1">
                            <div className="font-semibold">{item.label.replace(/^.+?\s/, '')}</div>
                            <div className="text-xs text-gray-500 group-hover:text-white/80">{item.description}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Separador visual */}
              <div className="h-8 w-px bg-white/30 mx-2"></div>
              
              
              <button
                onClick={handleLogout}
                className={`transition-all duration-300 transform hover:scale-105 flex items-center space-x-2 shadow-md hover:shadow-lg px-5 py-2 rounded-lg text-sm font-semibold ${
                  activeTurno 
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700'
                }`}
                disabled={!!activeTurno}
                title={activeTurno ? 'Debes cerrar el turno antes de cerrar sesión' : 'Cerrar sesión'}
              >
                <span>🚪</span>
                <span>Cerrar Sesión</span>
                {activeTurno && <span className="text-xs">⚠️</span>}
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
                  
                  {menuCategories.map((category) => (
                    <div key={category.title} className="border-b border-gray-50 last:border-b-0">
                      <div className="px-4 py-2">
                        <h3 className="text-sm font-semibold text-[#5A7836] flex items-center">
                          <span className="mr-2">{category.icon}</span>
                          {category.title}
                        </h3>
                      </div>
                      {category.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex items-center px-6 py-2 text-[#5A7836] hover:bg-gradient-to-r hover:from-[#5A7836] hover:to-[#4a6429] hover:text-white transition-all duration-200 font-medium group rounded-lg mx-2"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <span className="text-lg mr-3 group-hover:scale-110 transition-transform duration-200">{item.icon}</span>
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{item.label.replace(/^.+?\s/, '')}</div>
                            <div className="text-xs text-gray-500 group-hover:text-white/80">{item.description}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ))}
                  
                  <hr className="my-2 border-gray-100" />
                  
                  
                  <button
                    onClick={handleLogout}
                    className={`w-full flex items-center px-4 py-3 transition-all duration-200 font-semibold rounded-lg mx-2 ${
                      activeTurno 
                        ? 'text-gray-400 cursor-not-allowed' 
                        : 'text-red-600 hover:bg-red-50'
                    }`}
                    disabled={!!activeTurno}
                    title={activeTurno ? 'Debes cerrar el turno antes de cerrar sesión' : 'Cerrar sesión'}
                  >
                    <span className="text-xl mr-3">🚪</span>
                    <span>Cerrar Sesión</span>
                    {activeTurno && <span className="ml-2 text-xs">⚠️</span>}
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

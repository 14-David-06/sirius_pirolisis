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
          { label: "🔧 Mantenimientos", href: "/mantenimientos", icon: "🔧", description: "Registro de mantenimientos" },
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
      },
      {
        title: "Ventas",
        icon: "💰",
        items: [
          { label: "📋 Remisiones Clientes", href: "/remisiones-clientes", icon: "📋", description: "Gestión de remisiones de clientes" },
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
              
              {/* Dashboard Producción - Botón independiente */}
              <Link href="/dashboard-produccion">
                <button className="group relative bg-gradient-to-r from-blue-600 to-purple-700 text-white hover:from-blue-700 hover:to-purple-800 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 flex items-center space-x-2 backdrop-blur-sm shadow-md hover:shadow-lg hover:shadow-blue-600/30">
                  <span className="text-lg">📊</span>
                  <span>Dashboard Producción</span>
                </button>
              </Link>
              
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
                <div className="fixed inset-0 z-50 lg:hidden">
                  {/* Overlay para cerrar el menú */}
                  <div 
                    className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
                    onClick={() => setIsMenuOpen(false)}
                  ></div>
                  
                  {/* Panel del menú */}
                  <div className="fixed top-0 right-0 h-full w-80 max-w-sm bg-white shadow-2xl transform transition-transform duration-300 ease-in-out overflow-y-auto">
                    
                    {/* Header del menú */}
                    <div className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">🔧</span>
                        <h2 className="text-white font-bold text-lg">Panel de Control</h2>
                      </div>
                      <button
                        onClick={() => setIsMenuOpen(false)}
                        className="text-white hover:text-gray-200 transition-colors duration-200 p-1"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Contenido del menú */}
                    <div className="px-4 py-4 space-y-2">
                      
                      {/* Dashboard Producción - Destacado */}
                      <div className="mb-4">
                        <Link
                          href="/dashboard-produccion"
                          className="flex items-center p-4 bg-gradient-to-r from-blue-600 to-purple-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 group"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <span className="text-2xl mr-4 group-hover:scale-110 transition-transform duration-200">📊</span>
                          <div className="flex-1">
                            <div className="font-bold text-base">Dashboard Producción</div>
                            <div className="text-xs text-blue-100">Métricas y análisis en tiempo real</div>
                          </div>
                          <svg className="w-5 h-5 text-white opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>

                      {/* Categorías del menú */}
                      {menuCategories.map((category, categoryIndex) => (
                        <div key={category.title} className="mb-6">
                          {/* Título de la categoría */}
                          <div className="flex items-center mb-3 px-2">
                            <span className="text-lg mr-2">{category.icon}</span>
                            <h3 className="text-[#5A7836] font-bold text-sm uppercase tracking-wide">{category.title}</h3>
                            <div className="flex-1 h-px bg-gradient-to-r from-[#5A7836] to-transparent ml-3"></div>
                          </div>
                          
                          {/* Items de la categoría */}
                          <div className="space-y-1">
                            {category.items.map((item, itemIndex) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className="flex items-center p-3 text-gray-700 hover:bg-gradient-to-r hover:from-[#5A7836] hover:to-[#4a6429] hover:text-white transition-all duration-200 font-medium group rounded-lg border border-transparent hover:border-[#5A7836]/20 hover:shadow-sm"
                                onClick={() => setIsMenuOpen(false)}
                              >
                                <span className="text-xl mr-3 group-hover:scale-110 transition-transform duration-200">{item.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm truncate">{item.label.replace(/^.+?\s/, '')}</div>
                                  <div className="text-xs text-gray-500 group-hover:text-white/80 truncate">{item.description}</div>
                                </div>
                                <svg className="w-4 h-4 text-gray-400 group-hover:text-white opacity-0 group-hover:opacity-100 transition-all duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer del menú */}
                    <div className="border-t border-gray-200 p-4 mt-auto">
                      <button
                        onClick={handleLogout}
                        className={`w-full flex items-center justify-center p-4 transition-all duration-200 font-semibold rounded-xl ${
                          activeTurno 
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                            : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 hover:border-red-300'
                        }`}
                        disabled={!!activeTurno}
                        title={activeTurno ? 'Debes cerrar el turno antes de cerrar sesión' : 'Cerrar sesión'}
                      >
                        <span className="text-xl mr-3">🚪</span>
                        <span>Cerrar Sesión</span>
                        {activeTurno && <span className="ml-2 text-xs">⚠️</span>}
                      </button>
                      
                      {activeTurno && (
                        <p className="text-xs text-gray-500 text-center mt-2">
                          Cierra el turno activo para poder salir
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

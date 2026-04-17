"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";

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
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      alert('Debes cerrar el turno activo antes de cerrar sesión');
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
    // Cancelar cualquier timeout de cierre pendiente
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenDropdown(category);
  };

  const handleMouseLeave = () => {
    // Agregar un delay de 300ms antes de cerrar el menú
    closeTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 300);
  };

  // Limpiar el timeout cuando el componente se desmonte
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Determinar qué opciones mostrar basado en el estado del turno
  const getMenuCategories = (): MenuCategory[] => {
    const turnoItem = activeTurno 
      ? { label: "Cerrar Turno", href: "/cerrar-turno", icon: "", description: "Finalizar turno activo" }
      : { label: "Abrir Turno", href: "/abrir-turno", icon: "", description: "Iniciar nuevo turno" };

    return [
      {
        title: "Turnos",
        icon: "",
        items: [turnoItem]
      },
      {
        title: "Operaciones",
        icon: "",
        items: [
          { label: "Balance de Masa", href: "/balance-masa", icon: "", description: "Control de materiales" },
          { label: "Viajes de Biomasa", href: "/viajes-biomasa", icon: "", description: "Logística de biomasa" },
          { label: "Bitácora Pirólisis", href: "/bitacora-pirolisis", icon: "", description: "Registro de procesos" },
          { label: "Mantenimientos", href: "/mantenimientos", icon: "", description: "Registro de mantenimientos" },
          { label: "Aforos Turno", href: "/aforos-turno", icon: "", description: "Registro de aforos de producción" },
        ]
      },
      {
        title: "Recursos",
        icon: "",
        items: [
          { label: "Inventario Pirolisis", href: "/inventario-pirolisis", icon: "", description: "Gestión de inventario" },
          { label: "Manejo Residuos", href: "/manejo-residuos", icon: "", description: "Gestión de residuos" },
          { label: "Sistema de Baches", href: "/sistema-baches", icon: "", description: "Control por lotes" },
        ]
      },
      {
        title: "Ventas",
        icon: "",
        items: [
          { label: "Remisiones Clientes", href: "/remisiones-clientes", icon: "", description: "Gestión de remisiones de clientes" },
        ]
      },
      {
        title: "Remoción de Carbono (CDR)",
        icon: "",
        items: [
          { label: "Calculadora Total", href: "/calculadora-carbono-total", icon: "", description: "Cálculo consolidado 3 etapas" },
          { label: "eBiomass Detalles", href: "/calculadora-carbono", icon: "", description: "eBiomass — Emisiones transporte" },
          { label: "eProduction Detalles", href: "/calculadora-epirolisis", icon: "", description: "eProduction — Emisiones producción" },
          { label: "eTransporte Detalles", href: "/calculadora-etransporte", icon: "", description: "eTransporte — Emisiones transporte biochar" },
        ]
      }
    ];
  };

  const menuCategories = getMenuCategories();

  return (
    <>
      {/* Navbar para Desktop - Oculto en móviles */}
      <header className="w-full px-6 py-4 relative z-30 bg-transparent backdrop-blur-sm hidden lg:block">
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
          // Mostrar opciones públicas si no está logueado
          <div className="flex items-center space-x-4">
            {/* Dashboard Producción - Acceso público */}
            <Link href="/dashboard-produccion">
              <button className="bg-slate-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 hover:bg-slate-700 border border-slate-500/30">
                Dashboard
              </button>
            </Link>
            
            {/* Botón de login */}
            <Link href="/login">
              <button className="bg-[#5A7836] text-white px-8 py-3 rounded-lg font-medium transition-all duration-300 hover:bg-[#4a6429] border border-[#4a6429]/30">
                Acceder
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
                          <div className="flex-1">
                            <div className="font-semibold">{item.label}</div>
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
                <button className="bg-slate-600 text-white hover:bg-slate-700 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 border border-slate-500/30">
                  Dashboard Producción
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
                <span>Cerrar Sesión</span>
              </button>
            </div>


          </div>
        )}
        </nav>
      </header>

      {/* Sistema móvil completamente independiente */}
      <div className="lg:hidden">
        {/* Botón flotante para abrir menú - Solo visible si está logueado */}
        {isLoggedIn && (
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="fixed top-4 right-4 z-40 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white p-4 rounded-full shadow-2xl hover:from-[#4a6429] hover:to-[#3d5422] transition-all duration-300 hover:scale-110"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Logo flotante para móviles */}
        <div className="fixed top-4 left-4 z-40">
          <Link href="/" className="block">
            <Image
              src="/logo.png"
              alt="Sirius Logo"
              width={120}
              height={40}
              priority
              className="transition-transform duration-300 hover:scale-105"
            />
          </Link>
        </div>

        {/* Botón de acceso para usuarios no logueados */}
        {!isLoggedIn && (
          <div className="fixed top-4 right-4 z-40 flex space-x-2">
            <Link href="/dashboard-produccion">
              <button className="bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 hover:bg-slate-700 text-sm">
                Dashboard
              </button>
            </Link>
            <Link href="/login">
              <button className="bg-[#5A7836] text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 hover:bg-[#4a6429] text-sm">
                Acceder
              </button>
            </Link>
          </div>
        )}

        {/* Menú de pantalla completa para móviles */}
        {isMenuOpen && isLoggedIn && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl overflow-y-auto">
            {/* Header del menú móvil */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
              <div className="flex items-center space-x-3">
                <Image
                  src="/logo.png"
                  alt="Sirius Logo"
                  width={100}
                  height={35}
                  priority
                  className=""
                />
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="text-white p-2 hover:bg-white/20 rounded-xl transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido del menú móvil */}
            <div className="px-6 py-8 space-y-8">
              
              {/* Dashboard destacado */}
              <Link
                href="/dashboard-produccion"
                className="block bg-white/10 backdrop-blur-sm rounded-2xl p-6 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 border border-white/10"
                onClick={() => setIsMenuOpen(false)}
              >
                <div className="flex items-center space-x-4">
                  <div className="text-white">
                    <h3 className="text-xl font-bold">Dashboard de Producción</h3>
                    <p className="text-white/80 text-sm">Métricas y monitoreo en tiempo real</p>
                  </div>
                </div>
              </Link>

              {/* Categorías del menú */}
              {menuCategories.map((category, categoryIndex) => (
                <div key={category.title} className="space-y-4">
                  {/* Título de la categoría */}
                  <div className="flex items-center space-x-3">
                    <h3 className="text-white font-bold text-lg">{category.title}</h3>
                  </div>
                  
                  {/* Grid de items */}
                  <div className="grid grid-cols-1 gap-3">
                    {category.items.map((item, itemIndex) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block bg-white/5 backdrop-blur-sm rounded-xl p-4 hover:bg-white/15 transition-all duration-300 transform hover:scale-105 active:scale-95 border border-white/10"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className="flex-1">
                            <div className="text-white font-semibold">{item.label}</div>
                            <div className="text-white/70 text-xs">{item.description}</div>
                          </div>
                          <svg className="w-5 h-5 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer del menú móvil */}
            <div className="p-6 border-t border-white/10 mt-8 bg-white/5">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  handleLogout();
                }}
                className={`w-full flex items-center justify-center p-4 rounded-xl transition-all duration-300 font-semibold ${
                  activeTurno 
                    ? 'bg-white/10 text-white/50 cursor-not-allowed' 
                    : 'bg-red-500/80 text-white hover:bg-red-500 active:scale-95'
                }`}
                disabled={!!activeTurno}
                title={activeTurno ? 'Debes cerrar el turno antes de cerrar sesión' : 'Cerrar sesión'}
              >
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

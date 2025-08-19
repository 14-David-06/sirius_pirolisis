"use client";

import { Navbar, Footer } from "@/components";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UserData {
  id: string;
  Cedula: string;
  Nombre: string;
  Apellido: string;
  Email: string;
  Telefono: string;
  Cargo: string;
}

interface UserSession {
  user: UserData;
  loginTime: string;
}

export default function Home() {
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Verificar si hay una sesión activa
    const checkSession = () => {
      try {
        const savedSession = localStorage.getItem('userSession');
        if (savedSession) {
          const session: UserSession = JSON.parse(savedSession);
          setUserSession(session);
        }
      } catch (error) {
        console.error('Error loading session:', error);
        localStorage.removeItem('userSession');
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userSession');
    setUserSession(null);
    router.refresh();
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background Video - First Priority */}
      <video 
        className="fixed inset-0 w-full h-full object-cover z-0"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      >
        <source 
          src="https://res.cloudinary.com/dvnuttrox/video/upload/v1752168408/corte_pirolisis_pitch_deck_-_Made_with_Clipchamp_1_1_chu5dg.mp4" 
          type="video/mp4" 
        />
      </video>
      
      {/* Overlay for better text readability */}
      <div className="fixed inset-0 bg-black/50 z-10"></div>
      
      {/* Content Container */}
      <div className="relative z-20">
        {/* First Viewport - Video Background with Content */}
        <div className="min-h-screen flex flex-col">
          {/* Navbar Component */}
          <Navbar />

          {/* Hero Section */}
          <main className="flex-1 flex items-center justify-center">
            {loading ? (
              <div className="text-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-white text-lg">Verificando sesión...</p>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto px-6 text-center">
                {userSession ? (
                  // Usuario logueado
                  <div className="animate-fade-in-up">
                    <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
                      ¡Bienvenido de vuelta, {userSession.user.Nombre}!
                    </h1>
                    <p className="text-lg md:text-xl text-white/90 mb-2">
                      {userSession.user.Cargo} - Sirius Pirólisis
                    </p>
                    <p className="text-sm text-white/70 mb-8">
                      Última sesión: {new Date(userSession.loginTime).toLocaleString('es-ES')}
                    </p>
                  </div>
                ) : (
                  // Usuario no logueado
                  <div>
                    <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 animate-fade-in-up">
                      <span className="inline-block transition-transform duration-500 hover:scale-105">
                        Sirius
                      </span>
                      <span className="block text-white transition-transform duration-500 hover:scale-105">
                        Pirólisis
                      </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white mb-12 max-w-3xl mx-auto opacity-90 animate-fade-in-up animation-delay-300">
                      Transformando residuos en recursos valiosos a través de tecnología de pirólisis avanzada
                    </p>
                    
                    <div className="flex justify-center animate-fade-in-up animation-delay-600">
                      <a href="/login">
                        <button className="group bg-[#5A7836] text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-500 transform hover:bg-[#4a6429] hover:scale-110 hover:shadow-2xl hover:shadow-[#5A7836]/40 active:scale-95 hover:rotate-1 focus:outline-none focus:ring-4 focus:ring-[#5A7836]/50">
                          <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                            Acceder a la plataforma
                          </span>
                          <span className="inline-block ml-2 transition-transform duration-300 group-hover:translate-x-2">
                            →
                          </span>
                        </button>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* Second Section - Footer appears when scrolling */}
        <div className="bg-black relative z-30">
          <Footer />
        </div>
      </div>
    </div>
  );
}
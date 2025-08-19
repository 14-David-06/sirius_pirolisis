"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';

interface TurnoProtectionProps {
  children: React.ReactNode;
  requiresTurno?: boolean;
}

export default function TurnoProtection({ children, requiresTurno = true }: TurnoProtectionProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasActiveTurno, setHasActiveTurno] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndTurno = () => {
      // Verificar autenticación
      const userSession = localStorage.getItem('userSession');
      if (!userSession) {
        router.push('/login');
        return;
      }
      
      setIsAuthenticated(true);

      // Verificar turno activo si es requerido
      if (requiresTurno) {
        const turnoActivo = localStorage.getItem('turnoActivo');
        if (!turnoActivo) {
          setHasActiveTurno(false);
          setIsLoading(false);
          return;
        }
        setHasActiveTurno(true);
      }
      
      setIsLoading(false);
    };

    checkAuthAndTurno();
  }, [router, requiresTurno]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/80">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Ya se está redirigiendo
  }

  // Si requiere turno pero no hay turno activo
  if (requiresTurno && !hasActiveTurno) {
    return (
      <div 
        className="min-h-screen bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
        }}
      >
        <div className="absolute inset-0 bg-black/70"></div>
        
        <div className="relative z-20">
          <Navbar />
          
          <div className="flex items-center justify-center min-h-[80vh]">
            <div className="max-w-lg mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 text-center">
              <div className="mb-6">
                <div className="text-6xl mb-4">🔐</div>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">
                  Turno Requerido
                </h1>
                <p className="text-gray-600 mb-6">
                  Para acceder a las funciones operacionales necesitas abrir un turno primero. 
                  Esto asegura el correcto registro de todas las actividades.
                </p>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/abrir-turno')}
                  className="w-full bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-2"
                >
                  <span>🔄</span>
                  <span>Abrir Mi Turno</span>
                </button>
                
                <button
                  onClick={() => router.push('/')}
                  className="w-full bg-gray-500 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-2"
                >
                  <span>🏠</span>
                  <span>Volver al Inicio</span>
                </button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>💡 Nota:</strong> Una vez que abras tu turno, podrás acceder a todas las funciones operacionales del sistema.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Si todo está bien, mostrar el contenido
  return <>{children}</>;
}

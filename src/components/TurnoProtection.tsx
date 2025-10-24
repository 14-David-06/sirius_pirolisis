"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from './Navbar';

interface TurnoProtectionProps {
  children: React.ReactNode;
  requiresTurno?: boolean;
  allowBitacoraUsers?: boolean;
}

// Usuarios autorizados para acceder a todas las funciones sin turno
// David y Santiago tienen acceso completo a todas las funcionalidades
const SUPER_AUTHORIZED_USERS = [
  'Santiago Amaya',
  'Santiago',
  'David Hernandez', 
  'David',
  'Don Martin', 
  'Pablo Acebedo'
];

export default function TurnoProtection({ 
  children, 
  requiresTurno = true, 
  allowBitacoraUsers = false 
}: TurnoProtectionProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasActiveTurno, setHasActiveTurno] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [turnoInfo, setTurnoInfo] = useState<{
    turnoPerteneceAlUsuario: boolean;
    mensaje: string;
    turnoAbierto: any;
  } | null>(null);
  const router = useRouter();

  // Función para verificar si el usuario está autorizado para acceder sin turno
  const isUserAuthorizedForBitacora = (userName: string): boolean => {
    if (!userName) return false;
    
    // Normalizar el nombre para comparación (convertir a minúsculas y remover espacios extra)
    const normalizedUserName = userName.toLowerCase().trim();
    
    return SUPER_AUTHORIZED_USERS.some(authorizedUser => {
      const normalizedAuthorizedUser = authorizedUser.toLowerCase().trim();
      // Verificar coincidencia exacta o si el nombre del usuario está contenido en el autorizado
      return normalizedAuthorizedUser === normalizedUserName || 
             normalizedUserName.includes('david') || 
             normalizedUserName.includes('santiago') ||
             normalizedUserName.includes('martin') ||
             normalizedUserName.includes('pablo');
    });
  };

  useEffect(() => {
    const checkAuthAndTurno = async () => {
      // Verificar autenticación
      const userSession = localStorage.getItem('userSession');
      if (!userSession) {
        router.push('/login');
        return;
      }
      
      let userId = null;
      let userName = null;
      try {
        const sessionData = JSON.parse(userSession);
        userId = sessionData.user?.id;
        userName = sessionData.user?.Nombre || sessionData.user?.name;
        
        // Debug log para verificar el nombre del usuario
        console.log('🔍 [TurnoProtection] Usuario detectado:', userName);
        console.log('🔍 [TurnoProtection] ¿Es usuario autorizado?', isUserAuthorizedForBitacora(userName));
      } catch (error) {
        console.error('Error parsing user session:', error);
        router.push('/login');
        return;
      }
      
      setIsAuthenticated(true);

      // Verificar turno activo si es requerido
      // Si allowBitacoraUsers es true y el usuario está autorizado, no requerir turno
      const shouldRequireTurno = requiresTurno && !(allowBitacoraUsers && isUserAuthorizedForBitacora(userName));
      
      if (shouldRequireTurno && userId) {
        await validateAndSyncTurno(userId);
      } else if (shouldRequireTurno && !userId) {
        // Si se requiere turno pero no hay userId, marcar como sin turno
        setHasActiveTurno(false);
      } else {
        // No se requiere turno o usuario autorizado para bitácora
        setHasActiveTurno(true);
      }
      
      setIsLoading(false);
    };

    checkAuthAndTurno();

    // Configurar polling para mantener sincronización (cada 30 segundos)
    const intervalId = setInterval(() => {
      const userSession = localStorage.getItem('userSession');
      if (userSession) {
        try {
          const sessionData = JSON.parse(userSession);
          const userId = sessionData.user?.id;
          const userName = sessionData.user?.Nombre || sessionData.user?.name;
          
          // Solo hacer polling si se requiere turno y el usuario no está autorizado para bitácora
          const shouldRequireTurno = requiresTurno && !(allowBitacoraUsers && isUserAuthorizedForBitacora(userName));
          
          if (shouldRequireTurno && userId) {
            validateAndSyncTurno(userId);
          }
        } catch (error) {
          console.error('Error en polling de turno:', error);
        }
      }
    }, 30000); // 30 segundos

    return () => clearInterval(intervalId);
  }, [router, requiresTurno]);

  const validateAndSyncTurno = async (userId: string, showFeedback = false) => {
    if (showFeedback) setSyncing(true);

    try {
      const response = await fetch(`/api/turno/check?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Agregar timeout para evitar esperas infinitas
        signal: AbortSignal.timeout(10000) // 10 segundos timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();

      if (data.hasTurnoAbierto) {
        // Guardar información del turno encontrado
        setTurnoInfo({
          turnoPerteneceAlUsuario: data.turnoPerteneceAlUsuario,
          mensaje: data.mensaje,
          turnoAbierto: data.turnoAbierto
        });

        if (data.turnoPerteneceAlUsuario) {
          // El turno abierto pertenece al usuario actual
          const localTurno = localStorage.getItem('turnoActivo');
          if (localTurno) {
            const localTurnoData = JSON.parse(localTurno);
            if (localTurnoData.id !== data.turnoAbierto.id) {
              // El turno local no coincide, actualizar
              localStorage.setItem('turnoActivo', JSON.stringify(data.turnoAbierto));
              if (showFeedback) {
                alert('✅ Estado del turno actualizado');
              }
            }
          } else {
            // No hay turno local pero sí en BD, guardar
            localStorage.setItem('turnoActivo', JSON.stringify(data.turnoAbierto));
            if (showFeedback) {
              alert('✅ Turno encontrado y sincronizado');
            }
          }
          setHasActiveTurno(true);
        } else {
          // El turno abierto pertenece a otro usuario
          const localTurno = localStorage.getItem('turnoActivo');
          if (localTurno) {
            localStorage.removeItem('turnoActivo');
          }
          setHasActiveTurno(false);
          if (showFeedback) {
            alert(`⚠️ ${data.mensaje}`);
          }
        }
      } else {
        // No hay turno activo en BD
        setTurnoInfo(null);
        const localTurno = localStorage.getItem('turnoActivo');
        if (localTurno) {
          localStorage.removeItem('turnoActivo');
          if (showFeedback) {
            alert('🧹 Estado local limpiado - no hay turno activo');
          }
        }
        setHasActiveTurno(false);
      }
    } catch (error) {
      console.error('❌ Error validando turno:', error);
      
      // Determinar el tipo de error para mejor manejo
      let errorMessage = 'Error al sincronizar. Verifica tu conexión.';
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'No se puede conectar al servidor. Verifica que el servidor esté ejecutándose.';
      } else if (error instanceof Error && error.name === 'AbortError') {
        errorMessage = 'La solicitud tardó demasiado tiempo. Reintentando...';
      } else if (error instanceof Error) {
        errorMessage = `Error de conexión: ${error.message}`;
      }
      
      if (showFeedback) {
        alert(`❌ ${errorMessage}`);
      }
      
      // En caso de error de red, mantener el estado actual pero marcar para reintento
      setHasActiveTurno(false);
      setTurnoInfo(null);
    } finally {
      if (showFeedback) setSyncing(false);
    }
  };

  const forceSyncTurno = async () => {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      try {
        const sessionData = JSON.parse(userSession);
        const userId = sessionData.user?.id;
        if (userId) {
          await validateAndSyncTurno(userId, true);
        }
      } catch (error) {
        console.error('Error forzando sincronización:', error);
        alert('❌ Error al sincronizar');
      }
    }
  };

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
  // Excepción: usuarios autorizados para bitácora pueden acceder sin turno
  const userSession = localStorage.getItem('userSession');
  let userName = null;
  if (userSession) {
    try {
      const sessionData = JSON.parse(userSession);
      userName = sessionData.user?.Nombre || sessionData.user?.name;
    } catch (error) {
      // Ignorar error de parsing
    }
  }
  
  const shouldRequireTurno = requiresTurno && !(allowBitacoraUsers && isUserAuthorizedForBitacora(userName));
  
  if (shouldRequireTurno && !hasActiveTurno) {
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
                <div className="text-6xl mb-4">
                  {turnoInfo?.turnoPerteneceAlUsuario === false ? '�' : '�🔐'}
                </div>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">
                  {turnoInfo?.turnoPerteneceAlUsuario === false
                    ? 'Turno en Uso'
                    : 'Turno Requerido'
                  }
                </h1>
                <p className="text-gray-600 mb-6">
                  {turnoInfo?.turnoPerteneceAlUsuario === false
                    ? turnoInfo.mensaje
                    : 'Para acceder a las funciones operacionales necesitas abrir un turno primero. Esto asegura el correcto registro de todas las actividades.'
                  }
                </p>
              </div>
              
              <div className="space-y-3">
                {turnoInfo?.turnoPerteneceAlUsuario === false ? (
                  // Turno pertenece a otro usuario - mostrar información y esperar
                  <div className="space-y-3">
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-sm text-red-800 mb-2">
                        <strong>⏳ Espera a que el operador actual cierre su turno</strong>
                      </p>
                      {turnoInfo?.turnoAbierto && (
                        <div className="text-xs text-red-700">
                          <p><strong>Operador:</strong> {turnoInfo.turnoAbierto.operador}</p>
                          <p><strong>Inicio:</strong> {new Date(turnoInfo.turnoAbierto.fechaInicio).toLocaleString()}</p>
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={forceSyncTurno}
                      disabled={syncing}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {syncing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Verificando...</span>
                        </>
                      ) : (
                        <>
                          <span>🔄</span>
                          <span>Verificar Estado</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  // No hay turno abierto o turno pertenece al usuario - permitir abrir turno
                  <>
                    <button
                      onClick={() => router.push('/abrir-turno')}
                      className="w-full bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-2"
                    >
                      <span>🔄</span>
                      <span>Abrir Mi Turno</span>
                    </button>
                    
                    <button
                      onClick={forceSyncTurno}
                      disabled={syncing}
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {syncing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Sincronizando...</span>
                        </>
                      ) : (
                        <>
                          <span>🔄</span>
                          <span>Sincronizar Estado</span>
                        </>
                      )}
                    </button>
                  </>
                )}
                
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
                  <strong>💡 Nota:</strong> {turnoInfo?.turnoPerteneceAlUsuario === false
                    ? 'El sistema se verifica automáticamente cada 30 segundos. Una vez que el turno actual se cierre, podrás abrir el tuyo.'
                    : 'Una vez que abras tu turno, podrás acceder a todas las funciones operacionales del sistema. El sistema se sincroniza automáticamente cada 30 segundos.'
                  }
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

"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface CerrarTurnoFormData {
  consumoAguaFin: string;
  consumoEnergiaFin: string;
  consumoGasFinal: string;
}

export default function CerrarTurno() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <CerrarTurnoContent />
    </TurnoProtection>
  );
}

function CerrarTurnoContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [activeTurno, setActiveTurno] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState<CerrarTurnoFormData>({
    consumoAguaFin: '',
    consumoEnergiaFin: '',
    consumoGasFinal: ''
  });

  useEffect(() => {
    // TurnoProtection ya validó que el usuario está autenticado y tiene un turno activo
    const turnoActivo = localStorage.getItem('turnoActivo');
    if (turnoActivo) {
      try {
        const turnoData = JSON.parse(turnoActivo);
        setActiveTurno(turnoData);
      } catch (error) {
        console.error('Error parsing turno data:', error);
      }
    }
    setIsAuthenticated(true);
  }, []);

  // Función para actualizar el cache del turno
  const actualizarCacheTurno = async () => {
    setSyncing(true);
    try {
      const userSession = localStorage.getItem('userSession');
      if (!userSession) {
        throw new Error('No hay sesión de usuario');
      }

      const sessionData = JSON.parse(userSession);
      const userId = sessionData.user?.id;
      
      if (!userId) {
        throw new Error('ID de usuario no encontrado');
      }

      const response = await fetch(`/api/turno/check?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000) // 10 segundos timeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();

      if (data.hasTurnoAbierto && data.turnoPerteneceAlUsuario) {
        // Actualizar información local del turno
        localStorage.setItem('turnoActivo', JSON.stringify(data.turnoAbierto));
        setActiveTurno(data.turnoAbierto);
        setMensaje('✅ Cache del turno actualizado correctamente');
      } else if (data.hasTurnoAbierto && !data.turnoPerteneceAlUsuario) {
        // Hay un turno pero no pertenece al usuario actual
        localStorage.removeItem('turnoActivo');
        setActiveTurno(null);
        setMensaje('⚠️ ' + data.mensaje);
      } else {
        // No hay turno activo
        localStorage.removeItem('turnoActivo');
        setActiveTurno(null);
        setMensaje('🔍 No se encontró turno activo en el sistema');
      }
    } catch (error) {
      console.error('Error actualizando cache del turno:', error);
      let errorMessage = 'Error al actualizar el cache del turno';
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        errorMessage = 'No se puede conectar al servidor';
      } else if (error instanceof Error && error.name === 'AbortError') {
        errorMessage = 'La solicitud tardó demasiado tiempo';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setMensaje('❌ ' + errorMessage);
    } finally {
      setSyncing(false);
      
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => {
        setMensaje('');
      }, 5000);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMensaje('');

    try {
      if (!activeTurno) {
        setMensaje('❌ Error: No hay turno activo para cerrar.');
        return;
      }

      const dataToSend = {
        turnoId: activeTurno.id,
        consumoAguaFin: parseFloat(formData.consumoAguaFin) || 0,
        consumoEnergiaFin: parseFloat(formData.consumoEnergiaFin) || 0,
        consumoGasFinal: parseFloat(formData.consumoGasFinal) || 0
      };

      const response = await fetch('/api/turno/close', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();

      if (response.ok) {
        setMensaje('✅ ¡Turno cerrado exitosamente! Redirigiendo...');
        
        // Limpiar localStorage
        localStorage.removeItem('turnoActivo');
        
        // Esperar 2 segundos y redirigir
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        setMensaje(`❌ Error al cerrar el turno: ${result.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('💥 Error al cerrar turno:', error);
      setMensaje('❌ Error de conexión. Por favor, inténtalo nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">🔄 Verificando autenticación...</div>
      </div>
    );
  }

  if (!activeTurno) {
    return (
      <div 
        className="min-h-screen bg-cover bg-center bg-no-repeat relative"
        style={{
          backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
        }}
      >
        <div className="absolute inset-0 bg-black/60"></div>
        
        <div className="relative z-20">
          <Navbar />
          
          <div className="flex items-center justify-center min-h-[80vh]">
            <div className="max-w-md mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 text-center">
              <div className="mb-6">
                <div className="text-6xl mb-4">⚠️</div>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">
                  No hay turno activo
                </h1>
                <p className="text-gray-600 mb-6">
                  Para cerrar un turno, primero debes abrir uno. 
                  No hay ningún turno activo en este momento.
                </p>
              </div>
              
              {/* Mensaje de estado */}
              {mensaje && (
                <div className={`mb-4 p-3 rounded-lg ${
                  mensaje.startsWith('✅') 
                    ? 'bg-green-50 border border-green-200 text-green-800' 
                    : mensaje.startsWith('⚠️')
                    ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  <p className="text-sm font-medium">{mensaje}</p>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => router.push('/abrir-turno')}
                  className="w-full bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  🔄 Abrir Turno
                </button>
                
                <button
                  onClick={actualizarCacheTurno}
                  disabled={syncing}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg flex items-center justify-center space-x-2"
                >
                  {syncing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Actualizando Cache...</span>
                    </>
                  ) : (
                    <>
                      <span>🔄</span>
                      <span>Actualizar Cache Turno</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => router.push('/')}
                  className="w-full bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  🏠 Volver al Inicio
                </button>
              </div>
            </div>
          </div>
          
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
      }}
    >
      {/* Overlay para mejorar la legibilidad */}
      <div className="absolute inset-0 bg-black/40"></div>
      
      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-4xl mx-auto border border-white/30">            {/* Botón de Actualizar Cache */}
            <div className="flex justify-end mb-4">
              <button
                onClick={actualizarCacheTurno}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600/80 hover:bg-blue-700/80 disabled:bg-gray-500/50 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 flex items-center space-x-2 backdrop-blur-sm border border-white/30"
              >
                {syncing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Actualizando...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Actualizar Cache Turno</span>
                  </>
                )}
              </button>
            </div>

            {/* Mensaje de estado */}
            {mensaje && (
              <div className={`mb-4 p-3 rounded-lg backdrop-blur-sm border ${
                mensaje.startsWith('✅') 
                  ? 'bg-green-500/20 border-green-400/30 text-green-100' 
                  : mensaje.startsWith('⚠️')
                  ? 'bg-yellow-500/20 border-yellow-400/30 text-yellow-100'
                  : 'bg-red-500/20 border-red-400/30 text-red-100'
              }`}>
                <p className="text-sm font-medium drop-shadow">{mensaje}</p>
              </div>
            )}
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">🛑 Cerrar Turno de Pirólisis</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Registra las lecturas de consumo final para cerrar el turno de {activeTurno?.operador || 'operador'}
            </p>
            
            {mensaje && (
              <div className={`mb-6 p-4 rounded-lg text-center font-semibold backdrop-blur-sm ${
                mensaje.includes('✅') 
                  ? 'bg-green-500/80 text-white border border-green-400/50 shadow-lg' 
                  : 'bg-red-500/80 text-white border border-red-400/50 shadow-lg'
              }`}>
                {mensaje}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Lecturas de Consumo Final */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  📊 Lecturas de Consumo Final
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label htmlFor="consumoAguaFin" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      💧 Consumo Agua Final *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="consumoAguaFin"
                      name="consumoAguaFin"
                      value={formData.consumoAguaFin}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 45.20"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>

                  <div>
                    <label htmlFor="consumoEnergiaFin" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      ⚡ Consumo Energía Final *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="consumoEnergiaFin"
                      name="consumoEnergiaFin"
                      value={formData.consumoEnergiaFin}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 3650.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>

                  <div>
                    <label htmlFor="consumoGasFinal" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🔥 Consumo Gas Final *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="consumoGasFinal"
                      name="consumoGasFinal"
                      value={formData.consumoGasFinal}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 9850"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Información adicional */}
              <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-lg p-4 backdrop-blur-sm">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <span className="text-yellow-300 text-xl drop-shadow">ℹ️</span>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-yellow-100 drop-shadow">
                      Información importante
                    </h4>
                    <p className="text-sm text-yellow-200 mt-1 drop-shadow">
                      • El sistema registrará automáticamente la fecha/hora de cierre<br/>
                      • Una vez cerrado el turno, no podrás acceder a las funciones operativas<br/>
                      • Asegúrate de que todas las lecturas sean correctas antes de proceder
                    </p>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex justify-end space-x-4 pt-6">
                <button 
                  type="button"
                  onClick={() => router.back()}
                  disabled={isLoading}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Cerrando Turno...</span>
                    </>
                  ) : (
                    <>
                      <span>🛑</span>
                      <span>Cerrar Turno</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </main>
      <Footer />
      </div>
    </div>
  );
}

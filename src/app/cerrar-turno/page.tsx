"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface CerrarTurnoFormData {
  consumoAguaFin: string;
  consumoEnergiaFin: string;
  consumoGasFinal: string;
}

export default function CerrarTurno() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [activeTurno, setActiveTurno] = useState<any>(null);
  const router = useRouter();

  const [formData, setFormData] = useState<CerrarTurnoFormData>({
    consumoAguaFin: '',
    consumoEnergiaFin: '',
    consumoGasFinal: ''
  });

  useEffect(() => {
    const userSession = localStorage.getItem('userSession');
    
    if (!userSession) {
      router.push('/login');
      return;
    }

    // Verificar si hay un turno activo
    const turnoActivo = localStorage.getItem('turnoActivo');
    if (!turnoActivo) {
      router.push('/');
      return;
    }

    try {
      const userData = JSON.parse(userSession);
      const turnoData = JSON.parse(turnoActivo);
      
      setActiveTurno(turnoData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error parsing session data:', error);
      router.push('/login');
    }
  }, [router]);

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

      console.log('🔄 Enviando datos de cierre:', dataToSend);

      const response = await fetch('/api/turno/close', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();
      console.log('📡 Respuesta del servidor:', result);

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
              
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/abrir-turno')}
                  className="w-full bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  🔄 Abrir Turno
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
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-4xl mx-auto border border-white/30">
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

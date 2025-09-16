"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface TurnoFormData {
  operador: string;
  alimentacionBiomasa: string;
  herztTolva2: string;
  consumoAguaInicio: string;
  consumoEnergiaInicio: string;
  consumoGasInicial: string;
}

export default function AbrirTurno() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [hasActiveTurno, setHasActiveTurno] = useState(false);
  const [otherUserTurno, setOtherUserTurno] = useState<any>(null);
  const [isCheckingTurnos, setIsCheckingTurnos] = useState(true);
  const router = useRouter();

  const [formData, setFormData] = useState<TurnoFormData>({
    operador: '',
    alimentacionBiomasa: '',
    herztTolva2: '',
    consumoAguaInicio: '',
    consumoEnergiaInicio: '',
    consumoGasInicial: ''
  });

  useEffect(() => {
    const checkTurnos = async () => {
      const userSession = localStorage.getItem('userSession');
      console.log('🔍 Raw userSession from localStorage:', userSession);
      
      if (!userSession) {
        router.push('/login');
        return;
      }

      // Verificar si ya hay un turno activo en localStorage
      const turnoActivo = localStorage.getItem('turnoActivo');
      if (turnoActivo) {
        setHasActiveTurno(true);
        setIsCheckingTurnos(false);
        return;
      }

      try {
        const userData = JSON.parse(userSession);
        // Verificar si hay turnos abiertos en Airtable
        const userId = userData.user?.id;
        if (!userId) {
          console.error('❌ No se pudo obtener el userId del usuario');
          setMensaje('❌ Error: No se pudo identificar al usuario');
          return;
        }
        
        const response = await fetch(`/api/turno/check?userId=${userId}`);
        const result = await response.json();
        
        if (response.ok) {
          if (result.hasTurnoAbierto) {
            if (result.turnoPerteneceAlUsuario) {
              // El turno abierto pertenece al usuario actual - redirigir
              router.push('/');
              return;
            } else {
              // El turno abierto pertenece a otro usuario
              setOtherUserTurno(result.turnoAbierto);
              setMensaje(result.mensaje);
            }
          } else {
            setFormData(prev => ({
              ...prev,
              operador: userData.user?.Nombre || ''
            }));
            setIsAuthenticated(true);
          }
        } else {
          console.error('Error al verificar turnos:', result.error);
          setMensaje(`❌ Error al verificar turnos: ${result.error}`);
        }
      } catch (error) {
        console.error('Error parsing user session or checking turnos:', error);
        router.push('/login');
      } finally {
        setIsCheckingTurnos(false);
      }
    };

    checkTurnos();
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
      // Generar automáticamente la fecha/hora actual y obtener usuario de la sesión
      const userSession = localStorage.getItem('userSession');
      const sessionData = userSession ? JSON.parse(userSession) : {};
      const userData = sessionData.user || {};

      // Validar que tengamos los datos del usuario
      if (!userData.Nombre || !userData.id) {
        setMensaje('❌ Error: No se pudo obtener la información del usuario. Por favor, vuelve a iniciar sesión.');
        return;
      }
      
      const dataToSend = {
        operador: userData.Nombre || 'Usuario no identificado',
        alimentacionBiomasa: parseFloat(formData.alimentacionBiomasa) || 0,
        herztTolva2: parseInt(formData.herztTolva2) || 0,
        consumoAguaInicio: parseFloat(formData.consumoAguaInicio) || 0,
        consumoEnergiaInicio: parseFloat(formData.consumoEnergiaInicio) || 0,
        consumoGasInicial: parseInt(formData.consumoGasInicial) || 0,
        realizaRegistro: userData.Nombre || 'Usuario no identificado',
        usuarioId: userData.id || ''
      };

      const response = await fetch('/api/turno/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();

      if (response.ok) {
        setMensaje('✅ Turno abierto exitosamente');
        
        // Guardar el turno activo en localStorage
        const turnoActivo = {
          id: result.data?.records?.[0]?.id || 'temp-id',
          operador: userData.Nombre,
          fechaInicio: new Date().toISOString(),
          status: 'activo'
        };
        localStorage.setItem('turnoActivo', JSON.stringify(turnoActivo));
        
        // Limpiar formulario después de éxito
        setFormData({
          operador: formData.operador, // mantener el operador
          alimentacionBiomasa: '',
          herztTolva2: '',
          consumoAguaInicio: '',
          consumoEnergiaInicio: '',
          consumoGasInicial: ''
        });
        
        // Redirigir al usuario después de un breve delay
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        setMensaje(`❌ Error: ${result.error || 'No se pudo abrir el turno'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setMensaje('❌ Error de conexión. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated && !otherUserTurno && isCheckingTurnos) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">🔄 Verificando turnos activos...</div>
      </div>
    );
  }

  if (otherUserTurno) {
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
            <div className="max-w-lg mx-auto bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 text-center">
              <div className="mb-6">
                <div className="text-6xl mb-4">⚠️</div>
                <h1 className="text-2xl font-bold text-gray-800 mb-4">
                  Ya hay un turno activo
                </h1>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-yellow-800 mb-2">
                    📋 Información del turno activo:
                  </h3>
                  <div className="text-left text-sm text-yellow-700 space-y-1">
                    <p><strong>👤 Operador:</strong> {otherUserTurno.operador}</p>
                    <p><strong>📅 Inicio:</strong> {new Date(otherUserTurno.fechaInicio).toLocaleString('es-CO')}</p>
                    <p><strong>🎙️ Alimentación Biomasa:</strong> {otherUserTurno.alimentacionBiomasa} Kg/min</p>
                    <p><strong>🎙️ Herzt Tolva 2:</strong> {otherUserTurno.herztTolva2}</p>
                  </div>
                </div>
                <p className="text-gray-600 mb-6">
                  Para abrir un nuevo turno, es necesario que <strong>{otherUserTurno.operador}</strong> cierre 
                  su turno activo primero. Por favor, coordina con tu compañero para que finalice su turno.
                </p>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  🔄 Verificar Nuevamente
                </button>
                
                <button
                  onClick={() => router.push('/')}
                  className="w-full bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  🏠 Volver al Inicio
                </button>
                
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-600">
                    💡 <strong>Sugerencia:</strong> Puedes usar el botón "Verificar Nuevamente" 
                    después de que tu compañero cierre su turno.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <Footer />
        </div>
      </div>
    );
  }

  if (hasActiveTurno) {
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
                  Ya tienes un turno activo
                </h1>
                <p className="text-gray-600 mb-6">
                  No puedes abrir un nuevo turno mientras tienes uno en curso. 
                  Debes cerrar el turno actual desde el navbar antes de abrir uno nuevo.
                </p>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => router.push('/')}
                  className="w-full bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  🏠 Volver al Inicio
                </button>
                
                <button
                  onClick={() => {
                    localStorage.removeItem('turnoActivo');
                    window.location.reload();
                  }}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  🛑 Forzar Cierre de Turno
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
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">🔄 Abrir Turno de Pirólisis</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">El sistema generará automáticamente la fecha/hora de inicio y asignará el operador actual</p>
            
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
              {/* Parámetros de Operación */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  ⚙️ Parámetros de Operación
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="alimentacionBiomasa" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🎙️ Alimentación Biomasa Húmeda Por Minuto (Kg) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="alimentacionBiomasa"
                      name="alimentacionBiomasa"
                      value={formData.alimentacionBiomasa}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 1.70"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>

                  <div>
                    <label htmlFor="herztTolva2" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🎙️ Herzt Tolva 2 *
                    </label>
                    <input
                      type="number"
                      id="herztTolva2"
                      name="herztTolva2"
                      value={formData.herztTolva2}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 20"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Consumos Iniciales */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  📊 Lecturas de Consumo Inicial
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label htmlFor="consumoAguaInicio" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      💧 Consumo Agua Inicio *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="consumoAguaInicio"
                      name="consumoAguaInicio"
                      value={formData.consumoAguaInicio}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 42.20"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>

                  <div>
                    <label htmlFor="consumoEnergiaInicio" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      ⚡ Consumo Energía Inicio *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="consumoEnergiaInicio"
                      name="consumoEnergiaInicio"
                      value={formData.consumoEnergiaInicio}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 3559.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>

                  <div>
                    <label htmlFor="consumoGasInicial" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🔥 Consumo Gas Inicial *
                    </label>
                    <input
                      type="number"
                      id="consumoGasInicial"
                      name="consumoGasInicial"
                      value={formData.consumoGasInicial}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 9670"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
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
                  className="px-8 py-3 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white rounded-lg hover:from-[#4a6429] hover:to-[#3d5422] transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Abriendo Turno...</span>
                    </>
                  ) : (
                    <>
                      <span>🔄</span>
                      <span>Abrir Turno</span>
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

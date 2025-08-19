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
    const userSession = localStorage.getItem('userSession');
    console.log('🔍 Raw userSession from localStorage:', userSession);
    
    if (!userSession) {
      router.push('/login');
      return;
    }
    
    try {
      const userData = JSON.parse(userSession);
      console.log('🔍 Parsed userData:', userData);
      console.log('🔍 userData.user:', userData.user);
      
      setFormData(prev => ({
        ...prev,
        operador: userData.user?.Nombre || ''
      }));
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error parsing user session:', error);
      router.push('/login');
    }
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
      
      console.log('🔍 Datos del usuario para turno:', userData);
      console.log('🆔 ID del usuario:', userData.id);
      console.log('👤 Nombre del usuario:', userData.Nombre);
      console.log('📝 Operador del formulario:', formData.operador);

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

      console.log('📤 Datos que se enviarán a la API:', dataToSend);

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
        // Limpiar formulario después de éxito
        setFormData({
          operador: formData.operador, // mantener el operador
          alimentacionBiomasa: '',
          herztTolva2: '',
          consumoAguaInicio: '',
          consumoEnergiaInicio: '',
          consumoGasInicial: ''
        });
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">🔄 Verificando autenticación...</div>
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

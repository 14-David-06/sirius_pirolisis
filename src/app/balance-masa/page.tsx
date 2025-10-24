"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import VoiceRecorder from '@/components/VoiceRecorder';

interface BalanceMasaFormData {
  temperaturaR1: string;
  temperaturaR2: string;
  temperaturaR3: string;
  temperaturaH1: string;
  temperaturaH2: string;
  temperaturaH3: string;
  temperaturaH4: string;
  temperaturaG9: string;
}

export default function BalanceMasa() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <BalanceMasaContent />
    </TurnoProtection>
  );
}

function BalanceMasaContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const router = useRouter();

  const [formData, setFormData] = useState<BalanceMasaFormData>({
    temperaturaR1: '',
    temperaturaR2: '',
    temperaturaR3: '',
    temperaturaH1: '',
    temperaturaH2: '',
    temperaturaH3: '',
    temperaturaH4: '',
    temperaturaG9: ''
  });

  useEffect(() => {
    const userSession = localStorage.getItem('userSession');
    if (!userSession) {
      router.push('/login');
      return;
    }

    try {
      const sessionData = JSON.parse(userSession);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error parsing session:', error);
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

  const validateForm = () => {
    const requiredFields = ['temperaturaR1', 'temperaturaR2', 'temperaturaR3'];
    for (const field of requiredFields) {
      if (!formData[field as keyof BalanceMasaFormData]) {
        setMensaje(`Por favor complete el campo: ${field}`);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setMensaje('');

    try {
      // Obtener el turno activo
      const turnoActivo = localStorage.getItem('turnoActivo');
      let turnoPirolisisId = null;
      
      if (turnoActivo) {
        try {
          const turnoData = JSON.parse(turnoActivo);
          turnoPirolisisId = turnoData.id;
        } catch (error) {
          console.error('Error parsing turno activo:', error);
        }
      }

      // Obtener el usuario logueado automáticamente
      const userSession = localStorage.getItem('userSession');
      let realizaRegistro = '';
      
      if (userSession) {
        try {
          const sessionData = JSON.parse(userSession);
          
          // La estructura es: { user: { Nombre, Cedula, Cargo, etc }, loginTime }
          realizaRegistro = sessionData.user?.Nombre || 'Usuario desconocido';
        } catch (error) {
          console.error('Error parsing user session:', error);
          realizaRegistro = 'Usuario desconocido';
        }
      }

      const dataToSend = {
        pesoBiochar: 25.00, // Valor estático de 25kg
        temperaturaR1: parseFloat(formData.temperaturaR1),
        temperaturaR2: parseFloat(formData.temperaturaR2),
        temperaturaR3: parseFloat(formData.temperaturaR3),
        temperaturaH1: parseFloat(formData.temperaturaH1) || 0,
        temperaturaH2: parseFloat(formData.temperaturaH2) || 0,
        temperaturaH3: parseFloat(formData.temperaturaH3) || 0,
        temperaturaH4: parseFloat(formData.temperaturaH4) || 0,
        temperaturaG9: parseFloat(formData.temperaturaG9) || 0,
        realizaRegistro: realizaRegistro,
        ...(turnoPirolisisId && { turnoPirolisis: [turnoPirolisisId] })
      };

      const response = await fetch('/api/balance-masa/create-with-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();

      if (result.success) {
        if (result.warning) {
          setMensaje(`⚠️ ${result.warning}`);
        } else {
          setMensaje(`✅ ${result.message}`);
        }
        
        // Limpiar formulario
        setFormData({
          temperaturaR1: '',
          temperaturaR2: '',
          temperaturaR3: '',
          temperaturaH1: '',
          temperaturaH2: '',
          temperaturaH3: '',
          temperaturaH4: '',
          temperaturaG9: ''
        });
      } else {
        setMensaje(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setMensaje('❌ Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  const limpiarFormulario = () => {
    setFormData({
      temperaturaR1: '',
      temperaturaR2: '',
      temperaturaR3: '',
      temperaturaH1: '',
      temperaturaH2: '',
      temperaturaH3: '',
      temperaturaH4: '',
      temperaturaG9: ''
    });
    setMensaje('');
  };

  const handleTemperaturasExtraidas = (temperaturas: any) => {
    console.log('🎤 Temperaturas extraídas del dictado:', temperaturas);
    
    // Actualizar el formulario con las temperaturas extraídas
    setFormData(prev => ({
      ...prev,
      ...(temperaturas.temperaturaR1 && { temperaturaR1: temperaturas.temperaturaR1.toString() }),
      ...(temperaturas.temperaturaR2 && { temperaturaR2: temperaturas.temperaturaR2.toString() }),
      ...(temperaturas.temperaturaR3 && { temperaturaR3: temperaturas.temperaturaR3.toString() }),
      ...(temperaturas.temperaturaH1 && { temperaturaH1: temperaturas.temperaturaH1.toString() }),
      ...(temperaturas.temperaturaH2 && { temperaturaH2: temperaturas.temperaturaH2.toString() }),
      ...(temperaturas.temperaturaH3 && { temperaturaH3: temperaturas.temperaturaH3.toString() }),
      ...(temperaturas.temperaturaH4 && { temperaturaH4: temperaturas.temperaturaH4.toString() }),
      ...(temperaturas.temperaturaG9 && { temperaturaG9: temperaturas.temperaturaG9.toString() })
    }));

    // Mostrar mensaje de éxito
    const valoresEncontrados = Object.keys(temperaturas).length;
    setMensaje(`✅ Se llenaron ${valoresEncontrados} campo(s) automáticamente. Revise y edite si es necesario.`);
  };

  if (!isAuthenticated) {
    return <div>Cargando...</div>;
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
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">⚖️ Balance de Masa</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Registro de temperaturas y peso del biochar en el proceso de pirólisis
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
              {/* Peso del Biochar - Estático */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  📦 Informacion de la lona
                </h2>
                
                <div className="bg-green-500/20 border border-green-400/50 rounded-lg p-4">
                  <div className="flex items-center justify-center">
                    <span className="text-2xl font-bold text-white drop-shadow-lg">
                      ⚖️ Peso Biochar: 25.00 KG
                    </span>
                  </div>
                  <p className="text-center text-white/80 text-sm mt-2 drop-shadow">
                    Peso estándar establecido para el proceso
                  </p>
                </div>
              </div>

              {/* Dictado de Temperaturas */}
              <VoiceRecorder 
                onTemperaturesExtracted={handleTemperaturasExtraidas}
                isLoading={isLoading}
              />

              {/* Temperaturas de Reactores */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  🔥 Temperaturas de Reactores (°C)
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label htmlFor="temperaturaR1" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🌡️ Reactor R1 *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="temperaturaR1"
                      name="temperaturaR1"
                      value={formData.temperaturaR1}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 399.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="temperaturaR2" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🌡️ Reactor R2 *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="temperaturaR2"
                      name="temperaturaR2"
                      value={formData.temperaturaR2}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 412.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="temperaturaR3" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🌡️ Reactor R3 *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="temperaturaR3"
                      name="temperaturaR3"
                      value={formData.temperaturaR3}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 413.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Temperaturas de Hornos */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  🔥 Temperaturas de Hornos (°C)
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <label htmlFor="temperaturaH1" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🔥 Horno H1
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="temperaturaH1"
                      name="temperaturaH1"
                      value={formData.temperaturaH1}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 321.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="temperaturaH2" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🔥 Horno H2
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="temperaturaH2"
                      name="temperaturaH2"
                      value={formData.temperaturaH2}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 820.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="temperaturaH3" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🔥 Horno H3
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="temperaturaH3"
                      name="temperaturaH3"
                      value={formData.temperaturaH3}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 414.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="temperaturaH4" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🔥 Horno H4
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="temperaturaH4"
                      name="temperaturaH4"
                      value={formData.temperaturaH4}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 234.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Temperatura de Ducto */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  🌡️ Temperatura de Ducto
                </h2>
                
                <div>
                  <label htmlFor="temperaturaG9" className="block text-sm font-medium text-white mb-2 drop-shadow">
                    🌡️ Ducto G9 (°C)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    id="temperaturaG9"
                    name="temperaturaG9"
                    value={formData.temperaturaG9}
                    onChange={handleInputChange}
                    min="0"
                    placeholder="Ej: 0.00"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                  />
                </div>
              </div>

              {/* Botones de Acción - Centrados */}
              <div className="flex justify-center space-x-4 pt-6">
                <button 
                  type="button"
                  onClick={limpiarFormulario}
                  disabled={isLoading}
                  className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Limpiar
                </button>
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="px-8 py-3 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white rounded-lg hover:from-[#4a6429] hover:to-[#3d5422] transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-semibold shadow-lg"
                >
                  {isLoading ? 'Registrando...' : '⚖️ Registrar Balance'}
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

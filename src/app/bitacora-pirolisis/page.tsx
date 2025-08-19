"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BitacoraVoiceRecorder from '@/components/BitacoraVoiceRecorder';

interface BitacoraFormData {
  evento: string;
  descripcion: string;
  severidad: 'Baja' | 'Media' | 'Alta' | 'Crítica';
}

export default function BitacoraPirolisis() {
  return (
    <TurnoProtection requiresTurno={true}>
      <BitacoraContent />
    </TurnoProtection>
  );
}

function BitacoraContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const router = useRouter();

  const [formData, setFormData] = useState<BitacoraFormData>({
    evento: '',
    descripcion: '',
    severidad: 'Baja'
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.evento.trim()) {
      setMensaje('❌ Por favor ingrese el nombre del evento');
      return false;
    }
    if (!formData.descripcion.trim()) {
      setMensaje('❌ Por favor ingrese una descripción');
      return false;
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
      // Obtener datos del usuario y turno
      const userSession = localStorage.getItem('userSession');
      const turnoActivo = localStorage.getItem('turnoActivo');
      
      let sessionData: { user?: { Nombre?: string } } = {};
      let turnoData: { id?: string } = {};
      
      if (userSession) {
        sessionData = JSON.parse(userSession);
      }
      
      if (turnoActivo) {
        turnoData = JSON.parse(turnoActivo);
      }

      const dataToSend = {
        ...formData,
        registradoPor: sessionData?.user?.Nombre || 'Usuario no identificado',
        turnoId: turnoData?.id || null,
        fechaHora: new Date().toISOString(),
      };

      console.log('📋 Enviando registro de bitácora:', dataToSend);

      const response = await fetch('/api/bitacora/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();

      if (result.success) {
        setMensaje(`✅ ${result.message}`);
        
        // Limpiar formulario
        setFormData({
          evento: '',
          descripcion: '',
          severidad: 'Baja'
        });
      } else {
        setMensaje(`❌ ${result.error}`);
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
      evento: '',
      descripcion: '',
      severidad: 'Baja'
    });
    setMensaje('');
  };

  const handleEventoExtraido = (eventData: { evento: string; descripcion: string }) => {
    console.log('🎤 Datos del evento extraídos del dictado:', eventData);
    
    // Actualizar el formulario con los datos extraídos
    setFormData(prev => ({
      ...prev,
      evento: eventData.evento || prev.evento,
      descripcion: eventData.descripcion || prev.descripcion
    }));

    // Mostrar mensaje de éxito
    setMensaje('✅ Formulario llenado automáticamente desde el dictado. Revise y edite si es necesario.');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500 mx-auto"></div>
          <p className="mt-4 text-lg">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752096900/DSC_3884-Mejorado-NR_ghtz72.jpg')"
      }}
    >
      {/* Overlay translúcido */}
      <div className="absolute inset-0 bg-black/30"></div>
      
      <div className="relative z-10">
        <Navbar />
        
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-4xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">📋 Bitácora Pirólisis</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Registro de eventos y seguimiento del proceso de pirólisis
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
              
              {/* Dictado de Evento */}
              <BitacoraVoiceRecorder 
                onEventExtracted={handleEventoExtraido}
                isLoading={isLoading}
              />

              {/* Información del evento */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  🎯 Información del Evento
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="evento" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🏷️ Nombre del Evento *
                    </label>
                    <input
                      type="text"
                      id="evento"
                      name="evento"
                      value={formData.evento}
                      onChange={handleInputChange}
                      required
                      placeholder="Ej: Mantenimiento preventivo, Falla en equipo..."
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>

                  <div>
                    <label htmlFor="severidad" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      ⚠️ Severidad
                    </label>
                    <select
                      id="severidad"
                      name="severidad"
                      value={formData.severidad}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 font-medium"
                    >
                      <option value="Baja">🟢 Baja</option>
                      <option value="Media">🟡 Media</option>
                      <option value="Alta">🟠 Alta</option>
                      <option value="Crítica">🔴 Crítica</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6">
                  <label htmlFor="descripcion" className="block text-sm font-medium text-white mb-2 drop-shadow">
                    📝 Descripción detallada *
                  </label>
                  <textarea
                    id="descripcion"
                    name="descripcion"
                    value={formData.descripcion}
                    onChange={handleInputChange}
                    required
                    rows={4}
                    placeholder="Describa detalladamente el evento, causa, ubicación, equipos involucrados..."
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium resize-none"
                  />
                </div>
              </div>

              {/* Botones */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  type="button"
                  onClick={limpiarFormulario}
                  className="px-8 py-3 bg-white/20 hover:bg-white/30 text-white border-2 border-white/40 rounded-lg font-semibold backdrop-blur-sm drop-shadow-lg transition-all duration-200"
                >
                  🧹 Limpiar
                </button>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-8 py-3 bg-[#5A7836]/80 hover:bg-[#5A7836] text-white border-2 border-[#5A7836]/60 rounded-lg font-semibold backdrop-blur-sm drop-shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Registrando...
                    </>
                  ) : (
                    <>
                      📋 Registrar en Bitácora
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
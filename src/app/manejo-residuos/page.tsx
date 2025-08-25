'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ManejoResiduosVoiceRecorder from '@/components/ManejoResiduosVoiceRecorder';

interface ManejoResiduosFormData {
  cantidadAprovechables: string;
  cantidadPeligrosos: string;
  cantidadNoAprovechables: string;
  cantidadOrganicos: string;
  entregadoA: string;
  observaciones: string;
}

export default function ManejoResiduos() {
  return (
    <TurnoProtection requiresTurno={true}>
      <ManejoResiduosContent />
    </TurnoProtection>
  );
}

function ManejoResiduosContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const router = useRouter();

  const handleVoiceData = (data: any) => {
    // Actualizar el formulario con los datos del reconocimiento de voz
    if (data && typeof data === 'object') {
      setFormData({
        cantidadAprovechables: data.cantidadAprovechables?.toString() || '',
        cantidadPeligrosos: data.cantidadPeligrosos?.toString() || '',
        cantidadNoAprovechables: data.cantidadNoAprovechables?.toString() || '',
        cantidadOrganicos: data.cantidadOrganicos?.toString() || '',
        entregadoA: data.entregadoA || '',
        observaciones: data.observaciones || ''
      });
    }
  };

  const [formData, setFormData] = useState<ManejoResiduosFormData>({
    cantidadAprovechables: '',
    cantidadPeligrosos: '',
    cantidadNoAprovechables: '',
    cantidadOrganicos: '',
    entregadoA: '',
    observaciones: ''
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
    const hasAtLeastOneQuantity = [
      'cantidadAprovechables',
      'cantidadPeligrosos', 
      'cantidadNoAprovechables',
      'cantidadOrganicos'
    ].some(field => formData[field as keyof ManejoResiduosFormData] && parseFloat(formData[field as keyof ManejoResiduosFormData]) > 0);

    if (!hasAtLeastOneQuantity) {
      setMensaje('Por favor ingrese al menos una cantidad de residuos mayor a 0');
      return false;
    }

    if (!formData.entregadoA.trim()) {
      setMensaje('Por favor complete el campo "Entregado a"');
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
          console.log('🔍 Datos de sesión completos:', sessionData);
          
          realizaRegistro = sessionData.user?.Nombre || 'Usuario desconocido';
          console.log('👤 Nombre extraído:', realizaRegistro);
        } catch (error) {
          console.error('Error parsing user session:', error);
          realizaRegistro = 'Usuario desconocido';
        }
      }

      const dataToSend = {
        CantidadResiduosAprovechablesKg: parseFloat(formData.cantidadAprovechables) || 0,
        CantidadResiduosPeligrososKg: parseFloat(formData.cantidadPeligrosos) || 0,
        CantidadResiduosNoAprovechablesKg: parseFloat(formData.cantidadNoAprovechables) || 0,
        CantidadResiduosOrganicosKg: parseFloat(formData.cantidadOrganicos) || 0,
        EntregadoA: formData.entregadoA.trim(),
        RealizaRegistro: realizaRegistro,
        Observaciones: formData.observaciones.trim(),
        ...(turnoPirolisisId && { ID_Turno: [turnoPirolisisId] })
      };

      console.log('♻️ Enviando datos de manejo de residuos:', dataToSend);

      const response = await fetch('/api/manejo-residuos/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();

      if (response.ok && result.records) {
        setMensaje(`✅ Registro de manejo de residuos creado exitosamente (ID: ${result.records[0]?.id})`);
        
        // Limpiar formulario
        setFormData({
          cantidadAprovechables: '',
          cantidadPeligrosos: '',
          cantidadNoAprovechables: '',
          cantidadOrganicos: '',
          entregadoA: '',
          observaciones: ''
        });
      } else {
        setMensaje(`❌ Error: ${result.error || 'Error desconocido'}`);
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
      cantidadAprovechables: '',
      cantidadPeligrosos: '',
      cantidadNoAprovechables: '',
      cantidadOrganicos: '',
      entregadoA: '',
      observaciones: ''
    });
    setMensaje('');
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
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">♻️ Manejo de Residuos</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Registro de clasificación y gestión de residuos generados en el proceso
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
              {/* Grabación por Voz */}
              <ManejoResiduosVoiceRecorder 
                onDataExtracted={(data) => {
                  console.log('💭 Datos recibidos del reconocimiento de voz:', data);
                  setFormData(prev => ({
                    cantidadAprovechables: data.cantidadAprovechables || '',
                    cantidadPeligrosos: data.cantidadPeligrosos || '',
                    cantidadNoAprovechables: data.cantidadNoAprovechables || '',
                    cantidadOrganicos: data.cantidadOrganicos || '',
                    entregadoA: data.entregadoA || '',
                    observaciones: data.observaciones || ''
                  }));
                  setMensaje('✅ Datos extraídos del audio correctamente');
                }}
                isLoading={isLoading}
              />

              {/* Residuos Aprovechables y Orgánicos */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  🌱 Residuos Aprovechables y Orgánicos (KG)
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="cantidadAprovechables" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      ♻️ Residuos Aprovechables
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="cantidadAprovechables"
                      name="cantidadAprovechables"
                      value={formData.cantidadAprovechables}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 15.50"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="cantidadOrganicos" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🥬 Residuos Orgánicos
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="cantidadOrganicos"
                      name="cantidadOrganicos"
                      value={formData.cantidadOrganicos}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 8.25"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Residuos Peligrosos y No Aprovechables */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  ⚠️ Residuos Peligrosos y No Aprovechables (KG)
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="cantidadPeligrosos" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      ☢️ Residuos Peligrosos
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="cantidadPeligrosos"
                      name="cantidadPeligrosos"
                      value={formData.cantidadPeligrosos}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 2.75"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="cantidadNoAprovechables" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      🗑️ Residuos No Aprovechables
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="cantidadNoAprovechables"
                      name="cantidadNoAprovechables"
                      value={formData.cantidadNoAprovechables}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Ej: 5.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Información de Entrega */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  🚚 Información de Entrega
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="entregadoA" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      👤 Entregado a *
                    </label>
                    <input
                      type="text"
                      id="entregadoA"
                      name="entregadoA"
                      value={formData.entregadoA}
                      onChange={handleInputChange}
                      required
                      placeholder="Ej: Empresa de Gestión de Residuos XYZ"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="observaciones" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      📝 Observaciones
                    </label>
                    <textarea
                      id="observaciones"
                      name="observaciones"
                      value={formData.observaciones}
                      onChange={handleInputChange}
                      rows={4}
                      placeholder="Comentarios adicionales sobre el manejo de residuos..."
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 font-medium resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex justify-center space-x-4 pt-6">
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-semibold shadow-lg"
                >
                  {isLoading ? 'Registrando...' : '♻️ Registrar Manejo'}
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
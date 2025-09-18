'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface ViajesBiomasaFormData {
  nombreQuienEntrega: string;
  puntoRecoleccion: string;
  puntoEntrega: string;
  distanciaMetros: string;
  tipoBiomasa: string;
  tipoBiomasaOtro: string;
  pesoEntregadoMasaFresca: string;
  tipoCombustible: string;
  tipoCombustibleOtro: string;
  tipoVehiculo: string;
  tipoVehiculoOtro: string;
}

export default function ViajesBiomasa() {
  return (
    <TurnoProtection requiresTurno={true}>
      <ViajesBiomasaContent />
    </TurnoProtection>
  );
}

function ViajesBiomasaContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const router = useRouter();

  const [formData, setFormData] = useState({
    nombreQuienEntrega: '',
    puntoRecoleccion: '',
    puntoEntrega: '',
    distanciaMetros: '',
    tipoBiomasa: '',
    tipoBiomasaOtro: '',
    pesoEntregadoMasaFresca: '',
    tipoCombustible: '',
    tipoCombustibleOtro: '',
    tipoVehiculo: '',
    tipoVehiculoOtro: ''
  });

  const [showTipoBiomasaOtro, setShowTipoBiomasaOtro] = useState(false);
  const [showTipoCombustibleOtro, setShowTipoCombustibleOtro] = useState(false);
  const [showTipoVehiculoOtro, setShowTipoVehiculoOtro] = useState(false);

  // Estados para rutas S3
  const [rutasS3, setRutasS3] = useState<any[]>([]);
  const [rutaSeleccionada, setRutaSeleccionada] = useState('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [cargandoRutas, setCargandoRutas] = useState(false);
  const [cargandoImagen, setCargandoImagen] = useState(false);

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

  // Cargar rutas de S3 al montar el componente
  useEffect(() => {
    const cargarRutasS3 = async () => {
      if (!isAuthenticated) return;

      setCargandoRutas(true);
      try {
        const response = await fetch('/api/s3/list-routes');
        const data = await response.json();

        if (data.success) {
          setRutasS3(data.files);
        } else {
          console.error('Error cargando rutas S3:', data.error);
        }
      } catch (error) {
        console.error('Error al cargar rutas de S3:', error);
      } finally {
        setCargandoRutas(false);
      }
    };

    cargarRutasS3();
  }, [isAuthenticated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'tipoBiomasa') {
      setShowTipoBiomasaOtro(value === 'Otro');
      if (value !== 'Otro') setFormData(prev => ({ ...prev, tipoBiomasaOtro: '' }));
    }
    if (name === 'tipoCombustible') {
      setShowTipoCombustibleOtro(value === 'Otro');
      if (value !== 'Otro') setFormData(prev => ({ ...prev, tipoCombustibleOtro: '' }));
    }
    if (name === 'tipoVehiculo') {
      setShowTipoVehiculoOtro(value === 'Otro');
      if (value !== 'Otro') setFormData(prev => ({ ...prev, tipoVehiculoOtro: '' }));
    }
  };

  // Función para manejar cambio de ruta S3
  const handleRutaChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    setRutaSeleccionada(selectedKey);

    if (!selectedKey) {
      setImagenUrl('');
      return;
    }

    setCargandoImagen(true);
    try {
      const response = await fetch(`/api/s3/get-image-url?key=${encodeURIComponent(selectedKey)}`);
      const data = await response.json();

      if (data.success) {
        setImagenUrl(data.signedUrl);
      } else {
        console.error('Error obteniendo URL de imagen:', data.error);
        setImagenUrl('');
      }
    } catch (error) {
      console.error('Error al cargar imagen:', error);
      setImagenUrl('');
    } finally {
      setCargandoImagen(false);
    }
  };

  const validateForm = () => {
    if (!formData.nombreQuienEntrega.trim()) {
      setMensaje('Por favor ingrese el nombre de quien entrega la biomasa');
      return false;
    }
    if (!formData.puntoRecoleccion.trim()) {
      setMensaje('Por favor ingrese el punto de recolección');
      return false;
    }
    if (!formData.puntoEntrega.trim()) {
      setMensaje('Por favor ingrese el punto de entrega');
      return false;
    }
    if (!formData.distanciaMetros || parseFloat(formData.distanciaMetros) <= 0) {
      setMensaje('Por favor ingrese una distancia válida en metros');
      return false;
    }
    if (!formData.pesoEntregadoMasaFresca || parseFloat(formData.pesoEntregadoMasaFresca) <= 0) {
      setMensaje('Por favor ingrese el peso de la biomasa fresca');
      return false;
    }
    if (!formData.tipoVehiculo) {
      setMensaje('Por favor seleccione el tipo de vehículo');
      return false;
    }
    if (showTipoBiomasaOtro && !formData.tipoBiomasaOtro.trim()) {
      setMensaje('Por favor ingrese el nombre del tipo de biomasa');
      return false;
    }
    if (showTipoCombustibleOtro && !formData.tipoCombustibleOtro.trim()) {
      setMensaje('Por favor ingrese el nombre del tipo de combustible');
      return false;
    }
    if (showTipoVehiculoOtro && !formData.tipoVehiculoOtro.trim()) {
      setMensaje('Por favor ingrese el nombre del tipo de vehículo');
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
      // Obtener el usuario logueado para su ID
      const userSession = localStorage.getItem('userSession');
      let userId = null;
      let realizaRegistro = '';
      
      if (userSession) {
        try {
          const sessionData = JSON.parse(userSession);
          userId = sessionData.user?.id;
          realizaRegistro = sessionData.user?.Nombre || 'Usuario desconocido';
        } catch (error) {
          console.error('Error parsing user session:', error);
          realizaRegistro = 'Usuario desconocido';
        }
      }

      // Obtener el turno activo del usuario
      let turnoPirolisisId = null;
      if (userId) {
        try {
          const turnoResponse = await fetch(`/api/turno/check?userId=${userId}`);
          const turnoData = await turnoResponse.json();
          
          if (turnoData.hasTurnoAbierto) {
            turnoPirolisisId = turnoData.turnoAbierto.id;
            // Guardar el turno activo en localStorage
            localStorage.setItem('turnoActivo', JSON.stringify(turnoData.turnoAbierto));
          } else {
            localStorage.removeItem('turnoActivo');
          }
        } catch (error) {
          console.error('Error obteniendo turno activo:', error);
          localStorage.removeItem('turnoActivo');
        }
      }

      const dataToSend = {
        "Nombre Quien Entrega": formData.nombreQuienEntrega.trim(),
        "Punto Recoleccion": formData.puntoRecoleccion.trim(),
        "Punto Entrega": formData.puntoEntrega.trim(),
        "Distancia Metros": parseFloat(formData.distanciaMetros),
        "Tipo Biomasa": showTipoBiomasaOtro ? formData.tipoBiomasaOtro.trim() : formData.tipoBiomasa.trim(),
        "Peso entregado de masa fresca": parseFloat(formData.pesoEntregadoMasaFresca),
        "Tipo Combustible": showTipoCombustibleOtro ? formData.tipoCombustibleOtro.trim() : formData.tipoCombustible.trim(),
        "Tipo Vehículo": showTipoVehiculoOtro ? formData.tipoVehiculoOtro.trim() : formData.tipoVehiculo.trim(),
        "Realiza Registro": realizaRegistro,
        ...(turnoPirolisisId && { "ID_Turno": [turnoPirolisisId] })
      };

      const response = await fetch('/api/viajes-biomasa/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      const result = await response.json();

      if (response.ok) {
        setMensaje('✅ Viaje de biomasa registrado exitosamente');
        setFormData({
          nombreQuienEntrega: '',
          puntoRecoleccion: '',
          puntoEntrega: '',
          distanciaMetros: '',
          tipoBiomasa: '',
          tipoBiomasaOtro: '',
          pesoEntregadoMasaFresca: '',
          tipoCombustible: '',
          tipoCombustibleOtro: '',
          tipoVehiculo: '',
          tipoVehiculoOtro: ''
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
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">🚛 Registro de Viajes de Biomasa</h1>
            <p className="text-lg sm:text-xl md:text-2xl mb-8 text-gray-200 max-w-3xl mx-auto leading-relaxed text-center drop-shadow">
              Registro y seguimiento del transporte de biomasa para el proceso de pirólisis
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
              {/* Visualización de Rutas S3 */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  🗺️ Mapas de Rutas de Biomasa
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="rutaSeleccionada" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Seleccionar Ruta
                    </label>
                    <select
                      id="rutaSeleccionada"
                      name="rutaSeleccionada"
                      value={rutaSeleccionada}
                      onChange={handleRutaChange}
                      disabled={cargandoRutas}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                    >
                      <option value="">
                        {cargandoRutas ? 'Cargando rutas...' : 'Seleccione una ruta'}
                      </option>
                      {rutasS3.map((ruta) => (
                        <option key={ruta.key} value={ruta.key}>
                          {ruta.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    {cargandoImagen && (
                      <div className="text-white">Cargando imagen...</div>
                    )}
                  </div>
                </div>
                {imagenUrl && (
                  <div className="mt-6">
                    <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
                      <h3 className="text-lg font-medium text-white mb-3 drop-shadow">
                        Vista Previa de la Ruta
                      </h3>
                      <div className="flex justify-center">
                        <img
                          src={imagenUrl}
                          alt={`Ruta ${rutaSeleccionada}`}
                          className="max-w-full h-auto max-h-96 rounded-lg shadow-lg border border-white/20"
                          onError={() => {
                            console.error('Error cargando imagen');
                            setImagenUrl('');
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Información de Entrega */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  👤 Información de Entrega
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="nombreQuienEntrega" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Nombre Quien Entrega *
                    </label>
                    <input
                      type="text"
                      id="nombreQuienEntrega"
                      name="nombreQuienEntrega"
                      value={formData.nombreQuienEntrega}
                      onChange={handleInputChange}
                      required
                      placeholder="Ej: Juan Pérez"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="tipoVehiculo" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Tipo Vehículo *
                    </label>
                    <select
                      id="tipoVehiculo"
                      name="tipoVehiculo"
                      value={formData.tipoVehiculo}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                    >
                      <option value="">Seleccione un tipo de vehículo</option>
                      <option value="Camión">Camión</option>
                      <option value="Tractomula">Tractomula</option>
                      <option value="Volqueta">Volqueta</option>
                      <option value="Camioneta">Camioneta</option>
                      <option value="Motocicleta">Motocicleta</option>
                      <option value="Otro">Otro</option>
                    </select>
                    {showTipoVehiculoOtro && (
                      <input
                        type="text"
                        id="tipoVehiculoOtro"
                        name="tipoVehiculoOtro"
                        value={formData.tipoVehiculoOtro}
                        onChange={handleInputChange}
                        required
                        placeholder="Especifique el tipo de vehículo"
                        className="mt-2 w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Información de Ubicación */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  📍 Información de Ubicación
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="puntoRecoleccion" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Punto Recolección *
                    </label>
                    <input
                      type="text"
                      id="puntoRecoleccion"
                      name="puntoRecoleccion"
                      value={formData.puntoRecoleccion}
                      onChange={handleInputChange}
                      required
                      placeholder="Ej: Recolección Norte"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="puntoEntrega" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Punto Entrega *
                    </label>
                    <input
                      type="text"
                      id="puntoEntrega"
                      name="puntoEntrega"
                      value={formData.puntoEntrega}
                      onChange={handleInputChange}
                      required
                      placeholder="Ej: Planta Sur"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="distanciaMetros" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Distancia Metros *
                    </label>
                    <input
                      type="number"
                      id="distanciaMetros"
                      name="distanciaMetros"
                      value={formData.distanciaMetros}
                      onChange={handleInputChange}
                      required
                      min="0"
                      step="0.01"
                      placeholder="Ej: 15.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Información de Carga y Biomasa */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                  ⚖️ Información de Carga y Biomasa
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="tipoBiomasa" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Tipo Biomasa
                    </label>
                    <select
                      id="tipoBiomasa"
                      name="tipoBiomasa"
                      value={formData.tipoBiomasa}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                    >
                      <option value="">Seleccione un tipo de biomasa</option>
                      <option value="Residuos Forestales">Residuos Forestales</option>
                      <option value="Residuos Agrícolas">Residuos Agrícolas</option>
                      <option value="Residuos Urbanos">Residuos Urbanos</option>
                      <option value="Residuos Industriales">Residuos Industriales</option>
                      <option value="Otro">Otro</option>
                    </select>
                    {showTipoBiomasaOtro && (
                      <input
                        type="text"
                        id="tipoBiomasaOtro"
                        name="tipoBiomasaOtro"
                        value={formData.tipoBiomasaOtro}
                        onChange={handleInputChange}
                        required
                        placeholder="Especifique el tipo de biomasa"
                        className="mt-2 w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                      />
                    )}
                  </div>
                  <div>
                    <label htmlFor="pesoEntregadoMasaFresca" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Peso entregado de masa fresca (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      id="pesoEntregadoMasaFresca"
                      name="pesoEntregadoMasaFresca"
                      value={formData.pesoEntregadoMasaFresca}
                      onChange={handleInputChange}
                      required
                      min="0"
                      placeholder="Ej: 500.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    />
                  </div>
                  <div>
                    <label htmlFor="tipoCombustible" className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Tipo Combustible
                    </label>
                    <select
                      id="tipoCombustible"
                      name="tipoCombustible"
                      value={formData.tipoCombustible}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                    >
                      <option value="">Seleccione un tipo de combustible</option>
                      <option value="Diesel">Diesel</option>
                      <option value="Gasolina">Gasolina</option>
                      <option value="Gas">Gas</option>
                      <option value="Eléctrico">Eléctrico</option>
                      <option value="Otro">Otro</option>
                    </select>
                    {showTipoCombustibleOtro && (
                      <input
                        type="text"
                        id="tipoCombustibleOtro"
                        name="tipoCombustibleOtro"
                        value={formData.tipoCombustibleOtro}
                        onChange={handleInputChange}
                        required
                        placeholder="Especifique el tipo de combustible"
                        className="mt-2 w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                      />
                    )}
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
                  {isLoading ? 'Registrando...' : '🚛 Registrar Viaje'}
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

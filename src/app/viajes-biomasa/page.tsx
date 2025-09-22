'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface ViajesBiomasaFormData {
  nombreQuienEntrega: string;
  tipoBiomasa: string;
  tipoBiomasaOtro: string;
  pesoEntregadoMasaFresca: string;
  tipoCombustible: string;
  tipoCombustibleOtro: string;
  tipoVehiculo: string;
  tipoVehiculoOtro: string;
  // Nuevos campos para rutas
  rutaSeleccionada: string;
  nuevaRutaNombre: string;
  nuevaRutaDistancia: string;
  nuevaRutaCoordenadas: File | null;
  nuevaRutaImagen: File | null;
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
    tipoBiomasa: '',
    tipoBiomasaOtro: '',
    pesoEntregadoMasaFresca: '',
    tipoCombustible: '',
    tipoCombustibleOtro: '',
    tipoVehiculo: '',
    tipoVehiculoOtro: '',
    // Nuevos campos para rutas
    rutaSeleccionada: '',
    nuevaRutaNombre: '',
    nuevaRutaDistancia: '',
    nuevaRutaCoordenadas: null as File | null,
    nuevaRutaImagen: null as File | null
  });

  const [showTipoBiomasaOtro, setShowTipoBiomasaOtro] = useState(false);
  const [showTipoCombustibleOtro, setShowTipoCombustibleOtro] = useState(false);
  const [showTipoVehiculoOtro, setShowTipoVehiculoOtro] = useState(false);

  // Estados para rutas de Airtable
  const [rutasAirtable, setRutasAirtable] = useState<any[]>([]);
  const [rutaSeleccionada, setRutaSeleccionada] = useState('');
  const [imagenRutaUrl, setImagenRutaUrl] = useState('');
  const [cargandoRutas, setCargandoRutas] = useState(false);
  const [showNuevaRuta, setShowNuevaRuta] = useState(false);

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

  // Cargar rutas de Airtable al montar el componente
  useEffect(() => {
    const cargarRutasAirtable = async () => {
      if (!isAuthenticated) return;

      setCargandoRutas(true);
      try {
        const response = await fetch('/api/rutas-biomasa/list');
        const data = await response.json();

        if (data.success) {
          setRutasAirtable(data.records);
        } else {
          console.error('Error cargando rutas Airtable:', data.error);
        }
      } catch (error) {
        console.error('Error al cargar rutas de Airtable:', error);
      } finally {
        setCargandoRutas(false);
      }
    };

    cargarRutasAirtable();
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

  // Función para manejar cambio de ruta Airtable
  const handleRutaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    setRutaSeleccionada(selectedValue);
    setFormData(prev => ({ ...prev, rutaSeleccionada: selectedValue }));

    if (selectedValue === 'otra') {
      setShowNuevaRuta(true);
      setImagenRutaUrl('');
    } else if (selectedValue) {
      setShowNuevaRuta(false);
      // Buscar la ruta seleccionada y mostrar su imagen
      const rutaSeleccionada = rutasAirtable.find(ruta => ruta.id === selectedValue);
      if (rutaSeleccionada && rutaSeleccionada.fields['Imagen Ruta'] && rutaSeleccionada.fields['Imagen Ruta'].length > 0) {
        setImagenRutaUrl(rutaSeleccionada.fields['Imagen Ruta'][0].url);
      } else {
        setImagenRutaUrl('');
      }
    } else {
      setShowNuevaRuta(false);
      setImagenRutaUrl('');
    }
  };

  const validateForm = () => {
    if (!formData.nombreQuienEntrega.trim()) {
      setMensaje('Por favor ingrese el nombre de quien entrega la biomasa');
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

    // Validaciones para nueva ruta
    if (showNuevaRuta) {
      if (!formData.nuevaRutaNombre.trim()) {
        setMensaje('Por favor ingrese el nombre de la nueva ruta');
        return false;
      }
      if (!formData.nuevaRutaDistancia || parseFloat(formData.nuevaRutaDistancia) <= 0) {
        setMensaje('Por favor ingrese la distancia de la nueva ruta');
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

      if (!turnoPirolisisId) {
        setMensaje('❌ Debe tener un turno activo para registrar viajes');
        return;
      }

      const formDataToSend = new FormData();
      formDataToSend.append('Nombre Quien Entrega', formData.nombreQuienEntrega.trim());
      formDataToSend.append('Tipo Biomasa', showTipoBiomasaOtro ? formData.tipoBiomasaOtro.trim() : formData.tipoBiomasa.trim());
      formDataToSend.append('Peso entregado de masa fresca', formData.pesoEntregadoMasaFresca);
      formDataToSend.append('Tipo Combustible', showTipoCombustibleOtro ? formData.tipoCombustibleOtro.trim() : formData.tipoCombustible.trim());
      formDataToSend.append('Tipo Vehículo', showTipoVehiculoOtro ? formData.tipoVehiculoOtro.trim() : formData.tipoVehiculo.trim());
      formDataToSend.append('Realiza Registro', realizaRegistro);
      if (turnoPirolisisId) {
        formDataToSend.append('ID_Turno', JSON.stringify([turnoPirolisisId]));
      }
      // Información de ruta
      if (formData.rutaSeleccionada && formData.rutaSeleccionada !== 'otra') {
        formDataToSend.append('ID_Ruta', formData.rutaSeleccionada);
      }
      // Información de nueva ruta
      if (showNuevaRuta) {
        formDataToSend.append('Nueva Ruta Nombre', formData.nuevaRutaNombre.trim());
        formDataToSend.append('Nueva Ruta Distancia Metros', formData.nuevaRutaDistancia);
        if (formData.nuevaRutaCoordenadas) {
          formDataToSend.append('nuevaRutaCoordenadas', formData.nuevaRutaCoordenadas);
        }
        if (formData.nuevaRutaImagen) {
          formDataToSend.append('nuevaRutaImagen', formData.nuevaRutaImagen);
        }
      }

      const response = await fetch('/api/viajes-biomasa/create', {
        method: 'POST',
        body: formDataToSend,
      });

      const result = await response.json();

      if (response.ok) {
        setMensaje('✅ Viaje de biomasa registrado exitosamente');
        setFormData({
          nombreQuienEntrega: '',
          tipoBiomasa: '',
          tipoBiomasaOtro: '',
          pesoEntregadoMasaFresca: '',
          tipoCombustible: '',
          tipoCombustibleOtro: '',
          tipoVehiculo: '',
          tipoVehiculoOtro: '',
          rutaSeleccionada: '',
          nuevaRutaNombre: '',
          nuevaRutaDistancia: '',
          nuevaRutaCoordenadas: null,
          nuevaRutaImagen: null
        });
        setRutaSeleccionada('');
        setImagenRutaUrl('');
        setShowNuevaRuta(false);
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
                      {rutasAirtable.map((ruta: any) => (
                        <option key={ruta.id} value={ruta.id}>
                          {ruta.fields.Ruta}
                        </option>
                      ))}
                      <option value="otra">Otra ruta</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    {cargandoRutas && (
                      <div className="text-white">Cargando rutas...</div>
                    )}
                  </div>
                </div>
                {imagenRutaUrl && (
                  <div className="mt-6">
                    <div className="bg-white/20 backdrop-blur-sm p-4 rounded-lg border border-white/30">
                      <h3 className="text-lg font-medium text-white mb-3 drop-shadow">
                        Vista Previa de la Ruta
                      </h3>
                      <div className="flex justify-center">
                        <img
                          src={imagenRutaUrl}
                          alt={`Ruta seleccionada`}
                          className="max-w-full h-auto max-h-96 rounded-lg shadow-lg border border-white/20"
                          onError={() => {
                            console.error('Error cargando imagen');
                            setImagenRutaUrl('');
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Campos para nueva ruta */}
              {showNuevaRuta && (
                <div className="mt-6 bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                  <h3 className="text-lg font-medium text-white mb-4 drop-shadow">
                    📍 Registrar Nueva Ruta
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="nuevaRutaNombre" className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Nombre de la Ruta *
                      </label>
                      <input
                        type="text"
                        id="nuevaRutaNombre"
                        name="nuevaRutaNombre"
                        value={formData.nuevaRutaNombre}
                        onChange={handleInputChange}
                        required
                        placeholder="Ej: Ruta de PKO a Planta de Pirolisis"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                      />
                    </div>
                    <div>
                      <label htmlFor="nuevaRutaDistancia" className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Distancia en Metros *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        id="nuevaRutaDistancia"
                        name="nuevaRutaDistancia"
                        value={formData.nuevaRutaDistancia}
                        onChange={handleInputChange}
                        required
                        min="0"
                        placeholder="Ej: 247.86"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                      />
                    </div>
                    <div>
                      <label htmlFor="nuevaRutaCoordenadas" className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Archivo de Coordenadas (KML/GPX)
                      </label>
                      <input
                        type="file"
                        id="nuevaRutaCoordenadas"
                        name="nuevaRutaCoordenadas"
                        accept=".kml,.gpx"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setFormData(prev => ({ ...prev, nuevaRutaCoordenadas: file }));
                        }}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                    <div>
                      <label htmlFor="nuevaRutaImagen" className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Imagen de la Ruta (PNG/JPG)
                      </label>
                      <input
                        type="file"
                        id="nuevaRutaImagen"
                        name="nuevaRutaImagen"
                        accept=".png,.jpg,.jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setFormData(prev => ({ ...prev, nuevaRutaImagen: file }));
                        }}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                    </div>
                  </div>
                </div>
              )}

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
                      <option value="Tractor">Tractor</option>
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
                      <option value="Cascarilla de Palma">Cascarilla de Palma</option>
                      <option value="Tusa de Palma">Tusa de Palma</option>
                      <option value="Cascarilla de Arroz">Cascarilla de Arroz</option>
                      <option value="Semilla de Mango">Semilla de Mango</option>
                      <option value="Cáscara de Café">Cáscara de Café</option>
                      <option value="Bagazo de Caña">Bagazo de Caña</option>
                      <option value="Cascarilla de Coco">Cascarilla de Coco</option>
                      <option value="Paja de Arroz">Paja de Arroz</option>
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

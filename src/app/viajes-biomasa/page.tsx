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
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
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
    nombreQuienEntrega: 'Miller Triana',
    tipoBiomasa: 'Cascarilla de Palma',
    tipoBiomasaOtro: '',
    pesoEntregadoMasaFresca: '600',
    tipoCombustible: 'Diesel',
    tipoCombustibleOtro: '',
    tipoVehiculo: 'Cargador Frontal',
    tipoVehiculoOtro: '',
    // Nuevos campos para rutas
    rutaSeleccionada: '',  // Se selecciona dinámicamente
    nuevaRutaNombre: '',
    nuevaRutaDistancia: '',
    nuevaRutaCoordenadas: null as File | null,
    nuevaRutaImagen: null as File | null
  });

  const [showTipoBiomasaOtro, setShowTipoBiomasaOtro] = useState(false);
  const [showTipoCombustibleOtro, setShowTipoCombustibleOtro] = useState(false);
  const [showTipoVehiculoOtro, setShowTipoVehiculoOtro] = useState(false);

  // Estados para monitoreo de viajes biomasa
  const [viajesSinMonitoreo, setViajesSinMonitoreo] = useState<any[]>([]);
  const [contadorViajes, setContadorViajes] = useState(0);
  const [showMonitoreoHumedad, setShowMonitoreoHumedad] = useState(false);
  const [porcentajeHumedad, setPorcentajeHumedad] = useState('');
  const [isSubmittingMonitoreo, setIsSubmittingMonitoreo] = useState(false);
  const [laboratorioSeleccionado, setLaboratorioSeleccionado] = useState('');
  
  // Estados para registros pendientes
  const [registrosPendientes, setRegistrosPendientes] = useState<any[]>([]);
  const [showPendientes, setShowPendientes] = useState(false);

  // Estados para laboratorios
  const [laboratorios, setLaboratorios] = useState<any[]>([]);
  const [loadingLaboratorios, setLoadingLaboratorios] = useState(false);
  const [nuevoLaboratorioForm, setNuevoLaboratorioForm] = useState({
    nombreLaboratorio: '',
    tipoLaboratorio: '',
    responsable: '',
    telefono: '',
    correoElectronico: '',
    direccion: '',
    ciudad: '',
    pais: '',
    certificaciones: '',
    acreditaciones: '',
    metodosAnaliticos: '',
    fechaVigenciaCertificaciones: '',
    observaciones: ''
  });

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
          
          // Debug: ver las rutas cargadas
          console.log('🗺️ Rutas cargadas desde Airtable:', data.records.map((r: any) => r.fields['Ruta']));
          
          // Buscar y seleccionar automáticamente "Ruta Principal PKO - Pirolisis"
          const rutaPrincipal = data.records.find((ruta: any) => 
            ruta.fields['Ruta'] === 'Ruta Principal PKO - Pirolisis'
          );
          
          console.log('🎯 Ruta principal encontrada:', rutaPrincipal ? rutaPrincipal.fields['Ruta'] : 'No encontrada');
          
          if (rutaPrincipal) {
            setRutaSeleccionada(rutaPrincipal.id);
            setFormData(prev => ({ ...prev, rutaSeleccionada: rutaPrincipal.id }));
            
            // Cargar la imagen de la ruta si existe
            if (rutaPrincipal.fields['Imagen Ruta'] && rutaPrincipal.fields['Imagen Ruta'].length > 0) {
              setImagenRutaUrl(rutaPrincipal.fields['Imagen Ruta'][0].url);
            }
          }
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

  // Cargar laboratorios al montar el componente
  useEffect(() => {
    const cargarLaboratorios = async () => {
      if (!isAuthenticated) return;

      setLoadingLaboratorios(true);
      try {
        const response = await fetch('/api/laboratorios/list');
        if (!response.ok) {
          throw new Error('Error al cargar laboratorios');
        }
        const data = await response.json();
        setLaboratorios(data.laboratorios || []);
      } catch (error) {
        console.error('Error loading laboratorios:', error);
        setLaboratorios([]);
      } finally {
        setLoadingLaboratorios(false);
      }
    };

    cargarLaboratorios();
  }, [isAuthenticated]);

  // Cargar viajes sin monitoreo al montar el componente
  useEffect(() => {
    const cargarViajesSinMonitoreo = async () => {
      if (!isAuthenticated) return;

      try {
        const response = await fetch('/api/viajes-biomasa/unmonitored');
        const data = await response.json();

        if (data.success) {
          setViajesSinMonitoreo(data.records);
          setContadorViajes(data.count);
          setShowMonitoreoHumedad(data.count >= 10);
        } else {
          console.error('Error cargando viajes sin monitoreo:', data.error);
        }
      } catch (error) {
        console.error('Error al cargar viajes sin monitoreo:', error);
      }
    };

    cargarViajesSinMonitoreo();
  }, [isAuthenticated]);

  // Cargar registros pendientes de humedad
  useEffect(() => {
    const cargarRegistrosPendientes = async () => {
      if (!isAuthenticated) return;

      try {
        const response = await fetch('/api/monitoreo-viajes-biomasa/pendientes');
        const data = await response.json();

        if (data.success) {
          setRegistrosPendientes(data.records || []);
        } else {
          console.warn('⚠️ No se pudieron cargar registros pendientes:', data.error);
          setRegistrosPendientes([]); // Inicializar como array vacío
        }
      } catch (error) {
        console.error('Error al cargar registros pendientes:', error);
        setRegistrosPendientes([]); // Inicializar como array vacío en caso de error
      }
    };

    cargarRegistrosPendientes();
  }, [isAuthenticated]);

  // Función para crear monitoreo de viajes biomasa
  const crearMonitoreoViajes = async () => {
    if (viajesSinMonitoreo.length < 10 || !porcentajeHumedad.trim()) {
      alert('❌ Debe ingresar el porcentaje de humedad');
      return;
    }

    if (!laboratorioSeleccionado) {
      alert('❌ Debe seleccionar un laboratorio');
      return;
    }

    setIsSubmittingMonitoreo(true);

    try {
      // Validar y crear laboratorio si es nuevo
      let laboratorioId = laboratorioSeleccionado;

      if (laboratorioSeleccionado === 'nuevo-laboratorio') {
        if (!nuevoLaboratorioForm.nombreLaboratorio.trim()) {
          alert('❌ Debe ingresar el nombre del nuevo laboratorio');
          setIsSubmittingMonitoreo(false);
          return;
        }

        // Crear el nuevo laboratorio
        const laboratorioData = {
          records: [{
            fields: {
              'Nombre Laboratorio': nuevoLaboratorioForm.nombreLaboratorio.trim(),
              'Tipo Laboratorio': nuevoLaboratorioForm.tipoLaboratorio.trim(),
              'Responsable': nuevoLaboratorioForm.responsable.trim(),
              'Teléfono': nuevoLaboratorioForm.telefono.trim(),
              'Correo Electrónico': nuevoLaboratorioForm.correoElectronico.trim(),
              'Dirección': nuevoLaboratorioForm.direccion.trim(),
              'Ciudad': nuevoLaboratorioForm.ciudad.trim(),
              'País': nuevoLaboratorioForm.pais.trim(),
              'Certificaciones': nuevoLaboratorioForm.certificaciones.trim(),
              'Acreditaciones': nuevoLaboratorioForm.acreditaciones.trim(),
              'Métodos Analíticos': nuevoLaboratorioForm.metodosAnaliticos.trim(),
              'Fecha Vigencia Certificaciones': nuevoLaboratorioForm.fechaVigenciaCertificaciones.trim(),
              'Observaciones': nuevoLaboratorioForm.observaciones.trim()
            }
          }]
        };

        const createLabResponse = await fetch('/api/laboratorios/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(laboratorioData)
        });

        if (!createLabResponse.ok) {
          throw new Error('Error al crear el laboratorio');
        }

        const createLabResult = await createLabResponse.json();
        laboratorioId = createLabResult.records[0].id;

        // Recargar la lista de laboratorios
        const labResponse = await fetch('/api/laboratorios/list');
        if (labResponse.ok) {
          const labData = await labResponse.json();
          setLaboratorios(labData.laboratorios || []);
        }
      }

      // Obtener realizaRegistro del usuario actual
      const userSession = localStorage.getItem('userSession');
      let realizaRegistro = 'Usuario desconocido';

      if (userSession) {
        try {
          const sessionData = JSON.parse(userSession);
          realizaRegistro = sessionData.user?.Nombre || 'Usuario desconocido';
        } catch (error) {
          console.error('Error parsing user session:', error);
        }
      }

      // Tomar los primeros 10 viajes sin monitoreo
      const viajesParaMonitoreo = viajesSinMonitoreo.slice(0, 10).map(viaje => viaje.id);

      const monitoreoData = {
        viajesBiomasa: viajesParaMonitoreo,
        porcentajeHumedad: porcentajeHumedad.trim(),
        realizaRegistro: realizaRegistro,
        laboratorioId: laboratorioId // Ahora siempre requerido
      };

      const response = await fetch('/api/monitoreo-viajes-biomasa/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(monitoreoData)
      });

      if (response.ok) {
        alert('✅ Monitoreo de viajes biomasa registrado exitosamente');
        setMensaje('✅ Monitoreo de viajes biomasa registrado exitosamente');
        setPorcentajeHumedad('');
        setLaboratorioSeleccionado('');
        setShowMonitoreoHumedad(false);
        // Limpiar formulario de laboratorio
        setNuevoLaboratorioForm({
          nombreLaboratorio: '',
          tipoLaboratorio: '',
          responsable: '',
          telefono: '',
          correoElectronico: '',
          direccion: '',
          ciudad: '',
          pais: '',
          certificaciones: '',
          acreditaciones: '',
          metodosAnaliticos: '',
          fechaVigenciaCertificaciones: '',
          observaciones: ''
        });
        // Recargar datos
        await recargarViajesSinMonitoreo();
      } else {
        const errorData = await response.json();
        setMensaje(`❌ Error en monitoreo: ${errorData.message || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error creando monitoreo:', error);
      setMensaje('❌ Error al crear monitoreo de viajes biomasa');
    } finally {
      setIsSubmittingMonitoreo(false);
    }
  };

  // Función para auto-crear monitoreo con 0% cuando se pasa de 10 viajes
  const autoCrearMonitoreoConCero = async () => {
    try {
      console.log('🔄 Auto-creando monitoreo con 0% para los primeros 10 viajes...');

      // IMPORTANTE: Usar la lista ACTUAL del estado que tiene los viajes correctos
      // ANTES de que se recargue con el viaje #11
      if (viajesSinMonitoreo.length < 10) {
        console.error('❌ No hay suficientes viajes en el estado actual');
        return;
      }

      // Obtener realizaRegistro del usuario actual
      const userSession = localStorage.getItem('userSession');
      let realizaRegistro = 'Usuario desconocido';

      if (userSession) {
        try {
          const sessionData = JSON.parse(userSession);
          realizaRegistro = sessionData.user?.Nombre || 'Usuario desconocido';
        } catch (error) {
          console.error('Error parsing user session:', error);
        }
      }

      // Tomar los primeros 10 viajes del estado ACTUAL (antes de recargar)
      // Estos son los viajes correctos, sin incluir el viaje #11 recién creado
      console.log('📋 Viajes sin monitoreo en estado:', viajesSinMonitoreo.length);
      console.log('📋 Primeros IDs:', viajesSinMonitoreo.slice(0, 10).map((v: any) => v.id));
      
      const viajesParaMonitoreo = viajesSinMonitoreo.slice(0, 10).map((viaje: any) => viaje.id);

      const monitoreoData = {
        viajesBiomasa: viajesParaMonitoreo,
        porcentajeHumedad: '0', // Marcado como pendiente con 0%
        realizaRegistro: realizaRegistro,
        laboratorioId: null // Sin laboratorio asignado aún
      };

      const monitoreoResponse = await fetch('/api/monitoreo-viajes-biomasa/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(monitoreoData)
      });

      if (monitoreoResponse.ok) {
        console.log('✅ Monitoreo automático creado con 0% - Pendiente de completar');
        setMensaje('⚠️ Viaje registrado. Los primeros 10 viajes están pendientes de registrar humedad.');
        // Recargar datos
        await recargarViajesSinMonitoreo();
        await recargarRegistrosPendientes();
      } else {
        const errorData = await monitoreoResponse.json();
        console.error('Error creando monitoreo automático:', errorData);
      }
    } catch (error) {
      console.error('Error en autoCrearMonitoreoConCero:', error);
    }
  };

  // Función para recargar viajes sin monitoreo
  const recargarViajesSinMonitoreo = async () => {
    try {
      const response = await fetch('/api/viajes-biomasa/unmonitored');
      const data = await response.json();

      if (data.success) {
        setViajesSinMonitoreo(data.records);
        setContadorViajes(data.count);
        setShowMonitoreoHumedad(data.count >= 10);
      } else {
        console.error('Error recargando viajes sin monitoreo:', data.error);
      }
    } catch (error) {
      console.error('Error al recargar viajes sin monitoreo:', error);
    }
  };

  // Función para recargar registros pendientes
  const recargarRegistrosPendientes = async () => {
    try {
      const response = await fetch('/api/monitoreo-viajes-biomasa/pendientes');
      const data = await response.json();

      if (data.success) {
        setRegistrosPendientes(data.records || []);
      } else {
        console.warn('⚠️ No se pudieron recargar registros pendientes:', data.error);
        setRegistrosPendientes([]); // Inicializar como array vacío
      }
    } catch (error) {
      console.error('Error al recargar registros pendientes:', error);
      setRegistrosPendientes([]); // Inicializar como array vacío en caso de error
    }
  };

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
        
        // Buscar la ruta principal para mantenerla seleccionada
        const rutaPrincipal = rutasAirtable.find((ruta: any) => 
          ruta.fields['Ruta']?.includes('Ruta principal de PKO a Pirolisis') ||
          ruta.fields['Ruta']?.includes('PKO a Pirolisis') ||
          ruta.fields['Ruta']?.toLowerCase().includes('pko')
        );
        
        // Limpiar formulario pero mantener valores predefinidos
        setFormData({
          nombreQuienEntrega: 'Miller Triana',
          tipoBiomasa: 'Cascarilla de Palma',
          tipoBiomasaOtro: '',
          pesoEntregadoMasaFresca: '600',
          tipoCombustible: 'Diesel',
          tipoCombustibleOtro: '',
          tipoVehiculo: 'Cargador Frontal',
          tipoVehiculoOtro: '',
          rutaSeleccionada: rutaPrincipal?.id || '',
          nuevaRutaNombre: '',
          nuevaRutaDistancia: '',
          nuevaRutaCoordenadas: null,
          nuevaRutaImagen: null
        });
        setRutaSeleccionada(rutaPrincipal?.id || '');
        
        // Mantener la imagen de la ruta principal si existe
        if (rutaPrincipal && rutaPrincipal.fields['Imagen Ruta'] && rutaPrincipal.fields['Imagen Ruta'].length > 0) {
          setImagenRutaUrl(rutaPrincipal.fields['Imagen Ruta'][0].url);
        } else {
          setImagenRutaUrl('');
        }
        setShowNuevaRuta(false);

        // LÓGICA AUTO-CREAR MONITOREO CON 0% SI SE PASA DE 10 VIAJES
        // IMPORTANTE: Llamar ANTES de recargar para usar el estado actual
        const nuevoContador = contadorViajes + 1;
        
        if (nuevoContador === 11) {
          // El usuario registró el viaje 11 sin completar la humedad de los primeros 10
          // Auto-crear registro de monitoreo con 0% usando los 10 viajes actuales
          console.log('⚠️ Se registró viaje #11 - Auto-creando monitoreo para los primeros 10 viajes');
          await autoCrearMonitoreoConCero();
        } else if (nuevoContador === 10 && porcentajeHumedad.trim()) {
          // El usuario completó exactamente 10 viajes y tiene humedad ingresada
          await crearMonitoreoViajes();
        } else {
          // En cualquier otro caso, solo recargar los datos
          await recargarViajesSinMonitoreo();
        }
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

            {/* Dashboard de Monitoreo de Viajes Biomasa */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg flex items-center">
                📊 Monitoreo de Muestras de Biomasa
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white drop-shadow">{contadorViajes}</div>
                    <div className="text-sm text-white/80 drop-shadow">Viajes Registrados</div>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white drop-shadow">{10 - contadorViajes}</div>
                    <div className="text-sm text-white/80 drop-shadow">Viajes Restantes</div>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20">
                  <div className="text-center">
                    <div className={`text-2xl font-bold drop-shadow ${contadorViajes >= 10 ? 'text-green-300' : 'text-yellow-300'}`}>
                      {contadorViajes >= 10 ? 'Completo' : 'En Progreso'}
                    </div>
                    <div className="text-sm text-white/80 drop-shadow">Estado</div>
                  </div>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="w-full bg-white/20 rounded-full h-4 mb-4">
                <div
                  className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] h-4 rounded-full transition-all duration-500"
                  style={{width: `${Math.min((contadorViajes / 10) * 100, 100)}%`}}
                ></div>
              </div>
              <div className="text-center text-sm text-white/70 mb-4 drop-shadow">
                {Math.min(contadorViajes, 10)} / 10 viajes completados ({Math.min((contadorViajes / 10) * 100, 100).toFixed(1)}%)
              </div>

              {/* Campo de porcentaje de humedad cuando llegue a 10 viajes */}
              {showMonitoreoHumedad && (
                <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/20">
                  <h3 className="text-lg font-medium text-white mb-3 drop-shadow">
                    💧 Registro de Porcentaje de Humedad
                  </h3>
                  <p className="text-sm text-white/70 mb-4 drop-shadow">
                    Has alcanzado 10 viajes de biomasa. Registra el porcentaje de humedad de estas muestras.
                  </p>
                  
                  <div className="space-y-4">
                    {/* Porcentaje de Humedad */}
                    <div>
                      <label htmlFor="porcentajeHumedad" className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Porcentaje de Humedad (%) *
                      </label>
                      <input
                        type="number"
                        id="porcentajeHumedad"
                        value={porcentajeHumedad}
                        onChange={(e) => setPorcentajeHumedad(e.target.value)}
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="Ej: 45.50"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                      />
                    </div>

                    {/* Selector de Laboratorio */}
                    <div>
                      <label htmlFor="laboratorioSeleccionado" className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Laboratorio *
                      </label>
                      <select
                        id="laboratorioSeleccionado"
                        value={laboratorioSeleccionado}
                        onChange={(e) => setLaboratorioSeleccionado(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 font-medium"
                        disabled={loadingLaboratorios}
                        required
                      >
                        <option value="">
                          {loadingLaboratorios ? 'Cargando laboratorios...' : 'Seleccionar laboratorio'}
                        </option>
                        {laboratorios.map((lab) => (
                          <option key={lab.id} value={lab.id}>
                            {lab.nombre}
                          </option>
                        ))}
                        <option value="nuevo-laboratorio" className="font-semibold text-green-600">
                          ➕ Registrar nuevo laboratorio
                        </option>
                      </select>
                    </div>

                    {/* Formulario de Nuevo Laboratorio */}
                    {laboratorioSeleccionado === 'nuevo-laboratorio' && (
                      <div className="mt-4 p-4 bg-white/10 rounded-lg border border-white/20">
                        <h4 className="text-md font-semibold text-white mb-3 drop-shadow">📋 Datos del Nuevo Laboratorio</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-white mb-1 drop-shadow">
                              Nombre Laboratorio *
                            </label>
                            <input
                              type="text"
                              value={nuevoLaboratorioForm.nombreLaboratorio}
                              onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, nombreLaboratorio: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm"
                              placeholder="Nombre del laboratorio"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-white mb-1 drop-shadow">
                              Tipo Laboratorio
                            </label>
                            <input
                              type="text"
                              value={nuevoLaboratorioForm.tipoLaboratorio}
                              onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, tipoLaboratorio: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm"
                              placeholder="Tipo de laboratorio"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-white mb-1 drop-shadow">
                              Responsable
                            </label>
                            <input
                              type="text"
                              value={nuevoLaboratorioForm.responsable}
                              onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, responsable: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm"
                              placeholder="Nombre del responsable"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-white mb-1 drop-shadow">
                              Teléfono
                            </label>
                            <input
                              type="tel"
                              value={nuevoLaboratorioForm.telefono}
                              onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, telefono: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-sm"
                              placeholder="Teléfono"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Botón de Registro */}
                    <button
                      type="button"
                      onClick={crearMonitoreoViajes}
                      disabled={isSubmittingMonitoreo || !porcentajeHumedad.trim() || !laboratorioSeleccionado}
                      className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-semibold shadow-lg"
                    >
                      {isSubmittingMonitoreo ? 'Registrando...' : '📝 Registrar Monitoreo'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sección de Registros Pendientes */}
            {registrosPendientes.length > 0 && (
              <div className="bg-yellow-500/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-yellow-400/50 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-white drop-shadow-lg flex items-center">
                    ⚠️ Registros Pendientes de Humedad ({registrosPendientes.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowPendientes(!showPendientes)}
                    className="px-4 py-2 bg-yellow-600/80 text-white rounded-lg hover:bg-yellow-700/80 transition-all font-medium shadow-lg"
                  >
                    {showPendientes ? '▲ Ocultar' : '▼ Ver Pendientes'}
                  </button>
                </div>
                
                <p className="text-sm text-white/80 mb-4 drop-shadow">
                  Hay {registrosPendientes.length} {registrosPendientes.length === 1 ? 'registro' : 'registros'} de monitoreo con humedad pendiente (0%). Haz clic para completar la información.
                </p>

                {showPendientes && (
                  <div className="space-y-4">
                    {registrosPendientes.map((registro: any, index: number) => (
                      <RegistroPendienteCard
                        key={registro.id}
                        registro={registro}
                        index={index}
                        laboratorios={laboratorios}
                        onActualizar={async () => {
                          await recargarRegistrosPendientes();
                          await recargarViajesSinMonitoreo();
                          setMensaje('✅ Registro de humedad actualizado exitosamente');
                        }}
                      />
                    ))}
                  </div>
                )}
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
                      <option value="Cargador Frontal">Cargador Frontal</option>
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

// Componente para card de registro pendiente
function RegistroPendienteCard({ 
  registro, 
  index, 
  laboratorios, 
  onActualizar 
}: { 
  registro: any; 
  index: number; 
  laboratorios: any[]; 
  onActualizar: () => Promise<void>;
}) {
  const [porcentajeHumedad, setPorcentajeHumedad] = useState('');
  const [laboratorioSeleccionado, setLaboratorioSeleccionado] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDetalles, setShowDetalles] = useState(false);

  const handleActualizar = async () => {
    if (!porcentajeHumedad.trim() || parseFloat(porcentajeHumedad) <= 0) {
      alert('❌ Debe ingresar un porcentaje de humedad válido mayor a 0');
      return;
    }

    if (!laboratorioSeleccionado) {
      alert('❌ Debe seleccionar un laboratorio');
      return;
    }

    setIsUpdating(true);

    try {
      const response = await fetch('/api/monitoreo-viajes-biomasa/actualizar', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registroId: registro.id,
          porcentajeHumedad: porcentajeHumedad.trim(),
          laboratorioId: laboratorioSeleccionado
        })
      });

      if (response.ok) {
        alert('✅ Registro actualizado exitosamente');
        await onActualizar();
      } else {
        const errorData = await response.json();
        alert(`❌ Error: ${errorData.message || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error actualizando registro:', error);
      alert('❌ Error de conexión al actualizar registro');
    } finally {
      setIsUpdating(false);
    }
  };

  const fechaCreacion = registro.fields['Fecha Creacion Registro'] 
    ? new Date(registro.fields['Fecha Creacion Registro']).toLocaleString('es-CO')
    : 'Fecha no disponible';

  const numViajes = registro.fields['Viajes Biomasa']?.length || 0;

  return (
    <div className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-yellow-400/30">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-lg font-semibold text-white drop-shadow">
            Registro #{index + 1}
          </h4>
          <p className="text-sm text-white/70 drop-shadow">
            Fecha: {fechaCreacion}
          </p>
          <p className="text-sm text-white/70 drop-shadow">
            Viajes asociados: {numViajes}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDetalles(!showDetalles)}
          className="px-3 py-1 bg-yellow-600/60 text-white rounded text-sm hover:bg-yellow-700/60 transition-all"
        >
          {showDetalles ? '▲ Ocultar' : '▼ Completar'}
        </button>
      </div>

      {showDetalles && (
        <div className="space-y-3 mt-4 pt-4 border-t border-white/20">
          <div>
            <label className="block text-sm font-medium text-white mb-1 drop-shadow">
              Porcentaje de Humedad (%) *
            </label>
            <input
              type="number"
              value={porcentajeHumedad}
              onChange={(e) => setPorcentajeHumedad(e.target.value)}
              step="0.01"
              min="0.01"
              max="100"
              placeholder="Ej: 12.5"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1 drop-shadow">
              Laboratorio *
            </label>
            <select
              value={laboratorioSeleccionado}
              onChange={(e) => setLaboratorioSeleccionado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
            >
              <option value="">Seleccione un laboratorio</option>
              {laboratorios.map((lab: any) => (
                <option key={lab.id} value={lab.id}>
                  {lab.fields['Nombre Laboratorio'] || 'Sin nombre'}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleActualizar}
            disabled={isUpdating || !porcentajeHumedad.trim() || !laboratorioSeleccionado}
            className="w-full px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg"
          >
            {isUpdating ? 'Actualizando...' : '✅ Guardar Humedad'}
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useBaches } from '@/lib/useBaches';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';

export default function SistemaBaches() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <SistemaBachesContent />
    </TurnoProtection>
  );
}

function SistemaBachesContent() {
  const { data, loading, error, getLatestBache, calculateProgress, getBacheStatus, getBacheId, getDateValue, getTotalBiochar, getBiocharVendido, getTotalBiomasaHumeda, getBiomasaSecaActual, getMasaSecaTotal, hasPesoHumedoActualizado, hasMonitoreoRegistrado, hasComprobanteSubido, isPesoCompletamenteActualizado, getNumericValue, refetch } = useBaches();

  // Función para obtener el usuario de la sesión
  const getUserFromSession = () => {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      const sessionData = JSON.parse(userSession);
      return sessionData.user?.Nombre || sessionData.user?.name || 'Usuario';
    }
    return 'Usuario';
  };

  // Función para obtener el laboratorio seleccionado
  const getSelectedLaboratorio = () => {
    if (!monitoreoForm.laboratorio || monitoreoForm.laboratorio === 'nuevo-laboratorio') {
      return null;
    }
    return laboratorios.find(lab => lab.id === monitoreoForm.laboratorio);
  };

  // State for search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [fechaFilter, setFechaFilter] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('Todos');

  // State for monitoreo modal
  const [showMonitoreoModal, setShowMonitoreoModal] = useState(false);
  const [selectedBache, setSelectedBache] = useState<any>(null);
  const [monitoreoForm, setMonitoreoForm] = useState({
    idBigBag: '',
    humedadMC: '',
    masaSecaDM: '',
    laboratorio: ''
  });
  const [isSubmittingMonitoreo, setIsSubmittingMonitoreo] = useState(false);
  const [updatingBacheId, setUpdatingBacheId] = useState<string | null>(null);

  // State for detalles modal
  const [showDetallesModal, setShowDetallesModal] = useState(false);
  const [selectedBacheDetalles, setSelectedBacheDetalles] = useState<any>(null);

  // State for pasar a bodega modal
  const [showPasarBodegaModal, setShowPasarBodegaModal] = useState(false);
  const [selectedBacheBodega, setSelectedBacheBodega] = useState<any>(null);
  const [isSubmittingBodega, setIsSubmittingBodega] = useState(false);

  // State for multiple selection in Completos Planta
  const [selectedBachesPlanta, setSelectedBachesPlanta] = useState<Set<string>>(new Set());
  const [isSubmittingMultipleBodega, setIsSubmittingMultipleBodega] = useState(false);

  // State for transport form modal
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [transportForm, setTransportForm] = useState({
    tipoVehiculo: 'Dump truck',
    referenciaVehiculo: 'Kodiak',
    distanciaPlantaBodega: '6',
    tipoCombustible: 'Diesel',
    funcionVehiculo: 'Transport of Biochar slugs to storage',
    distanciaMetros: 500,
    dieselConsumidoTransporte: 0.3,
    esVehiculoNuevo: false
  });
  const [isSubmittingTransport, setIsSubmittingTransport] = useState(false);

  // State for actualizar peso modal
  const [showActualizarPesoModal, setShowActualizarPesoModal] = useState(false);
  const [selectedBachePeso, setSelectedBachePeso] = useState<any>(null);
  const [pesoHumedo, setPesoHumedo] = useState('');
  const [comprobantePeso, setComprobantePeso] = useState<File | null>(null);
  const [isSubmittingPeso, setIsSubmittingPeso] = useState(false);

  // State for laboratorios
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

  // Filtered baches based on search and filters
  const filteredBaches = useMemo(() => {
    if (!data?.records) return [];

    return data.records.filter(bache => {
      const matchesSearch = searchTerm === '' ||
        getBacheId(bache).toLowerCase().includes(searchTerm.toLowerCase()) ||
        getBacheStatus(bache).toLowerCase().includes(searchTerm.toLowerCase());

      const matchesEstado = estadoFilter === '' || getBacheStatus(bache) === estadoFilter;

      const matchesFecha = fechaFilter === '' || getDateValue(bache)?.includes(fechaFilter);

      const status = getBacheStatus(bache);
      const matchesCategoria = categoriaFilter === 'Todos' ||
        (categoriaFilter === 'En Proceso' && status === 'Bache en proceso') ||
        (categoriaFilter === 'Completos Planta' && status === 'Bache Completo Planta') ||
        (categoriaFilter === 'Completos Bodega' && status === 'Bache Completo Bodega') ||
        (categoriaFilter === 'Agotados' && status === 'Bache Agotado') ||
        (categoriaFilter === 'Incompletos' && status === 'Bache Incompleto');

      return matchesSearch && matchesEstado && matchesFecha && matchesCategoria;
    });
  }, [data, searchTerm, estadoFilter, fechaFilter, categoriaFilter, getBacheId, getBacheStatus, getDateValue]);

  // Group baches by category for dashboard blocks
  const groupedBaches = useMemo(() => {
    const groups: Record<string, any[]> = {
      'En Proceso': [],
      'Completos Planta': [],
      'Completos Bodega': [],
      'Agotados': [],
      'Incompletos': []
    };

    filteredBaches.forEach(bache => {
      const status = getBacheStatus(bache);
      if (status === 'Bache en proceso') {
        groups['En Proceso'].push(bache);
      } else if (status === 'Bache Completo Planta') {
        groups['Completos Planta'].push(bache);
      } else if (status === 'Bache Completo Bodega') {
        groups['Completos Bodega'].push(bache);
      } else if (status === 'Bache Agotado') {
        groups['Agotados'].push(bache);
      } else if (status === 'Bache Incompleto') {
        groups['Incompletos'].push(bache);
      }
    });

    return groups;
  }, [filteredBaches, getBacheStatus]);

  // Handle monitoreo modal
  const openMonitoreoModal = (bache: any) => {
    setSelectedBache(bache);
    setShowMonitoreoModal(true);
    // Pre-fill some fields
    setMonitoreoForm({
      idBigBag: getBacheId(bache),
      humedadMC: '',
      masaSecaDM: '', // Se calculará automáticamente
      laboratorio: ''
    });
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
  };

  const closeMonitoreoModal = () => {
    setShowMonitoreoModal(false);
    setSelectedBache(null);
    setMonitoreoForm({
      idBigBag: '',
      humedadMC: '',
      masaSecaDM: '',
      laboratorio: ''
    });
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
  };

  // Handle detalles modal
  const openDetallesModal = (bache: any) => {
    setSelectedBacheDetalles(bache);
    setShowDetallesModal(true);
  };

  const closeDetallesModal = () => {
    setShowDetallesModal(false);
    setSelectedBacheDetalles(null);
  };

  // Función para calcular masa seca automáticamente
  const calcularMasaSeca = (humedadMC: string, pesoHumedo: number) => {
    if (!humedadMC || isNaN(parseFloat(humedadMC)) || pesoHumedo <= 0) {
      return '';
    }
    
    const humedadPorcentaje = parseFloat(humedadMC);
    
    // Validar que el porcentaje de humedad esté entre 0 y 100
    if (humedadPorcentaje < 0 || humedadPorcentaje > 100) {
      return '';
    }
    
    const masaSeca = pesoHumedo * (1 - humedadPorcentaje / 100);
    
    // Validar que el resultado no sea negativo (doble verificación)
    if (masaSeca < 0) {
      return '';
    }
    
    return masaSeca.toFixed(2);
  };

  const handleMonitoreoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Validación especial para el porcentaje de humedad
    if (name === 'humedadMC') {
      const humedadNum = parseFloat(value);
      if (value !== '' && (!isNaN(humedadNum) && (humedadNum < 0 || humedadNum > 100))) {
        alert('⚠️ El porcentaje de humedad debe estar entre 0% y 100%');
        return;
      }
    }
    
    let updatedForm = {
      ...monitoreoForm,
      [name]: value
    };
    
    // Si se cambió el porcentaje de humedad, recalcular masa seca
    if (name === 'humedadMC' && selectedBache) {
      const pesoHumedo = getNumericValue(selectedBache, [
        'Total Biochar Humedo Bache (KG)',
        'Peso Humedo',
        'Biochar Humedo'
      ]);
      const masaSecaCalculada = calcularMasaSeca(value, pesoHumedo);
      
      // Si la masa seca calculada está vacía (por validaciones), mostrar mensaje
      if (value !== '' && pesoHumedo > 0 && masaSecaCalculada === '') {
        alert('⚠️ El porcentaje de humedad ingresado generaría un valor inválido de masa seca');
      }
      
      updatedForm = {
        ...updatedForm,
        masaSecaDM: masaSecaCalculada
      };
    }
    
    setMonitoreoForm(updatedForm);

    // Si se cambia el laboratorio seleccionado, limpiar el campo de nuevo laboratorio
    if (name === 'laboratorio' && value !== 'nuevo-laboratorio') {
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
    }
  };

  const submitMonitoreo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingMonitoreo(true);

    try {
      // Validar campos requeridos del monitoreo
      if (!monitoreoForm.humedadMC.trim() || !monitoreoForm.masaSecaDM.trim()) {
        alert('❌ Los campos "% Humedad (MC)" y "Masa Seca (DM kg)" son obligatorios');
        setIsSubmittingMonitoreo(false);
        return;
      }

      // Validar que se haya seleccionado un laboratorio
      if (!monitoreoForm.laboratorio.trim()) {
        alert('❌ Debe seleccionar un laboratorio');
        setIsSubmittingMonitoreo(false);
        return;
      }

      let laboratorioId = monitoreoForm.laboratorio;

      // Si se seleccionó "nuevo-laboratorio", crear el laboratorio primero
      if (monitoreoForm.laboratorio === 'nuevo-laboratorio') {
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
              // 'Fecha Vigencia Certificaciones': nuevoLaboratorioForm.fechaVigenciaCertificaciones.trim(), // Campo temporalmente deshabilitado
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
        await loadLaboratorios();
      }

      const monitoreoData = {
        records: [{
          fields: {
            'ID BigBag': monitoreoForm.idBigBag,
            '% Humedad (MC)': monitoreoForm.humedadMC, // String según documentación de Airtable
            'Masa Seca (DM kg)': parseFloat(monitoreoForm.masaSecaDM), // Number según documentación
            'Realiza Registro': getUserFromSession(),
            'Bache': [selectedBache.id], // Link to the bache record
            'Laboratorio': laboratorioId && laboratorioId !== 'nuevo-laboratorio' ? [laboratorioId] : []
          }
        }]
      };

      const response = await fetch('/api/monitoreo-baches/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(monitoreoData)
      });

      if (!response.ok) {
        throw new Error('Error al registrar monitoreo');
      }

      alert('✅ Monitoreo registrado exitosamente');
      closeMonitoreoModal();
      // Recargar los datos para actualizar el estado de los botones
      refetch();
    } catch (error) {
      console.error('Error submitting monitoreo:', error);
      alert('❌ Error al registrar el monitoreo');
    } finally {
      setIsSubmittingMonitoreo(false);
    }
  };

  // Load laboratorios
  const loadLaboratorios = async () => {
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

  // Load laboratorios on component mount
  useEffect(() => {
    loadLaboratorios();
  }, []);

  // Handle pasar a bodega - Abrir modal
  const handlePasarABodega = (bache: any) => {
    setSelectedBacheBodega(bache);
    setShowPasarBodegaModal(true);
  };

  // Cerrar modal de pasar a bodega
  const closePasarBodegaModal = () => {
    setShowPasarBodegaModal(false);
    setSelectedBacheBodega(null);
  };

  // Manejar selección de baches en planta
  const handleBachePlantaSelection = (bacheId: string, isSelected: boolean) => {
    setSelectedBachesPlanta(prev => {
      const newSelection = new Set(prev);
      if (isSelected) {
        newSelection.add(bacheId);
      } else {
        newSelection.delete(bacheId);
      }
      return newSelection;
    });
  };

  // Limpiar selección
  const clearSelection = () => {
    setSelectedBachesPlanta(new Set());
  };

  // Verificar si se pueden pasar baches seleccionados a bodega
  const canProcessSelectedBaches = selectedBachesPlanta.size === 10;

  // Seleccionar los próximos 10 baches disponibles
  const selectNext10Baches = () => {
    const bachesPlanta = groupedBaches['Completos Planta'] || [];
    const nextBaches = bachesPlanta.slice(0, 10);
    setSelectedBachesPlanta(new Set(nextBaches.map(b => b.id)));
  };

  // Toggle selección de un bache individual (para click en card)
  const toggleBacheSelection = (bacheId: string) => {
    setSelectedBachesPlanta(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(bacheId)) {
        newSelection.delete(bacheId);
      } else if (newSelection.size < 10) {
        newSelection.add(bacheId);
      }
      return newSelection;
    });
  };

  // Función para verificar si el peso ya fue actualizado desde el estado inicial
  const isPesoYaActualizado = (bache: any) => {
    const resultado = isPesoCompletamenteActualizado(bache);
    
    // Log para debugging - solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 [isPesoYaActualizado] Bache ${getBacheId(bache)}: ${resultado}`, {
        tienePesoHumedo: hasPesoHumedoActualizado(bache),
        tieneComprobante: hasComprobanteSubido(bache),
        tieneMonitoreo: hasMonitoreoRegistrado(bache)
      });
    }
    
    return resultado;
  };

  // Handle actualizar peso - Abrir modal
  const handleActualizarPeso = (bache: any) => {
    setSelectedBachePeso(bache);
    setPesoHumedo('');
    setShowActualizarPesoModal(true);
  };

  // Cerrar modal de actualizar peso
  const closeActualizarPesoModal = () => {
    setShowActualizarPesoModal(false);
    setSelectedBachePeso(null);
    setPesoHumedo('');
    setComprobantePeso(null);
  };

  // Manejar selección de archivo con validación
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    
    if (file) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxSizeMB = 25; // Debe coincidir con el backend
      
      console.log(`📎 Archivo seleccionado: ${file.name} (${fileSizeMB}MB)`);
      
      if (file.size > maxSizeMB * 1024 * 1024) {
        alert(`❌ El archivo "${file.name}" es demasiado grande (${fileSizeMB}MB).\n\nTamaño máximo permitido: ${maxSizeMB}MB.\n\nConsejos:\n• Comprime la imagen antes de subirla\n• Usa una calidad menor al tomar la foto\n• Convierte a JPG si es PNG`);
        e.target.value = ''; // Limpiar el input
        setComprobantePeso(null);
        return;
      }
      
      // Mostrar información del archivo válido
      if (parseFloat(fileSizeMB) > 10) {
        console.log(`⚠️ Archivo grande pero válido: ${fileSizeMB}MB`);
      }
    }
    
    setComprobantePeso(file);
  };

  // Submit actualizar peso
  const submitActualizarPeso = async () => {
    if (!pesoHumedo.trim() || parseFloat(pesoHumedo) <= 0) {
      alert('❌ Debe ingresar un peso válido');
      return;
    }

    setIsSubmittingPeso(true);

    try {
      console.log('🚀 Iniciando actualización de peso:', selectedBachePeso.id);

      let comprobanteUrl = '';

      // Si hay archivo, subirlo a S3 primero
      if (comprobantePeso) {
        console.log('📤 Subiendo comprobante de peso a S3...');
        
        const formData = new FormData();
        formData.append('file', comprobantePeso);
        formData.append('bacheId', selectedBachePeso.id);

        const uploadResponse = await fetch('/api/s3/upload-comprobante-peso', {
          method: 'POST',
          body: formData,
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok) {
          const errorMsg = uploadData.details || uploadData.error || 'Error desconocido';
          console.error('❌ Error subiendo archivo:', uploadData);
          throw new Error(`❌ ${errorMsg}`);
        }

        comprobanteUrl = uploadData.fileUrl;
        console.log('✅ Comprobante subido exitosamente:', comprobanteUrl);
      }

      // Enviar datos para actualizar el peso húmedo
      const updateData: any = {
        id: selectedBachePeso.id,
        "Total Biochar Humedo Bache (KG)": parseFloat(pesoHumedo)
      };

      // Agregar URL del comprobante si existe
      if (comprobanteUrl) {
        updateData["Comprobante Peso Bache"] = [{ url: comprobanteUrl }];
      }

      console.log('📤 Enviando datos a API:', updateData);

      const response = await fetch('/api/baches/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      console.log('📥 Status de respuesta:', response.status);
      console.log('📋 Headers de respuesta:', Object.fromEntries(response.headers.entries()));

      // Verificar si la respuesta es JSON antes de intentar parsearla
      const contentType = response.headers.get('content-type');
      let responseData;
      
      if (contentType && contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch (parseError) {
          console.error('❌ Error parseando JSON:', parseError);
          const responseText = await response.text();
          console.error('📄 Texto de respuesta:', responseText);
          throw new Error(`Error parseando respuesta del servidor. Texto recibido: ${responseText.substring(0, 200)}...`);
        }
      } else {
        const responseText = await response.text();
        console.error('❌ Respuesta no es JSON. Content-Type:', contentType);
        console.error('📄 Texto de respuesta:', responseText);
        throw new Error(`El servidor devolvió una respuesta inválida (${contentType}). Texto: ${responseText.substring(0, 200)}...`);
      }

      console.log('📥 Respuesta de API:', response.status, responseData);

      if (!response.ok) {
        const errorMsg = responseData?.details 
          ? `${responseData.error}: ${JSON.stringify(responseData.details)}` 
          : responseData?.error || 'Error desconocido';
        throw new Error(`Error ${response.status}: ${errorMsg}`);
      }

      alert(comprobantePeso ? '✅ Peso y comprobante actualizados exitosamente' : '✅ Peso actualizado exitosamente');
      closeActualizarPesoModal();
      // Recargar los datos
      refetch();
    } catch (error) {
      console.error('❌ Error updating peso:', error);
      alert(`❌ Error al actualizar el peso: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsSubmittingPeso(false);
    }
  };

  // Submit pasar a bodega - solo cambiar estado
  const submitPasarABodega = async () => {
    setIsSubmittingBodega(true);
    setUpdatingBacheId(selectedBacheBodega.id);

    try {
      console.log('🚀 Iniciando actualización de bache:', selectedBacheBodega.id);

      // Enviar solo el cambio de estado
      const updateData = {
        id: selectedBacheBodega.id,
        "Estado Bache": 'Bache Completo Bodega'
      };

      console.log('📤 Enviando datos a API:', updateData);

      const response = await fetch('/api/baches/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      const responseData = await response.json();
      console.log('📥 Respuesta de API:', response.status, responseData);

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${responseData.error || 'Error desconocido'}`);
      }

      alert('✅ Bache movido a bodega exitosamente');
      closePasarBodegaModal();
      // Recargar los datos
      refetch();
    } catch (error) {
      console.error('❌ Error updating bache:', error);
      alert(`❌ Error al mover el bache a bodega: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsSubmittingBodega(false);
      setUpdatingBacheId(null);
    }
  };

  // Cerrar modal de transporte
  const closeTransportModal = () => {
    setShowTransportModal(false);
    // Resetear formulario a valores por defecto
    setTransportForm({
      tipoVehiculo: 'Dump truck',
      referenciaVehiculo: 'Kodiak',
      distanciaPlantaBodega: '6',
      tipoCombustible: 'Diesel',
      funcionVehiculo: 'Transport of Biochar slugs to storage',
      distanciaMetros: 500,
      dieselConsumidoTransporte: 0.3,
      esVehiculoNuevo: false
    });
  };

  // Procesar transporte y actualizar baches a bodega
  const processTransportToBodega = async () => {
    if (!canProcessSelectedBaches) return;

    setIsSubmittingTransport(true);
    try {
      const bacheIds = Array.from(selectedBachesPlanta);
      
      // Datos del vehículo para cada bache
      const vehicleData = {
        "Tipo Vehiculo": transportForm.tipoVehiculo,
        "Referencia Vehiculo": transportForm.referenciaVehiculo,
        "Distancia Planta Bodega": transportForm.distanciaPlantaBodega,
        "Tipo Combustible": transportForm.tipoCombustible,
        "Funcion Vehiculo": transportForm.funcionVehiculo,
        "Distancia Metros": transportForm.distanciaMetros,
        "Diesel Consumido Transporte": transportForm.dieselConsumidoTransporte
      };

      // Procesar todos los baches seleccionados
      const promises = bacheIds.map(bacheId => 
        fetch('/api/baches/update', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: bacheId,
            "Estado Bache": 'Bache Completo Bodega',
            ...vehicleData
          }),
        })
      );

      const results = await Promise.all(promises);
      
      // Verificar que todas las operaciones fueron exitosas
      for (let i = 0; i < results.length; i++) {
        if (!results[i].ok) {
          const errorData = await results[i].json();
          throw new Error(`Error al procesar bache ${bacheIds[i]}: ${errorData.error}`);
        }
      }

      // Refetch data to update the UI
      await refetch();
      
      // Limpiar selección y cerrar modal
      clearSelection();
      closeTransportModal();
      
      alert(`✅ ${bacheIds.length} baches movidos a bodega con información de transporte`);
    } catch (error: any) {
      console.error('❌ Error al procesar transporte:', error);
      alert(`❌ Error al procesar el transporte: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsSubmittingTransport(false);
    }
  };

  // Manejar cambios en el formulario de transporte
  const handleTransportFormChange = (field: string, value: string | number | boolean) => {
    setTransportForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Resetear formulario para vehículo nuevo
  const resetToNewVehicle = () => {
    setTransportForm({
      tipoVehiculo: '',
      referenciaVehiculo: '',
      distanciaPlantaBodega: '',
      tipoCombustible: '',
      funcionVehiculo: '',
      distanciaMetros: 0,
      dieselConsumidoTransporte: 0,
      esVehiculoNuevo: true
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat relative" style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752096934/18032025-DSCF8092_mpdwvs.jpg')"
      }}>
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-lg">Cargando datos de baches...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat relative" style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752096934/18032025-DSCF8092_mpdwvs.jpg')"
      }}>
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30">
            <div className="text-white text-center">
              <p className="text-lg mb-4">Error al cargar datos</p>
              <p className="text-sm text-white/70">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const latestBache = getLatestBache();
  const totalBaches = data?.records?.length || 0;
  const bachesActivos = data?.records?.filter(b => {
    const status = getBacheStatus(b);
    return status === 'Bache en proceso';
  }).length || 0;
  const bachesCompletados = data?.records?.filter(b => {
    const status = getBacheStatus(b);
    return status === 'Bache Completo Planta' || status === 'Bache Completo Bodega' || status === 'Bache Agotado';
  }).length || 0;
  const totalBiochar = data?.records?.reduce((sum, b) => sum + getTotalBiochar(b), 0) || 0;
  
  // Nuevas estadísticas de biomasa
  const totalBiomasaHumeda = data?.records?.reduce((sum, b) => sum + getTotalBiomasaHumeda(b), 0) || 0;
  const totalBiomasaSecaActual = data?.records?.reduce((sum, b) => sum + getBiomasaSecaActual(b), 0) || 0;
  const totalMasaSeca = data?.records?.reduce((sum, b) => sum + getMasaSecaTotal(b), 0) || 0;

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752096934/18032025-DSCF8092_mpdwvs.jpg')"
      }}
    >
      {/* Overlay para mejorar la legibilidad */}
      <div className="absolute inset-0 bg-black/40"></div>

      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-4xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">Sistema de Baches</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Gestión y control de baches en el proceso de pirólisis por lotes
            </p>

            {/* Estadísticas Generales */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Estadísticas Generales</h2>
              <div className="space-y-3 text-white">
                <div className="flex justify-between">
                  <span className="drop-shadow">Total de Baches:</span>
                  <span className="font-semibold">{totalBaches}</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Baches Activos:</span>
                  <span className="font-semibold">{bachesActivos}</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Baches Completados:</span>
                  <span className="font-semibold">{bachesCompletados}</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Total Biochar Producido (Referencia):</span>
                  <span className="font-semibold">{totalBiochar} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Total Biochar Húmedo:</span>
                  <span className="font-semibold">{totalBiomasaHumeda.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Total Biochar Seco Actual:</span>
                  <span className="font-semibold">{totalBiomasaSecaActual.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Total Masa Seca (Histórico):</span>
                  <span className="font-semibold">{totalMasaSeca.toFixed(1)} kg</span>
                </div>
              </div>
            </div>

            {/* Bache Actual */}
            {latestBache ? (
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Bache Actual</h2>
                <div className="space-y-3 text-white">
                  <div className="font-bold text-lg drop-shadow">
                    {getBacheId(latestBache)}
                  </div>
                  <div className="flex justify-between">
                    <span className="drop-shadow">Estado:</span>
                    <span className={`font-semibold px-2 py-1 rounded-full text-xs ${
                      getBacheStatus(latestBache) === 'Bache Completo Planta' || getBacheStatus(latestBache) === 'Bache Completo Bodega'
                        ? 'bg-green-500/20 text-green-200'
                        : getBacheStatus(latestBache) === 'Bache en proceso'
                        ? 'bg-blue-500/20 text-blue-200'
                        : 'bg-yellow-500/20 text-yellow-200'
                    }`}>
                      {getBacheStatus(latestBache)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="drop-shadow">Progreso Lonas:</span>
                    <span className="font-semibold">
                      {calculateProgress(latestBache).lonasUsadas} / {calculateProgress(latestBache).totalLonas} lonas
                    </span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] h-3 rounded-full transition-all duration-500"
                      style={{width: `${calculateProgress(latestBache).progressPercentage}%`}}
                    ></div>
                  </div>
                  <div className="text-center text-sm text-white/70 mb-2 drop-shadow">
                    {calculateProgress(latestBache).progressPercentage.toFixed(1)}% completado
                  </div>
                  <div className="text-center mt-4">
                    <div className="text-sm drop-shadow">Total Biochar</div>
                    <div className="font-bold">{getTotalBiochar(latestBache)} kg</div>
                  </div>
                  <div className="text-xs text-white/70 mt-2 drop-shadow">
                    Creado: {getDateValue(latestBache) ?
                      new Date(getDateValue(latestBache)).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) :
                      new Date(latestBache.createdTime).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    }
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Bache Actual</h2>
                <div className="text-center text-white/70 py-8">
                  <p>No hay baches registrados en el sistema</p>
                </div>
              </div>
            )}

            {/* Filtros Superiores */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Filtros</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {['Todos', 'En Proceso', 'Completos Planta', 'Completos Bodega', 'Agotados', 'Incompletos'].map((categoria) => (
                  <button
                    key={categoria}
                    onClick={() => setCategoriaFilter(categoria)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      categoriaFilter === categoria
                        ? 'bg-[#5A7836] text-white shadow-lg'
                        : 'bg-white/10 text-white/80 hover:bg-white/20 border border-white/30'
                    }`}
                  >
                    {categoria} ({categoria === 'Todos' ? filteredBaches.length : groupedBaches[categoria]?.length || 0})
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Buscar por Código o Estado</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-md text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Filtrar por Estado</label>
                  <select
                    value={estadoFilter}
                    onChange={(e) => setEstadoFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-white/50"
                  >
                    <option value="">Todos los Estados</option>
                    <option value="Bache en proceso">Bache en proceso</option>
                    <option value="Bache Completo Planta">Bache Completo Planta</option>
                    <option value="Bache Completo Bodega">Bache Completo Bodega</option>
                    <option value="Bache Agotado">Bache Agotado</option>
                    <option value="Bache Incompleto">Bache Incompleto</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Filtrar por Fecha (YYYY-MM-DD)</label>
                  <input
                    type="text"
                    value={fechaFilter}
                    onChange={(e) => setFechaFilter(e.target.value)}
                    placeholder="2025-09-17"
                    className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-md text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                </div>
              </div>
            </div>

            {/* Botón Ver Laboratorios */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <div className="flex justify-center">
                <Link href="/laboratorios">
                  <button className="bg-[#5A7836]/80 hover:bg-[#5A7836] text-white px-8 py-3 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 hover:shadow-lg">
                    🧪 Ver Laboratorios
                  </button>
                </Link>
              </div>
            </div>

            {/* Dashboard de Baches */}
            <div className="space-y-6">
              {Object.entries(groupedBaches).map(([categoria, baches]) => {
                if (categoriaFilter !== 'Todos' && categoria !== categoriaFilter) return null;
                
                const blockColors = {
                  'En Proceso': 'bg-blue-500/20 border-blue-400/50',
                  'Completos Planta': 'bg-green-500/20 border-green-400/50',
                  'Completos Bodega': 'bg-emerald-500/20 border-emerald-400/50',
                  'Agotados': 'bg-red-500/20 border-red-400/50',
                  'Incompletos': 'bg-yellow-500/20 border-yellow-400/50'
                };

                return (
                  <div key={categoria} className={`bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6 border ${blockColors[categoria as keyof typeof blockColors]}`}>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold text-white drop-shadow-lg flex items-center">
                        <span className={`w-4 h-4 rounded-full mr-3 ${
                          categoria === 'En Proceso' ? 'bg-blue-400' :
                          categoria === 'Completos Planta' ? 'bg-green-400' :
                          categoria === 'Completos Bodega' ? 'bg-emerald-400' :
                          categoria === 'Agotados' ? 'bg-red-400' : 'bg-yellow-400'
                        }`}></span>
                        {categoria} ({baches.length})
                      </h3>
                      
                      {categoria === 'Completos Planta' && (
                        <div className="flex items-center space-x-2">
                          {/* Botón de limpiar selección */}
                          {selectedBachesPlanta.size > 0 && (
                            <button
                              onClick={clearSelection}
                              className="bg-gray-600/80 hover:bg-gray-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200"
                              title="Limpiar selección"
                            >
                              🗑️ Limpiar ({selectedBachesPlanta.size})
                            </button>
                          )}

                          {/* Contador y botón principal */}
                          <div className="flex items-center space-x-2">
                            <span className="text-white/80 text-sm font-medium">
                              {selectedBachesPlanta.size}/10
                            </span>
                            <button
                              onClick={() => setShowTransportModal(true)}
                              disabled={!canProcessSelectedBaches}
                              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 transform ${
                                canProcessSelectedBaches
                                  ? 'bg-blue-600/90 hover:bg-blue-600 hover:scale-105 text-white shadow-lg cursor-pointer'
                                  : 'bg-gray-500/50 text-gray-400 cursor-not-allowed'
                              }`}
                              title={!canProcessSelectedBaches ? 'Selecciona exactamente 10 baches' : 'Configurar transporte a bodega'}
                            >
                              📦 Pasar a Bodega
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {baches.length === 0 ? (
                      <div className="text-center text-white/70 py-8">
                        <p>No hay baches en esta categoría</p>
                      </div>
                    ) : (
                      <>
                        {categoria === 'Completos Planta' && baches.length >= 10 && (
                          <div className="mb-4 p-3 bg-blue-500/20 border border-blue-400/50 rounded-lg">
                            <p className="text-blue-200 text-sm flex items-center">
                              <span className="mr-2">💡</span>
                              <strong>Tip:</strong> Haz click en cualquier bache para seleccionarlo. Selecciona exactamente 10 baches para proceder.
                            </p>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {baches.map((bache) => {
                            const isSelected = selectedBachesPlanta.has(bache.id);
                            const isSelectableCategory = categoria === 'Completos Planta';
                            
                            return (
                              <div 
                                key={bache.id} 
                                onClick={() => isSelectableCategory ? toggleBacheSelection(bache.id) : undefined}
                                className={`backdrop-blur-sm border rounded-xl p-4 transition-all duration-300 relative cursor-pointer transform ${
                                  isSelectableCategory 
                                    ? isSelected 
                                      ? 'bg-blue-500/30 border-blue-400 shadow-lg scale-105 ring-2 ring-blue-400/50' 
                                      : 'bg-white/10 border-white/20 hover:bg-blue-500/20 hover:border-blue-400/50 hover:scale-102'
                                    : 'bg-white/10 border-white/20 hover:bg-white/20 cursor-default'
                                }`}
                              >
                                {isSelectableCategory && (
                                  <>
                                    {/* Indicador visual de selección */}
                                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                                      isSelected 
                                        ? 'bg-blue-500 border-blue-400 text-white shadow-md' 
                                        : 'bg-white/20 border-white/40 hover:border-blue-400/60'
                                    }`}>
                                      {isSelected && (
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                      )}
                                    </div>
                                    
                                    {/* Overlay de selección */}
                                    {isSelected && (
                                      <div className="absolute inset-0 bg-blue-500/10 rounded-xl pointer-events-none" />
                                    )}
                                  </>
                                )}
                                <div className="mb-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className={`font-bold text-lg drop-shadow ${
                                      isSelected ? 'text-blue-200' : 'text-white'
                                    }`}>
                                      {isSelected ? '✓ ' : ''}{getBacheId(bache)}
                                    </h4>
                                    {isSelectableCategory && selectedBachesPlanta.size >= 10 && !isSelected && (
                                      <span className="text-xs text-orange-300 opacity-75">Máximo alcanzado</span>
                                    )}
                                  </div>
                              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold mt-1 ${
                                (() => {
                                  const status = getBacheStatus(bache);
                                  const totalBiochar = getTotalBiochar(bache);
                                  
                                  // Para baches en planta o bodega, determinar color por cantidad de biochar
                                  if (status === 'Bache Completo Planta' || status === 'Bache Completo Bodega') {
                                    return totalBiochar >= 500 ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-200';
                                  }
                                  
                                  // Para otros estados, mantener lógica original
                                  return status === 'Bache Agotado' ? 'bg-red-500/20 text-red-200' :
                                         status === 'Bache en proceso' ? 'bg-blue-500/20 text-blue-200' : 
                                         'bg-yellow-500/20 text-yellow-200';
                                })()
                              }`}>
                                {(() => {
                                  const status = getBacheStatus(bache);
                                  
                                  // Mostrar el estado normal sin modificar por peso húmedo
                                  return status;
                                })()}
                              </span>
                            </div>
                            
                            <div className="space-y-2 mb-4">
                              <div className="flex justify-between text-sm">
                                <span className="text-white/80 drop-shadow">Lonas:</span>
                                <span className="text-white font-semibold">{calculateProgress(bache).lonasUsadas} / {calculateProgress(bache).totalLonas}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-white/80 drop-shadow">Biochar Total:</span>
                                <span className="text-white font-semibold">{getTotalBiochar(bache)} kg</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-white/80 drop-shadow">Biochar Vendido:</span>
                                <span className="text-white font-semibold">{getBiocharVendido(bache)} kg</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-white/80 drop-shadow">Fecha:</span>
                                <span className="text-white font-semibold">
                                  {getDateValue(bache) ?
                                    new Date(getDateValue(bache)).toLocaleDateString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    }) :
                                    new Date(bache.createdTime).toLocaleDateString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    })
                                  }
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-white/80 drop-shadow">Responsable:</span>
                                <span className="text-white font-semibold">Sistema</span>
                              </div>
                            </div>
                            
                            {/* Botón Ver Detalles - disponible para todos los baches */}
                            <div className="mt-3 mb-3">
                              <button
                                onClick={() => openDetallesModal(bache)}
                                className="w-full bg-gray-600/80 hover:bg-gray-600 text-white py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200"
                              >
                                👁️ Ver Detalles
                              </button>
                            </div>

                            {categoria === 'Completos Bodega' && (
                              <div className="space-y-2 mt-3">
                                <button
                                  onClick={() => openMonitoreoModal(bache)}
                                  disabled={!hasPesoHumedoActualizado(bache) || hasMonitoreoRegistrado(bache)}
                                  className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    hasPesoHumedoActualizado(bache) && !hasMonitoreoRegistrado(bache)
                                      ? 'bg-[#5A7836]/80 hover:bg-[#5A7836] text-white cursor-pointer'
                                      : 'bg-gray-500/50 text-gray-400 cursor-not-allowed'
                                  }`}
                                  title={
                                    !hasPesoHumedoActualizado(bache) 
                                      ? 'Debe actualizar el peso del bache primero' 
                                      : hasMonitoreoRegistrado(bache)
                                      ? 'El monitoreo ya ha sido registrado para este bache'
                                      : ''
                                  }
                                >
                                  {hasMonitoreoRegistrado(bache) ? '✅ Monitoreo Registrado' : '📊 Registrar Monitoreo'}
                                </button>
                                <button
                                  onClick={() => handleActualizarPeso(bache)}
                                  disabled={isPesoYaActualizado(bache)}
                                  className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                                    !isPesoYaActualizado(bache)
                                      ? 'bg-orange-600/80 hover:bg-orange-600 text-white cursor-pointer'
                                      : 'bg-gray-500/50 text-gray-400 cursor-not-allowed'
                                  }`}
                                  title={isPesoYaActualizado(bache) 
                                    ? hasMonitoreoRegistrado(bache) 
                                      ? 'El peso ya fue actualizado y el bache tiene monitoreo completo'
                                      : 'El peso y comprobante ya fueron actualizados'
                                    : 'Actualizar el peso húmedo total del bache'
                                  }
                                >
                                  {isPesoYaActualizado(bache) 
                                    ? '✅ Peso Actualizado' 
                                    : hasPesoHumedoActualizado(bache) 
                                      ? '📎 Agregar Comprobante'
                                      : '⚖️ Actualizar Peso'
                                  }
                                </button>
                              </div>
                            )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

          </div>

        </main>

        {/* Modal de Monitoreo */}
        {showMonitoreoModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">📊 Registrar Monitoreo</h2>
                <button
                  onClick={closeMonitoreoModal}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={submitMonitoreo} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    ID BigBag
                  </label>
                  <input
                    type="text"
                    name="idBigBag"
                    value={monitoreoForm.idBigBag}
                    readOnly
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-600 cursor-not-allowed"
                    placeholder="ID del BigBag"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      % Humedad (MC)
                    </label>
                    <input
                      type="number"
                      name="humedadMC"
                      value={monitoreoForm.humedadMC}
                      onChange={handleMonitoreoInputChange}
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                      placeholder="Ej: 15.5"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Masa Seca (DM kg)
                    </label>
                    <input
                      type="number"
                      name="masaSecaDM"
                      value={monitoreoForm.masaSecaDM}
                      readOnly
                      step="0.01"
                      className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-600 cursor-not-allowed"
                      placeholder="Se calculará automáticamente"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Laboratorio *
                  </label>
                  <select
                    name="laboratorio"
                    value={monitoreoForm.laboratorio}
                    onChange={handleMonitoreoInputChange}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                    disabled={loadingLaboratorios}
                    required
                  >
                    <option value="">
                      {loadingLaboratorios ? 'Cargando laboratorios...' : 'Seleccionar laboratorio *'}
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

                  {/* Zona informativa de Métodos Analíticos */}
                  {getSelectedLaboratorio() && getSelectedLaboratorio()?.fields?.['Métodos Analíticos'] && (
                    <div className="mt-3 p-3 bg-blue-500/20 rounded-lg border border-blue-300/30">
                      <h4 className="text-sm font-semibold text-white mb-2 drop-shadow flex items-center">
                        🔬 Métodos Analíticos
                      </h4>
                      <p className="text-sm text-blue-100 leading-relaxed">
                        {getSelectedLaboratorio()?.fields?.['Métodos Analíticos']}
                      </p>
                    </div>
                  )}

                  {monitoreoForm.laboratorio === 'nuevo-laboratorio' && (
                    <div className="mt-4 p-4 bg-white/10 rounded-lg border border-white/20">
                      <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">📋 Datos del Nuevo Laboratorio</h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Nombre Laboratorio *
                          </label>
                          <input
                            type="text"
                            value={nuevoLaboratorioForm.nombreLaboratorio}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, nombreLaboratorio: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="Nombre del laboratorio"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Tipo Laboratorio
                          </label>
                          <input
                            type="text"
                            value={nuevoLaboratorioForm.tipoLaboratorio}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, tipoLaboratorio: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="Tipo de laboratorio"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Responsable
                          </label>
                          <input
                            type="text"
                            value={nuevoLaboratorioForm.responsable}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, responsable: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="Nombre del responsable"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Teléfono
                          </label>
                          <input
                            type="tel"
                            value={nuevoLaboratorioForm.telefono}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, telefono: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="Número de teléfono"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Correo Electrónico
                          </label>
                          <input
                            type="email"
                            value={nuevoLaboratorioForm.correoElectronico}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, correoElectronico: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="correo@ejemplo.com"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Ciudad
                          </label>
                          <input
                            type="text"
                            value={nuevoLaboratorioForm.ciudad}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, ciudad: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="Ciudad"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            País
                          </label>
                          <input
                            type="text"
                            value={nuevoLaboratorioForm.pais}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, pais: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="País"
                          />
                        </div>

                        {/* Campo temporalmente deshabilitado - ID no válido en Airtable
                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Fecha Vigencia Certificaciones
                          </label>
                          <input
                            type="text"
                            value={nuevoLaboratorioForm.fechaVigenciaCertificaciones}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, fechaVigenciaCertificaciones: e.target.value }))}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            placeholder="Fecha de vigencia"
                          />
                        </div>
                        */}
                      </div>

                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Dirección
                          </label>
                          <textarea
                            value={nuevoLaboratorioForm.direccion}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, direccion: e.target.value }))}
                            rows={2}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                            placeholder="Dirección completa"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Certificaciones
                          </label>
                          <textarea
                            value={nuevoLaboratorioForm.certificaciones}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, certificaciones: e.target.value }))}
                            rows={2}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                            placeholder="Certificaciones del laboratorio"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Acreditaciones
                          </label>
                          <textarea
                            value={nuevoLaboratorioForm.acreditaciones}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, acreditaciones: e.target.value }))}
                            rows={2}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                            placeholder="Acreditaciones del laboratorio"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Métodos Analíticos
                          </label>
                          <textarea
                            value={nuevoLaboratorioForm.metodosAnaliticos}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, metodosAnaliticos: e.target.value }))}
                            rows={2}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                            placeholder="Métodos analíticos disponibles"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                            Observaciones
                          </label>
                          <textarea
                            value={nuevoLaboratorioForm.observaciones}
                            onChange={(e) => setNuevoLaboratorioForm(prev => ({ ...prev, observaciones: e.target.value }))}
                            rows={3}
                            className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                            placeholder="Observaciones adicionales"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>



                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={closeMonitoreoModal}
                    className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingMonitoreo}
                    className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-green-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isSubmittingMonitoreo ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>
                        <span className="ml-2">Registrando...</span>
                      </>
                    ) : (
                      '📊 Registrar Monitoreo'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Detalles */}
        {showDetallesModal && selectedBacheDetalles && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">👁️ Detalles del Bache</h2>
                <button
                  onClick={closeDetallesModal}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Información básica */}
                <div className="bg-white/10 rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">📋 Información Básica</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">ID del Bache:</span>
                      <p className="text-white font-semibold text-lg">{getBacheId(selectedBacheDetalles)}</p>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Estado:</span>
                      <p className={`font-semibold text-sm px-2 py-1 rounded-full inline-block mt-1 ${
                        (() => {
                          const status = getBacheStatus(selectedBacheDetalles);
                          const totalBiochar = getTotalBiochar(selectedBacheDetalles);
                          
                          if (status === 'Bache Completo Planta' || status === 'Bache Completo Bodega') {
                            return totalBiochar >= 500 ? 'bg-green-500/20 text-green-200' : 'bg-yellow-500/20 text-yellow-200';
                          }
                          
                          return status === 'Bache Agotado' ? 'bg-red-500/20 text-red-200' :
                                 status === 'Bache en proceso' ? 'bg-blue-500/20 text-blue-200' : 
                                 'bg-yellow-500/20 text-yellow-200';
                        })()
                      }`}>
                        {(() => {
                          const status = getBacheStatus(selectedBacheDetalles);
                          
                          return status;
                        })()}
                      </p>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Fecha de Creación:</span>
                      <p className="text-white font-semibold">
                        {getDateValue(selectedBacheDetalles) ?
                          new Date(getDateValue(selectedBacheDetalles)).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) :
                          new Date(selectedBacheDetalles.createdTime).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        }
                      </p>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">ID de Registro:</span>
                      <p className="text-white font-semibold">{selectedBacheDetalles.id}</p>
                    </div>
                  </div>
                </div>

                {/* Información de producción */}
                <div className="bg-white/10 rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">🏭 Información de Producción</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Lonas Usadas:</span>
                      <p className="text-white font-semibold">{calculateProgress(selectedBacheDetalles).lonasUsadas} / {calculateProgress(selectedBacheDetalles).totalLonas}</p>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Progreso:</span>
                      <p className="text-white font-semibold">{calculateProgress(selectedBacheDetalles).progressPercentage.toFixed(1)}%</p>
                      <div className="w-full bg-white/20 rounded-full h-2 mt-1">
                        <div
                          className="bg-gradient-to-r from-[#5A7836] to-[#4a6429] h-2 rounded-full transition-all duration-500"
                          style={{width: `${calculateProgress(selectedBacheDetalles).progressPercentage}%`}}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Biochar Total Producido:</span>
                      <p className="text-white font-semibold">{getTotalBiochar(selectedBacheDetalles)} kg</p>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Biochar Vendido:</span>
                      <p className="text-white font-semibold">{getBiocharVendido(selectedBacheDetalles)} kg</p>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Biochar Disponible:</span>
                      <p className="text-white font-semibold">{getTotalBiochar(selectedBacheDetalles) - getBiocharVendido(selectedBacheDetalles)} kg</p>
                    </div>
                    <div>
                      <span className="text-white/80 drop-shadow text-sm">Objetivo de Producción:</span>
                      <p className="text-white font-semibold">500 kg</p>
                    </div>
                  </div>
                </div>

                {/* Información adicional */}
                <div className="bg-white/10 rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">📊 Información Adicional</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-white/80 drop-shadow text-sm">Responsable:</span>
                      <span className="text-white font-semibold">Sistema</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/80 drop-shadow text-sm">Última Actualización:</span>
                      <span className="text-white font-semibold">
                        {new Date(selectedBacheDetalles.createdTime).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Campos adicionales de Airtable */}
                {Object.keys(selectedBacheDetalles.fields).length > 0 && (
                  <div className="bg-white/10 rounded-lg p-4 border border-white/20">
                    <h3 className="text-lg font-semibold text-white mb-4 drop-shadow">🔍 Campos Técnicos</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {Object.entries(selectedBacheDetalles.fields).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-white/60 drop-shadow">{key}:</span>
                          <span className="text-white font-mono ml-2">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={closeDetallesModal}
                  className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Pasar a Bodega */}
        {showPasarBodegaModal && selectedBacheBodega && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-md w-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">📦 Pasar a Bodega</h2>
                <button
                  onClick={closePasarBodegaModal}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6">
                <div className="bg-white/10 rounded-lg p-4 border border-white/20 mb-4">
                  <h3 className="text-lg font-semibold text-white mb-2 drop-shadow">Bache: {getBacheId(selectedBacheBodega)}</h3>
                  <div className="text-sm text-white/80 space-y-1">
                    <p>Estado Actual: <span className="font-semibold text-white">{getBacheStatus(selectedBacheBodega)}</span></p>
                    <p>Lonas Usadas: <span className="font-semibold text-white">{calculateProgress(selectedBacheBodega).lonasUsadas} / {calculateProgress(selectedBacheBodega).totalLonas}</span></p>
                  </div>
                </div>

                <div className="bg-blue-500/20 border border-blue-400/50 rounded-lg p-3 mb-6">
                  <p className="text-sm text-white drop-shadow">
                    ℹ️ El bache cambiará su estado a "Bache Completo Bodega"
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closePasarBodegaModal}
                    disabled={isSubmittingBodega}
                    className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submitPasarABodega}
                    disabled={isSubmittingBodega}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isSubmittingBodega ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Moviendo...
                      </div>
                    ) : (
                      '📦 Confirmar y Pasar a Bodega'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Actualizar Peso */}
        {showActualizarPesoModal && selectedBachePeso && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-md w-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">⚖️ Actualizar Peso</h2>
                <button
                  onClick={closeActualizarPesoModal}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6">
                <div className="bg-white/10 rounded-lg p-4 border border-white/20 mb-4">
                  <h3 className="text-lg font-semibold text-white mb-2 drop-shadow">Bache: {getBacheId(selectedBachePeso)}</h3>
                  <div className="text-sm text-white/80 space-y-1">
                    <p>Estado Actual: <span className="font-semibold text-white">{getBacheStatus(selectedBachePeso)}</span></p>
                    <p>Lonas Usadas: <span className="font-semibold text-white">{calculateProgress(selectedBachePeso).lonasUsadas} / {calculateProgress(selectedBachePeso).totalLonas}</span></p>
                  </div>
                </div>

                <div>
                  <label htmlFor="pesoHumedo" className="block text-sm font-medium text-white mb-2 drop-shadow">
                    Total Biochar Húmedo (kg) *
                  </label>
                  <input
                    type="number"
                    id="pesoHumedo"
                    name="pesoHumedo"
                    value={pesoHumedo}
                    onChange={(e) => setPesoHumedo(e.target.value)}
                    step="0.01"
                    min="0"
                    placeholder="Ej: 520.5"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                    required
                  />
                  <p className="text-xs text-white/60 mt-1 drop-shadow">
                    Ingrese el peso húmedo total del bache
                  </p>
                </div>

                {/* Campo de archivo adjunto */}
                <div className="mt-4">
                  <label htmlFor="comprobantePeso" className="block text-sm font-medium text-white mb-2 drop-shadow">
                    📎 Comprobante de Peso (Opcional)
                  </label>
                  <input
                    type="file"
                    id="comprobantePeso"
                    name="comprobantePeso"
                    accept="image/*,.pdf"
                    capture="environment"
                    onChange={handleFileSelection}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 font-medium file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />
                  {comprobantePeso && (
                    <div className="mt-2 p-2 bg-white/10 rounded-lg border border-white/20">
                      <p className="text-xs text-white/90 drop-shadow">
                        📎 <span className="font-semibold">{comprobantePeso.name}</span>
                      </p>
                      <p className="text-xs text-white/70 drop-shadow">
                        📏 Tamaño: {(comprobantePeso.size / (1024 * 1024)).toFixed(2)}MB
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-white/60 mt-1 drop-shadow">
                    📷 Puede tomar una foto o adjuntar un archivo PDF como comprobante (máx. 25MB)
                  </p>
                </div>

                <div className="bg-green-500/20 border border-green-400/50 rounded-lg p-3 mt-4">
                  <p className="text-sm text-white drop-shadow">
                    ℹ️ Este valor se guardará en el campo "Total Biochar Húmedo Bache (KG)"
                  </p>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={closeActualizarPesoModal}
                    disabled={isSubmittingPeso}
                    className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submitActualizarPeso}
                    disabled={isSubmittingPeso || !pesoHumedo.trim()}
                    className="flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isSubmittingPeso ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Actualizando...
                      </div>
                    ) : (
                      '⚖️ Actualizar Peso'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Configuración de Transporte */}
        {showTransportModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">🚚 Configurar Transporte a Bodega</h2>
                <button
                  onClick={closeTransportModal}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="mb-6">
                {/* Información de baches seleccionados */}
                <div className="bg-white/10 rounded-lg p-4 border border-white/20 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-2 drop-shadow">
                    Baches Seleccionados: {selectedBachesPlanta.size}
                  </h3>
                  <div className="text-sm text-white/80">
                    <p>Los {selectedBachesPlanta.size} baches serán trasladados de planta a bodega</p>
                  </div>
                </div>

                {/* Toggle para vehículo existente o nuevo */}
                <div className="mb-6">
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setTransportForm(prev => ({ ...prev, esVehiculoNuevo: false, tipoVehiculo: 'Dump truck', referenciaVehiculo: 'Kodiak', distanciaPlantaBodega: '6', tipoCombustible: 'Diesel', funcionVehiculo: 'Transport of Biochar slugs to storage', distanciaMetros: 500, dieselConsumidoTransporte: 0.3 }))}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        !transportForm.esVehiculoNuevo 
                          ? 'bg-blue-600/80 text-white' 
                          : 'bg-white/20 text-white/70 hover:bg-white/30'
                      }`}
                    >
                      🚛 Vehículo Existente
                    </button>
                    <button
                      onClick={resetToNewVehicle}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        transportForm.esVehiculoNuevo 
                          ? 'bg-emerald-600/80 text-white' 
                          : 'bg-white/20 text-white/70 hover:bg-white/30'
                      }`}
                    >
                      ➕ Nuevo Vehículo
                    </button>
                  </div>
                </div>

                {/* Formulario de datos del vehículo */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Tipo Vehículo *
                      </label>
                      <input
                        type="text"
                        value={transportForm.tipoVehiculo}
                        onChange={(e) => handleTransportFormChange('tipoVehiculo', e.target.value)}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="ej. Dump truck"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Referencia Vehículo *
                      </label>
                      <input
                        type="text"
                        value={transportForm.referenciaVehiculo}
                        onChange={(e) => handleTransportFormChange('referenciaVehiculo', e.target.value)}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="ej. Kodiak"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Distancia Planta-Bodega (km) *
                      </label>
                      <input
                        type="text"
                        value={transportForm.distanciaPlantaBodega}
                        onChange={(e) => handleTransportFormChange('distanciaPlantaBodega', e.target.value)}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="ej. 6"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Tipo Combustible *
                      </label>
                      <input
                        type="text"
                        value={transportForm.tipoCombustible}
                        onChange={(e) => handleTransportFormChange('tipoCombustible', e.target.value)}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="ej. Diesel"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                      Función Vehículo *
                    </label>
                    <input
                      type="text"
                      value={transportForm.funcionVehiculo}
                      onChange={(e) => handleTransportFormChange('funcionVehiculo', e.target.value)}
                      className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="ej. Transport of Biochar slugs to storage"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Distancia Metros *
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={transportForm.distanciaMetros}
                        onChange={(e) => handleTransportFormChange('distanciaMetros', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="ej. 500"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                        Diesel Consumido Transporte *
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={transportForm.dieselConsumidoTransporte}
                        onChange={(e) => handleTransportFormChange('dieselConsumidoTransporte', parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="ej. 0.3"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={closeTransportModal}
                    disabled={isSubmittingTransport}
                    className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={processTransportToBodega}
                    disabled={isSubmittingTransport || !transportForm.tipoVehiculo || !transportForm.referenciaVehiculo}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isSubmittingTransport ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Procesando...
                      </div>
                    ) : (
                      '🚚 Confirmar Transporte'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}

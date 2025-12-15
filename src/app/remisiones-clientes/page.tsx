"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import VoiceToText from '@/components/VoiceToText';
import React, { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/config';

export default function RemisionesClientes() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <RemisionesClientesContent />
    </TurnoProtection>
  );
}

function RemisionesClientesContent() {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Todos');
  const [showNuevaRemisionForm, setShowNuevaRemisionForm] = useState(false);
  
  // Estados para las remisiones
  const [remisiones, setRemisiones] = useState<any[]>([]);
  const [loadingRemisiones, setLoadingRemisiones] = useState(false);
  const [estadisticas, setEstadisticas] = useState({
    totalRemisiones: 0,
    remisionesPendientes: 0,
    remisionesCompletadas: 0,
    biocharVendido: 0
  });
  
  // Estados para el dropdown de clientes
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clientesExistentes, setClientesExistentes] = useState<{nombre: string, nit: string}[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [allowAutoDropdown, setAllowAutoDropdown] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  
  // Estados para el dropdown de baches
  const [bachesDisponibles, setBachesDisponibles] = useState<{id: string, codigo: string, cantidadDisponible: number, estado: string}[]>([]);
  const [loadingBaches, setLoadingBaches] = useState(false);
  const [generatingQR, setGeneratingQR] = useState<string | null>(null);

  // Función para generar QR de entrega
  const generateEntregaQR = async (remisionId: string) => {
    setGeneratingQR(`entrega-${remisionId}`);
    try {
      console.log('🔗 Generando QR para entrega:', remisionId);
      
      // URL del formulario de entrega
      const entregaUrl = `${window.location.origin}/entrega-remision/${remisionId}`;
      
      const response = await fetch('/api/generate-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          remisionId: remisionId,
          url: entregaUrl,
          type: 'remision'
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error generando QR');
      }
      
      if (result.success) {
        // Abrir el QR en una nueva ventana o descargar
        const qrWindow = window.open('', '_blank');
        if (qrWindow) {
          qrWindow.document.write(`
            <html>
              <head><title>QR - Formulario de Entrega</title></head>
              <body style="text-align: center; padding: 20px; font-family: Arial, sans-serif;">
                <h2>QR - Formulario de Entrega</h2>
                <p>Escaneé este código para acceder al formulario de entrega</p>
                <img src="${result.qrUrl}" alt="QR Code" style="max-width: 300px; border: 2px solid #ccc; padding: 10px;"/>
                <br/><br/>
                <p style="font-size: 12px; color: #666;">
                  URL: ${entregaUrl}
                </p>
              </body>
            </html>
          `);
        } else {
          alert(`QR generado. URL: ${entregaUrl}`);
        }
      }
    } catch (error: any) {
      console.error('Error generando QR:', error);
      alert('Error generando el código QR: ' + error.message);
    } finally {
      setGeneratingQR(null);
    }
  };

  // Función para generar QR de recepción
  const generateRecepcionQR = async (remisionId: string) => {
    setGeneratingQR(`recepcion-${remisionId}`);
    try {
      console.log('🔗 Generando QR para recepción:', remisionId);
      
      // URL del formulario de recepción
      const recepcionUrl = `${window.location.origin}/recepcion-remision/${remisionId}`;
      
      const response = await fetch('/api/generate-qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          remisionId: remisionId,
          url: recepcionUrl,
          type: 'remision'
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error generando QR');
      }
      
      if (result.success) {
        // Abrir el QR en una nueva ventana
        const qrWindow = window.open('', '_blank');
        if (qrWindow) {
          qrWindow.document.write(`
            <html>
              <head><title>QR - Formulario de Recepción</title></head>
              <body style="text-align: center; padding: 20px; font-family: Arial, sans-serif;">
                <h2>QR - Formulario de Recepción</h2>
                <p>Escaneé este código para confirmar la recepción del producto</p>
                <img src="${result.qrUrl}" alt="QR Code" style="max-width: 300px; border: 2px solid #ccc; padding: 10px;"/>
                <br/><br/>
                <p style="font-size: 12px; color: #666;">
                  URL: ${recepcionUrl}
                </p>
              </body>
            </html>
          `);
        } else {
          alert(`QR generado. URL: ${recepcionUrl}`);
        }
      }
    } catch (error: any) {
      console.error('Error generando QR:', error);
      alert('Error generando el código QR: ' + error.message);
    } finally {
      setGeneratingQR(null);
    }
  };

  // Función para obtener el usuario de la sesión
  const getUserFromSession = () => {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      try {
        const sessionData = JSON.parse(userSession);
        return sessionData.user?.Nombre || 'Usuario';
      } catch (error) {
        console.error('Error parsing user session:', error);
        return 'Usuario';
      }
    }
    return 'Usuario';
  };

  // Función para formatear fechas
  const formatearFecha = (fechaString: string) => {
    if (!fechaString) return 'No definida';
    try {
      const fecha = new Date(fechaString);
      return fecha.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return 'Fecha inválida';
    }
  };

  // Función para determinar el estado de una remisión
  const determinarEstado = (remision: any) => {
    const fields = remision.fields || {};
    
    if (fields[config.airtable.remisionesBachesFields.responsableRecibe!] && fields[config.airtable.remisionesBachesFields.responsableEntrega!]) {
      return { estado: 'Completado', color: 'bg-green-500' };
    } else if (fields[config.airtable.remisionesBachesFields.responsableEntrega!]) {
      return { estado: 'En Proceso', color: 'bg-yellow-500' };
    } else {
      return { estado: 'Pendiente', color: 'bg-gray-500' };
    }
  };

  // Filtrar remisiones basado en búsqueda y filtros
  const remisionesFiltradas = remisiones.filter(remision => {
    const fields = remision.fields || {};
    const cliente = fields['Cliente'] || fields[config.airtable.remisionesBachesFields.cliente!] || ''; // Cliente
    const idNumerico = fields['ID Numerico'] || fields[config.airtable.remisionesBachesFields.idNumerico!] || ''; // ID Numerico
    const { estado } = determinarEstado(remision);
    
    const coincideBusqueda = searchTerm === '' || 
      cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(idNumerico).includes(searchTerm);
    
    const coincideEstado = estadoFilter === 'Todos' || estado === estadoFilter;
    
    return coincideBusqueda && coincideEstado;
  });

  // Función para obtener todas las remisiones desde Airtable
  const fetchRemisiones = useCallback(async () => {
    if (loadingRemisiones) return;
    
    setLoadingRemisiones(true);
    try {
      console.log('📋 Cargando remisiones...');
      
      const response = await fetch('/api/remisiones-baches');
      
      if (!response.ok) {
        console.error('API Response not OK:', response.status, response.statusText);
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📋 Remisiones obtenidas:', data);
      
      if (data.success && Array.isArray(data.records)) {
        setRemisiones(data.records);
        
        // Calcular estadísticas
        const total = data.records.length;
        const completadas = data.records.filter((r: any) => 
          r.fields?.[config.airtable.remisionesBachesFields.responsableRecibe!] && r.fields?.[config.airtable.remisionesBachesFields.responsableEntrega!]
        ).length;
        const pendientes = total - completadas;
        
        // Calcular biochar vendido (necesitaríamos obtener los detalles de cantidades)
        const biocharTotal = 0;
        // TODO: Implementar cálculo desde tabla de detalle cantidades
        
        setEstadisticas({
          totalRemisiones: total,
          remisionesPendientes: pendientes,
          remisionesCompletadas: completadas,
          biocharVendido: biocharTotal
        });
      } else {
        console.error('API Response structure unexpected:', data);
        setRemisiones([]);
      }
    } catch (err) {
      console.error('Error al cargar remisiones:', err);
      setRemisiones([]);
    } finally {
      setLoadingRemisiones(false);
    }
  }, []);

  // Función para obtener clientes únicos desde Airtable
  const fetchClientesExistentes = useCallback(async () => {
    if (loadingClientes) return;
    
    setLoadingClientes(true);
    try {
      // Obtener todos los campos sin especificar Field IDs específicos
      const response = await fetch('/api/remisiones-baches');
      
      if (!response.ok) {
        console.error('API Response not OK:', response.status, response.statusText);
        throw new Error(`HTTP Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('API Response data:', data); // Debug log
      
      if (data.success && Array.isArray(data.records)) {
        // Extraer clientes únicos (evitar duplicados)
        const clientesMap = new Map();
        
        data.records.forEach((record: any) => {
          // Buscar los campos de cliente usando nombres alternativos posibles
          const cliente = record.fields?.['Cliente'] || record.fields?.[config.airtable.remisionesBachesFields.cliente!] || '';
          const nit = record.fields?.['NIT/CC Cliente'] || record.fields?.[config.airtable.remisionesBachesFields.nitCliente!] || '';
          
          if (cliente && nit && !clientesMap.has(cliente)) {
            clientesMap.set(cliente, { nombre: cliente, nit: nit });
          }
        });
        
        // Convertir Map a Array y ordenar alfabéticamente
        const clientesUnicos = Array.from(clientesMap.values())
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
        
        console.log('Clientes únicos encontrados:', clientesUnicos.length); // Debug log
        setClientesExistentes(clientesUnicos);
      } else {
        console.error('API Response structure unexpected:', {
          success: data.success,
          recordsType: typeof data.records,
          recordsLength: Array.isArray(data.records) ? data.records.length : 'not array',
          error: data.error,
          fullData: data
        });
        setClientesExistentes([]);
      }
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      setClientesExistentes([]);
    } finally {
      setLoadingClientes(false);
    }
  }, []);

  // Función para obtener baches disponibles desde Airtable
  const fetchBachesDisponibles = useCallback(async () => {
    if (loadingBaches) return;
    
    setLoadingBaches(true);
    console.log('🔄 Iniciando carga de baches disponibles...');
    
    try {
      const response = await fetch('/api/baches/disponibles');
      const data = await response.json();
      
      console.log('🗂️ Respuesta completa de API baches disponibles:', { 
        ok: response.ok, 
        status: response.status, 
        data: data,
        recordsLength: data.records?.length 
      });
      
      if (response.ok && data.records) {
        console.log('📋 Records raw data:', data.records);
        
        const baches = data.records.map((record: any) => {
          // Procesar cantidad usando el nombre del campo
          const cantidadRaw = record.fields?.['Total Cantidad Actual Biochar Seco'];
          let cantidadDisponible = 0;
          
          if (Array.isArray(cantidadRaw)) {
            // Si es array, tomar el primer valor
            cantidadDisponible = Math.round(parseFloat(cantidadRaw[0]) || 0);
          } else if (typeof cantidadRaw === 'string') {
            // Si es string, intentar parsear
            cantidadDisponible = Math.round(parseFloat(cantidadRaw.replace(/"/g, '')) || 0);
          } else if (typeof cantidadRaw === 'number') {
            // Si es número, redondear
            cantidadDisponible = Math.round(cantidadRaw);
          }
          
          // Procesar código usando el nombre del campo
          const codigoRaw = record.fields?.['Codigo Bache'];
          let codigo = 'Sin código';
          
          if (typeof codigoRaw === 'string') {
            codigo = codigoRaw.replace(/"/g, '');
          } else if (Array.isArray(codigoRaw)) {
            codigo = String(codigoRaw[0] || '').replace(/"/g, '');
          }
          
          console.log('🔍 Procesando record del frontend:', {
            id: record.id,
            codigoRaw,
            codigo,
            cantidadRaw,
            cantidadDisponible,
            estado: record.fields?.['Estado Bache']
          });
          
          return {
            id: record.id,
            codigo,
            cantidadDisponible,
            estado: record.fields?.['Estado Bache'] || 'Sin estado'
          };
        }); // Ya filtrados en el backend
        
        console.log('✅ Baches finales disponibles:', baches);
        setBachesDisponibles(baches);
      } else {
        console.error('❌ Error en respuesta de baches:', {
          ok: response.ok,
          status: response.status,
          error: data.error,
          data: data
        });
        setBachesDisponibles([]);
      }
    } catch (error) {
      console.error('💥 Error al cargar baches:', error);
      setBachesDisponibles([]);
    } finally {
      setLoadingBaches(false);
      console.log('🏁 Finalizando carga de baches disponibles');
    }
  }, []);

  // Cargar baches disponibles al montar el componente
  useEffect(() => {
    fetchBachesDisponibles();
  }, [fetchBachesDisponibles]);

  const [formData, setFormData] = useState({
    // Información básica
    fechaEvento: '',
    realizaRegistro: '',
    observaciones: '',
    
    // Información del cliente
    cliente: '',
    nitCcCliente: '',
    
    // Información de recepción
    responsableRecibe: '',
    numeroDocumentoRecibe: '',
    firmaRecibe: null as File | null,
    
    // Documentos
    documentoRemision: null as File | null,
    qrDocumentoRemision: null as File | null,
    
    // Baches vinculados con cantidades
    bachesSeleccionados: [] as {bacheId: string, codigoBache: string, cantidadSolicitada: number, cantidadDisponible: number}[]
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Limpiar errores de campo cuando el usuario empiece a escribir
    if (submitError || fieldErrors.length > 0) {
      setSubmitError(null);
      setFieldErrors([]);
    }
  };

  const handleAgregarBache = () => {
    setFormData(prev => ({
      ...prev,
      bachesSeleccionados: [...prev.bachesSeleccionados, {
        bacheId: '',
        codigoBache: '',
        cantidadSolicitada: 0,
        cantidadDisponible: 0
      }]
    }));
  };

  const handleRemoverBache = (index: number) => {
    setFormData(prev => ({
      ...prev,
      bachesSeleccionados: prev.bachesSeleccionados.filter((_, i) => i !== index)
    }));
  };

  const handleBacheChange = (index: number, field: string, value: string | number) => {
    if (field === 'bacheId') {
      const selectedBache = bachesDisponibles.find(b => b.id === value);
      if (selectedBache) {
        setFormData(prev => ({
          ...prev,
          bachesSeleccionados: prev.bachesSeleccionados.map((bache, i) => 
            i === index ? {
              ...bache,
              bacheId: selectedBache.id,
              codigoBache: selectedBache.codigo,
              cantidadDisponible: selectedBache.cantidadDisponible,
              cantidadSolicitada: 0
            } : bache
          )
        }));
      }
    } else if (field === 'cantidadSolicitada') {
      // Validación especial para cantidad solicitada - solo números enteros
      let cantidad = 0;
      if (typeof value === 'string') {
        // Remover caracteres no numéricos (solo permitir dígitos)
        const cleanValue = value.replace(/[^\d]/g, '');
        cantidad = parseInt(cleanValue) || 0;
      } else {
        cantidad = Math.round(Number(value)) || 0;
      }
      
      // Limitar la cantidad a la disponible del bache (redondeada)
      const currentBache = formData.bachesSeleccionados[index];
      if (currentBache && cantidad > Math.round(currentBache.cantidadDisponible)) {
        cantidad = Math.round(currentBache.cantidadDisponible);
      }
      
      // Limitar a un máximo razonable
      if (cantidad > 999999) {
        cantidad = 999999;
      }
      
      setFormData(prev => ({
        ...prev,
        bachesSeleccionados: prev.bachesSeleccionados.map((bache, i) => 
          i === index ? { ...bache, cantidadSolicitada: cantidad } : bache
        )
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        bachesSeleccionados: prev.bachesSeleccionados.map((bache, i) => 
          i === index ? { ...bache, [field]: value } : bache
        )
      }));
    }
  };



  const handleVoiceText = (text: string) => {
    setFormData(prev => ({ ...prev, observaciones: prev.observaciones + (prev.observaciones ? ' ' : '') + text }));
  };

  // Función para manejar la selección de cliente
  const handleClienteSelect = (cliente: { nombre: string; nit: string } | null) => {
    if (cliente) {
      // Cliente existente seleccionado
      setFormData(prev => ({
        ...prev,
        cliente: cliente.nombre,
        nitCcCliente: cliente.nit
      }));
      setIsNewClient(false);
      setAllowAutoDropdown(true);
      setShowClienteDropdown(false);
    } else {
      // NUEVO CLIENTE - COMPORTAMIENTO SIMPLIFICADO
      setFormData(prev => ({
        ...prev,
        cliente: '',
        nitCcCliente: ''
      }));
      setIsNewClient(true);
      setShowClienteDropdown(false); // Cerrar dropdown INMEDIATAMENTE
      setAllowAutoDropdown(false); // Bloquear apertura automática
      
      // NO hacer foco automático - dejar que el usuario haga clic manualmente
    }
  };

  // Filtrar clientes basado en la búsqueda
  const clientesFiltrados = clientesExistentes.filter(cliente =>
    cliente.nombre.toLowerCase().includes(formData.cliente.toLowerCase())
  );

  // useEffect para inicializar el campo realizaRegistro con el usuario de la sesión
  React.useEffect(() => {
    setFormData(prev => ({
      ...prev,
      realizaRegistro: getUserFromSession()
    }));
    
    // Cargar datos iniciales
    fetchClientesExistentes();
    fetchRemisiones();
  }, [fetchClientesExistentes, fetchRemisiones]);

  // useEffect para cerrar el dropdown al hacer clic fuera
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.relative')) {
        setShowClienteDropdown(false);
      }
    };

    if (showClienteDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showClienteDropdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    setFieldErrors([]);

    try {
      // Validar campos requeridos con mensajes específicos
      const missingFields = [];
      if (!formData.fechaEvento) missingFields.push('Fecha del Evento');
      if (!formData.cliente) missingFields.push('Cliente');
      if (!formData.nitCcCliente) missingFields.push('NIT/CC del Cliente');
      if (formData.bachesSeleccionados.length === 0) missingFields.push('Al menos un bache debe ser seleccionado');
      
      // Validar cantidades de baches
      for (let i = 0; i < formData.bachesSeleccionados.length; i++) {
        const bache = formData.bachesSeleccionados[i];
        if (!bache.bacheId) {
          missingFields.push(`Bache ${i + 1}: Debe seleccionar un bache`);
        }
        if (!bache.cantidadSolicitada || bache.cantidadSolicitada <= 0) {
          missingFields.push(`Bache ${i + 1}: Debe especificar una cantidad mayor a 0`);
        }
        if (bache.cantidadSolicitada > Math.round(bache.cantidadDisponible)) {
          missingFields.push(`Bache ${i + 1}: La cantidad solicitada (${Math.round(bache.cantidadSolicitada)} KG) excede la disponible (${Math.round(bache.cantidadDisponible)} KG)`);
        }
      }

      if (missingFields.length > 0) {
        setFieldErrors(missingFields);
        throw new Error(`Faltan los siguientes campos requeridos: ${missingFields.join(', ')}`);
      }

      console.log('📤 Enviando datos de remisión:', formData);
      console.log('🔍 Validación exitosa - todos los campos requeridos completados');

      // Enviar datos al API
      const response = await fetch('/api/remisiones-baches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status}: ${response.statusText}`);
      }

      if (!result.success) {
        throw new Error(result.error || 'Error desconocido al crear la remisión');
      }

      console.log('✅ Remisión creada exitosamente:', result.record);
      
      // Mostrar éxito y resetear formulario
      setSubmitSuccess(true);
      
      // Resetear formulario después de un breve delay
      setTimeout(() => {
        setFormData({
          fechaEvento: '',
          realizaRegistro: getUserFromSession(),
          observaciones: '',
          cliente: '',
          nitCcCliente: '',
          responsableRecibe: '',
          numeroDocumentoRecibe: '',
          firmaRecibe: null,
          documentoRemision: null,
          qrDocumentoRemision: null,
          bachesSeleccionados: []
        });
        setIsNewClient(false);
        setAllowAutoDropdown(true);
        setShowNuevaRemisionForm(false);
        setSubmitSuccess(false);
        
        // Recargar la lista de remisiones
        fetchRemisiones();
      }, 2000);

    } catch (error) {
      console.error('❌ Error al crear remisión:', error);
      setSubmitError(error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">Remisiones de Clientes</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Gestión y seguimiento de remisiones de biochar a clientes
            </p>

            {/* Estadísticas Generales */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white drop-shadow-lg">Estadísticas Generales</h2>
                <button
                  onClick={fetchRemisiones}
                  disabled={loadingRemisiones}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 disabled:bg-gray-500/20 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 text-sm"
                >
                  {loadingRemisiones ? (
                    <>
                      <div className="animate-spin inline-block w-3 h-3 border border-white/20 border-t-white rounded-full mr-1"></div>
                      Actualizando...
                    </>
                  ) : (
                    <>🔄 Actualizar</>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-white">
                <div className="bg-white/10 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-300">{estadisticas.totalRemisiones}</div>
                  <div className="text-xs text-white/80 drop-shadow">Total Remisiones</div>
                </div>
                <div className="bg-white/10 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-300">{estadisticas.remisionesPendientes}</div>
                  <div className="text-xs text-white/80 drop-shadow">Pendientes</div>
                </div>
                <div className="bg-white/10 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-300">{estadisticas.remisionesCompletadas}</div>
                  <div className="text-xs text-white/80 drop-shadow">Completadas</div>
                </div>
                <div className="bg-white/10 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-300">{estadisticas.biocharVendido}</div>
                  <div className="text-xs text-white/80 drop-shadow">Biochar (kg)</div>
                </div>
              </div>
            </div>

            {/* Filtros */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Filtros</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Buscar por Cliente o ID</label>
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
                    <option value="Todos">Todos los Estados</option>
                    <option value="Pendiente">Pendiente</option>
                    <option value="En Proceso">En Proceso</option>
                    <option value="Completado">Completado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={() => setShowNuevaRemisionForm(true)}
                    className="w-full bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white py-2 px-4 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-[#5A7836]/30"
                  >
                    ➕ Nueva Remisión
                  </button>
                </div>
              </div>
            </div>

            {/* Formulario de Nueva Remisión */}
            {showNuevaRemisionForm && (
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30 mb-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-white drop-shadow-lg">📋 Nueva Remisión</h2>
                  <button 
                    onClick={() => setShowNuevaRemisionForm(false)}
                    className="text-white/70 hover:text-white text-2xl font-bold transition-colors duration-200"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Información Básica de la Remisión */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center drop-shadow">
                      📋 Información de la Remisión
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Fecha del Evento *</label>
                        <input
                          type="date"
                          name="fechaEvento"
                          value={formData.fechaEvento}
                          onChange={handleInputChange}
                          required
                          className={`w-full px-4 py-3 bg-white/10 border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/50 ${
                            fieldErrors.includes('Fecha del Evento') ? 'border-red-400 focus:ring-red-400/50' : 'border-white/30'
                          }`}
                        />
                        {fieldErrors.includes('Fecha del Evento') && (
                          <p className="text-red-400 text-xs mt-1">Este campo es requerido</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Realiza Registro *</label>
                        <input
                          type="text"
                          name="realizaRegistro"
                          value={formData.realizaRegistro}
                          readOnly
                          className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white/80 cursor-not-allowed"
                        />
                        <p className="text-xs text-white/60 mt-1 drop-shadow">
                          Usuario automático de la sesión activa
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Observaciones</label>
                        <div className="relative">
                          <textarea
                            name="observaciones"
                            value={formData.observaciones}
                            onChange={handleInputChange}
                            placeholder="Especifique bloques, parcelas, ubicaciones exactas y uso destinado del biochar (cultivos específicos, mejora de suelos, etc.)"
                            rows={3}
                            className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 resize-none"
                          />
                          <VoiceToText 
                            onTextExtracted={handleVoiceText}
                            isLoading={false}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Información del Cliente */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20 relative z-50">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center drop-shadow">
                      🏢 Información del Cliente
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                      <div className="relative z-[100]">
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">
                          Cliente * {isNewClient && <span className="text-green-400 text-xs">(Nuevo Cliente)</span>}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            name="cliente"
                            value={formData.cliente}
                            onChange={(e) => {
                              const inputValue = e.target.value;
                              
                              // Actualizar formData.cliente con lo que está escribiendo
                              setFormData(prev => {
                                const clienteExistente = clientesExistentes.find(c => c.nombre === inputValue);
                                return {
                                  ...prev, 
                                  cliente: inputValue,
                                  // Si es un cliente existente, usar su NIT; si no y es campo vacío limpiar NIT, sino mantener
                                  nitCcCliente: clienteExistente ? clienteExistente.nit : 
                                    (inputValue === '' ? '' : prev.nitCcCliente)
                                };
                              });
                              
                              // Si el usuario está escribiendo, habilitar dropdown y mostrarlo
                              if (inputValue.length > 0) {
                                setAllowAutoDropdown(true);
                                setShowClienteDropdown(true);
                                
                                // Determinar si es nuevo cliente
                                const clienteExistente = clientesExistentes.find(c => c.nombre === inputValue);
                                setIsNewClient(!clienteExistente);
                              } else {
                                // Campo vacío - no cambiar estado isNewClient si ya está como nuevo cliente
                                if (!isNewClient) {
                                  setShowClienteDropdown(false);
                                }
                              }
                            }}
                            onFocus={() => {
                              // Solo abrir dropdown si está permitido Y el campo no está vacío para nuevo cliente
                              if (allowAutoDropdown && !(isNewClient && formData.cliente === '')) {
                                setShowClienteDropdown(true);
                              }
                            }}
                            placeholder={isNewClient ? "Escriba el nombre del nuevo cliente" : "Buscar cliente existente o escribir nuevo"}
                            required
                            className={`w-full px-4 py-3 pr-12 border rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 transition-all duration-200 ${
                              fieldErrors.includes('Cliente') 
                                ? 'border-red-400 focus:ring-red-400/50 bg-red-900/20' 
                                : isNewClient 
                                ? 'bg-green-900/20 border-green-400/50 focus:ring-green-400/50 focus:border-green-400/50' 
                                : 'bg-white/10 border-white/30 focus:ring-blue-400/50 focus:border-blue-400/50'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowClienteDropdown(!showClienteDropdown)}
                            className={`absolute right-3 top-1/2 transform -translate-y-1/2 text-white/70 hover:text-white transition-all duration-200 ${
                              showClienteDropdown ? 'rotate-180' : ''
                            }`}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M7 10l5 5 5-5z"/>
                            </svg>
                          </button>
                          
                          {/* Dropdown de clientes */}
                          {showClienteDropdown && (
                            <>
                              {/* Overlay sutil */}
                              <div className="fixed inset-0 z-[999]" onClick={() => setShowClienteDropdown(false)} />
                              
                              <div className="absolute z-[1000] w-full mt-1 bg-gray-900/98 backdrop-blur-xl border border-white/50 rounded-lg shadow-[0_20px_25px_-5px_rgba(0,0,0,0.8)] max-h-60 overflow-y-auto" style={{position: 'absolute', top: '100%', left: 0, right: 0}}>
                              {/* Opción nuevo cliente */}
                              <button
                                type="button"
                                onClick={() => handleClienteSelect(null)}
                                className="w-full px-4 py-3 text-left text-white hover:bg-gradient-to-r hover:from-green-600/20 hover:to-green-500/20 border-b border-white/20 flex items-center transition-all duration-200 group"
                              >
                                <span className="mr-3 text-green-400 group-hover:scale-110 transition-transform">➕</span>
                                <div className="flex-1">
                                  <div className="font-semibold text-green-400">Nuevo Cliente</div>
                                  <div className="text-xs text-white/70">Crear un cliente nuevo</div>
                                </div>
                              </button>
                              
                              {/* Opción recargar clientes */}
                              {!loadingClientes && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    fetchClientesExistentes();
                                    setShowClienteDropdown(false);
                                  }}
                                  className="w-full px-4 py-3 text-left text-white hover:bg-gradient-to-r hover:from-blue-600/20 hover:to-blue-500/20 border-b border-white/20 flex items-center transition-all duration-200 group"
                                >
                                  <span className="mr-3 text-blue-400 group-hover:scale-110 transition-transform">🔄</span>
                                  <div className="flex-1">
                                    <div className="font-semibold text-blue-400">Recargar Clientes</div>
                                    <div className="text-xs text-white/70">Actualizar lista desde base de datos</div>
                                  </div>
                                </button>
                              )}
                              
                              {/* Indicador de carga */}
                              {loadingClientes && (
                                <div className="px-4 py-6 text-center">
                                  <div className="text-white/60 text-sm">
                                    <div className="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full mr-2"></div>
                                    Cargando clientes...
                                  </div>
                                </div>
                              )}
                              
                              {/* Clientes existentes filtrados */}
                              {!loadingClientes && clientesFiltrados.map((cliente, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => handleClienteSelect(cliente)}
                                  className="w-full px-4 py-3 text-left text-white hover:bg-white/15 border-b border-white/10 last:border-b-0 transition-all duration-200 group"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium group-hover:text-blue-300 transition-colors">{cliente.nombre}</div>
                                      <div className="text-xs text-white/60">NIT: {cliente.nit}</div>
                                    </div>
                                    <div className="text-white/40 group-hover:text-white/70 ml-2">
                                      →
                                    </div>
                                  </div>
                                </button>
                              ))}
                              
                              {/* Mensaje cuando no hay clientes en la base de datos */}
                              {!loadingClientes && clientesExistentes.length === 0 && !formData.cliente && (
                                <div className="px-4 py-6 text-center">
                                  <div className="text-white/40 text-4xl mb-2">📊</div>
                                  <div className="text-white/60 text-sm font-medium mb-1">No hay clientes registrados</div>
                                  <div className="text-white/40 text-xs">Será el primer cliente en el sistema</div>
                                </div>
                              )}
                              
                              {/* Mensaje cuando no hay resultados de búsqueda */}
                              {!loadingClientes && clientesFiltrados.length === 0 && formData.cliente && clientesExistentes.length > 0 && (
                                <div className="px-4 py-6 text-center">
                                  <div className="text-white/40 text-4xl mb-2">🔍</div>
                                  <div className="text-white/60 text-sm font-medium mb-1">No se encontraron clientes</div>
                                  <div className="text-white/40 text-xs">Escriba el nombre del nuevo cliente</div>
                                </div>
                              )}
                            </div>
                          </>
                          )}
                        </div>
                        {fieldErrors.includes('Cliente') && (
                          <p className="text-red-400 text-xs mt-1">Este campo es requerido</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">NIT/CC Cliente *</label>
                        <input
                          type="text"
                          name="nitCcCliente"
                          value={formData.nitCcCliente}
                          onChange={handleInputChange}
                          placeholder="NIT o Cédula del cliente"
                          required
                          readOnly={!isNewClient && !!clientesExistentes.find(c => c.nombre === formData.cliente)}
                          className={`w-full px-4 py-3 border rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 ${
                            fieldErrors.includes('NIT/CC del Cliente')
                              ? 'border-red-400 focus:ring-red-400/50 bg-red-900/20'
                              : (!isNewClient && clientesExistentes.find(c => c.nombre === formData.cliente))
                              ? 'bg-white/5 cursor-not-allowed border-white/30'
                              : 'bg-white/10 border-white/30'
                          }`}
                        />
                        {fieldErrors.includes('NIT/CC del Cliente') && (
                          <p className="text-red-400 text-xs mt-1">Este campo es requerido</p>
                        )}
                        {!fieldErrors.includes('NIT/CC del Cliente') && !isNewClient && clientesExistentes.find(c => c.nombre === formData.cliente) && (
                          <p className="text-xs text-white/60 mt-1 drop-shadow">
                            NIT precargado automáticamente
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Baches Pirólisis */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20 relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white flex items-center drop-shadow">
                        🗂️ Baches Pirólisis
                      </h3>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAgregarBache}
                          disabled={loadingBaches}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
                        >
                          <span>+</span>
                          Agregar Bache
                        </button>
                        <button
                          type="button"
                          onClick={fetchBachesDisponibles}
                          disabled={loadingBaches}
                          className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 text-sm"
                        >
                          🔄 Recargar
                        </button>
                      </div>
                    </div>
                    
                    {formData.bachesSeleccionados.length === 0 ? (
                      <div className="text-white/70 text-center py-4">
                        No hay baches seleccionados. Haga clic en "Agregar Bache" para comenzar.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {formData.bachesSeleccionados.map((bacheSeleccionado, index) => (
                          <div key={index} className="bg-white/5 p-4 rounded-lg border border-white/10">
                            <div className="flex items-center justify-between mb-3">
                              <label className="text-sm font-medium text-white/90 drop-shadow">
                                Bache {index + 1}
                              </label>
                              <button
                                type="button"
                                onClick={() => handleRemoverBache(index)}
                                className="text-red-400 hover:text-red-300 transition-colors duration-200"
                              >
                                ❌ Remover
                              </button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Selector de Bache */}
                              <div>
                                <label className="block text-xs font-medium text-white/80 mb-1">Seleccionar Bache</label>
                                <select
                                  value={bacheSeleccionado.bacheId}
                                  onChange={(e) => handleBacheChange(index, 'bacheId', e.target.value)}
                                  disabled={loadingBaches}
                                  className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50"
                                >
                                  <option value="" className="bg-gray-800">
                                    {loadingBaches ? 'Cargando...' : 'Seleccione un bache'}
                                  </option>
                                  {bachesDisponibles
                                    .filter(bache => 
                                      !formData.bachesSeleccionados.some((bs, i) => 
                                        i !== index && bs.bacheId === bache.id
                                      )
                                    )
                                    .map((bache) => (
                                      <option key={bache.id} value={bache.id} className="bg-gray-800">
                                        {bache.codigo} - {Math.round(bache.cantidadDisponible)} KG disponibles
                                      </option>
                                    ))}
                                </select>
                              </div>
                              
                              {/* Input de Cantidad */}
                              <div>
                                <label className="block text-xs font-medium text-white/80 mb-1">
                                  Cantidad a Sacar (KG)
                                  {bacheSeleccionado.cantidadDisponible > 0 && (
                                    <span className="text-white/60"> - Disponible: {Math.round(bacheSeleccionado.cantidadDisponible)} KG</span>
                                  )}
                                </label>
                                <input
                                  type="number"
                                  value={bacheSeleccionado.cantidadSolicitada || ''}
                                  onChange={(e) => handleBacheChange(index, 'cantidadSolicitada', e.target.value)}
                                  placeholder="Ej: 100"
                                  min="1"
                                  max={Math.round(bacheSeleccionado.cantidadDisponible)}
                                  step="1"
                                  disabled={!bacheSeleccionado.bacheId}
                                  className={`w-full px-3 py-2 bg-white/10 border ${
                                    bacheSeleccionado.cantidadSolicitada > bacheSeleccionado.cantidadDisponible 
                                      ? 'border-red-500' 
                                      : 'border-white/30'
                                  } rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed`}
                                />
                                {bacheSeleccionado.cantidadSolicitada > bacheSeleccionado.cantidadDisponible && (
                                  <div className="mt-1 text-xs text-red-400">
                                    ⚠️ La cantidad excede lo disponible ({Math.round(bacheSeleccionado.cantidadDisponible)} KG)
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {bacheSeleccionado.bacheId && bacheSeleccionado.codigoBache && (
                              <div className="mt-2 text-xs text-white/70">
                                <span className="font-medium">{bacheSeleccionado.codigoBache}</span>
                                {bacheSeleccionado.cantidadSolicitada > 0 && (
                                  <span> - Solicitando: {Math.round(bacheSeleccionado.cantidadSolicitada)} KG</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {/* Resumen Total */}
                        <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-500/30">
                          <div className="text-sm font-medium text-white/90">
                            Resumen: {formData.bachesSeleccionados.length} bache(s) seleccionado(s)
                          </div>
                          <div className="text-xs text-white/70 mt-1">
                            Total a sacar: {Math.round(formData.bachesSeleccionados.reduce((total, bache) => total + (bache.cantidadSolicitada || 0), 0))} KG
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botones de Acción */}
                  {/* Mensajes de error y éxito */}
                  {submitError && (
                    <div className="bg-red-500/20 border border-red-400/50 text-red-200 p-4 rounded-lg mb-4">
                      <div className="flex items-center">
                        <span className="text-red-400 mr-2">❌</span>
                        <div>
                          <div className="font-semibold">Error al generar remisión</div>
                          <div className="text-sm text-red-300">{submitError}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {submitSuccess && (
                    <div className="bg-green-500/20 border border-green-400/50 text-green-200 p-4 rounded-lg mb-4">
                      <div className="flex items-center">
                        <span className="text-green-400 mr-2">✅</span>
                        <div>
                          <div className="font-semibold">¡Remisión generada exitosamente!</div>
                          <div className="text-sm text-green-300">La remisión se ha registrado correctamente en el sistema.</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowNuevaRemisionForm(false);
                        setSubmitError(null);
                        setSubmitSuccess(false);
                      }}
                      className="flex-1 bg-gray-500/20 border border-gray-400/50 text-gray-200 py-3 px-6 rounded-lg font-semibold transition-all duration-300 hover:bg-gray-500/30"
                      disabled={isSubmitting}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg ${
                        isSubmitting
                          ? 'bg-gray-500/50 cursor-not-allowed text-gray-300'
                          : submitSuccess
                          ? 'bg-gradient-to-r from-green-600 to-green-500 text-white hover:shadow-green-500/30'
                          : 'bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white hover:shadow-[#5A7836]/30'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full mr-2"></div>
                          Generando Remisión...
                        </>
                      ) : submitSuccess ? (
                        '✅ Remisión Generada'
                      ) : (
                        '📋 Generar Remisión'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Lista de Remisiones */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white drop-shadow-lg">Lista de Remisiones</h2>
                <div className="text-sm text-white/80">
                  {loadingRemisiones ? 'Cargando...' : `${remisionesFiltradas.length} de ${remisiones.length} remisiones`}
                </div>
              </div>

              {loadingRemisiones ? (
                <div className="text-center text-white/70 py-12">
                  <div className="animate-spin inline-block w-8 h-8 border-4 border-white/20 border-t-white rounded-full mb-4"></div>
                  <p>Cargando remisiones...</p>
                </div>
              ) : remisiones.length === 0 ? (
                <div className="text-center text-white/70 py-12">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-xl font-semibold mb-2">No hay remisiones registradas</h3>
                  <p className="text-sm">Las remisiones de clientes aparecerán aquí una vez que sean creadas.</p>
                  <button 
                    onClick={() => setShowNuevaRemisionForm(true)}
                    className="mt-4 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white py-2 px-6 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-[#5A7836]/30"
                  >
                    Crear Primera Remisión
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {remisionesFiltradas.map((remision, index) => {
                    const fields = remision.fields || {};
                    const { estado, color } = determinarEstado(remision);
                    
                    return (
                      <div key={remision.id || index} className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 hover:bg-white/15 transition-colors duration-200">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-lg font-semibold text-white">
                                #{fields['ID Numerico'] || fields[config.airtable.remisionesBachesFields.idNumerico!] || 'N/A'}
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${color}`}>
                                {estado}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                              <div className="text-white/90">
                                <span className="text-white/60">Cliente:</span>
                                <div className="font-medium">{fields['Cliente'] || fields[config.airtable.remisionesBachesFields.cliente!] || 'No especificado'}</div>
                              </div>
                              <div className="text-white/90">
                                <span className="text-white/60">NIT/CC:</span>
                                <div className="font-medium">{fields['NIT/CC Cliente'] || fields[config.airtable.remisionesBachesFields.nitCliente!] || 'No especificado'}</div>
                              </div>
                              <div className="text-white/90">
                                <span className="text-white/60">Fecha Evento:</span>
                                <div className="font-medium">{formatearFecha(fields['Fecha Evento'] || fields[config.airtable.remisionesBachesFields.fechaEvento!])}</div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mt-2">
                              <div className="text-white/90">
                                <span className="text-white/60">Registrado por:</span>
                                <div className="font-medium">{fields['Realiza Registro'] || fields[config.airtable.remisionesBachesFields.realizaRegistro!] || 'No especificado'}</div>
                              </div>
                              <div className="text-white/90">
                                <span className="text-white/60">ID:</span>
                                <div className="font-medium">{fields[config.airtable.remisionesBachesFields.id!] || 'N/A'}</div>
                              </div>
                            </div>
                            
                            {(fields['Observaciones'] || fields[config.airtable.remisionesBachesFields.observaciones!]) && (
                              <div className="text-white/90 mt-2">
                                <span className="text-white/60">Observaciones:</span>
                                <div className="text-sm bg-white/5 p-2 rounded mt-1">
                                  {fields['Observaciones'] || fields[config.airtable.remisionesBachesFields.observaciones!]}
                                </div>
                              </div>
                            )}
                            
                            {/* Información de Entrega y Recepción */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-white/20">
                              <div>
                                <div className="text-xs text-white/60 mb-1">📤 ENTREGA</div>
                                <div className="text-sm text-white/90">
                                  <div><span className="text-white/60">Responsable:</span> {fields['Responsable Entrega'] || fields[config.airtable.remisionesBachesFields.responsableEntrega!] || 'Pendiente'}</div>
                                  <div><span className="text-white/60">Documento:</span> {fields['Numero Documento Entrega'] || fields[config.airtable.remisionesBachesFields.numeroDocumentoEntrega!] || 'No especificado'}</div>
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-white/60 mb-1">📥 RECEPCIÓN</div>
                                <div className="text-sm text-white/90">
                                  <div><span className="text-white/60">Responsable:</span> {fields['Responsable Recibe'] || fields[config.airtable.remisionesBachesFields.responsableRecibe!] || 'Pendiente'}</div>
                                  <div><span className="text-white/60">Documento:</span> {fields['Numero Documento Recibe'] || fields[config.airtable.remisionesBachesFields.numeroDocumentoRecibe!] || 'No especificado'}</div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Baches vinculados */}
                            {(() => {
                              const bachesField = fields['Bache Pirolisis Alterado'] || (config.airtable.remisionesBachesFields.bachePirolisisAlterado && fields[config.airtable.remisionesBachesFields.bachePirolisisAlterado]);
                              const hasBaches = bachesField && Array.isArray(bachesField) && bachesField.length > 0;
                              return hasBaches && (
                                <div className="mt-3 pt-3 border-t border-white/20">
                                  <div className="text-xs text-white/60 mb-2">🗂️ BACHES VINCULADOS</div>
                                  <div className="text-sm text-white/90">
                                    {bachesField.length} bache(s) asociado(s)
                                  </div>
                                </div>
                              );
                            })()}
                            
                            {/* Documentos adjuntos */}
                            <div className="flex flex-wrap gap-2 mt-3">
                              {(fields['Documento Remisión'] || fields[config.airtable.remisionesBachesFields.documentoRemision!]) && (
                                <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs">
                                  📄 Documento Remisión
                                </span>
                              )}
                              {(fields['QR Documento Remisión'] || fields[config.airtable.remisionesBachesFields.qrDocumento!]) && (
                                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                                  🔗 QR Documento
                                </span>
                              )}
                              {(fields['Firma Entrega'] || fields[config.airtable.remisionesBachesFields.firmaEntrega!]) && (
                                <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs">
                                  ✍️ Firma Entrega
                                </span>
                              )}
                              {(fields['Firma Recibe'] || fields[config.airtable.remisionesBachesFields.firmaRecibe!]) && (
                                <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
                                  ✍️ Firma Recepción
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 min-w-[120px]">
                            <button className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors duration-200">
                              👁️ Ver Detalles
                            </button>
                            <button className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors duration-200">
                              📄 Generar PDF
                            </button>
                            <button 
                              onClick={() => generateEntregaQR(remision.id)}
                              disabled={generatingQR === `entrega-${remision.id}`}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition-colors duration-200"
                            >
                              {generatingQR === `entrega-${remision.id}` ? '⏳' : '📦'} QR Entrega
                            </button>
                            <button 
                              onClick={() => generateRecepcionQR(remision.id)}
                              disabled={generatingQR === `recepcion-${remision.id}`}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition-colors duration-200"
                            >
                              {generatingQR === `recepcion-${remision.id}` ? '⏳' : '📥'} QR Recepción
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
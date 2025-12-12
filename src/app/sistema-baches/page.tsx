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
  const { data, loading, error, getLatestBache, calculateProgress, getBacheStatus, getBacheId, getDateValue, getTotalBiochar, getBiocharVendido, refetch } = useBaches();

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
    referenciaLaboratorio: '',
    resultadosLaboratorio: '',
    observaciones: '',
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
      masaSecaDM: '',
      referenciaLaboratorio: '',
      resultadosLaboratorio: '',
      observaciones: '',
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
      referenciaLaboratorio: '',
      resultadosLaboratorio: '',
      observaciones: '',
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

  const handleMonitoreoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setMonitoreoForm(prev => ({
      ...prev,
      [name]: value
    }));

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
        await loadLaboratorios();
      }

      const monitoreoData = {
        records: [{
          fields: {
            'ID BigBag': monitoreoForm.idBigBag,
            '% Humedad (MC)': monitoreoForm.humedadMC,
            'Masa Seca (DM kg)': monitoreoForm.masaSecaDM,
            'No. Referencia Laboratorio': monitoreoForm.referenciaLaboratorio,
            'Resultados Laboratorio': monitoreoForm.resultadosLaboratorio,
            'Observaciones': monitoreoForm.observaciones,
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
                  <span className="drop-shadow">Total Biochar Producido:</span>
                  <span className="font-semibold">{totalBiochar} kg</span>
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
                    <h3 className="text-xl font-semibold text-white mb-4 drop-shadow-lg flex items-center">
                      <span className={`w-4 h-4 rounded-full mr-3 ${
                        categoria === 'En Proceso' ? 'bg-blue-400' :
                        categoria === 'Completos Planta' ? 'bg-green-400' :
                        categoria === 'Completos Bodega' ? 'bg-emerald-400' :
                        categoria === 'Agotados' ? 'bg-red-400' : 'bg-yellow-400'
                      }`}></span>
                      {categoria} ({baches.length})
                    </h3>
                    
                    {baches.length === 0 ? (
                      <div className="text-center text-white/70 py-8">
                        <p>No hay baches en esta categoría</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {baches.map((bache) => (
                          <div key={bache.id} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-all duration-200">
                            <div className="mb-3">
                              <h4 className="font-bold text-white text-lg drop-shadow">{getBacheId(bache)}</h4>
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
                            
                            {(categoria === 'Completos Planta' || categoria === 'Completos Bodega') && (
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => openMonitoreoModal(bache)}
                                  className="flex-1 bg-[#5A7836]/80 hover:bg-[#5A7836] text-white py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200"
                                >
                                  📊 Registrar Monitoreo
                                </button>
                                {categoria === 'Completos Planta' && (
                                  <button
                                    onClick={() => handlePasarABodega(bache)}
                                    disabled={updatingBacheId === bache.id}
                                    className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {updatingBacheId === bache.id ? (
                                      <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto"></div>
                                        <span className="ml-1">Moviendo...</span>
                                      </>
                                    ) : (
                                      '📦 Pasar a Bodega'
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
                    <textarea
                      name="humedadMC"
                      value={monitoreoForm.humedadMC}
                      onChange={handleMonitoreoInputChange}
                      rows={3}
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                      placeholder="Porcentaje de humedad"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Masa Seca (DM kg)
                    </label>
                    <textarea
                      name="masaSecaDM"
                      value={monitoreoForm.masaSecaDM}
                      onChange={handleMonitoreoInputChange}
                      rows={3}
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                      placeholder="Masa seca en kg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    No. Referencia Laboratorio
                  </label>
                  <textarea
                    name="referenciaLaboratorio"
                    value={monitoreoForm.referenciaLaboratorio}
                    onChange={handleMonitoreoInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Número de referencia del laboratorio"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Resultados Laboratorio
                  </label>
                  <textarea
                    name="resultadosLaboratorio"
                    value={monitoreoForm.resultadosLaboratorio}
                    onChange={handleMonitoreoInputChange}
                    rows={3}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Resultados del laboratorio"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Observaciones
                  </label>
                  <textarea
                    name="observaciones"
                    value={monitoreoForm.observaciones}
                    onChange={handleMonitoreoInputChange}
                    rows={3}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Observaciones adicionales"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Laboratorio
                  </label>
                  <select
                    name="laboratorio"
                    value={monitoreoForm.laboratorio}
                    onChange={handleMonitoreoInputChange}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                    disabled={loadingLaboratorios}
                  >
                    <option value="">
                      {loadingLaboratorios ? 'Cargando laboratorios...' : 'Seleccionar laboratorio (opcional)'}
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

        <Footer />
      </div>
    </div>
  );
}

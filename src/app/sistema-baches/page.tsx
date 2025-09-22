"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useBaches } from '@/lib/useBaches';
import { useState, useMemo } from 'react';

export default function SistemaBaches() {
  return (
    <TurnoProtection requiresTurno={true}>
      <SistemaBachesContent />
    </TurnoProtection>
  );
}

function SistemaBachesContent() {
  const { data, loading, error, getLatestBache, calculateProgress, getBacheStatus, getBacheId, getNumericValue, getDateValue, getTotalBiochar, getBiocharVendido } = useBaches();

  // State for search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [fechaFilter, setFechaFilter] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('Todos');

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

  if (loading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat relative" style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
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
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
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
  const bachesActivos = data?.records?.filter(b => getBacheStatus(b) !== 'Completado').length || 0;
  const bachesCompletados = totalBaches - bachesActivos;
  const totalBiochar = data?.records?.reduce((sum, b) => sum + getTotalBiochar(b), 0) || 0;

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
                      getBacheStatus(latestBache) === 'Completado'
                        ? 'bg-green-500/20 text-green-200'
                        : getBacheStatus(latestBache) === 'En Progreso'
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
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="text-center">
                      <div className="text-sm drop-shadow">Total</div>
                      <div className="font-bold">{getTotalBiochar(latestBache)} kg</div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm drop-shadow">Vendido</div>
                      <div className="font-bold">{getBiocharVendido(latestBache)} kg</div>
                    </div>
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
                                getBacheStatus(bache) === 'Bache Agotado' ? 'bg-red-500/20 text-red-200' :
                                getBacheStatus(bache) === 'Bache Completo Planta' || getBacheStatus(bache) === 'Bache Completo Bodega' ? 'bg-green-500/20 text-green-200' :
                                getBacheStatus(bache) === 'Bache en proceso' ? 'bg-blue-500/20 text-blue-200' : 'bg-yellow-500/20 text-yellow-200'
                              }`}>
                                {getBacheStatus(bache)}
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
                            
                            <div className="flex gap-2">
                              <button className="flex-1 bg-[#5A7836]/80 hover:bg-[#5A7836] text-white py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200">
                                Ver Detalle
                              </button>
                              <button className="flex-1 bg-white/20 hover:bg-white/30 text-white py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 border border-white/30">
                                Editar
                              </button>
                            </div>
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
        <Footer />
      </div>
    </div>
  );
}

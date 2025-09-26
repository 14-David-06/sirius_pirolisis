"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import VoiceToText from '@/components/VoiceToText';
import { useInventario } from '@/lib/useInventario';

interface MantenimientoFormData {
  tipoMantenimiento: string;
  descripcion: string;
  equipo: string;
  prioridad: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  insumosUtilizados: { id: string; cantidad: number }[];
}

export default function Mantenimientos() {
  return (
    <TurnoProtection requiresTurno={true}>
      <MantenimientosContent />
    </TurnoProtection>
  );
}

function MantenimientosContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [mantenimientos] = useState<any[]>([]);
  const [equipos, setEquipos] = useState<any[]>([]);
  const router = useRouter();
  const { data: inventarioData, loading: inventarioLoading, error: inventarioError } = useInventario();

  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<MantenimientoFormData>({
    tipoMantenimiento: '',
    descripcion: '',
    equipo: '',
    prioridad: 'Media',
    insumosUtilizados: []
  });

  useEffect(() => {
    const userSession = localStorage.getItem('userSession');
    if (!userSession) {
      router.push('/login');
      return;
    }

    try {
      JSON.parse(userSession);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Error parsing session:', error);
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (isAuthenticated) {
      const fetchEquipos = async () => {
        try {
          const response = await fetch('/api/equipos/list');
          if (response.ok) {
            const data = await response.json();
            setEquipos(data.equipos);
          } else {
            console.error('Error fetching equipos');
          }
        } catch (error) {
          console.error('Error fetching equipos:', error);
        }
      };
      fetchEquipos();
    }
  }, [isAuthenticated]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleInsumoCantidadChange = (insumoId: string, cantidad: number) => {
    setFormData(prev => ({
      ...prev,
      insumosUtilizados: prev.insumosUtilizados.map(item =>
        item.id === insumoId ? { ...item, cantidad } : item
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMensaje('');

    try {
      // Obtener información del usuario actual
      const userSession = localStorage.getItem('userSession');
      const sessionData = JSON.parse(userSession || '{}');
      const userName = sessionData.user?.name || 'Usuario desconocido';

      // Aquí irá la lógica del backend cuando esté listo
      console.log('Datos del mantenimiento:', formData);

      // Simulación de guardado exitoso
      setMensaje('✅ Mantenimiento registrado exitosamente');

      // Registrar salidas de insumos utilizados
      if (formData.insumosUtilizados.length > 0) {
        for (const insumo of formData.insumosUtilizados) {
          try {
            const response = await fetch('/api/inventario/remove-quantity', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                itemId: insumo.id,
                cantidad: insumo.cantidad,
                tipoSalida: 'Mantenimiento',
                observaciones: `Utilizado en mantenimiento: ${formData.descripcion}`,
                'Realiza Registro': userName
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              console.error('Error al registrar salida del insumo:', insumo.id, errorData);
              setMensaje(prev => prev + `\n⚠️ Error al registrar salida del insumo ${insumo.id}: ${errorData.error}`);
            } else {
              console.log('Salida registrada para insumo:', insumo.id);
            }
          } catch (error) {
            console.error('Error al procesar salida del insumo:', insumo.id, error);
            setMensaje(prev => prev + `\n⚠️ Error al procesar salida del insumo ${insumo.id}`);
          }
        }
      }

      // Limpiar formulario
      setFormData({
        tipoMantenimiento: '',
        descripcion: '',
        equipo: '',
        prioridad: 'Media',
        insumosUtilizados: []
      });

      // Aquí se actualizaría la lista de mantenimientos
      // setMantenimientos(prev => [...prev, nuevoMantenimiento]);

    } catch (error) {
      console.error('Error al registrar mantenimiento:', error);
      setMensaje('❌ Error al registrar el mantenimiento');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[#5A7836]"></div>
      </div>
    );
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
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <h1 className="text-4xl font-bold text-white mb-2 text-center drop-shadow-lg flex items-center justify-center">
              <span className="text-5xl mr-4">🔧</span>
              Sistema de Mantenimientos
            </h1>
            <p className="text-center text-white/90 mb-8 drop-shadow text-lg">
              Registra y gestiona todos los mantenimientos del sistema de pirolisis
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Formulario de registro */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center drop-shadow">
                  <span className="text-3xl mr-3">📝</span>
                  Registrar Nuevo Mantenimiento
                </h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Equipo/Sistema *
                    </label>
                    <select
                      name="equipo"
                      value={formData.equipo}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                    >
                      <option value="">Seleccionar equipo</option>
                      {equipos.map((equipo) => (
                        <option key={equipo.id} value={equipo.nombre}>
                          {equipo.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                        Tipo de Mantenimiento *
                      </label>
                      <select
                        name="tipoMantenimiento"
                        value={formData.tipoMantenimiento}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                      >
                        <option value="">Seleccionar tipo</option>
                        <option value="Preventivo">Preventivo</option>
                        <option value="Correctivo">Correctivo</option>
                        <option value="Predictivo">Predictivo</option>
                        <option value="Condicional">Condicional</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                        Prioridad *
                      </label>
                      <select
                        name="prioridad"
                        value={formData.prioridad}
                        onChange={handleInputChange}
                        required
                        className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                      >
                        <option value="Baja">Baja</option>
                        <option value="Media">Media</option>
                        <option value="Alta">Alta</option>
                        <option value="Urgente">Urgente</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Descripción del Mantenimiento *
                    </label>
                    <div className="relative">
                      <textarea
                        name="descripcion"
                        value={formData.descripcion}
                        onChange={handleInputChange}
                        placeholder="Describe detalladamente el mantenimiento a realizar..."
                        required
                        rows={4}
                        className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 resize-none text-gray-800 placeholder-gray-500"
                      />
                      <VoiceToText
                        onTextExtracted={(text) => {
                          setFormData(prev => ({
                            ...prev,
                            descripcion: prev.descripcion ? prev.descripcion + ' ' + text : text
                          }));
                        }}
                        isLoading={isLoading}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Insumos Utilizados (Opcional)
                    </label>
                    <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/20">
                      {inventarioLoading ? (
                        <div className="text-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
                          <p className="text-white/80 text-sm mt-2">Cargando inventario...</p>
                        </div>
                      ) : inventarioError ? (
                        <p className="text-red-300 text-sm">Error al cargar inventario: {inventarioError}</p>
                      ) : (
                        <div className="space-y-4">
                          {/* Lista de insumos seleccionados */}
                          {formData.insumosUtilizados.map((insumo) => {
                            const record = inventarioData?.records.find(r => r.id === insumo.id);
                            const insumoNombre = record?.fields.Insumo || 'Sin nombre';
                            const stock = record?.fields['Total Cantidad Stock'] || 0;
                            const presentacion = record?.fields['Presentacion Insumo'] || 'Unidades';

                            return (
                              <div key={insumo.id} className="flex items-center space-x-3 bg-white/10 p-3 rounded-lg">
                                <div className="flex-1">
                                  <p className="text-white font-medium text-sm">{insumoNombre}</p>
                                  <p className="text-white/70 text-xs">Stock disponible: {stock} {presentacion}</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <div className="flex flex-col">
                                    <label className="text-white/80 text-xs mb-1">Cantidad a utilizar</label>
                                    <input
                                      type="number"
                                      min="1"
                                      max={stock}
                                      value={insumo.cantidad}
                                      onChange={(e) => handleInsumoCantidadChange(insumo.id, parseInt(e.target.value) || 1)}
                                      className="w-20 px-2 py-1 bg-white/90 border border-white/30 rounded text-gray-800 text-sm"
                                      placeholder="Cant."
                                    />
                                    <span className="text-white/60 text-xs mt-1">Máx: {stock}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormData(prev => ({
                                        ...prev,
                                        insumosUtilizados: prev.insumosUtilizados.filter(item => item.id !== insumo.id)
                                      }));
                                    }}
                                    className="text-red-300 hover:text-red-100 text-sm px-2 py-1 rounded hover:bg-red-500/20"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Selector de nuevo insumo con búsqueda */}
                          <div className="border-t border-white/20 pt-4">
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Buscar insumo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-3 py-2 bg-white/90 border border-white/30 rounded text-gray-800 text-sm focus:ring-1 focus:ring-green-400"
                              />
                              <div className="absolute right-2 top-2 text-white/60 text-xs">
                                🔍
                              </div>
                            </div>
                            <div className="mt-2 max-h-40 overflow-y-auto">
                              {inventarioData?.records
                                .filter(record => !formData.insumosUtilizados.some(item => item.id === record.id))
                                .filter(record => 
                                  !searchTerm || 
                                  (record.fields.Insumo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  (record.fields['Presentacion Insumo'] || '').toLowerCase().includes(searchTerm.toLowerCase())
                                )
                                .map((record) => (
                                  <button
                                    key={record.id}
                                    type="button"
                                    onClick={() => {
                                      setFormData(prev => ({
                                        ...prev,
                                        insumosUtilizados: [...prev.insumosUtilizados, { id: record.id, cantidad: 1 }]
                                      }));
                                    }}
                                    className="w-full text-left px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-sm text-white transition-colors mb-1"
                                  >
                                    <div className="font-medium">{record.fields.Insumo || 'Sin nombre'}</div>
                                    <div className="text-xs text-white/70">Stock: {record.fields['Total Cantidad Stock'] || 0} {record.fields['Presentacion Insumo'] || 'unidades'}</div>
                                  </button>
                                ))}
                            </div>
                          </div>

                          {formData.insumosUtilizados.length > 0 && (
                            <p className="text-white/80 text-xs text-center">
                              {formData.insumosUtilizados.length} insumo{formData.insumosUtilizados.length !== 1 ? 's' : ''} seleccionado{formData.insumosUtilizados.length !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-green-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-3 backdrop-blur-sm border border-green-500/30"
                  >
                    {isLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        <span>Registrando...</span>
                      </>
                    ) : (
                      <>
                        <span>🔧</span>
                        <span>Registrar Mantenimiento</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Lista de mantenimientos */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center drop-shadow">
                  <span className="text-3xl mr-3">📋</span>
                  Mantenimientos Registrados
                </h2>

                {mantenimientos.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4 text-white/70">📝</div>
                    <h3 className="text-xl font-semibold text-white mb-2 drop-shadow">
                      No hay mantenimientos registrados
                    </h3>
                    <p className="text-white/80 drop-shadow">
                      Los mantenimientos registrados aparecerán aquí
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {mantenimientos.map((mantenimiento) => (
                      <div key={mantenimiento.id || Math.random()} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-all duration-200">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-white drop-shadow">{mantenimiento.equipo}</h4>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold drop-shadow ${
                            mantenimiento.prioridad === 'Urgente' ? 'bg-red-500/80 text-white' :
                            mantenimiento.prioridad === 'Alta' ? 'bg-orange-500/80 text-white' :
                            mantenimiento.prioridad === 'Media' ? 'bg-yellow-500/80 text-white' :
                            'bg-green-500/80 text-white'
                          }`}>
                            {mantenimiento.prioridad}
                          </span>
                        </div>
                        <p className="text-sm text-white/90 mb-2 drop-shadow">{mantenimiento.descripcion}</p>
                        <div className="flex justify-between text-xs text-white/70 drop-shadow">
                          <span>{mantenimiento.tipoMantenimiento}</span>
                          <span>{mantenimiento.fechaProgramada || 'Sin fecha'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
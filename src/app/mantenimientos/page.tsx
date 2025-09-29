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

interface OtroEquipoFormData {
  nombre: string;
  ubicacion: string;
  funcionPrincipal: string;
  anoInstalacion: number | '' | 'N/A';
  fabricanteModelo: string;
  capacidadOperacional: string;
  tipoInsumoRecibido: string;
  cantidadPromedio: string;
  fuenteInsumos: string;
  medioTransporteInsumo: string;
  observacionesOperativas: string;
  notasAdicionales: string;
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

  const [showOtroEquipoForm, setShowOtroEquipoForm] = useState(false);

  const [categoriaTecnicaNA, setCategoriaTecnicaNA] = useState(false);
  const [categoriaInsumosNA, setCategoriaInsumosNA] = useState(false);
  const [categoriaOperativaNA, setCategoriaOperativaNA] = useState(false);

  const [otroEquipoFormData, setOtroEquipoFormData] = useState<OtroEquipoFormData>({
    nombre: '',
    ubicacion: '',
    funcionPrincipal: '',
    anoInstalacion: '',
    fabricanteModelo: '',
    capacidadOperacional: '',
    tipoInsumoRecibido: '',
    cantidadPromedio: '',
    fuenteInsumos: '',
    medioTransporteInsumo: '',
    observacionesOperativas: '',
    notasAdicionales: ''
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

    if (name === 'equipo') {
      if (value === 'Otro equipo') {
        setShowOtroEquipoForm(true);
      } else {
        setShowOtroEquipoForm(false);
      }
    }
  };

  const handleOtroEquipoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setOtroEquipoFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCategoriaTecnicaNA = (checked: boolean) => {
    setCategoriaTecnicaNA(checked);
    if (checked) {
      setOtroEquipoFormData(prev => ({
        ...prev,
        anoInstalacion: 'N/A',
        fabricanteModelo: 'N/A',
        capacidadOperacional: 'N/A'
      }));
    } else {
      setOtroEquipoFormData(prev => ({
        ...prev,
        anoInstalacion: '',
        fabricanteModelo: '',
        capacidadOperacional: ''
      }));
    }
  };

  const handleCategoriaInsumosNA = (checked: boolean) => {
    setCategoriaInsumosNA(checked);
    if (checked) {
      setOtroEquipoFormData(prev => ({
        ...prev,
        tipoInsumoRecibido: 'N/A',
        cantidadPromedio: 'N/A',
        fuenteInsumos: 'N/A',
        medioTransporteInsumo: 'N/A'
      }));
    } else {
      setOtroEquipoFormData(prev => ({
        ...prev,
        tipoInsumoRecibido: '',
        cantidadPromedio: '',
        fuenteInsumos: '',
        medioTransporteInsumo: ''
      }));
    }
  };

  const handleCategoriaOperativaNA = (checked: boolean) => {
    setCategoriaOperativaNA(checked);
    if (checked) {
      setOtroEquipoFormData(prev => ({
        ...prev,
        observacionesOperativas: 'N/A',
        notasAdicionales: 'N/A'
      }));
    } else {
      setOtroEquipoFormData(prev => ({
        ...prev,
        observacionesOperativas: '',
        notasAdicionales: ''
      }));
    }
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

      // Validar selección de equipo
      if (!formData.equipo) {
        setMensaje('❌ Debe seleccionar un equipo o "Mantenimiento a todos los equipos"');
        setIsLoading(false);
        return;
      }

      let equipoId = null;

      // Si es un equipo existente, buscar su ID
      if (formData.equipo !== 'Mantenimiento a todos los equipos' && formData.equipo !== 'Otro equipo') {
        const equipoSeleccionado = equipos.find(equipo => equipo.nombre === formData.equipo);
        if (equipoSeleccionado) {
          equipoId = equipoSeleccionado.id;
        } else {
          setMensaje('❌ Error: Equipo seleccionado no encontrado');
          setIsLoading(false);
          return;
        }
      }

      // Si es "Otro equipo", crear el equipo primero
      if (formData.equipo === 'Otro equipo') {
        if (!otroEquipoFormData.nombre.trim()) {
          setMensaje('❌ Debe ingresar el nombre del equipo');
          setIsLoading(false);
          return;
        }

        try {
          const createResponse = await fetch('/api/equipos/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...otroEquipoFormData,
              anoInstalacion: otroEquipoFormData.anoInstalacion || null,
              realizaRegistro: userName
            }),
          });

          if (!createResponse.ok) {
            const errorData = await createResponse.json();
            setMensaje(`❌ Error al crear el equipo: ${errorData.error}`);
            setIsLoading(false);
            return;
          }

          const createData = await createResponse.json();
          equipoId = createData.records[0].id; // Asumiendo que devuelve el ID del nuevo registro
          setMensaje('✅ Equipo creado exitosamente. Registrando mantenimiento...');
        } catch (error) {
          console.error('Error creando equipo:', error);
          setMensaje('❌ Error al crear el equipo');
          setIsLoading(false);
          return;
        }
      }

      // Obtener turno activo
      const turnoActivo = localStorage.getItem('turnoActivo');
      let turnoId = null;
      if (turnoActivo) {
        try {
          const turnoData = JSON.parse(turnoActivo);
          turnoId = turnoData.id;
        } catch (error) {
          console.error('Error parsing turno activo:', error);
        }
      }

      // Preparar IDs de insumos
      const insumosIds = formData.insumosUtilizados.map(insumo => insumo.id);

      // Aquí irá la lógica del backend cuando esté listo
      console.log('Datos del mantenimiento:', {
        tipoMantenimiento: formData.tipoMantenimiento,
        descripcion: formData.descripcion,
        prioridad: formData.prioridad,
        realizaRegistro: userName,
        turnoId: turnoId,
        equipoId: equipoId,
        insumosIds: insumosIds
      });

      // Enviar a Airtable
      try {
        const mantenimientoResponse = await fetch('/api/mantenimientos/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tipoMantenimiento: formData.tipoMantenimiento,
            descripcion: formData.descripcion,
            prioridad: formData.prioridad,
            realizaRegistro: userName,
            turnoId: turnoId,
            equipoId: equipoId, // Ahora es el ID real o null
            insumosIds: insumosIds
          }),
        });

        if (!mantenimientoResponse.ok) {
          const errorData = await mantenimientoResponse.json();
          setMensaje(`❌ Error al crear mantenimiento: ${errorData.error}`);
          setIsLoading(false);
          return;
        }

        const mantenimientoData = await mantenimientoResponse.json();
        console.log('Mantenimiento creado:', mantenimientoData);
        setMensaje('✅ Mantenimiento registrado exitosamente');

      } catch (error) {
        console.error('Error creando mantenimiento:', error);
        setMensaje('❌ Error al registrar el mantenimiento');
        setIsLoading(false);
        return;
      }

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

      setOtroEquipoFormData({
        nombre: '',
        ubicacion: '',
        funcionPrincipal: '',
        anoInstalacion: '',
        fabricanteModelo: '',
        capacidadOperacional: '',
        tipoInsumoRecibido: '',
        cantidadPromedio: '',
        fuenteInsumos: '',
        medioTransporteInsumo: '',
        observacionesOperativas: '',
        notasAdicionales: ''
      });

      setShowOtroEquipoForm(false);

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
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-4xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">Sistema de Mantenimientos</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
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

            <div className="w-full">
              {/* Formulario de registro */}
              <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Registrar Nuevo Mantenimiento</h2>

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
                      <option value="Mantenimiento a todos los equipos">Mantenimiento a todos los equipos</option>
                      <option value="Otro equipo">Otro equipo</option>
                      {equipos.map((equipo) => (
                        <option key={equipo.id} value={equipo.nombre}>
                          {equipo.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-lg border border-white/30">
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
                              <div key={insumo.id} className="flex items-center space-x-3 bg-white/20 p-3 rounded-lg">
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
                                    className="w-full text-left px-3 py-2 bg-white/20 hover:bg-white/30 rounded text-sm text-white transition-colors mb-1"
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

                  {showOtroEquipoForm && (
                    <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mt-6">
                      <h3 className="text-lg font-semibold text-white mb-4 drop-shadow-lg">Registrar Nuevo Equipo</h3>

                      {/* Información Básica */}
                      <div className="mb-6">
                        <h4 className="text-lg font-semibold text-white mb-3 drop-shadow">Información Básica</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Nombre del Equipo *
                            </label>
                            <input
                              type="text"
                              name="nombre"
                              value={otroEquipoFormData.nombre}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: Reactor de Pirolisis"
                              required
                              className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Ubicación
                            </label>
                            <input
                              type="text"
                              name="ubicacion"
                              value={otroEquipoFormData.ubicacion}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: Área de proceso principal"
                              className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Función Principal
                            </label>
                            <div className="relative">
                              <textarea
                                name="funcionPrincipal"
                                value={otroEquipoFormData.funcionPrincipal}
                                onChange={handleOtroEquipoInputChange}
                                placeholder="Describa la función que cumple el equipo..."
                                rows={3}
                                className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 resize-none text-gray-800 placeholder-gray-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Información Técnica */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-lg font-semibold text-white drop-shadow">Información Técnica</h4>
                          <label className="flex items-center space-x-2 text-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={categoriaTecnicaNA}
                              onChange={(e) => handleCategoriaTecnicaNA(e.target.checked)}
                              className="w-4 h-4 text-green-600 bg-white/20 border-white/30 rounded focus:ring-green-500 focus:ring-2"
                            />
                            <span className="text-sm font-medium">Omitir</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Año de Instalación
                            </label>
                            <input
                              type="number"
                              name="anoInstalacion"
                              value={otroEquipoFormData.anoInstalacion}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: 2023"
                              min="1900"
                              max={new Date().getFullYear()}
                              disabled={categoriaTecnicaNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 ${categoriaTecnicaNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Fabricante/Modelo
                            </label>
                            <input
                              type="text"
                              name="fabricanteModelo"
                              value={otroEquipoFormData.fabricanteModelo}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: Sirius - Modelo X1"
                              disabled={categoriaTecnicaNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 ${categoriaTecnicaNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Capacidad Operacional
                            </label>
                            <input
                              type="text"
                              name="capacidadOperacional"
                              value={otroEquipoFormData.capacidadOperacional}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: 500 kg/h"
                              disabled={categoriaTecnicaNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 ${categoriaTecnicaNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Información de Insumos */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-lg font-semibold text-white drop-shadow">Información de Insumos</h4>
                          <label className="flex items-center space-x-2 text-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={categoriaInsumosNA}
                              onChange={(e) => handleCategoriaInsumosNA(e.target.checked)}
                              className="w-4 h-4 text-green-600 bg-white/20 border-white/30 rounded focus:ring-green-500 focus:ring-2"
                            />
                            <span className="text-sm font-medium">Omitir</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Tipo de Insumo Recibido
                            </label>
                            <input
                              type="text"
                              name="tipoInsumoRecibido"
                              value={otroEquipoFormData.tipoInsumoRecibido}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: Biomasa seca"
                              disabled={categoriaInsumosNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 ${categoriaInsumosNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Cantidad Promedio (día/mes)
                            </label>
                            <input
                              type="text"
                              name="cantidadPromedio"
                              value={otroEquipoFormData.cantidadPromedio}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: 4 toneladas diarias"
                              disabled={categoriaInsumosNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 ${categoriaInsumosNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Fuente de Insumos
                            </label>
                            <input
                              type="text"
                              name="fuenteInsumos"
                              value={otroEquipoFormData.fuenteInsumos}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: Tolva de recepción"
                              disabled={categoriaInsumosNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 ${categoriaInsumosNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Medio de Transporte del Insumo
                            </label>
                            <input
                              type="text"
                              name="medioTransporteInsumo"
                              value={otroEquipoFormData.medioTransporteInsumo}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Ej: Por gravedad"
                              disabled={categoriaInsumosNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 ${categoriaInsumosNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Información Operativa */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-lg font-semibold text-white drop-shadow">Información Operativa</h4>
                          <label className="flex items-center space-x-2 text-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={categoriaOperativaNA}
                              onChange={(e) => handleCategoriaOperativaNA(e.target.checked)}
                              className="w-4 h-4 text-green-600 bg-white/20 border-white/30 rounded focus:ring-green-500 focus:ring-2"
                            />
                            <span className="text-sm font-medium">Omitir</span>
                          </label>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Observaciones Operativas
                            </label>
                            <div className="relative">
                              <textarea
                                name="observacionesOperativas"
                                value={otroEquipoFormData.observacionesOperativas}
                                onChange={handleOtroEquipoInputChange}
                                placeholder="Notas sobre funcionamiento, riesgos, recomendaciones..."
                                rows={4}
                                disabled={categoriaOperativaNA}
                                className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 resize-none text-gray-800 placeholder-gray-500 ${categoriaOperativaNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                              Notas Adicionales
                            </label>
                            <textarea
                              name="notasAdicionales"
                              value={otroEquipoFormData.notasAdicionales}
                              onChange={handleOtroEquipoInputChange}
                              placeholder="Cualquier información adicional relevante..."
                              rows={3}
                              disabled={categoriaOperativaNA}
                              className={`w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 resize-none text-gray-800 placeholder-gray-500 ${categoriaOperativaNA ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

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
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
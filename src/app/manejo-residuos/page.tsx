'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ManejoResiduosVoiceRecorder from '@/components/ManejoResiduosVoiceRecorder';

interface ManejoResiduosFormData {
  subtiposAprovechables: Array<{subtipo: string, cantidad: string}>;
  subtiposOrganicos: Array<{subtipo: string, cantidad: string}>;
  subtiposPeligrosos: Array<{subtipo: string, cantidad: string}>;
  subtiposNoAprovechables: Array<{subtipo: string, cantidad: string}>;
  entregadoA: string;
  observaciones: string;
}

export default function ManejoResiduos() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
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
        subtiposAprovechables: data.subtiposAprovechables || [],
        subtiposOrganicos: data.subtiposOrganicos || [],
        subtiposPeligrosos: data.subtiposPeligrosos || [],
        subtiposNoAprovechables: data.subtiposNoAprovechables || [],
        entregadoA: data.entregadoA || '',
        observaciones: data.observaciones || ''
      });
    }
  };

  const [formData, setFormData] = useState<ManejoResiduosFormData>({
    subtiposAprovechables: [],
    subtiposOrganicos: [],
    subtiposPeligrosos: [],
    subtiposNoAprovechables: [],
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

  // Auto-ocultar mensajes de éxito después de 5 segundos
  useEffect(() => {
    if (mensaje && mensaje.includes('✅')) {
      console.log('⏰ Iniciando timer para auto-ocultar mensaje de éxito en 5 segundos');
      const timer = setTimeout(() => {
        console.log('⏰ Auto-ocultando mensaje de éxito');
        setMensaje('');
      }, 5000);

      return () => {
        console.log('⏰ Limpiando timer');
        clearTimeout(timer);
      };
    }
  }, [mensaje]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const agregarSubtipo = (categoria: keyof Pick<ManejoResiduosFormData, 'subtiposAprovechables' | 'subtiposOrganicos' | 'subtiposPeligrosos' | 'subtiposNoAprovechables'>) => {
    setFormData(prev => ({
      ...prev,
      [categoria]: [...prev[categoria], { subtipo: '', cantidad: '' }]
    }));
  };

  const actualizarSubtipo = (
    categoria: keyof Pick<ManejoResiduosFormData, 'subtiposAprovechables' | 'subtiposOrganicos' | 'subtiposPeligrosos' | 'subtiposNoAprovechables'>,
    index: number,
    campo: 'subtipo' | 'cantidad',
    valor: string
  ) => {
    setFormData(prev => ({
      ...prev,
      [categoria]: prev[categoria].map((item, i) => 
        i === index ? { ...item, [campo]: valor } : item
      )
    }));
  };

  const eliminarSubtipo = (
    categoria: keyof Pick<ManejoResiduosFormData, 'subtiposAprovechables' | 'subtiposOrganicos' | 'subtiposPeligrosos' | 'subtiposNoAprovechables'>,
    index: number
  ) => {
    setFormData(prev => ({
      ...prev,
      [categoria]: prev[categoria].filter((_, i) => i !== index)
    }));
  };

  const validateForm = () => {
    const hasAtLeastOneSubtipo = [
      'subtiposAprovechables',
      'subtiposOrganicos',
      'subtiposPeligrosos',
      'subtiposNoAprovechables'
    ].some(field => {
      const subtipos = formData[field as keyof ManejoResiduosFormData] as Array<{subtipo: string, cantidad: string}>;
      return subtipos.length > 0 && subtipos.some(subtipo => subtipo.subtipo.trim() && parseFloat(subtipo.cantidad) > 0);
    });

    if (!hasAtLeastOneSubtipo) {
      setMensaje('❌ Debe agregar al menos un subtipo de residuo con su cantidad (mayor a 0) antes de continuar');
      return false;
    }

    if (!formData.entregadoA.trim()) {
      setMensaje('❌ El campo "Entregado a" es obligatorio. Por favor especifique la empresa o entidad destinataria');
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
    setMensaje('⏳ Procesando y guardando datos en Airtable...');

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
          
          realizaRegistro = sessionData.user?.Nombre || 'Usuario desconocido';
        } catch (error) {
          console.error('Error parsing user session:', error);
          realizaRegistro = 'Usuario desconocido';
        }
      }

      // Crear registros individuales para cada subtipo
      const recordsToCreate: Array<{
        Residuo: string;
        'Cantidad Residuo KG': number;
        'Tipo Residuo': string;
        'Entregado a': string;
        'Observaciones': string;
        'Realiza Registro': string;
        'ID_Turno': string;
      }> = [];

      // Procesar subtipos aprovechables
      formData.subtiposAprovechables.forEach(subtipo => {
        if (subtipo.subtipo.trim() && parseFloat(subtipo.cantidad) > 0) {
          recordsToCreate.push({
            Residuo: subtipo.subtipo.trim(),
            'Cantidad Residuo KG': parseFloat(subtipo.cantidad),
            'Tipo Residuo': '♻️ Residuos Aprovechables', // Valor con emoji que existe en Airtable
            'Entregado a': formData.entregadoA.trim(),
            'Observaciones': formData.observaciones.trim(),
            'Realiza Registro': realizaRegistro,
            'ID_Turno': turnoPirolisisId ? turnoPirolisisId : '' // String directo, no array
          });
        }
      });

      // Procesar subtipos orgánicos
      formData.subtiposOrganicos.forEach(subtipo => {
        if (subtipo.subtipo.trim() && parseFloat(subtipo.cantidad) > 0) {
          recordsToCreate.push({
            Residuo: subtipo.subtipo.trim(),
            'Cantidad Residuo KG': parseFloat(subtipo.cantidad),
            'Tipo Residuo': '🥬 Residuos Orgánicos', // Valor con emoji que existe en Airtable
            'Entregado a': formData.entregadoA.trim(),
            'Observaciones': formData.observaciones.trim(),
            'Realiza Registro': realizaRegistro,
            'ID_Turno': turnoPirolisisId ? turnoPirolisisId : '' // String directo, no array
          });
        }
      });

      // Procesar subtipos peligrosos
      formData.subtiposPeligrosos.forEach(subtipo => {
        if (subtipo.subtipo.trim() && parseFloat(subtipo.cantidad) > 0) {
          recordsToCreate.push({
            Residuo: subtipo.subtipo.trim(),
            'Cantidad Residuo KG': parseFloat(subtipo.cantidad),
            'Tipo Residuo': '☢️ Residuos Peligrosos', // Valor con emoji que existe en Airtable
            'Entregado a': formData.entregadoA.trim(),
            'Observaciones': formData.observaciones.trim(),
            'Realiza Registro': realizaRegistro,
            'ID_Turno': turnoPirolisisId ? turnoPirolisisId : '' // String directo, no array
          });
        }
      });

      // Procesar subtipos no aprovechables
      formData.subtiposNoAprovechables.forEach(subtipo => {
        if (subtipo.subtipo.trim() && parseFloat(subtipo.cantidad) > 0) {
          recordsToCreate.push({
            Residuo: subtipo.subtipo.trim(),
            'Cantidad Residuo KG': parseFloat(subtipo.cantidad),
            'Tipo Residuo': '🗑️ Residuos No Aprovechables', // Valor con emoji que existe en Airtable
            'Entregado a': formData.entregadoA.trim(),
            'Observaciones': formData.observaciones.trim(),
            'Realiza Registro': realizaRegistro,
            'ID_Turno': turnoPirolisisId ? turnoPirolisisId : '' // String directo, no array
          });
        }
      });

      // Validar que hay registros para crear
      if (recordsToCreate.length === 0) {
        setMensaje('❌ No hay subtipos válidos para registrar');
        setIsLoading(false);
        return;
      }

      // Validar cada registro
      for (const record of recordsToCreate) {
        if (!record.Residuo || record.Residuo.trim() === '') {
          setMensaje('❌ Todos los subtipos deben tener un nombre válido');
          setIsLoading(false);
          return;
        }
        if (!record['Cantidad Residuo KG'] || record['Cantidad Residuo KG'] <= 0) {
          setMensaje('❌ Error de validación: Todas las cantidades de residuos deben ser mayores a 0 kg');
          setIsLoading(false);
          return;
        }
        if (!record['Entregado a'] || record['Entregado a'].trim() === '') {
          setMensaje('❌ Error de validación: El campo "Entregado a" es obligatorio para trazabilidad');
          setIsLoading(false);
          return;
        }
        // Validar que el Tipo Residuo sea válido según Airtable
        const tiposValidos = ['♻️ Residuos Aprovechables', '🥬 Residuos Orgánicos', '☢️ Residuos Peligrosos', '🗑️ Residuos No Aprovechables'];
        if (!record['Tipo Residuo'] || !tiposValidos.includes(record['Tipo Residuo'])) {
          setMensaje(`❌ Error del sistema: Tipo de residuo inválido "${record['Tipo Residuo']}". Contacte al administrador.`);
          setIsLoading(false);
          return;
        }
        // Validar que ID_Turno esté presente
        if (!record.ID_Turno || record.ID_Turno.trim() === '') {
          setMensaje('❌ Error de sesión: No hay un turno activo. Por favor, abra un turno primero desde el menú principal.');
          setIsLoading(false);
          return;
        }
      }

      const response = await fetch('/api/manejo-residuos/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: recordsToCreate }),
      });

      const result = await response.json();

      if (response.ok && result.records) {
        const pluralRegistros = recordsToCreate.length === 1 ? 'registro' : 'registros';
        const mensajeExito = `✅ ¡Éxito! Se ${recordsToCreate.length === 1 ? 'creó' : 'crearon'} ${recordsToCreate.length} ${pluralRegistros} de manejo de residuos correctamente en Airtable`;
        
        console.log('✅ Estableciendo mensaje de éxito:', mensajeExito);
        setMensaje(mensajeExito);
        
        // Hacer scroll hacia arriba para mostrar el mensaje
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Limpiar formulario después de una pequeña demora para que el usuario vea el mensaje
        setTimeout(() => {
          limpiarFormulario();
        }, 1000);
      } else {
        setMensaje(`❌ Error al guardar en Airtable: ${result.error || 'Error desconocido. Verifique su conexión e intente nuevamente.'}`);
      }
    } catch (error) {
      console.error('Error:', error);
      setMensaje('❌ Error de conexión con el servidor. Verifique su conexión a internet e intente nuevamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const limpiarFormulario = () => {
    setFormData({
      subtiposAprovechables: [],
      subtiposOrganicos: [],
      subtiposPeligrosos: [],
      subtiposNoAprovechables: [],
      entregadoA: '',
      observaciones: ''
    });
    // No limpiar el mensaje aquí para que se pueda ver el mensaje de éxito
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
              <div className={`mb-6 p-6 rounded-xl text-center font-bold backdrop-blur-sm transform transition-all duration-500 ease-in-out border-2 relative z-50 ${
                mensaje.includes('✅') 
                  ? 'bg-gradient-to-r from-green-500 to-green-600 text-white border-green-300 shadow-2xl shadow-green-500/50 animate-bounce' 
                  : 'bg-gradient-to-r from-red-500 to-red-600 text-white border-red-300 shadow-2xl shadow-red-500/50 animate-pulse'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-center space-x-3">
                      <span className="text-3xl animate-pulse">
                        {mensaje.includes('✅') ? '🎉' : '⚠️'}
                      </span>
                      <span className="text-lg font-extrabold">{mensaje}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMensaje('')}
                    className="ml-4 text-white/80 hover:text-white transition-colors duration-200 text-xl font-bold hover:bg-black/20 rounded-full w-8 h-8 flex items-center justify-center"
                    title="Cerrar mensaje"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Grabación por Voz */}
              <ManejoResiduosVoiceRecorder 
                onDataExtracted={(data) => {
                  setFormData(prev => ({
                    subtiposAprovechables: data.subtiposAprovechables || [],
                    subtiposOrganicos: data.subtiposOrganicos || [],
                    subtiposPeligrosos: data.subtiposPeligrosos || [],
                    subtiposNoAprovechables: data.subtiposNoAprovechables || [],
                    entregadoA: data.entregadoA || '',
                    observaciones: data.observaciones || ''
                  }));
                  setMensaje('✅ ¡Perfecto! Los datos fueron extraídos del audio y cargados automáticamente en el formulario');
                }}
                isLoading={isLoading}
              />

              {/* Residuos Aprovechables */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white flex items-center drop-shadow">
                    ♻️ Residuos Aprovechables
                  </h2>
                  <button
                    type="button"
                    onClick={() => agregarSubtipo('subtiposAprovechables')}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <span>+ Agregar Subtipo</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.subtiposAprovechables.map((subtipo, index) => (
                    <div key={index} className="flex space-x-4 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          Subtipo {index + 1}
                        </label>
                        <input
                          type="text"
                          value={subtipo.subtipo}
                          onChange={(e) => actualizarSubtipo('subtiposAprovechables', index, 'subtipo', e.target.value)}
                          placeholder="Ej: Papel, Cartón, Botellas plásticas"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          KG
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={subtipo.cantidad}
                          onChange={(e) => actualizarSubtipo('subtiposAprovechables', index, 'cantidad', e.target.value)}
                          min="0"
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => eliminarSubtipo('subtiposAprovechables', index)}
                        className="px-3 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  {formData.subtiposAprovechables.length === 0 && (
                    <p className="text-white/70 text-center py-4">No hay subtipos agregados</p>
                  )}
                </div>
              </div>

              {/* Residuos Orgánicos */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white flex items-center drop-shadow">
                    🥬 Residuos Orgánicos
                  </h2>
                  <button
                    type="button"
                    onClick={() => agregarSubtipo('subtiposOrganicos')}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <span>+ Agregar Subtipo</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.subtiposOrganicos.map((subtipo, index) => (
                    <div key={index} className="flex space-x-4 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          Subtipo {index + 1}
                        </label>
                        <input
                          type="text"
                          value={subtipo.subtipo}
                          onChange={(e) => actualizarSubtipo('subtiposOrganicos', index, 'subtipo', e.target.value)}
                          placeholder="Ej: Restos de comida, Cáscaras de fruta"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          KG
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={subtipo.cantidad}
                          onChange={(e) => actualizarSubtipo('subtiposOrganicos', index, 'cantidad', e.target.value)}
                          min="0"
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => eliminarSubtipo('subtiposOrganicos', index)}
                        className="px-3 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  {formData.subtiposOrganicos.length === 0 && (
                    <p className="text-white/70 text-center py-4">No hay subtipos agregados</p>
                  )}
                </div>
              </div>

              {/* Residuos Peligrosos */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white flex items-center drop-shadow">
                    ☢️ Residuos Peligrosos
                  </h2>
                  <button
                    type="button"
                    onClick={() => agregarSubtipo('subtiposPeligrosos')}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <span>+ Agregar Subtipo</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.subtiposPeligrosos.map((subtipo, index) => (
                    <div key={index} className="flex space-x-4 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          Subtipo {index + 1}
                        </label>
                        <input
                          type="text"
                          value={subtipo.subtipo}
                          onChange={(e) => actualizarSubtipo('subtiposPeligrosos', index, 'subtipo', e.target.value)}
                          placeholder="Ej: Aceite usado, Baterías, Químicos"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          KG
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={subtipo.cantidad}
                          onChange={(e) => actualizarSubtipo('subtiposPeligrosos', index, 'cantidad', e.target.value)}
                          min="0"
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => eliminarSubtipo('subtiposPeligrosos', index)}
                        className="px-3 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  {formData.subtiposPeligrosos.length === 0 && (
                    <p className="text-white/70 text-center py-4">No hay subtipos agregados</p>
                  )}
                </div>
              </div>

              {/* Residuos No Aprovechables */}
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white flex items-center drop-shadow">
                    🗑️ Residuos No Aprovechables
                  </h2>
                  <button
                    type="button"
                    onClick={() => agregarSubtipo('subtiposNoAprovechables')}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 flex items-center space-x-2"
                  >
                    <span>+ Agregar Subtipo</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.subtiposNoAprovechables.map((subtipo, index) => (
                    <div key={index} className="flex space-x-4 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          Subtipo {index + 1}
                        </label>
                        <input
                          type="text"
                          value={subtipo.subtipo}
                          onChange={(e) => actualizarSubtipo('subtiposNoAprovechables', index, 'subtipo', e.target.value)}
                          placeholder="Ej: Plástico contaminado, Mezclas complejas"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                          KG
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={subtipo.cantidad}
                          onChange={(e) => actualizarSubtipo('subtiposNoAprovechables', index, 'cantidad', e.target.value)}
                          min="0"
                          placeholder="0.00"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-gray-900 placeholder-gray-500 font-medium"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => eliminarSubtipo('subtiposNoAprovechables', index)}
                        className="px-3 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                  {formData.subtiposNoAprovechables.length === 0 && (
                    <p className="text-white/70 text-center py-4">No hay subtipos agregados</p>
                  )}
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
                  className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-semibold shadow-lg flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Guardando en Airtable...</span>
                    </>
                  ) : (
                    <>
                      <span>♻️</span>
                      <span>Registrar Manejo</span>
                    </>
                  )}
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
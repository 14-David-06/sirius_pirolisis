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
    <TurnoProtection requiresTurno={true}>
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
      setMensaje('Por favor ingrese al menos un subtipo de residuo con cantidad mayor a 0');
      return false;
    }

    if (!formData.entregadoA.trim()) {
      setMensaje('Por favor complete el campo "Entregado a"');
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
          setMensaje('❌ Todas las cantidades deben ser mayores a 0');
          setIsLoading(false);
          return;
        }
        if (!record['Entregado a'] || record['Entregado a'].trim() === '') {
          setMensaje('❌ El campo "Entregado a" es obligatorio');
          setIsLoading(false);
          return;
        }
        // Validar que el Tipo Residuo sea válido según Airtable
        const tiposValidos = ['♻️ Residuos Aprovechables', '🥬 Residuos Orgánicos', '☢️ Residuos Peligrosos', '🗑️ Residuos No Aprovechables'];
        if (!record['Tipo Residuo'] || !tiposValidos.includes(record['Tipo Residuo'])) {
          setMensaje(`❌ Tipo de residuo inválido: ${record['Tipo Residuo']}. Debe ser uno de: ${tiposValidos.join(', ')}`);
          setIsLoading(false);
          return;
        }
        // Validar que ID_Turno esté presente
        if (!record.ID_Turno || record.ID_Turno.trim() === '') {
          setMensaje('❌ Falta el ID del turno. Por favor, abre un turno primero.');
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
        setMensaje(`✅ Registro de manejo de residuos creado exitosamente (${recordsToCreate.length} registros)`);
        
        // Limpiar formulario
        limpiarFormulario();
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

  const limpiarFormulario = () => {
    setFormData({
      subtiposAprovechables: [],
      subtiposOrganicos: [],
      subtiposPeligrosos: [],
      subtiposNoAprovechables: [],
      entregadoA: '',
      observaciones: ''
    });
    setMensaje('');
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
              <div className={`mb-6 p-4 rounded-lg text-center font-semibold backdrop-blur-sm ${
                mensaje.includes('✅') 
                  ? 'bg-green-500/80 text-white border border-green-400/50 shadow-lg' 
                  : 'bg-red-500/80 text-white border border-red-400/50 shadow-lg'
              }`}>
                {mensaje}
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
                  setMensaje('✅ Datos extraídos del audio correctamente');
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
                  className="px-8 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none font-semibold shadow-lg"
                >
                  {isLoading ? 'Registrando...' : '♻️ Registrar Manejo'}
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
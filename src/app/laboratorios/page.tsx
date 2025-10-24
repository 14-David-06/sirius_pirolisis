"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useState, useEffect } from 'react';

interface Laboratorio {
  id: string;
  nombre: string;
  fields?: any;
}

export default function LaboratoriosPage() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <LaboratoriosContent />
    </TurnoProtection>
  );
}

function LaboratoriosContent() {
  const [laboratorios, setLaboratorios] = useState<Laboratorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados para modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedLaboratorio, setSelectedLaboratorio] = useState<Laboratorio | null>(null);

  // Estados para formularios
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [laboratorioForm, setLaboratorioForm] = useState({
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

  // Cargar laboratorios al montar el componente
  useEffect(() => {
    loadLaboratorios();
  }, []);

  const loadLaboratorios = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/laboratorios/list');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al cargar laboratorios');
      }

      setLaboratorios(data.laboratorios || []);
    } catch (err: any) {
      setError(err.message || 'Error desconocido');
      console.error('Error loading laboratorios:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setLaboratorioForm({
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

  const openCreateModal = () => {
    resetForm();
    setSelectedLaboratorio(null);
    setShowCreateModal(true);
  };

  const openEditModal = (laboratorio: Laboratorio) => {
    // Cargar datos del laboratorio para editar usando field IDs
    setLaboratorioForm({
      nombreLaboratorio: laboratorio.fields?.['Nombre Laboratorio'] || '',
      tipoLaboratorio: laboratorio.fields?.['Tipo Laboratorio'] || '',
      responsable: laboratorio.fields?.['Responsable'] || '',
      telefono: laboratorio.fields?.['Teléfono'] || '',
      correoElectronico: laboratorio.fields?.['Correo Electrónico'] || '',
      direccion: laboratorio.fields?.['Dirección'] || '',
      ciudad: laboratorio.fields?.['Ciudad'] || '',
      pais: laboratorio.fields?.['País'] || '',
      certificaciones: laboratorio.fields?.['Certificaciones'] || '',
      acreditaciones: laboratorio.fields?.['Acreditaciones'] || '',
      metodosAnaliticos: laboratorio.fields?.['Métodos Analíticos'] || '',
      fechaVigenciaCertificaciones: laboratorio.fields?.['Fecha Vigencia Certificaciones'] || '',
      observaciones: laboratorio.fields?.['Observaciones'] || ''
    });
    setSelectedLaboratorio(laboratorio);
    setShowEditModal(true);
  };

  const openDetailsModal = (laboratorio: Laboratorio) => {
    setSelectedLaboratorio(laboratorio);
    setShowDetailsModal(true);
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowDetailsModal(false);
    setSelectedLaboratorio(null);
    resetForm();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setLaboratorioForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const submitCreateLaboratorio = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validar campos requeridos
      if (!laboratorioForm.nombreLaboratorio.trim()) {
        alert('❌ El nombre del laboratorio es obligatorio');
        setIsSubmitting(false);
        return;
      }

      const laboratorioData = {
        records: [{
          fields: {
            'Nombre Laboratorio': laboratorioForm.nombreLaboratorio.trim(),
            'Tipo Laboratorio': laboratorioForm.tipoLaboratorio.trim(),
            'Responsable': laboratorioForm.responsable.trim(),
            'Teléfono': laboratorioForm.telefono.trim(),
            'Correo Electrónico': laboratorioForm.correoElectronico.trim(),
            'Dirección': laboratorioForm.direccion.trim(),
            'Ciudad': laboratorioForm.ciudad.trim(),
            'País': laboratorioForm.pais.trim(),
            'Certificaciones': laboratorioForm.certificaciones.trim(),
            'Acreditaciones': laboratorioForm.acreditaciones.trim(),
            'Métodos Analíticos': laboratorioForm.metodosAnaliticos.trim(),
            'Fecha Vigencia Certificaciones': laboratorioForm.fechaVigenciaCertificaciones.trim(),
            'Observaciones': laboratorioForm.observaciones.trim()
          }
        }]
      };

      const response = await fetch('/api/laboratorios/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(laboratorioData)
      });

      if (!response.ok) {
        throw new Error('Error al crear laboratorio');
      }

      alert('✅ Laboratorio creado exitosamente');
      closeModals();
      loadLaboratorios(); // Recargar la lista
    } catch (error) {
      console.error('Error creating laboratorio:', error);
      alert('❌ Error al crear el laboratorio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitEditLaboratorio = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validar campos requeridos
      if (!laboratorioForm.nombreLaboratorio.trim()) {
        alert('❌ El nombre del laboratorio es obligatorio');
        setIsSubmitting(false);
        return;
      }

      if (!selectedLaboratorio) {
        alert('❌ No se seleccionó laboratorio para editar');
        setIsSubmitting(false);
        return;
      }

      // Enviar datos de actualización a la API
      const updateData = {
        id: selectedLaboratorio.id,
        fields: {
          nombreLaboratorio: laboratorioForm.nombreLaboratorio.trim(),
          tipoLaboratorio: laboratorioForm.tipoLaboratorio.trim(),
          responsable: laboratorioForm.responsable.trim(),
          telefono: laboratorioForm.telefono.trim(),
          correoElectronico: laboratorioForm.correoElectronico.trim(),
          direccion: laboratorioForm.direccion.trim(),
          ciudad: laboratorioForm.ciudad.trim(),
          pais: laboratorioForm.pais.trim(),
          certificaciones: laboratorioForm.certificaciones.trim(),
          acreditaciones: laboratorioForm.acreditaciones.trim(),
          metodosAnaliticos: laboratorioForm.metodosAnaliticos.trim(),
          fechaVigenciaCertificaciones: laboratorioForm.fechaVigenciaCertificaciones.trim(),
          observaciones: laboratorioForm.observaciones.trim()
        }
      };

      const response = await fetch(`/api/laboratorios/${selectedLaboratorio.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al actualizar laboratorio');
      }

      alert('✅ Laboratorio actualizado exitosamente');
      closeModals();
      loadLaboratorios(); // Recargar la lista
    } catch (error) {
      console.error('Error editing laboratorio:', error);
      alert('❌ Error al editar el laboratorio');
    } finally {
      setIsSubmitting(false);
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
              <p className="text-lg">Cargando laboratorios...</p>
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
              <p className="text-lg mb-4">Error al cargar laboratorios</p>
              <p className="text-sm text-white/70">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">🧪 Gestión de Laboratorios</h1>
                <p className="text-white/90 drop-shadow">
                  Administración de laboratorios para análisis de biochar
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="bg-[#5A7836]/80 hover:bg-[#5A7836] text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 hover:shadow-lg"
              >
                ➕ Nuevo Laboratorio
              </button>
            </div>

            {/* Lista de Laboratorios */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6 border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Lista de Laboratorios</h2>

              {laboratorios.length === 0 ? (
                <div className="text-center text-white/70 py-8">
                  <p>No hay laboratorios registrados</p>
                  <p className="text-sm mt-2">Haz clic en "Nuevo Laboratorio" para agregar el primero</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {laboratorios.map((laboratorio) => (
                    <div key={laboratorio.id} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-all duration-200">
                      <div className="mb-3">
                        <h3 className="font-bold text-white text-lg drop-shadow">{laboratorio.nombre}</h3>
                        {laboratorio.fields?.['Tipo Laboratorio'] && (
                          <p className="text-white/70 text-sm">{laboratorio.fields['Tipo Laboratorio']}</p>
                        )}
                      </div>

                      <div className="space-y-2 mb-4 text-sm">
                        {laboratorio.fields?.['Responsable'] && (
                          <div className="flex justify-between">
                            <span className="text-white/80 drop-shadow">Responsable:</span>
                            <span className="text-white font-semibold">{laboratorio.fields['Responsable']}</span>
                          </div>
                        )}
                        {laboratorio.fields?.['Correo Electrónico'] && (
                          <div className="flex justify-between">
                            <span className="text-white/80 drop-shadow">Email:</span>
                            <span className="text-white font-semibold">{laboratorio.fields['Correo Electrónico']}</span>
                          </div>
                        )}
                        {laboratorio.fields?.['Ciudad'] && laboratorio.fields?.['País'] && (
                          <div className="flex justify-between">
                            <span className="text-white/80 drop-shadow">Ubicación:</span>
                            <span className="text-white font-semibold">{laboratorio.fields['Ciudad']}, {laboratorio.fields['País']}</span>
                          </div>
                        )}
                        {laboratorio.fields?.['Teléfono'] && (
                          <div className="flex justify-between">
                            <span className="text-white/80 drop-shadow">Teléfono:</span>
                            <span className="text-white font-semibold">{laboratorio.fields['Teléfono']}</span>
                          </div>
                        )}
                        {laboratorio.fields?.['Certificaciones'] && (
                          <div className="flex justify-between">
                            <span className="text-white/80 drop-shadow">Certificaciones:</span>
                            <span className="text-green-300 font-semibold">Sí</span>
                          </div>
                        )}
                        {laboratorio.fields?.['Acreditaciones'] && (
                          <div className="flex justify-between">
                            <span className="text-white/80 drop-shadow">Acreditaciones:</span>
                            <span className="text-blue-300 font-semibold">Sí</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openDetailsModal(laboratorio)}
                          className="flex-1 bg-green-600/80 hover:bg-green-600 text-white py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200"
                        >
                          👁️ Ver Detalles
                        </button>
                        <button
                          onClick={() => openEditModal(laboratorio)}
                          className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200"
                        >
                          ✏️ Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Modal Crear Laboratorio */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">➕ Nuevo Laboratorio</h2>
                <button
                  onClick={closeModals}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={submitCreateLaboratorio} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Nombre Laboratorio *
                    </label>
                    <input
                      type="text"
                      name="nombreLaboratorio"
                      value={laboratorioForm.nombreLaboratorio}
                      onChange={handleInputChange}
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
                      name="tipoLaboratorio"
                      value={laboratorioForm.tipoLaboratorio}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                      placeholder="Ej: Analítico, Microbiológico, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Responsable
                    </label>
                    <input
                      type="text"
                      name="responsable"
                      value={laboratorioForm.responsable}
                      onChange={handleInputChange}
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
                      name="telefono"
                      value={laboratorioForm.telefono}
                      onChange={handleInputChange}
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
                      name="correoElectronico"
                      value={laboratorioForm.correoElectronico}
                      onChange={handleInputChange}
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
                      name="ciudad"
                      value={laboratorioForm.ciudad}
                      onChange={handleInputChange}
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
                      name="pais"
                      value={laboratorioForm.pais}
                      onChange={handleInputChange}
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
                      name="fechaVigenciaCertificaciones"
                      value={laboratorioForm.fechaVigenciaCertificaciones}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Dirección
                  </label>
                  <textarea
                    name="direccion"
                    value={laboratorioForm.direccion}
                    onChange={handleInputChange}
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
                    name="certificaciones"
                    value={laboratorioForm.certificaciones}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Certificaciones obtenidas"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Acreditaciones
                  </label>
                  <textarea
                    name="acreditaciones"
                    value={laboratorioForm.acreditaciones}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Acreditaciones"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Métodos Analíticos
                  </label>
                  <textarea
                    name="metodosAnaliticos"
                    value={laboratorioForm.metodosAnaliticos}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Métodos analíticos utilizados"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Observaciones
                  </label>
                  <textarea
                    name="observaciones"
                    value={laboratorioForm.observaciones}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Observaciones adicionales"
                  />
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={closeModals}
                    className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-green-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>
                        <span className="ml-2">Creando...</span>
                      </>
                    ) : (
                      '✅ Crear Laboratorio'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Editar Laboratorio */}
        {showEditModal && selectedLaboratorio && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">✏️ Editar Laboratorio</h2>
                <button
                  onClick={closeModals}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-4 mb-6">
                <p className="text-yellow-200 text-sm">
                  ⚠️ <strong>Nota:</strong> La funcionalidad completa de edición requiere implementar una API de actualización en el backend. Por ahora, puede crear nuevos laboratorios.
                </p>
              </div>

              <form onSubmit={submitEditLaboratorio} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Nombre Laboratorio *
                    </label>
                    <input
                      type="text"
                      name="nombreLaboratorio"
                      value={laboratorioForm.nombreLaboratorio}
                      onChange={handleInputChange}
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
                      name="tipoLaboratorio"
                      value={laboratorioForm.tipoLaboratorio}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                      placeholder="Ej: Analítico, Microbiológico, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                      Responsable
                    </label>
                    <input
                      type="text"
                      name="responsable"
                      value={laboratorioForm.responsable}
                      onChange={handleInputChange}
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
                      name="telefono"
                      value={laboratorioForm.telefono}
                      onChange={handleInputChange}
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
                      name="correoElectronico"
                      value={laboratorioForm.correoElectronico}
                      onChange={handleInputChange}
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
                      name="ciudad"
                      value={laboratorioForm.ciudad}
                      onChange={handleInputChange}
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
                      name="pais"
                      value={laboratorioForm.pais}
                      onChange={handleInputChange}
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
                      name="fechaVigenciaCertificaciones"
                      value={laboratorioForm.fechaVigenciaCertificaciones}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800"
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Dirección
                  </label>
                  <textarea
                    name="direccion"
                    value={laboratorioForm.direccion}
                    onChange={handleInputChange}
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
                    name="certificaciones"
                    value={laboratorioForm.certificaciones}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Certificaciones obtenidas"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Acreditaciones
                  </label>
                  <textarea
                    name="acreditaciones"
                    value={laboratorioForm.acreditaciones}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Acreditaciones"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Métodos Analíticos
                  </label>
                  <textarea
                    name="metodosAnaliticos"
                    value={laboratorioForm.metodosAnaliticos}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Métodos analíticos utilizados"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-white mb-2 drop-shadow">
                    Observaciones
                  </label>
                  <textarea
                    name="observaciones"
                    value={laboratorioForm.observaciones}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full px-4 py-3 bg-white/90 border border-white/30 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all duration-200 text-gray-800 resize-none"
                    placeholder="Observaciones adicionales"
                  />
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={closeModals}
                    className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div>
                        <span className="ml-2">Guardando...</span>
                      </>
                    ) : (
                      '💾 Guardar Cambios'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Ver Detalles del Laboratorio */}
        {showDetailsModal && selectedLaboratorio && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">📋 Detalles del Laboratorio</h2>
                <button
                  onClick={closeModals}
                  className="text-white/70 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Información Básica */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow-lg">Información Básica</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Nombre del Laboratorio</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">{selectedLaboratorio.nombre}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Tipo de Laboratorio</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['Tipo Laboratorio'] || 'No especificado'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Información de Contacto */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow-lg">Información de Contacto</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Responsable</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['Responsable'] || 'No especificado'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Teléfono</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['Teléfono'] || 'No especificado'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Correo Electrónico</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['Correo Electrónico'] || 'No especificado'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Ubicación */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow-lg">Ubicación</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Dirección</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['Dirección'] || 'No especificada'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Ciudad</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['Ciudad'] || 'No especificada'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">País</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['País'] || 'No especificado'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Certificaciones y Acreditaciones */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow-lg">Certificaciones y Acreditaciones</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Certificaciones</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg min-h-[60px]">
                        {selectedLaboratorio.fields?.['Certificaciones'] || 'No especificadas'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Acreditaciones</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg min-h-[60px]">
                        {selectedLaboratorio.fields?.['Acreditaciones'] || 'No especificadas'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Fecha Vigencia Certificaciones</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg">
                        {selectedLaboratorio.fields?.['Fecha Vigencia Certificaciones'] || 'No especificada'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Métodos y Observaciones */}
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                  <h3 className="text-lg font-semibold text-white mb-4 drop-shadow-lg">Métodos Analíticos y Observaciones</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Métodos Analíticos</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg min-h-[60px]">
                        {selectedLaboratorio.fields?.['Métodos Analíticos'] || 'No especificados'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/80 mb-1">Observaciones</label>
                      <p className="text-white font-medium bg-white/10 px-3 py-2 rounded-lg min-h-[60px]">
                        {selectedLaboratorio.fields?.['Observaciones'] || 'Sin observaciones'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => {
                    closeModals();
                    openEditModal(selectedLaboratorio);
                  }}
                  className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  ✏️ Editar Laboratorio
                </button>
                <button
                  onClick={closeModals}
                  className="flex-1 bg-white/20 hover:bg-white/30 text-white py-3 px-6 rounded-xl font-semibold transition-all duration-200 border border-white/30"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}
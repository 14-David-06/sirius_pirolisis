"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import VoiceToText from '@/components/VoiceToText';
import React, { useState } from 'react';

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
  const [formData, setFormData] = useState({
    // Información básica
    fechaEvento: '',
    cantidadBiocharSecoKg: '',
    realizaRegistro: '',
    observaciones: '',
    
    // Información del cliente
    cliente: '',
    nitCcCliente: '',
    
    // Información de entrega
    responsableEntrega: '',
    numeroDocumentoEntrega: '',
    firmaEntrega: null as File | null,
    
    // Información de recepción
    responsableRecibe: '',
    numeroDocumentoRecibe: '',
    firmaRecibe: null as File | null,
    
    // Documentos
    documentoRemision: null as File | null,
    qrDocumentoRemision: null as File | null,
    
    // Bache vinculado
    bachePirolisisAlterado: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0] || null;
    setFormData(prev => ({ ...prev, [fieldName]: file }));
  };

  const handleVoiceText = (text: string) => {
    setFormData(prev => ({ ...prev, observaciones: prev.observaciones + (prev.observaciones ? ' ' : '') + text }));
  };

  // useEffect para inicializar el campo realizaRegistro con el usuario de la sesión
  React.useEffect(() => {
    setFormData(prev => ({
      ...prev,
      realizaRegistro: getUserFromSession()
    }));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Datos de remisión:', formData);
    // Aquí se implementará la lógica para enviar la remisión
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
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Estadísticas Generales</h2>
              <div className="space-y-3 text-white">
                <div className="flex justify-between">
                  <span className="drop-shadow">Total Remisiones:</span>
                  <span className="font-semibold">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Remisiones Pendientes:</span>
                  <span className="font-semibold">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Remisiones Completadas:</span>
                  <span className="font-semibold">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="drop-shadow">Biochar Vendido:</span>
                  <span className="font-semibold">0 kg</span>
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
                    <div className="mb-6">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Fecha del Evento *</label>
                        <input
                          type="date"
                          name="fechaEvento"
                          value={formData.fechaEvento}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
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
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center drop-shadow">
                      🏢 Información del Cliente
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Cliente *</label>
                        <input
                          type="text"
                          name="cliente"
                          value={formData.cliente}
                          onChange={handleInputChange}
                          placeholder="Nombre del cliente"
                          required
                          className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
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
                          className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Información de Entrega */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center drop-shadow">
                      🚚 Información de Entrega
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Responsable Entrega *</label>
                        <input
                          type="text"
                          name="responsableEntrega"
                          value={formData.responsableEntrega}
                          onChange={handleInputChange}
                          placeholder="Nombre del responsable de entrega"
                          required
                          className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Número Documento Entrega *</label>
                        <input
                          type="text"
                          name="numeroDocumentoEntrega"
                          value={formData.numeroDocumentoEntrega}
                          onChange={handleInputChange}
                          placeholder="CC o documento del responsable"
                          required
                          className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Firma Entrega</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'firmaEntrega')}
                        className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white/20 file:text-white hover:file:bg-white/30"
                      />
                    </div>
                  </div>

                  {/* Bache Pirólisis */}
                  <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center drop-shadow">
                      🗂️ Bache Pirólisis
                    </h3>
                    <div>
                      <label className="block text-sm font-medium text-white/90 mb-2 drop-shadow">Bache Pirólisis Alterado</label>
                      <select
                        name="bachePirolisisAlterado"
                        value={formData.bachePirolisisAlterado}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/50"
                      >
                        <option value="" className="bg-gray-800">Seleccione un bache (se cargará dinámicamente)</option>
                        <option value="bache_001" className="bg-gray-800">Bache 001 - 450 KG disponibles</option>
                        <option value="bache_002" className="bg-gray-800">Bache 002 - 320 KG disponibles</option>
                      </select>
                    </div>
                  </div>

                  {/* Botones de Acción */}
                  <div className="flex flex-col sm:flex-row gap-4 pt-6">
                    <button
                      type="button"
                      onClick={() => setShowNuevaRemisionForm(false)}
                      className="flex-1 bg-gray-500/20 border border-gray-400/50 text-gray-200 py-3 px-6 rounded-lg font-semibold transition-all duration-300 hover:bg-gray-500/30"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white py-3 px-6 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-[#5A7836]/30"
                    >
                      🚀 Registrar Remisión
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Lista de Remisiones */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Lista de Remisiones</h2>

              {/* Estado vacío */}
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
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { config } from '@/lib/config';

export default function RecepcionRemision() {
  const params = useParams();
  const remisionId = params.id as string;
  
  const [remision, setRemision] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    responsableRecibe: '',
    numeroDocumentoRecibe: '',
    firmaRecibe: null as File | null,
    observacionesRecepcion: ''
  });

  // Cargar datos de la remisión
  useEffect(() => {
    const fetchRemision = async () => {
      try {
        const response = await fetch(`/api/remisiones-baches/${remisionId}`);
        if (!response.ok) {
          throw new Error('No se pudo cargar la remisión');
        }
        const data = await response.json();
        if (data.success) {
          setRemision(data.record);
        }
      } catch (error) {
        console.error('Error cargando remisión:', error);
        setSubmitError('No se pudo cargar la información de la remisión');
      } finally {
        setLoading(false);
      }
    };

    if (remisionId) {
      fetchRemision();
    }
  }, [remisionId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, files } = e.target as HTMLInputElement;
    
    if (name === 'firmaRecibe' && files) {
      setFormData(prev => ({ ...prev, [name]: files[0] }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    // Limpiar errores
    if (submitError) {
      setSubmitError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.responsableRecibe.trim()) {
      setSubmitError('El nombre del responsable es requerido');
      return;
    }

    if (!formData.numeroDocumentoRecibe.trim()) {
      setSubmitError('El número de documento es requerido');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Crear FormData para enviar archivos
      const submitData = new FormData();
      submitData.append('responsableRecibe', formData.responsableRecibe);
      submitData.append('numeroDocumentoRecibe', formData.numeroDocumentoRecibe);
      submitData.append('observacionesRecepcion', formData.observacionesRecepcion);
      
      if (formData.firmaRecibe) {
        submitData.append('firmaRecibe', formData.firmaRecibe);
      }

      const response = await fetch(`/api/remisiones-baches/${remisionId}/recepcion`, {
        method: 'POST',
        body: submitData
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status}: ${response.statusText}`);
      }

      if (!result.success) {
        throw new Error(result.error || 'Error desconocido');
      }

      setSubmitSuccess(true);
      setFormData({
        responsableRecibe: '',
        numeroDocumentoRecibe: '',
        firmaRecibe: null,
        observacionesRecepcion: ''
      });

    } catch (error: any) {
      console.error('Error registrando recepción:', error);
      setSubmitError(error.message || 'Error al registrar la recepción');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#2C5234] to-[#1a3d23] flex items-center justify-center">
        <div className="text-white text-lg">Cargando información...</div>
      </div>
    );
  }

  if (!remision) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#2C5234] to-[#1a3d23] flex items-center justify-center">
        <div className="text-white text-lg">Remisión no encontrada</div>
      </div>
    );
  }

  const fields = remision.fields || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2C5234] to-[#1a3d23] text-white">
      <main className="container mx-auto px-4 py-8">
        <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-2xl mx-auto border border-white/30">
          
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Sirius Regenerative Solutions</h2>
              <p className="text-white/60 text-sm">Sistema de Gestión de Recepción</p>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">
              📥 Formulario de Recepción
            </h1>
            <p className="text-white/90 mb-4">
              Confirme la recepción del biochar para la remisión
            </p>
            
            {/* Información de la remisión */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-white/60">Remisión:</span>
                  <div className="font-medium">#{fields['ID Numerico'] || (config.airtable.remisionesBachesFields.idNumerico && fields[config.airtable.remisionesBachesFields.idNumerico]) || 'N/A'}</div>
                </div>
                <div>
                  <span className="text-white/60">Cliente:</span>
                  <div className="font-medium">{fields['Cliente'] || (config.airtable.remisionesBachesFields.cliente && fields[config.airtable.remisionesBachesFields.cliente]) || 'No especificado'}</div>
                </div>
                <div>
                  <span className="text-white/60">Fecha Evento:</span>
                  <div className="font-medium">{new Date(fields['Fecha Evento'] || (config.airtable.remisionesBachesFields.fechaEvento && fields[config.airtable.remisionesBachesFields.fechaEvento])).toLocaleDateString('es-CO')}</div>
                </div>
                <div>
                  <span className="text-white/60">Estado:</span>
                  <div className="font-medium text-blue-300">Pendiente de Recepción</div>
                </div>
              </div>
            </div>
          </div>

          {/* Formulario */}
          {submitSuccess ? (
            <div className="bg-green-500/20 border border-green-400/50 text-green-200 p-6 rounded-lg text-center">
              <div className="text-2xl mb-2">✅</div>
              <div className="text-lg font-semibold mb-2">¡Recepción Confirmada!</div>
              <div className="text-sm">
                La recepción del biochar ha sido registrada correctamente.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Responsable de Recepción */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Responsable de Recepción *
                </label>
                <input
                  type="text"
                  name="responsableRecibe"
                  value={formData.responsableRecibe}
                  onChange={handleInputChange}
                  placeholder="Nombre completo del responsable"
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
              </div>

              {/* Número de Documento */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Número de Documento de Identidad *
                </label>
                <input
                  type="text"
                  name="numeroDocumentoRecibe"
                  value={formData.numeroDocumentoRecibe}
                  onChange={handleInputChange}
                  placeholder="Cédula o documento de identidad"
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
              </div>

              {/* Observaciones de Recepción */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Observaciones de Recepción
                </label>
                <textarea
                  name="observacionesRecepcion"
                  value={formData.observacionesRecepcion}
                  onChange={handleInputChange}
                  placeholder="Estado del producto recibido, observaciones sobre la entrega, etc."
                  rows={3}
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent resize-none"
                />
              </div>

              {/* Firma de Recepción */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Firma de Recepción (Opcional)
                </label>
                <input
                  type="file"
                  name="firmaRecibe"
                  onChange={handleInputChange}
                  accept="image/*,.pdf"
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-white/20 file:text-white hover:file:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                />
                <p className="text-xs text-white/60 mt-1">
                  Formatos permitidos: JPG, PNG, PDF (máx. 5MB)
                </p>
              </div>

              {/* Error Messages */}
              {submitError && (
                <div className="bg-red-500/20 border border-red-400/50 text-red-200 p-4 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-red-400 mr-2">❌</span>
                    {submitError}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white py-3 px-6 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-[#5A7836]/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin inline-block mr-2">⏳</span>
                    Confirmando Recepción...
                  </>
                ) : (
                  <>
                    <span className="mr-2">📥</span>
                    Confirmar Recepción
                  </>
                )}
              </button>
            </form>
          )}

        </div>
      </main>

      {/* Footer simplificado para formulario público */}
      <footer className="bg-black/20 backdrop-blur-sm border-t border-white/10 py-4">
        <div className="container mx-auto px-4 text-center">
          <p className="text-white/60 text-sm">
            Sirius Regenerative Solutions S.A.S - Sistema de Recepción
          </p>
        </div>
      </footer>
    </div>
  );
}
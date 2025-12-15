'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { config } from '@/lib/config';
import VoiceToText from '@/components/VoiceToText';

export default function RecepcionRemision() {
  const params = useParams();
  const remisionId = params.id as string;
  
  const [remision, setRemision] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recepcionYaCompletada, setRecepcionYaCompletada] = useState(false);
  const [entregaNoCompletada, setEntregaNoCompletada] = useState(false);
  
  const [formData, setFormData] = useState({
    responsableRecibe: '',
    numeroDocumentoRecibe: '',
    telefonoRecibe: '',
    emailRecibe: '',
    observacionesRecepcion: '',
    aceptaTratamientoDatos: false,
    aceptaTerminosCondiciones: false,
    aceptaUsoResponsableBiochar: false
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
          // Verificar estados de entrega y recepción
          const record = data.record;
          
          // Debug: mostrar field IDs y valores
          console.log('🔍 [recepcion] Field IDs de configuración:', {
            responsableEntrega: config.airtable.remisionesBachesFields.responsableEntrega,
            numeroDocumentoEntrega: config.airtable.remisionesBachesFields.numeroDocumentoEntrega,
            responsableRecibe: config.airtable.remisionesBachesFields.responsableRecibe,
            numeroDocumentoRecibe: config.airtable.remisionesBachesFields.numeroDocumentoRecibe
          });
          
          // Usar field IDs o nombres de campo directos como fallback
          const responsableEntregaField = config.airtable.remisionesBachesFields.responsableEntrega || 'Responsable Entrega';
          const numeroDocumentoEntregaField = config.airtable.remisionesBachesFields.numeroDocumentoEntrega || 'Numero Documento Entrega';
          const responsableRecibeField = config.airtable.remisionesBachesFields.responsableRecibe || 'Responsable Recibe';
          const numeroDocumentoRecibeField = config.airtable.remisionesBachesFields.numeroDocumentoRecibe || 'Numero Documento Recibe';
          
          console.log('🔍 [recepcion] Campos del record:', Object.keys(record.fields || {}));
          console.log('🔍 [recepcion] Valores de entrega:', {
            responsableEntrega: record.fields?.[responsableEntregaField],
            numeroDocumentoEntrega: record.fields?.[numeroDocumentoEntregaField]
          });
          
          const entregaCompleta = record.fields?.[responsableEntregaField] && 
                                 record.fields?.[numeroDocumentoEntregaField];
          const recepcionCompleta = record.fields?.[responsableRecibeField] && 
                                   record.fields?.[numeroDocumentoRecibeField];
          
          console.log('🔍 [recepcion] Valores con fallback:', {
            responsableEntrega: record.fields?.[responsableEntregaField],
            numeroDocumentoEntrega: record.fields?.[numeroDocumentoEntregaField],
            responsableRecibe: record.fields?.[responsableRecibeField],
            numeroDocumentoRecibe: record.fields?.[numeroDocumentoRecibeField]
          });
          
          console.log('🔍 [recepcion] Estados:', {
            entregaCompleta,
            recepcionCompleta,
            entregaNoCompletada: !entregaCompleta,
            recepcionYaCompletada: !!recepcionCompleta
          });
          
          setEntregaNoCompletada(!entregaCompleta);
          setRecepcionYaCompletada(!!recepcionCompleta);
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

  // Función para manejar texto transcrito del micrófono
  const handleVoiceText = (text: string) => {
    setFormData(prev => ({ 
      ...prev, 
      observacionesRecepcion: prev.observacionesRecepcion + (prev.observacionesRecepcion ? ' ' : '') + text 
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = (e.target as HTMLInputElement).checked;
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
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

    if (!formData.aceptaTratamientoDatos) {
      setSubmitError('Debe aceptar el tratamiento de datos personales');
      return;
    }

    if (!formData.aceptaTerminosCondiciones) {
      setSubmitError('Debe aceptar los términos y condiciones');
      return;
    }

    if (!formData.aceptaUsoResponsableBiochar) {
      setSubmitError('Debe declarar el uso responsable del biochar');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Crear FormData para enviar datos
      const submitData = new FormData();
      submitData.append('responsableRecibe', formData.responsableRecibe);
      submitData.append('numeroDocumentoRecibe', formData.numeroDocumentoRecibe);
      submitData.append('telefonoRecibe', formData.telefonoRecibe);
      submitData.append('emailRecibe', formData.emailRecibe);
      submitData.append('observacionesRecepcion', formData.observacionesRecepcion);
      submitData.append('aceptaTratamientoDatos', formData.aceptaTratamientoDatos.toString());
      submitData.append('aceptaTerminosCondiciones', formData.aceptaTerminosCondiciones.toString());
      submitData.append('aceptaUsoResponsableBiochar', formData.aceptaUsoResponsableBiochar.toString());

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
        telefonoRecibe: '',
        emailRecibe: '',
        observacionesRecepcion: '',
        aceptaTratamientoDatos: false,
        aceptaTerminosCondiciones: false,
        aceptaUsoResponsableBiochar: false
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

  // Si la entrega no está completada, no se puede recibir
  if (entregaNoCompletada) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#2C5234] to-[#1a3d23] flex items-center justify-center p-4">
        <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-2xl w-full border border-white/30">
          <div className="text-center">
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-500/20 border border-yellow-400/50 mb-4">
                <svg className="h-8 w-8 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">⏳ Entrega Pendiente</h1>
              <p className="text-white/80 mb-4">
                No se puede completar la recepción hasta que se haya completado y firmado el formulario de entrega.
              </p>
              <div className="bg-yellow-500/20 border border-yellow-400/50 rounded-lg p-4 mb-4">
                <p className="text-yellow-200 font-medium">
                  📋 Remisión: {remision?.fields?.[config.airtable.remisionesBachesFields.id || 'ID'] || remisionId}
                </p>
                <p className="text-yellow-300 text-sm mt-1">
                  Debe completarse primero el proceso de entrega
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => window.history.back()}
                  className="inline-flex items-center px-4 py-2 border border-white/30 text-sm font-medium rounded-md text-white bg-white/10 hover:bg-white/20 transition-colors"
                >
                  ← Regresar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Si la recepción ya fue completada, mostrar mensaje
  if (recepcionYaCompletada) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#2C5234] to-[#1a3d23] flex items-center justify-center p-4">
        <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-2xl w-full border border-white/30">
          <div className="text-center">
            <div className="mb-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-500/20 border border-green-400/50 mb-4">
                <svg className="h-8 w-8 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">✅ Recepción Ya Completada</h1>
              <p className="text-white/80 mb-4">
                Este formulario de recepción ya fue llenado y firmado. Para prevenir suplantación de información, 
                el formulario ha sido deshabilitado.
              </p>
              <div className="bg-blue-500/20 border border-blue-400/50 rounded-lg p-4 mb-4">
                <p className="text-blue-200 font-medium">
                  📋 Remisión: {remision?.fields?.[config.airtable.remisionesBachesFields.id || 'ID'] || remisionId}
                </p>
                <p className="text-blue-300 text-sm mt-1">
                  Responsable de recepción: {remision?.fields?.[config.airtable.remisionesBachesFields.responsableRecibe || 'Responsable Recibe']}
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => window.history.back()}
                  className="inline-flex items-center px-4 py-2 border border-white/30 text-sm font-medium rounded-md text-white bg-white/10 hover:bg-white/20 transition-colors"
                >
                  ← Regresar
                </button>
              </div>
            </div>
          </div>
        </div>
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

              {/* Teléfono de Recepción */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Teléfono de Contacto
                </label>
                <input
                  type="tel"
                  name="telefonoRecibe"
                  value={formData.telefonoRecibe}
                  onChange={handleInputChange}
                  placeholder="Número de teléfono"
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
              </div>

              {/* Email de Recepción */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  name="emailRecibe"
                  value={formData.emailRecibe}
                  onChange={handleInputChange}
                  placeholder="correo@ejemplo.com"
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
              </div>

              {/* Observaciones de Recepción */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Observaciones de Recepción
                </label>
                <div className="relative">
                  <textarea
                    name="observacionesRecepcion"
                    value={formData.observacionesRecepcion}
                    onChange={handleInputChange}
                    placeholder="Estado del producto recibido, observaciones sobre la entrega, etc."
                    rows={3}
                    className="w-full px-4 py-3 pr-12 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent resize-none"
                  />
                  <VoiceToText 
                    onTextExtracted={handleVoiceText}
                    isLoading={false}
                  />
                </div>
              </div>

              {/* Aceptación de Tratamiento de Datos */}
              <div>
                <label className="flex items-start space-x-3 text-sm text-white/90 cursor-pointer">
                  <input
                    type="checkbox"
                    name="aceptaTratamientoDatos"
                    checked={formData.aceptaTratamientoDatos}
                    onChange={handleInputChange}
                    required
                    className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-white/30 rounded bg-white/10"
                  />
                  <span>
                    <span className="text-red-400">*</span> Autorizo el tratamiento de mis datos personales de acuerdo con la 
                    <strong className="text-white"> Ley 1581 de 2012</strong> de protección de datos personales de Colombia.
                  </span>
                </label>
              </div>

              {/* Aceptación de Términos y Condiciones */}
              <div>
                <label className="flex items-start space-x-3 text-sm text-white/90 cursor-pointer">
                  <input
                    type="checkbox"
                    name="aceptaTerminosCondiciones"
                    checked={formData.aceptaTerminosCondiciones}
                    onChange={handleInputChange}
                    required
                    className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-white/30 rounded bg-white/10"
                  />
                  <span>
                    <span className="text-red-400">*</span> Acepto los 
                    <strong className="text-white"> términos y condiciones</strong> y las 
                    <strong className="text-white"> políticas de privacidad</strong> de Sirius Regenerative Solutions.
                  </span>
                </label>
              </div>

              {/* Declaración de Uso Responsable del Biochar */}
              <div>
                <label className="flex items-start space-x-3 text-sm text-white/90 cursor-pointer">
                  <input
                    type="checkbox"
                    name="aceptaUsoResponsableBiochar"
                    checked={formData.aceptaUsoResponsableBiochar}
                    onChange={handleInputChange}
                    required
                    className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-white/30 rounded bg-white/10"
                  />
                  <span>
                    <span className="text-red-400">*</span> Declaro que me hago responsable de la 
                    <strong className="text-white"> correcta aplicación del biochar</strong> devolviéndolo al suelo como una 
                    <strong className="text-white"> enmienda para el cambio climático</strong>. Declaro que 
                    <strong className="text-white"> NO realizaré quemas del producto</strong> ni ninguna acción que pueda conllevar 
                    a que el producto libere el CO₂ que ha retenido durante su proceso de captura o reducción.
                  </span>
                </label>
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
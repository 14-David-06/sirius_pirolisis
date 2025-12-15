'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { config } from '@/lib/config';

export default function EntregaRemision() {
  const params = useParams();
  const remisionId = params.id as string;
  
  const [remision, setRemision] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    responsableEntrega: '',
    numeroDocumentoEntrega: '',
    telefonoEntrega: '',
    emailEntrega: '',
    aceptaTratamientoDatos: false,
    aceptaTerminosCondiciones: false
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
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
    
    if (!formData.responsableEntrega.trim()) {
      setSubmitError('El nombre del responsable es requerido');
      return;
    }

    if (!formData.numeroDocumentoEntrega.trim()) {
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

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Crear FormData para enviar datos
      const submitData = new FormData();
      submitData.append('responsableEntrega', formData.responsableEntrega);
      submitData.append('numeroDocumentoEntrega', formData.numeroDocumentoEntrega);
      submitData.append('telefonoEntrega', formData.telefonoEntrega);
      submitData.append('emailEntrega', formData.emailEntrega);
      submitData.append('aceptaTratamientoDatos', formData.aceptaTratamientoDatos.toString());
      submitData.append('aceptaTerminosCondiciones', formData.aceptaTerminosCondiciones.toString());

      const response = await fetch(`/api/remisiones-baches/${remisionId}/entrega`, {
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
        responsableEntrega: '',
        numeroDocumentoEntrega: '',
        telefonoEntrega: '',
        emailEntrega: '',
        aceptaTratamientoDatos: false,
        aceptaTerminosCondiciones: false
      });

    } catch (error: any) {
      console.error('Error actualizando entrega:', error);
      setSubmitError(error.message || 'Error al actualizar la información de entrega');
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
              <p className="text-white/60 text-sm">Sistema de Gestión de Entregas</p>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">
              📦 Formulario de Entrega
            </h1>
            <p className="text-white/90 mb-4">
              Complete la información de entrega para la remisión
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
                  <div className="font-medium text-yellow-300">Pendiente de Entrega</div>
                </div>
              </div>
            </div>
          </div>

          {/* Formulario */}
          {submitSuccess ? (
            <div className="bg-green-500/20 border border-green-400/50 text-green-200 p-6 rounded-lg text-center">
              <div className="text-2xl mb-2">✅</div>
              <div className="text-lg font-semibold mb-2">¡Entrega Registrada!</div>
              <div className="text-sm mb-4">
                La información de entrega ha sido actualizada correctamente.
              </div>
              
              {/* Mensaje de siguiente paso */}
              <div className="bg-blue-500/20 border border-blue-400/50 text-blue-200 p-4 rounded-lg mt-4">
                <div className="text-lg font-semibold mb-2">📱 Siguiente Paso</div>
                <div className="text-sm mb-3">
                  Ahora debe mostrar el siguiente código QR al usuario que va a <strong>recibir</strong> el producto para completar el proceso.
                </div>
                <button
                  onClick={() => {
                    const recepcionUrl = `${window.location.origin}/recepcion-remision/${remisionId}`;
                    window.open(recepcionUrl, '_blank');
                  }}
                  className="bg-gradient-to-r from-blue-600 to-blue-500 text-white py-2 px-4 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
                >
                  📥 Abrir Formulario de Recepción
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Responsable de Entrega */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Responsable de Entrega *
                </label>
                <input
                  type="text"
                  name="responsableEntrega"
                  value={formData.responsableEntrega}
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
                  name="numeroDocumentoEntrega"
                  value={formData.numeroDocumentoEntrega}
                  onChange={handleInputChange}
                  placeholder="Cédula o documento de identidad"
                  required
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
              </div>

              {/* Teléfono de Entrega */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Teléfono de Contacto
                </label>
                <input
                  type="tel"
                  name="telefonoEntrega"
                  value={formData.telefonoEntrega}
                  onChange={handleInputChange}
                  placeholder="Número de teléfono"
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
              </div>

              {/* Email de Entrega */}
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  name="emailEntrega"
                  value={formData.emailEntrega}
                  onChange={handleInputChange}
                  placeholder="correo@ejemplo.com"
                  className="w-full px-4 py-3 bg-white/10 border border-white/30 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent"
                />
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
                    Registrando Entrega...
                  </>
                ) : (
                  <>
                    <span className="mr-2">📦</span>
                    Registrar Entrega
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
            Sirius Regenerative Solutions S.A.S - Sistema de Entregas
          </p>
        </div>
      </footer>
    </div>
  );
}
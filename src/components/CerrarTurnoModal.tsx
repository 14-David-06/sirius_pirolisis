'use client';

import { useState } from 'react';

interface CerrarTurnoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (datosCierre: DatosCierre) => void;
  loading: boolean;
}

export interface DatosCierre {
  consumoAguaFin: number;
  consumoEnergiaFin: number;
  consumoGasFinal: number;
}

export default function CerrarTurnoModal({ isOpen, onClose, onConfirm, loading }: CerrarTurnoModalProps) {
  const [datosCierre, setDatosCierre] = useState<DatosCierre>({
    consumoAguaFin: 0,
    consumoEnergiaFin: 0,
    consumoGasFinal: 0
  });

  const [errors, setErrors] = useState<Partial<DatosCierre>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validación
    const newErrors: Partial<DatosCierre> = {};
    
    if (datosCierre.consumoAguaFin <= 0) {
      newErrors.consumoAguaFin = 0;
    }
    
    if (datosCierre.consumoEnergiaFin <= 0) {
      newErrors.consumoEnergiaFin = 0;
    }
    
    if (datosCierre.consumoGasFinal <= 0) {
      newErrors.consumoGasFinal = 0;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onConfirm(datosCierre);
  };

  const handleInputChange = (field: keyof DatosCierre, value: string) => {
    const numValue = parseFloat(value) || 0;
    setDatosCierre(prev => ({
      ...prev,
      [field]: numValue
    }));
    
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[field] !== undefined) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const resetForm = () => {
    setDatosCierre({
      consumoAguaFin: 0,
      consumoEnergiaFin: 0,
      consumoGasFinal: 0
    });
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Background overlay con la misma imagen que el formulario de apertura */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
        }}
      >
        <div className="absolute inset-0 bg-black/60"></div>
      </div>
      
      {/* Contenido del modal */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-4xl mx-auto border border-white/30 w-full">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
              🛑 Cerrar Turno de Pirólisis
            </h2>
            <p className="text-white/90 drop-shadow">
              Registra las lecturas de consumo final para cerrar el turno
            </p>
          </div>
          
          {/* Form Content */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Lecturas de Consumo Final */}
            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center drop-shadow">
                📊 Lecturas de Consumo Final
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                    💧 Consumo Agua Final *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={datosCierre.consumoAguaFin || ''}
                    onChange={(e) => handleInputChange('consumoAguaFin', e.target.value)}
                    className={`w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium ${
                      errors.consumoAguaFin !== undefined 
                        ? 'border-red-500 bg-red-50' 
                        : 'border-gray-300'
                    }`}
                    placeholder="Ej: 45.20"
                    required
                    min="0"
                  />
                  {errors.consumoAguaFin !== undefined && (
                    <p className="text-red-400 text-xs mt-1 font-medium drop-shadow">
                      ⚠️ Este campo es requerido y debe ser mayor a 0
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                    ⚡ Consumo Energía Final *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={datosCierre.consumoEnergiaFin || ''}
                    onChange={(e) => handleInputChange('consumoEnergiaFin', e.target.value)}
                    className={`w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium ${
                      errors.consumoEnergiaFin !== undefined 
                        ? 'border-red-500 bg-red-50' 
                        : 'border-gray-300'
                    }`}
                    placeholder="Ej: 3650.00"
                    required
                    min="0"
                  />
                  {errors.consumoEnergiaFin !== undefined && (
                    <p className="text-red-400 text-xs mt-1 font-medium drop-shadow">
                      ⚠️ Este campo es requerido y debe ser mayor a 0
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2 drop-shadow">
                    🔥 Consumo Gas Final *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={datosCierre.consumoGasFinal || ''}
                    onChange={(e) => handleInputChange('consumoGasFinal', e.target.value)}
                    className={`w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium ${
                      errors.consumoGasFinal !== undefined 
                        ? 'border-red-500 bg-red-50' 
                        : 'border-gray-300'
                    }`}
                    placeholder="Ej: 9850"
                    required
                    min="0"
                  />
                  {errors.consumoGasFinal !== undefined && (
                    <p className="text-red-400 text-xs mt-1 font-medium drop-shadow">
                      ⚠️ Este campo es requerido y debe ser mayor a 0
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Información adicional */}
            <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-lg p-4 backdrop-blur-sm">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-yellow-300 text-xl drop-shadow">ℹ️</span>
                </div>
                <div className="ml-3">
                  <h4 className="text-sm font-medium text-yellow-100 drop-shadow">
                    Información importante
                  </h4>
                  <p className="text-sm text-yellow-200 mt-1 drop-shadow">
                    • El sistema registrará automáticamente la fecha/hora de cierre<br/>
                    • Una vez cerrado el turno, no podrás acceder a las funciones operativas<br/>
                    • Asegúrate de que todas las lecturas sean correctas antes de proceder
                  </p>
                </div>
              </div>
            </div>

            {/* Botones de Acción */}
            <div className="flex justify-end space-x-4 pt-6">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Cerrando...</span>
                  </>
                ) : (
                  <>
                    <span>🛑</span>
                    <span>Cerrar Turno</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
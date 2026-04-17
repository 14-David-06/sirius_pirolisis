"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import TurnoProtection from '@/components/TurnoProtection';

interface Aforo {
  id: string;
  fechaHoraRegistro: string;
  turnoId: string;
  hertzTolva: number;
  alimentacionBiomasaMinuto: number;
  produccionBiocharMinuto: number;
  rendimientoInstantaneo: number;
  alimentacionBiomasaHora: number;
  produccionBiocharHora: number;
  realizaRegistro: string;
}

interface AforoFormData {
  hertzTolva: string;
  alimentacionBiomasaMinuto: string;
  produccionBiocharMinuto: string;
}

export default function AforosTurno() {
  return (
    <TurnoProtection requiresTurno={true}>
      <AforosTurnoContent />
    </TurnoProtection>
  );
}

function AforosTurnoContent() {
  const [aforos, setAforos] = useState<Aforo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [turnoCerrado, setTurnoCerrado] = useState(false);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [rendimientoPromedio, setRendimientoPromedio] = useState(0);
  const router = useRouter();

  const [formData, setFormData] = useState<AforoFormData>({
    hertzTolva: '',
    alimentacionBiomasaMinuto: '',
    produccionBiocharMinuto: '',
  });

  // Rendimiento instantáneo en tiempo real (preview)
  const rendimientoPreview = (() => {
    const biomasa = parseFloat(formData.alimentacionBiomasaMinuto);
    const biochar = parseFloat(formData.produccionBiocharMinuto);
    if (biomasa > 0 && biochar >= 0) {
      return Math.round(((biochar / biomasa) * 100) * 100) / 100;
    }
    return null;
  })();

  const loadAforos = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/aforos?turno_id=${id}`);
      const result = await response.json();
      if (response.ok && result.success) {
        setAforos(result.data);
        setRendimientoPromedio(result.resumen?.rendimientoPromedio || 0);
      }
    } catch (err) {
      console.error('Error al cargar aforos:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      // Obtener datos del usuario
      const userSession = localStorage.getItem('userSession');
      if (userSession) {
        try {
          const sessionData = JSON.parse(userSession);
          setUserName(sessionData.user?.Nombre || '');
          setUserRole(sessionData.user?.cargo || '');
        } catch { /* ignore */ }
      }

      // Obtener turno activo
      const turnoActivo = localStorage.getItem('turnoActivo');
      if (!turnoActivo) {
        setLoading(false);
        return;
      }

      try {
        const turno = JSON.parse(turnoActivo);
        setTurnoId(turno.id);

        // Verificar si el turno está cerrado
        const checkResponse = await fetch(`/api/turno/check?userId=${JSON.parse(userSession || '{}').user?.id || ''}`);
        const checkResult = await checkResponse.json();
        if (!checkResult.hasTurnoAbierto) {
          setTurnoCerrado(true);
        }

        // Cargar aforos existentes
        await loadAforos(turno.id);
      } catch (err) {
        console.error('Error inicializando aforos:', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [loadAforos]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnoId || turnoCerrado) return;

    setSaving(true);
    setMensaje('');

    try {
      const response = await fetch('/api/aforos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnoId,
          hertzTolva: parseFloat(formData.hertzTolva),
          alimentacionBiomasaMinuto: parseFloat(formData.alimentacionBiomasaMinuto),
          produccionBiocharMinuto: parseFloat(formData.produccionBiocharMinuto),
          realizaRegistro: userName,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMensaje('✅ Aforo registrado exitosamente');
        setFormData({ hertzTolva: '', alimentacionBiomasaMinuto: '', produccionBiocharMinuto: '' });
        await loadAforos(turnoId);
      } else {
        setMensaje(`❌ ${result.error || 'Error al registrar aforo'}`);
      }
    } catch (err) {
      setMensaje('❌ Error de conexión al registrar aforo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (aforoId: string) => {
    if (!confirm('¿Estás seguro de eliminar este aforo?')) return;

    try {
      const response = await fetch(`/api/aforos/${aforoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eliminadoPor: userName }),
      });

      const result = await response.json();
      if (response.ok && result.success) {
        setMensaje('✅ Aforo eliminado');
        if (turnoId) await loadAforos(turnoId);
      } else {
        setMensaje(`❌ ${result.error || 'Error al eliminar aforo'}`);
      }
    } catch {
      setMensaje('❌ Error de conexión al eliminar aforo');
    }
  };

  const canDelete = userRole?.toLowerCase().includes('admin') || userRole?.toLowerCase().includes('supervisor');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">🔄 Cargando aforos del turno...</div>
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
      <div className="absolute inset-0 bg-black/50"></div>
      
      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-2 text-center drop-shadow-lg">
              📊 Registro de Aforos del Turno
            </h1>
            <p className="text-center text-white/80 mb-6 drop-shadow">
              Mediciones de tasa de alimentación y producción durante el turno activo
            </p>

            {/* Estado del turno */}
            {turnoCerrado && (
              <div className="mb-6 p-4 bg-red-500/30 border border-red-400/50 rounded-lg text-center text-white font-semibold">
                🔒 Turno cerrado — Los aforos son de solo lectura
              </div>
            )}

            {mensaje && (
              <div className={`mb-6 p-4 rounded-lg text-center font-semibold backdrop-blur-sm ${
                mensaje.includes('✅') 
                  ? 'bg-green-500/80 text-white border border-green-400/50' 
                  : 'bg-red-500/80 text-white border border-red-400/50'
              }`}>
                {mensaje}
              </div>
            )}

            {/* Resumen de rendimiento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 text-center">
                <p className="text-white/70 text-sm">Total Aforos Registrados</p>
                <p className="text-white font-bold text-3xl">{aforos.length}</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20 text-center">
                <p className="text-white/70 text-sm">Rendimiento Promedio del Turno</p>
                <p className="text-white font-bold text-3xl">
                  {rendimientoPromedio > 0 ? `${rendimientoPromedio}%` : '—'}
                </p>
              </div>
            </div>

            {/* Formulario de registro (solo si turno activo) */}
            {!turnoCerrado && turnoId && (
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">
                  📝 Registrar Nuevo Aforo
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="hertzTolva" className="block text-sm font-medium text-white mb-1">
                        Hertz Tolva
                      </label>
                      <input
                        type="number"
                        id="hertzTolva"
                        name="hertzTolva"
                        value={formData.hertzTolva}
                        onChange={handleInputChange}
                        required
                        min="0"
                        step="0.1"
                        placeholder="Ej: 20"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                      />
                    </div>
                    <div>
                      <label htmlFor="alimentacionBiomasaMinuto" className="block text-sm font-medium text-white mb-1">
                        Biomasa/min (Kg)
                      </label>
                      <input
                        type="number"
                        id="alimentacionBiomasaMinuto"
                        name="alimentacionBiomasaMinuto"
                        value={formData.alimentacionBiomasaMinuto}
                        onChange={handleInputChange}
                        required
                        min="0"
                        step="0.01"
                        placeholder="Ej: 1.70"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                      />
                    </div>
                    <div>
                      <label htmlFor="produccionBiocharMinuto" className="block text-sm font-medium text-white mb-1">
                        Biochar/min (Kg)
                      </label>
                      <input
                        type="number"
                        id="produccionBiocharMinuto"
                        name="produccionBiocharMinuto"
                        value={formData.produccionBiocharMinuto}
                        onChange={handleInputChange}
                        required
                        min="0"
                        step="0.01"
                        placeholder="Ej: 0.50"
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#5A7836] focus:border-[#5A7836] bg-white text-gray-900 placeholder-gray-500 font-medium"
                      />
                    </div>
                  </div>

                  {/* Preview de rendimiento instantáneo */}
                  {rendimientoPreview !== null && (
                    <div className="bg-white/10 border border-white/20 rounded-lg p-3 text-center">
                      <p className="text-white/70 text-sm">Rendimiento instantáneo (preview)</p>
                      <p className={`text-2xl font-bold ${
                        rendimientoPreview > 30 ? 'text-green-300' : rendimientoPreview > 20 ? 'text-yellow-300' : 'text-red-300'
                      }`}>
                        {rendimientoPreview}%
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-8 py-3 bg-gradient-to-r from-[#5A7836] to-[#4a6429] text-white rounded-lg hover:from-[#4a6429] hover:to-[#3d5422] transition-all duration-200 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <span>💾</span>
                          <span>Guardar Aforo</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Historial de aforos */}
            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow">
                📋 Historial de Aforos del Turno
              </h2>
              
              {aforos.length === 0 ? (
                <p className="text-white/60 text-center py-8">
                  No hay aforos registrados en este turno
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-white/70 font-medium py-3 px-2">Hora</th>
                        <th className="text-white/70 font-medium py-3 px-2">Hz Tolva</th>
                        <th className="text-white/70 font-medium py-3 px-2">Biomasa/min</th>
                        <th className="text-white/70 font-medium py-3 px-2">Biochar/min</th>
                        <th className="text-white/70 font-medium py-3 px-2">Biomasa/h</th>
                        <th className="text-white/70 font-medium py-3 px-2">Biochar/h</th>
                        <th className="text-white/70 font-medium py-3 px-2">Rendimiento</th>
                        <th className="text-white/70 font-medium py-3 px-2">Registró</th>
                        {canDelete && !turnoCerrado && (
                          <th className="text-white/70 font-medium py-3 px-2">Acción</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {aforos.map((aforo) => (
                        <tr key={aforo.id} className="border-b border-white/10 hover:bg-white/5">
                          <td className="text-white py-3 px-2">
                            {new Date(aforo.fechaHoraRegistro).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="text-white py-3 px-2">{aforo.hertzTolva}</td>
                          <td className="text-white py-3 px-2">{aforo.alimentacionBiomasaMinuto} Kg</td>
                          <td className="text-white py-3 px-2">{aforo.produccionBiocharMinuto} Kg</td>
                          <td className="text-white/70 py-3 px-2">{aforo.alimentacionBiomasaHora.toFixed(1)} Kg/h</td>
                          <td className="text-white/70 py-3 px-2">{aforo.produccionBiocharHora.toFixed(1)} Kg/h</td>
                          <td className="py-3 px-2">
                            <span className={`font-bold ${
                              aforo.rendimientoInstantaneo > 30 ? 'text-green-300' : aforo.rendimientoInstantaneo > 20 ? 'text-yellow-300' : 'text-red-300'
                            }`}>
                              {aforo.rendimientoInstantaneo}%
                            </span>
                          </td>
                          <td className="text-white/70 py-3 px-2 text-xs">{aforo.realizaRegistro}</td>
                          {canDelete && !turnoCerrado && (
                            <td className="py-3 px-2">
                              <button
                                onClick={() => handleDelete(aforo.id)}
                                className="text-red-400 hover:text-red-300 text-xs font-medium"
                              >
                                🗑️ Eliminar
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

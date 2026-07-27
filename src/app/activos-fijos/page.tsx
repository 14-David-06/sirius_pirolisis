/**
 * Página principal del Sistema de Gestión de Activos Fijos
 * Multi-área para toda la empresa Sirius
 */

"use client";

import { useState } from 'react';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  EstadisticasActivos,
  AlertasActivos,
  ActivosTable,
  RegistrarActivoForm,
  DetalleActivoModal,
} from '@/components/activos';
import type { ActivoFijoRecord } from '@/types/activos';
import { useActivos, useEstadisticasActivos } from '@/lib/useActivos';

// Función helper para obtener el nombre del usuario actual
const getCurrentUserName = (): string => {
  try {
    const userSession = localStorage.getItem('userSession');
    if (userSession) {
      const sessionData = JSON.parse(userSession);
      return sessionData.user?.Nombre || sessionData.user?.name || 'Usuario Desconocido';
    }
  } catch (error) {
    console.error('Error obteniendo nombre de usuario:', error);
  }
  return 'Usuario Desconocido';
};

export default function ActivosFijos() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <ActivosFijosContent />
    </TurnoProtection>
  );
}

function ActivosFijosContent() {
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [activoSeleccionado, setActivoSeleccionado] = useState<ActivoFijoRecord | null>(null);

  // Hooks principales
  const {
    data,
    loading,
    error,
    refreshActivos,
    getTotalActivos,
    getActivosOperativos,
    getActivosEnReparacion,
    getActivosAsignados,
    getActivosDisponibles,
    getActivosProximosAVencer,
    getValorTotalActivos,
    // Getters
    getActivoNombre,
    getActivoCodigo,
    getActivoCategoria,
    getActivoEstado,
    getActivoUbicacion,
    getActivoArea,
    getActivoResponsable,
    getActivoEstaAsignado,
    getActivoDiasVencimiento,
  } = useActivos({
    categoria: (filtroCategoria || undefined) as any,
    estadoOperativo: (filtroEstado || undefined) as any,
  });

  const { estadisticas } = useEstadisticasActivos();

  const handleModalSuccess = async (successMessage: string) => {
    setShowModal(false);
    await refreshActivos();
    alert(successMessage);
  };

  const handleFilterChange = (categoria: string, estado: string) => {
    setFiltroCategoria(categoria);
    setFiltroEstado(estado);
  };

  // Estados de carga y error
  if (loading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat relative" style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
      }}>
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30">
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-lg">Cargando activos fijos...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const isNotConfigured = error.includes('no configurado');

    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat relative" style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
      }}>
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30">
            <div className="text-white text-center">
              {isNotConfigured ? (
                <>
                  <div className="text-6xl mb-4">🔧</div>
                  <h2 className="text-2xl font-bold mb-4">Módulo de Activos Fijos</h2>
                  <p className="text-lg mb-4">Sistema de gestión de activos para toda la empresa</p>
                  <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-200">
                      <strong>⚠️ Configuración pendiente:</strong><br />
                      Para activar este módulo, necesitas:
                    </p>
                    <ul className="text-sm text-yellow-200 mt-2 text-left">
                      <li>• Verificar que las tablas existen en Airtable (base "Sirius Activos Core")</li>
                      <li>• Configurar las variables de entorno en .env.local:</li>
                      <li className="ml-4 font-mono text-xs">AIRTABLE_ACTIVOS_CORE_BASE_ID</li>
                      <li className="ml-4 font-mono text-xs">AIRTABLE_ACTIVOS_FIJOS_TABLE_ID</li>
                      <li className="ml-4 font-mono text-xs">AIRTABLE_ASIGNACIONES_TABLE_ID</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg mb-4">Error al cargar activos</p>
                  <p className="text-sm text-white/70">{error}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalActivos = getTotalActivos();
  const operativos = getActivosOperativos();
  const enReparacion = getActivosEnReparacion();
  const asignados = getActivosAsignados();
  const disponibles = getActivosDisponibles();
  const porVencer = getActivosProximosAVencer();
  const valorTotal = getValorTotalActivos();

  const isTableEmpty = data && data.records && data.records.length === 0;

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative"
      style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
      }}
    >
      <div className="absolute inset-0 bg-black/40"></div>

      <div className="relative z-10">
        <Navbar />
        <main className="container mx-auto px-6 py-8">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">
              🔧 Sistema de Activos Fijos
            </h1>
            <p className="text-center text-white/90 mb-6 drop-shadow text-lg">
              Gestión integral de activos fijos para toda la empresa Sirius
            </p>

            {/* Banner informativo de separación de módulos */}
            <div className="bg-blue-500/20 backdrop-blur-md rounded-lg p-4 mb-6 border border-blue-500/30">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">ℹ️</span>
                <div className="flex-1">
                  <p className="text-white font-semibold">
                    Este módulo gestiona <strong>Activos Fijos</strong> (Herramientas, Equipos, Vehículos, Tecnología)
                  </p>
                  <p className="text-white/80 text-sm mt-1">
                    ¿Buscas Materiales o Químicos consumibles? →{' '}
                    <a
                      href="/inventario-pirolisis"
                      className="underline hover:text-white font-semibold"
                    >
                      Ir a Inventario de Almacén
                    </a>
                  </p>
                </div>
              </div>
            </div>

            {/* Botón de acción */}
            <div className="text-center mb-6">
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2 mx-auto"
              >
                <span>📝</span>
                <span>Registrar Nuevo Activo</span>
              </button>
            </div>

            {isTableEmpty ? (
              <div className="bg-blue-500/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-blue-500/30 text-center">
                <div className="text-6xl mb-4">🔧</div>
                <h2 className="text-2xl font-bold text-white mb-4">¡Sistema de Activos Fijos Listo!</h2>
                <p className="text-lg text-white/90 mb-4">
                  Las tablas están configuradas correctamente pero aún no hay activos registrados.
                </p>
                <p className="text-white/80 mb-6">
                  Comienza registrando tu primer activo usando el botón "Registrar Nuevo Activo" arriba.
                </p>
                <div className="bg-white/10 rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-2">
                    <strong>Tipos de activos que puedes registrar:</strong>
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-white/80">
                    <div>🔧 Herramientas</div>
                    <div>⚙️ Equipos Industriales</div>
                    <div>🚛 Vehículos</div>
                    <div>💻 Tecnología</div>
                    <div>🏭 Infraestructura</div>
                    <div>📦 Mobiliario</div>
                    <div>🔥 Seguridad</div>
                    <div>✨ Y más...</div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Estadísticas generales */}
                <EstadisticasActivos
                  totalActivos={totalActivos}
                  operativos={operativos.length}
                  enReparacion={enReparacion.length}
                  asignados={asignados.length}
                  disponibles={disponibles.length}
                  porVencer={porVencer.length}
                  valorTotal={valorTotal}
                />

                {/* Alertas */}
                <AlertasActivos
                  porVencer={porVencer}
                  enReparacion={enReparacion}
                  getActivoNombre={getActivoNombre}
                  getActivoCodigo={getActivoCodigo}
                  getActivoDiasVencimiento={getActivoDiasVencimiento}
                />

                {/* Tabla de activos */}
                <ActivosTable
                  activos={data?.records || []}
                  getActivoNombre={getActivoNombre}
                  getActivoCodigo={getActivoCodigo}
                  getActivoCategoria={getActivoCategoria}
                  getActivoEstado={getActivoEstado}
                  getActivoUbicacion={getActivoUbicacion}
                  getActivoArea={getActivoArea}
                  getActivoResponsable={getActivoResponsable}
                  getActivoEstaAsignado={getActivoEstaAsignado}
                  getActivoDiasVencimiento={getActivoDiasVencimiento}
                  onFilterChange={handleFilterChange}
                  onVerDetalle={(activo) => {
                    setActivoSeleccionado(activo);
                  }}
                />
              </>
            )}
          </div>
        </main>
        <Footer />
      </div>

      {/* Modal para formularios */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl w-full max-w-4xl mx-auto border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-6 rounded-t-xl border-b border-white/10">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg text-center">
                📝 Registrar Nuevo Activo
              </h2>
              <p className="text-center text-white/80 mt-2 drop-shadow text-sm">
                Registra un nuevo activo fijo en el sistema (herramientas, equipos, vehículos, etc.)
              </p>
            </div>

            <RegistrarActivoForm
              onSuccess={() => handleModalSuccess('Activo registrado exitosamente')}
              onCancel={() => setShowModal(false)}
              getCurrentUserName={getCurrentUserName}
            />
          </div>
        </div>
      )}

      {/* Modal de Detalle */}
      <DetalleActivoModal
        activo={activoSeleccionado}
        onClose={() => setActivoSeleccionado(null)}
        onUpdate={async () => {
          await refreshActivos();
        }}
      />
    </div>
  );
}

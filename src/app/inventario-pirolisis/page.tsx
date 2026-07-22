/**
 * Página principal del Sistema de Inventario de Pirolisis
 * Versión refactorizada y simplificada - orquesta componentes sin lógica de negocio
 */

"use client";

import { useState } from 'react';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SalidaInsumoForm from '@/components/SalidaInsumoForm';
import {
  EstadisticasGenerales,
  AlertasInventario,
  VencimientosProximos,
  MetricasSection,
  PaqueteLonasCard,
  InventarioTable,
  RegistrarInsumoForm,
  IngresoInsumoForm,
} from '@/components/inventario';
import { useInventario } from '@/lib/useInventario';
import { DIAS_ALERTA_VENCIMIENTO } from '@/lib/inventario.constants';

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

export default function InventarioPirolisis() {
  return (
    <TurnoProtection requiresTurno={true} allowBitacoraUsers={true}>
      <InventarioPirolisisContent />
    </TurnoProtection>
  );
}

function InventarioPirolisisContent() {
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'ingresar' | 'registrar' | 'salida'>('ingresar');

  const {
    data,
    loading,
    error,
    refreshInventario,
    getTotalItems,
    getItemsByCategory,
    getLowStockItems,
    getVencimientosProximos,
    getItemName,
    getItemDescription,
    getItemEntradas,
    getItemSalidas,
    getItemPresentacion,
    getItemCantidadPresentacion,
    getItemCategory,
    getItemQuantity,
    getItemUnit,
    getItemStockTotal,
    getItemCategoriaInsumo,
    getItemEstado,
    getItemFechaVencimiento,
  } = useInventario({
    categoria: filtroCategoria || undefined,
    estado: filtroEstado || undefined,
  });

  const handleModalSuccess = async (successMessage: string) => {
    setShowModal(false);
    await refreshInventario();
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
              <p className="text-lg">Cargando inventario...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const isTableNotConfigured = error.includes('no configurado') || error.includes('AIRTABLE_INVENTARIO_TABLE_ID');
    const isTableNotFound = error.includes('no encontrada') || error.includes('INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND');

    return (
      <div className="min-h-screen bg-cover bg-center bg-no-repeat relative" style={{
        backgroundImage: "url('https://res.cloudinary.com/dvnuttrox/image/upload/v1752165981/20032025-DSCF8381_2_1_jzs49t.jpg')"
      }}>
        <div className="absolute inset-0 bg-black/40"></div>
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-white/30">
            <div className="text-white text-center">
              {isTableNotConfigured ? (
                <>
                  <div className="text-6xl mb-4">📦</div>
                  <h2 className="text-2xl font-bold mb-4">Módulo de Inventario</h2>
                  <p className="text-lg mb-4">El módulo de inventario está listo para usar</p>
                  <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-200">
                      <strong>⚠️ Configuración pendiente:</strong><br />
                      Para activar este módulo, necesitas:
                    </p>
                    <ul className="text-sm text-yellow-200 mt-2 text-left">
                      <li>• Crear una tabla "Inventario Pirolisis" en Airtable</li>
                      <li>• Descomentar y configurar <code>AIRTABLE_INVENTARIO_TABLE_ID</code> en .env.local</li>
                      <li>• Agregar el ID de tu tabla de Airtable</li>
                    </ul>
                  </div>
                </>
              ) : isTableNotFound ? (
                <>
                  <div className="text-6xl mb-4">🔍</div>
                  <h2 className="text-2xl font-bold mb-4">Tabla No Encontrada</h2>
                  <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-200">
                      <strong>🔧 Posibles soluciones:</strong>
                    </p>
                    <ul className="text-sm text-red-200 mt-2 text-left">
                      <li>• Verifica que la tabla "Inventario Pirolisis" existe en Airtable</li>
                      <li>• Confirma que el ID de tabla en .env.local es correcto</li>
                      <li>• Asegúrate de que tienes permisos de acceso a la tabla</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg mb-4">Error al cargar inventario</p>
                  <p className="text-sm text-white/70">{error}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalItems = getTotalItems();
  const lowStockItems = getLowStockItems();
  const categories = getItemsByCategory();
  const vencimientosProximos = getVencimientosProximos(DIAS_ALERTA_VENCIMIENTO);
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
              🏭 Sistema de Inventario - Pirolisis
            </h1>
            <p className="text-center text-white/90 mb-6 drop-shadow text-lg">
              Gestión integral del inventario de insumos para procesos de pirólisis industrial
            </p>

            {/* Botones de acciones */}
            <div className="text-center mb-6">
              <div className="flex justify-center space-x-4 flex-wrap gap-4">
                <button
                  onClick={() => { setModalMode('ingresar'); setShowModal(true); }}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <span>📦</span>
                  <span>Ingresar Cantidades</span>
                </button>
                <button
                  onClick={() => { setModalMode('salida'); setShowModal(true); }}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <span>📤</span>
                  <span>Salida de Insumos</span>
                </button>
                <button
                  onClick={() => { setModalMode('registrar'); setShowModal(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <span>📝</span>
                  <span>Registrar Nuevo Insumo</span>
                </button>
              </div>
            </div>

            {isTableEmpty ? (
              <div className="bg-blue-500/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-blue-500/30 text-center">
                <div className="text-6xl mb-4">📦</div>
                <h2 className="text-2xl font-bold text-white mb-4">¡Tabla de Inventario Lista!</h2>
                <p className="text-lg text-white/90 mb-4">
                  La tabla de inventario está configurada correctamente pero aún no tiene datos.
                </p>
              </div>
            ) : (
              <>
                <EstadisticasGenerales
                  totalItems={totalItems}
                  totalCategorias={Object.keys(categories).length}
                  itemsStockBajo={lowStockItems.length}
                />

                <AlertasInventario
                  items={lowStockItems}
                  getItemName={getItemName}
                  getItemCategory={getItemCategory}
                  getItemDescription={getItemDescription}
                  getItemQuantity={getItemQuantity}
                  getItemUnit={getItemUnit}
                />

                <VencimientosProximos
                  items={vencimientosProximos}
                  diasAlerta={DIAS_ALERTA_VENCIMIENTO}
                  getItemName={getItemName}
                  getItemCategoriaInsumo={getItemCategoriaInsumo}
                  getItemCategory={getItemCategory}
                  getItemFechaVencimiento={getItemFechaVencimiento}
                />

                <MetricasSection />
                <PaqueteLonasCard />

                <InventarioTable
                  categories={categories}
                  getItemName={getItemName}
                  getItemCategory={getItemCategory}
                  getItemCategoriaInsumo={getItemCategoriaInsumo}
                  getItemEstado={getItemEstado}
                  getItemPresentacion={getItemPresentacion}
                  getItemCantidadPresentacion={getItemCantidadPresentacion}
                  getItemStockTotal={getItemStockTotal}
                  getItemDescription={getItemDescription}
                  getItemEntradas={getItemEntradas}
                  getItemSalidas={getItemSalidas}
                  onFilterChange={handleFilterChange}
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
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl w-full max-w-2xl mx-auto border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-6 rounded-t-xl border-b border-white/10">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg text-center">
                {modalMode === 'ingresar' ? '📦 Ingresar Cantidades al Inventario'
                  : modalMode === 'salida' ? '📤 Salida de Insumos — Trazabilidad'
                  : '📝 Registrar Nuevo Insumo'}
              </h2>
              <p className="text-center text-white/80 mt-2 drop-shadow text-sm">
                {modalMode === 'ingresar'
                  ? 'Selecciona un insumo existente y agrega cantidades al inventario.'
                  : modalMode === 'salida'
                  ? 'Registra la salida con tipo de uso y vinculación productiva.'
                  : 'Registra un nuevo insumo en el sistema de inventario de pirolisis.'
                }
              </p>
            </div>

            {modalMode === 'salida' ? (
              <SalidaInsumoForm
                records={data?.records || []}
                getItemName={getItemName}
                getItemCategory={getItemCategory}
                getItemQuantity={getItemQuantity}
                getItemPresentacion={getItemPresentacion}
                getItemStockTotal={getItemStockTotal}
                getCurrentUserName={getCurrentUserName}
                onSuccess={() => handleModalSuccess('Salida de insumo registrada exitosamente')}
                onCancel={() => setShowModal(false)}
              />
            ) : modalMode === 'ingresar' ? (
              <IngresoInsumoForm
                records={data?.records || []}
                onSuccess={() => handleModalSuccess('Cantidad agregada exitosamente')}
                onCancel={() => setShowModal(false)}
                getCurrentUserName={getCurrentUserName}
                getItemName={getItemName}
                getItemCategory={getItemCategory}
                getItemStockTotal={getItemStockTotal}
              />
            ) : (
              <RegistrarInsumoForm
                onSuccess={() => handleModalSuccess('Insumo registrado exitosamente')}
                onCancel={() => setShowModal(false)}
                getCurrentUserName={getCurrentUserName}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

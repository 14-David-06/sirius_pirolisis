"use client";

import { useState, useEffect } from 'react';
import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useInventario } from '@/lib/useInventario';

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
    <TurnoProtection requiresTurno={true}>
      <InventarioPirolisisContent />
    </TurnoProtection>
  );
}

function InventarioPirolisisContent() {
  const { data, loading, error, refreshInventario, getTotalItems, getItemsByCategory, getLowStockItems, getItemName, getItemDescription, getItemEntradas, getItemSalidas, getItemPresentacion, getItemCantidadPresentacion } = useInventario();

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'ingresar' | 'registrar'>('ingresar');
  const [newItem, setNewItem] = useState({
    'Nombre del Insumo': '',
    'Categoría': '',
    'Presentación': '',
    'Cantidad Presentacion Insumo': '',
    'Presentación Personalizada': '',
    'Ficha Seguridad URL': ''
  });
  const [safetySheetFile, setSafetySheetFile] = useState<File | null>(null);
  const [uploadingSafetySheet, setUploadingSafetySheet] = useState(false);
  const [creating, setCreating] = useState(false);

  // Limpiar campo personalizado cuando se cambia la presentación
  useEffect(() => {
    if (newItem['Presentación'] !== 'Otro') {
      setNewItem(prev => ({ ...prev, 'Presentación Personalizada': '' }));
    }
  }, [newItem['Presentación']]);

  // Función para subir ficha de seguridad
  const uploadSafetySheet = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/s3/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details || errorData.error || 'Error al subir archivo');
    }

    const data = await response.json();
    return data.fileUrl;
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem['Nombre del Insumo'] || !newItem['Categoría']) {
      alert('Por favor completa los campos requeridos: Nombre del Insumo y Categoría');
      return;
    }

    setCreating(true);
    try {
      // Preparar los datos incluyendo el nombre del usuario que realiza el registro
      const itemData = {
        ...newItem,
        'Realiza Registro': getCurrentUserName()
      };

      // Si se seleccionó "Otro", usar el valor personalizado
      if (itemData['Presentación'] === 'Otro') {
        itemData['Presentación'] = itemData['Presentación Personalizada'] || 'Otro';
      }

      // Subir ficha de seguridad si es un químico y se seleccionó un archivo
      if (itemData['Categoría'] === 'Químicos' && safetySheetFile) {
        setUploadingSafetySheet(true);
        try {
          const fileUrl = await uploadSafetySheet(safetySheetFile);
          itemData['Ficha Seguridad URL'] = fileUrl;
        } catch (uploadError: any) {
          throw new Error(`Error al subir ficha de seguridad: ${uploadError.message}`);
        } finally {
          setUploadingSafetySheet(false);
        }
      }

      const response = await fetch('/api/inventario/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(itemData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error al ${modalMode === 'ingresar' ? 'ingresar' : 'registrar'} el elemento`);
      }

      // Limpiar formulario y cerrar modal
      setNewItem({
        'Nombre del Insumo': '',
        'Categoría': '',
        'Presentación': '',
        'Cantidad Presentacion Insumo': '',
        'Presentación Personalizada': '',
        'Ficha Seguridad URL': ''
      });
      setSafetySheetFile(null);
      setShowModal(false);

      // Refrescar los datos
      await refreshInventario();
      alert(`${modalMode === 'ingresar' ? 'Elemento ingresado' : 'Insumo registrado'} exitosamente`);
    } catch (err: any) {
      alert(`Error al ${modalMode === 'ingresar' ? 'ingresar' : 'registrar'} el elemento: ' + err.message`);
    } finally {
      setCreating(false);
    }
  };

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
                  <p className="text-sm text-white/70">
                    Una vez configurado, podrás gestionar tu inventario de materiales para pirolisis.
                  </p>
                </>
              ) : isTableNotFound ? (
                <>
                  <div className="text-6xl mb-4">🔍</div>
                  <h2 className="text-2xl font-bold mb-4">Tabla No Encontrada</h2>
                  <p className="text-lg mb-4">No se pudo encontrar la tabla de inventario</p>
                  <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-200">
                      <strong>🔧 Posibles soluciones:</strong>
                    </p>
                    <ul className="text-sm text-red-200 mt-2 text-left">
                      <li>• Verifica que la tabla "Inventario Pirolisis" existe en Airtable</li>
                      <li>• Confirma que el ID de tabla en .env.local es correcto</li>
                      <li>• Asegúrate de que tienes permisos de acceso a la tabla</li>
                      <li>• Revisa que el token de Airtable es válido</li>
                    </ul>
                  </div>
                  <p className="text-sm text-white/70">
                    Revisa la documentación en <code>INVENTARIO_README.md</code> para más detalles.
                  </p>
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

  // Verificar si la tabla existe pero está vacía
  const isTableEmpty = data && data.records && data.records.length === 0;

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
          <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-8 max-w-6xl mx-auto border border-white/30">
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">🏭 Sistema de Inventario - Pirolisis</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow text-lg">
              Gestión integral del inventario de insumos para procesos de pirólisis industrial
            </p>

            {/* Botones para acciones del inventario */}
            <div className="text-center mb-6">
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => {
                    setModalMode('ingresar');
                    setShowModal(true);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <span>➕</span>
                  <span>Ingresar Elemento</span>
                </button>
                <button
                  onClick={() => {
                    setModalMode('registrar');
                    setShowModal(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <span>📝</span>
                  <span>Registrar Nuevo Insumo</span>
                </button>
              </div>
            </div>

            {isTableEmpty ? (
              /* Tabla vacía - mostrar mensaje informativo */
              <div className="bg-blue-500/20 backdrop-blur-md rounded-lg shadow-lg p-8 border border-blue-500/30 text-center">
                <div className="text-6xl mb-4">📦</div>
                <h2 className="text-2xl font-bold text-white mb-4">¡Tabla de Inventario Lista!</h2>
                <p className="text-lg text-white/90 mb-4">
                  La tabla de inventario está configurada correctamente pero aún no tiene datos.
                </p>
                <div className="bg-white/10 rounded-lg p-4 mb-4">
                  <p className="text-sm text-white/80 mb-2">Para empezar a usar el inventario:</p>
                  <ul className="text-sm text-white/70 text-left inline-block">
                    <li>• Agrega algunos items a tu tabla de Airtable</li>
                    <li>• Usa los campos: Nombre, Categoria, Cantidad, Unidad</li>
                    <li>• Configura Stock Minimo para recibir alertas</li>
                  </ul>
                </div>
                <p className="text-sm text-white/60">
                  Una vez que agregues datos, aparecerán aquí automáticamente.
                </p>
              </div>
            ) : (
              /* Tabla con datos - mostrar dashboard completo */
              <>

            {/* Estadísticas Generales */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">📊 Estadísticas del Inventario</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-white">
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-blue-300">{totalItems}</div>
                  <div className="text-sm drop-shadow">Total de Insumos</div>
                </div>
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-green-300">{Object.keys(categories).length}</div>
                  <div className="text-sm drop-shadow">Categorías Activas</div>
                </div>
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-red-300">{lowStockItems.length}</div>
                  <div className="text-sm drop-shadow">Items con Stock Bajo</div>
                </div>
                <div className="text-center bg-white/10 p-4 rounded-lg">
                  <div className="text-3xl font-bold text-purple-300">N/A</div>
                  <div className="text-sm drop-shadow">Total Unidades</div>
                </div>
              </div>
            </div>

            {/* Items con Stock Bajo */}
            {lowStockItems.length > 0 && (
              <div className="bg-red-500/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-red-500/30 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">⚠️ Alertas de Inventario</h2>
                <div className="space-y-3">
                  {lowStockItems.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center bg-white/10 p-4 rounded-lg border border-red-500/20">
                      <div className="flex-1">
                        <span className="text-white font-semibold text-lg">{getItemName(item)}</span>
                        <div className="text-sm text-white/70">Categoría: {item.fields['Categoría'] || 'Sin categoría'}</div>
                        {getItemDescription(item) && (
                          <div className="text-sm text-white/60 mt-1">{getItemDescription(item)}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-red-300 font-bold text-xl">
                          {item.fields['Cantidad Actual'] || 0} unidades
                        </span>
                        <div className="text-xs text-red-200 mt-1">Stock bajo</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inventario por Categorías */}
            <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30">
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Inventario por Categorías</h2>
              <div className="space-y-4">
                {Object.entries(categories).map(([categoria, items]) => {
                  const itemsArray = items as any[];
                  return (
                    <div key={categoria} className="bg-white/10 p-4 rounded">
                      <h3 className="text-lg font-semibold text-white mb-2 drop-shadow">
                        {categoria || 'Sin Categoría'} ({itemsArray.length} items)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {itemsArray.map((item: any, index: number) => (
                          <div key={index} className="bg-white/10 p-4 rounded-lg border border-white/20 hover:bg-white/15 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="font-semibold text-white text-lg">{getItemName(item)}</div>
                                <div className="text-sm text-white/70">Categoría: {item.fields['fld1IPRAdcleI4BKf'] || item.fields['Categoría'] || 'Sin categoría'}</div>
                                {getItemPresentacion(item) && (
                                  <div className="text-sm text-white/70">
                                    Presentación: {getItemCantidadPresentacion(item)} {getItemPresentacion(item)}
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-bold text-blue-300">N/A</div>
                                <div className="text-sm text-white/70">unidades</div>
                              </div>
                            </div>
                            {getItemDescription(item) && (
                              <div className="text-sm text-white/80 mt-2 p-2 bg-white/10 rounded">
                                <strong>Registro:</strong> {getItemDescription(item)}
                              </div>
                            )}
                            {(getItemEntradas(item).length > 0 || getItemSalidas(item).length > 0) && (
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-green-500/20 p-2 rounded">
                                  <div className="text-green-300 font-semibold">Entradas</div>
                                  <div className="text-white">{getItemEntradas(item).length} registros</div>
                                </div>
                                <div className="bg-red-500/20 p-2 rounded">
                                  <div className="text-red-300 font-semibold">Salidas</div>
                                  <div className="text-white">{getItemSalidas(item).length} registros</div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
              </>
            )}
          </div>
        </main>
        <Footer />
      </div>

      {/* Modal para ingresar elemento o registrar insumo */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4 text-black">
              {modalMode === 'ingresar' ? 'Ingresar Elemento al Inventario' : 'Registrar Nuevo Insumo'}
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              {modalMode === 'ingresar'
                ? 'Agrega cantidad a un elemento existente o crea uno nuevo en el inventario.'
                : 'Registra un nuevo insumo en el sistema de inventario de pirolisis.'
              }
            </p>
            <form onSubmit={handleCreateItem}>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-black">Nombre del Insumo *</label>
                <input
                  type="text"
                  value={newItem['Nombre del Insumo']}
                  onChange={(e) => setNewItem({...newItem, 'Nombre del Insumo': e.target.value})}
                  className="w-full p-2 border rounded text-black"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-black">Categoría *</label>
                <select
                  value={newItem['Categoría']}
                  onChange={(e) => setNewItem({...newItem, 'Categoría': e.target.value})}
                  className="w-full p-2 border rounded text-black"
                  required
                >
                  <option value="">Seleccionar categoría</option>
                  <option value="Materiales">Materiales</option>
                  <option value="Químicos">Químicos</option>
                  <option value="Herramientas">Herramientas</option>
                </select>
              </div>
              {newItem['Categoría'] === 'Químicos' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1 text-black">
                    Ficha de Seguridad (PDF) *
                  </label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setSafetySheetFile(e.target.files?.[0] || null)}
                    className="w-full p-2 border rounded text-black"
                    required={newItem['Categoría'] === 'Químicos'}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Archivo PDF con ficha de seguridad del químico (mínimo 100KB)
                  </p>
                  {safetySheetFile && (
                    <p className="text-xs text-green-600 mt-1">
                      Archivo seleccionado: {safetySheetFile.name}
                    </p>
                  )}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-black">Presentación</label>
                <select
                  value={newItem['Presentación']}
                  onChange={(e) => setNewItem({...newItem, 'Presentación': e.target.value})}
                  className="w-full p-2 border rounded text-black"
                >
                  <option value="">Seleccionar presentación</option>
                  <option value="Kilogramos">Kilogramos</option>
                  <option value="Litros">Litros</option>
                  <option value="Unidades">Unidades</option>
                  <option value="Bolsas">Bolsas</option>
                  <option value="Cajas">Cajas</option>
                  <option value="Galones">Galones</option>
                  <option value="Metros">Metros</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              {newItem['Presentación'] === 'Otro' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1 text-black">Especificar Presentación</label>
                  <input
                    type="text"
                    value={newItem['Presentación Personalizada']}
                    onChange={(e) => setNewItem({...newItem, 'Presentación Personalizada': e.target.value})}
                    className="w-full p-2 border rounded text-black"
                    placeholder="Ej: Toneladas, Barriles, etc."
                  />
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-black">Cantidad Presentacion Insumo</label>
                <input
                  type="number"
                  value={newItem['Cantidad Presentacion Insumo']}
                  onChange={(e) => setNewItem({...newItem, 'Cantidad Presentacion Insumo': e.target.value})}
                  className="w-full p-2 border rounded text-black"
                  placeholder="Ej: 25"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <label className="block text-sm font-medium mb-1 text-gray-700">Registrado por:</label>
                <p className="text-sm text-gray-600 font-medium">{getCurrentUserName()}</p>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 border rounded hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || uploadingSafetySheet}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {uploadingSafetySheet
                    ? 'Subiendo ficha de seguridad...'
                    : creating
                    ? (modalMode === 'ingresar' ? 'Ingresando...' : 'Registrando...')
                    : (modalMode === 'ingresar' ? 'Ingresar Elemento' : 'Registrar Insumo')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
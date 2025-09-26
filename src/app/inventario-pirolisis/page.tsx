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
  const { data, loading, error, refreshInventario, getTotalItems, getItemsByCategory, getLowStockItems, getItemName, getItemDescription, getItemEntradas, getItemSalidas, getItemPresentacion, getItemCantidadPresentacion, getItemCategory, getItemQuantity, getItemUnit, getItemStockTotal } = useInventario();

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'ingresar' | 'registrar' | 'salida'>('ingresar');
  const [newItem, setNewItem] = useState({
    'Nombre del Insumo': '',
    'Categoría': '',
    'Presentación': '',
    'Cantidad Presentacion Insumo': '',
    'Presentación Personalizada': '',
    'Ficha Seguridad URL': '',
    'Ficha Seguridad S3 Path': ''
  });
  const [safetySheetFile, setSafetySheetFile] = useState<File | null>(null);
  const [uploadingSafetySheet, setUploadingSafetySheet] = useState(false);
  const [creating, setCreating] = useState(false);
  const [addQuantityData, setAddQuantityData] = useState({
    selectedItemId: '',
    cantidad: '',
    notas: ''
  });
  const [removeQuantityData, setRemoveQuantityData] = useState({
    selectedItemId: '',
    cantidad: '',
    tipoSalida: 'Consumo en Proceso',
    observaciones: '',
    documentoSoporte: null as File | null
  });
  const [removeQuantityError, setRemoveQuantityError] = useState('');

  // Limpiar campo personalizado cuando se cambia la presentación
  useEffect(() => {
    if (newItem['Presentación'] !== 'Otro') {
      setNewItem(prev => ({ ...prev, 'Presentación Personalizada': '' }));
    }
  }, [newItem['Presentación']]);

  // Función para subir ficha de seguridad
  const uploadSafetySheet = async (file: File): Promise<{fileUrl: string, s3Path: string}> => {
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
    return {
      fileUrl: data.fileUrl,
      s3Path: data.s3Path
    };
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
          const uploadResult = await uploadSafetySheet(safetySheetFile);
          itemData['Ficha Seguridad URL'] = uploadResult.fileUrl;
          itemData['Ficha Seguridad S3 Path'] = uploadResult.s3Path;
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
        'Ficha Seguridad URL': '',
        'Ficha Seguridad S3 Path': ''
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

  // Función para agregar cantidades a items existentes
  const handleAddQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addQuantityData.selectedItemId || !addQuantityData.cantidad) {
      alert('Por favor selecciona un insumo y especifica la cantidad a agregar');
      return;
    }

    setCreating(true);
    try {
      const quantityData = {
        itemId: addQuantityData.selectedItemId,
        cantidad: parseFloat(addQuantityData.cantidad),
        notas: addQuantityData.notas,
        'Realiza Registro': getCurrentUserName(),
        tipo: 'entrada' // Para diferenciar de salidas
      };

      const response = await fetch('/api/inventario/add-quantity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quantityData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al agregar cantidad');
      }

      // Limpiar formulario y cerrar modal
      setAddQuantityData({
        selectedItemId: '',
        cantidad: '',
        notas: ''
      });
      setShowModal(false);

      // Refrescar los datos
      await refreshInventario();
      alert('Cantidad agregada exitosamente');
    } catch (err: any) {
      alert(`Error al agregar cantidad: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  // Función para remover cantidades de items existentes (salida de insumos)
  const handleRemoveQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!removeQuantityData.selectedItemId || !removeQuantityData.cantidad) {
      alert('Por favor selecciona un insumo y especifica la cantidad a remover');
      return;
    }

    // Validar que la cantidad no sea mayor al stock disponible
    const selectedItem = data?.records.find(item => item.id === removeQuantityData.selectedItemId);
    if (selectedItem) {
      const stockDisponible = getItemStockTotal(selectedItem);
      const cantidadARemover = parseFloat(removeQuantityData.cantidad);
      
      if (cantidadARemover > stockDisponible) {
        setRemoveQuantityError(`No puedes remover ${cantidadARemover} unidades. Solo hay ${stockDisponible} unidades disponibles en stock.`);
        return;
      }
    }

    // Limpiar error si la validación pasa
    setRemoveQuantityError('');

    // Validar tipo de salida
    const tiposValidos = ['Consumo en Proceso', 'Devolución a Proveedor', 'Ajuste', 'Traslado a Otro Almacén', 'Otro'];
    if (!tiposValidos.includes(removeQuantityData.tipoSalida)) {
      alert('Tipo de salida inválido. Por favor selecciona un tipo válido.');
      return;
    }

    setCreating(true);
    try {
      let documentoSoporteUrl = '';

      // Subir documento si existe
      if (removeQuantityData.documentoSoporte) {
        const formData = new FormData();
        formData.append('file', removeQuantityData.documentoSoporte);
        formData.append('folder', 'inventario-salidas');

        const uploadResponse = await fetch('/api/s3/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Error al subir el documento de soporte');
        }

        const uploadData = await uploadResponse.json();
        documentoSoporteUrl = uploadData.fileUrl;
      }

      const quantityData = {
        itemId: removeQuantityData.selectedItemId,
        cantidad: parseFloat(removeQuantityData.cantidad),
        tipoSalida: removeQuantityData.tipoSalida,
        observaciones: removeQuantityData.observaciones,
        documentoSoporteUrl,
        'Realiza Registro': getCurrentUserName()
      };

      const response = await fetch('/api/inventario/remove-quantity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quantityData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al registrar salida de insumo');
      }

      // Limpiar formulario y cerrar modal
      setRemoveQuantityData({
        selectedItemId: '',
        cantidad: '',
        tipoSalida: 'Consumo en Proceso',
        observaciones: '',
        documentoSoporte: null
      });
      setRemoveQuantityError('');
      setShowModal(false);

      // Refrescar los datos
      await refreshInventario();
      alert('Salida de insumo registrada exitosamente');
    } catch (err: any) {
      alert(`Error al registrar salida: ${err.message}`);
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
              <div className="flex justify-center space-x-4 flex-wrap gap-4">
                <button
                  onClick={() => {
                    setModalMode('ingresar');
                    setShowModal(true);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <span>📦</span>
                  <span>Ingresar Cantidades</span>
                </button>
                <button
                  onClick={() => {
                    setModalMode('salida');
                    setRemoveQuantityData({
                      selectedItemId: '',
                      cantidad: '',
                      tipoSalida: 'Consumo en Proceso',
                      observaciones: '',
                      documentoSoporte: null
                    });
                    setRemoveQuantityError('');
                    setShowModal(true);
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 flex items-center space-x-2"
                >
                  <span>📤</span>
                  <span>Salida de Insumos</span>
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
                        <div className="text-sm text-white/70">Categoría: {getItemCategory(item)}</div>
                        {getItemDescription(item) && (
                          <div className="text-sm text-white/60 mt-1">{getItemDescription(item)}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-red-300 font-bold text-xl">
                          {getItemQuantity(item)} {getItemUnit(item)}
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
                                <div className="text-sm text-white/70">Categoría: {getItemCategory(item)}</div>
                                {getItemPresentacion(item) && (
                                  <div className="text-sm text-white/70">
                                    Presentación: {getItemCantidadPresentacion(item)} {getItemPresentacion(item)}
                                  </div>
                                )}
                                <div className="text-base text-white font-semibold">
                                  Stock Disponible: {getItemStockTotal(item)} {getItemPresentacion(item) || 'unidades'}
                                </div>
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

      {/* Modal para ingresar cantidades o registrar insumo */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/10 backdrop-blur-md rounded-xl shadow-2xl w-full max-w-2xl mx-auto border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-6 rounded-t-xl border-b border-white/10">
              <h2 className="text-2xl font-bold text-white drop-shadow-lg text-center">
                {modalMode === 'ingresar' ? '📦 Ingresar Cantidades al Inventario' : modalMode === 'salida' ? '📤 Salida de Insumos' : '📝 Registrar Nuevo Insumo'}
              </h2>
              <p className="text-center text-white/80 mt-2 drop-shadow text-sm">
                {modalMode === 'ingresar'
                  ? 'Selecciona un insumo existente y agrega cantidades al inventario.'
                  : modalMode === 'salida'
                  ? 'Registra la salida de insumos del inventario con soporte para documentos.'
                  : 'Registra un nuevo insumo en el sistema de inventario de pirolisis.'
                }
              </p>
            </div>

            <form onSubmit={modalMode === 'ingresar' ? handleAddQuantity : modalMode === 'salida' ? handleRemoveQuantity : handleCreateItem} className="p-6">
              {modalMode === 'ingresar' ? (
                <div className="space-y-6">
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Seleccionar Insumo *</label>
                    <select
                      value={addQuantityData.selectedItemId}
                      onChange={(e) => setAddQuantityData({...addQuantityData, selectedItemId: e.target.value})}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
                      required
                    >
                      <option value="" className="bg-gray-800">Seleccionar insumo existente</option>
                      {data?.records.map((item: any) => (
                        <option key={item.id} value={item.id} className="bg-gray-800">
                          {getItemName(item)} - {getItemCategory(item)} - Presentación: {getItemCantidadPresentacion(item)} {getItemPresentacion(item)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Cantidad a Agregar *</label>
                    <input
                      type="number"
                      value={addQuantityData.cantidad}
                      onChange={(e) => setAddQuantityData({...addQuantityData, cantidad: e.target.value})}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
                      placeholder="Ej: 25"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>

                  <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-lg p-4 border border-green-500/20">
                    <label className="block text-sm font-semibold mb-2 text-green-200 drop-shadow">Registrado por:</label>
                    <p className="text-white font-medium drop-shadow">{getCurrentUserName()}</p>
                  </div>
                </div>
              ) : modalMode === 'salida' ? (
                <div className="space-y-6">
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Seleccionar Insumo *</label>
                    <select
                      value={removeQuantityData.selectedItemId}
                      onChange={(e) => {
                        setRemoveQuantityData({...removeQuantityData, selectedItemId: e.target.value});
                        setRemoveQuantityError('');
                      }}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm"
                      required
                    >
                      <option value="" className="bg-gray-800">Seleccionar insumo existente</option>
                      {data?.records.map((item: any) => (
                        <option key={item.id} value={item.id} className="bg-gray-800">
                          {getItemName(item)} - {getItemCategory(item)} - Presentación: {getItemQuantity(item)} {getItemPresentacion(item)}
                        </option>
                      ))}
                    </select>
                    {removeQuantityData.selectedItemId && (
                      <p className="text-sm text-blue-200 mt-2 drop-shadow">
                        📊 Stock disponible: <span className="font-semibold">
                          {(() => {
                            const selectedItem = data?.records.find(item => item.id === removeQuantityData.selectedItemId);
                            return selectedItem ? getItemStockTotal(selectedItem) : 0;
                          })()} {(() => {
                            const selectedItem = data?.records.find(item => item.id === removeQuantityData.selectedItemId);
                            return selectedItem ? getItemPresentacion(selectedItem) || 'unidades' : 'unidades';
                          })()}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Cantidad a Remover *</label>
                    <input
                      type="number"
                      value={removeQuantityData.cantidad}
                      onChange={(e) => {
                        setRemoveQuantityData({...removeQuantityData, cantidad: e.target.value});
                        setRemoveQuantityError('');
                      }}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm"
                      placeholder="Ej: 5"
                      min="0"
                      step="0.01"
                      required
                    />
                    {removeQuantityError && (
                      <div className="mt-2 p-2 bg-red-500/20 border border-red-500/30 rounded-lg">
                        <p className="text-red-200 text-sm drop-shadow">⚠️ {removeQuantityError}</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Tipo de Salida *</label>
                    <select
                      value={removeQuantityData.tipoSalida}
                      onChange={(e) => setRemoveQuantityData({...removeQuantityData, tipoSalida: e.target.value})}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm"
                      required
                    >
                      <option value="Consumo en Proceso" className="bg-gray-800">🔄 Consumo en Proceso</option>
                      <option value="Devolución a Proveedor" className="bg-gray-800">↩️ Devolución a Proveedor</option>
                      <option value="Ajuste" className="bg-gray-800">⚖️ Ajuste</option>
                      <option value="Traslado a Otro Almacén" className="bg-gray-800">🚛 Traslado a Otro Almacén</option>
                      <option value="Mantenimiento" className="bg-gray-800">🔧 Mantenimiento</option>
                      <option value="Otro" className="bg-gray-800">📝 Otro</option>
                    </select>
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Observaciones</label>
                    <textarea
                      value={removeQuantityData.observaciones}
                      onChange={(e) => setRemoveQuantityData({...removeQuantityData, observaciones: e.target.value})}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent backdrop-blur-sm resize-none"
                      placeholder="Detalles adicionales sobre la salida..."
                      rows={3}
                    />
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">📎 Documento de Soporte (Opcional)</label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setRemoveQuantityData({...removeQuantityData, documentoSoporte: e.target.files?.[0] || null})}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
                    />
                    <p className="text-xs text-white/60 mt-2 drop-shadow">
                      PDF, JPG, PNG (máximo 10MB)
                    </p>
                    {removeQuantityData.documentoSoporte && (
                      <div className="mt-2 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                        <p className="text-green-200 text-sm drop-shadow">
                          ✅ Archivo seleccionado: {removeQuantityData.documentoSoporte.name}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 rounded-lg p-4 border border-red-500/20">
                    <label className="block text-sm font-semibold mb-2 text-red-200 drop-shadow">Registrado por:</label>
                    <p className="text-white font-medium drop-shadow">{getCurrentUserName()}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Nombre del Insumo *</label>
                    <input
                      type="text"
                      value={newItem['Nombre del Insumo']}
                      onChange={(e) => setNewItem({...newItem, 'Nombre del Insumo': e.target.value})}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
                      placeholder="Ej: Hidróxido de Sodio"
                      required
                    />
                  </div>

                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Categoría *</label>
                    <select
                      value={newItem['Categoría']}
                      onChange={(e) => setNewItem({...newItem, 'Categoría': e.target.value})}
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
                      required
                    >
                      <option value="" className="bg-gray-800">Seleccionar categoría</option>
                      <option value="Materiales" className="bg-gray-800">🏭 Materiales</option>
                      <option value="Químicos" className="bg-gray-800">⚗️ Químicos</option>
                      <option value="Herramientas" className="bg-gray-800">🔧 Herramientas</option>
                      <option value="Equipos" className="bg-gray-800">⚙️ Equipos</option>
                      <option value="Consumibles" className="bg-gray-800">📦 Consumibles</option>
                    </select>
                  </div>

                  {newItem['Categoría'] === 'Químicos' && (
                    <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-lg p-4 border border-yellow-500/20">
                      <label className="block text-sm font-semibold mb-2 text-yellow-200 drop-shadow">
                        📋 Ficha de Seguridad (PDF) *
                      </label>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setSafetySheetFile(e.target.files?.[0] || null)}
                        className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-yellow-600 file:text-white hover:file:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent backdrop-blur-sm"
                        required={newItem['Categoría'] === 'Químicos'}
                      />
                      <p className="text-xs text-yellow-200 mt-2 drop-shadow">
                        Archivo PDF con ficha de seguridad del químico (mínimo 100KB)
                      </p>
                      {safetySheetFile && (
                        <div className="mt-2 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                          <p className="text-green-200 text-sm drop-shadow">
                            ✅ Archivo seleccionado: {safetySheetFile.name}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Presentación</label>
                      <select
                        value={newItem['Presentación']}
                        onChange={(e) => setNewItem({...newItem, 'Presentación': e.target.value})}
                        className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
                      >
                        <option value="" className="bg-gray-800">Seleccionar presentación</option>
                        <option value="Kilogramos" className="bg-gray-800">⚖️ Kilogramos</option>
                        <option value="Litros" className="bg-gray-800">🧪 Litros</option>
                        <option value="Unidades" className="bg-gray-800">📦 Unidades</option>
                        <option value="Bolsas" className="bg-gray-800">🛍️ Bolsas</option>
                        <option value="Cajas" className="bg-gray-800">📦 Cajas</option>
                        <option value="Galones" className="bg-gray-800">🪣 Galones</option>
                        <option value="Metros" className="bg-gray-800">📏 Metros</option>
                        <option value="Otro" className="bg-gray-800">✏️ Otro</option>
                      </select>
                    </div>

                    {newItem['Presentación'] === 'Otro' && (
                      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                        <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Especificar Presentación</label>
                        <input
                          type="text"
                          value={newItem['Presentación Personalizada']}
                          onChange={(e) => setNewItem({...newItem, 'Presentación Personalizada': e.target.value})}
                          className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
                          placeholder="Ej: Toneladas, Barriles..."
                        />
                      </div>
                    )}

                    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                      <label className="block text-sm font-semibold mb-2 text-white drop-shadow">Cantidad por Presentación</label>
                      <input
                        type="number"
                        value={newItem['Cantidad Presentacion Insumo']}
                        onChange={(e) => setNewItem({...newItem, 'Cantidad Presentacion Insumo': e.target.value})}
                        className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm"
                        placeholder="Ej: 25"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg p-4 border border-purple-500/20">
                    <label className="block text-sm font-semibold mb-2 text-purple-200 drop-shadow">Registrado por:</label>
                    <p className="text-white font-medium drop-shadow">{getCurrentUserName()}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-4 mt-8 pt-6 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 bg-white/10 text-white border border-white/20 rounded-lg hover:bg-white/20 transition-all duration-200 backdrop-blur-sm font-medium"
                >
                  ❌ Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || uploadingSafetySheet}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 backdrop-blur-sm ${
                    modalMode === 'ingresar'
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-green-500/25'
                      : modalMode === 'salida'
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-red-500/25'
                      : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-purple-500/25'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {uploadingSafetySheet
                    ? '⏳ Subiendo ficha de seguridad...'
                    : creating
                    ? (modalMode === 'ingresar' ? '📦 Ingresando...' : modalMode === 'salida' ? '📤 Registrando Salida...' : '📝 Registrando...')
                    : (modalMode === 'ingresar' ? '✅ Ingresar Cantidad' : modalMode === 'salida' ? '📤 Registrar Salida' : '📝 Registrar Insumo')
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
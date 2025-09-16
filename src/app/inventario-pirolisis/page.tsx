"use client";

import { TurnoProtection } from '@/components';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useInventario } from '@/lib/useInventario';

export default function InventarioPirolisis() {
  return (
    <TurnoProtection requiresTurno={true}>
      <InventarioPirolisisContent />
    </TurnoProtection>
  );
}

function InventarioPirolisisContent() {
  const { data, loading, error, getTotalItems, getItemsByCategory, getLowStockItems, getItemName, getItemDescription } = useInventario();

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
            <h1 className="text-3xl font-bold text-white mb-6 text-center drop-shadow-lg">Inventario de Pirolisis</h1>
            <p className="text-center text-white/90 mb-6 drop-shadow">
              Gestión y control del inventario de materiales para el proceso de pirólisis
            </p>

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
              <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">Estadísticas Generales</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-white">
                <div className="text-center">
                  <div className="text-2xl font-bold">{totalItems}</div>
                  <div className="text-sm drop-shadow">Total de Items</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{Object.keys(categories).length}</div>
                  <div className="text-sm drop-shadow">Categorías</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-300">{lowStockItems.length}</div>
                  <div className="text-sm drop-shadow">Items con Stock Bajo</div>
                </div>
              </div>
            </div>

            {/* Items con Stock Bajo */}
            {lowStockItems.length > 0 && (
              <div className="bg-red-500/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-red-500/30 mb-6">
                <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">⚠️ Items con Stock Bajo</h2>
                <div className="space-y-2">
                  {lowStockItems.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between items-center bg-white/10 p-3 rounded">
                      <div>
                        <span className="text-white font-semibold">{getItemName(item)}</span>
                        {getItemDescription(item) && (
                          <div className="text-sm text-white/60">{getItemDescription(item)}</div>
                        )}
                      </div>
                      <span className="text-red-300 font-semibold">
                        {item.fields['Presentacion Insumo'] || 0} {item.fields['Unidad'] || 'unidades'}
                      </span>
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
                          <div key={index} className="bg-white/10 p-3 rounded text-white">
                            <div className="font-semibold">{getItemName(item)}</div>
                            <div className="text-sm text-white/70">
                              Cantidad: {item.fields['Presentacion Insumo'] || 0} {item.fields['Unidad'] || 'unidades'}
                            </div>
                            {getItemDescription(item) && (
                              <div className="text-sm text-white/60 mt-1">
                                {getItemDescription(item)}
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
    </div>
  );
}
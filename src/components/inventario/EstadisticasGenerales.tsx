/**
 * Componente de Estadísticas Generales del Inventario
 * Muestra resumen de items totales, categorías, stock bajo y unidades totales
 */

interface EstadisticasGeneralesProps {
  totalItems: number;
  totalCategorias: number;
  itemsStockBajo: number;
}

export default function EstadisticasGenerales({
  totalItems,
  totalCategorias,
  itemsStockBajo,
}: EstadisticasGeneralesProps) {
  return (
    <div className="bg-white/20 backdrop-blur-md rounded-lg shadow-lg p-6 border border-white/30 mb-6">
      <h2 className="text-xl font-semibold text-white mb-4 drop-shadow-lg">
        📊 Estadísticas del Inventario
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-white">
        <div className="text-center bg-white/10 p-4 rounded-lg">
          <div className="text-3xl font-bold text-blue-300">{totalItems}</div>
          <div className="text-sm drop-shadow">Total de Insumos</div>
        </div>
        <div className="text-center bg-white/10 p-4 rounded-lg">
          <div className="text-3xl font-bold text-green-300">{totalCategorias}</div>
          <div className="text-sm drop-shadow">Categorías Activas</div>
        </div>
        <div className="text-center bg-white/10 p-4 rounded-lg">
          <div className="text-3xl font-bold text-red-300">{itemsStockBajo}</div>
          <div className="text-sm drop-shadow">Items con Stock Bajo</div>
        </div>
        <div className="text-center bg-white/10 p-4 rounded-lg">
          <div className="text-3xl font-bold text-purple-300">N/A</div>
          <div className="text-sm drop-shadow">Total Unidades</div>
        </div>
      </div>
    </div>
  );
}
